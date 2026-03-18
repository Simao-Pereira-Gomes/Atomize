import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cancel,
  confirm,
  intro,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import {
  type AIConfig,
  getAIConfig,
  getAIConfigForProvider,
} from "@config/ai.config";
import { logger } from "@config/logger";
import { PlatformFactory } from "@platforms/platform-factory";
import { AIGeneratorFactory } from "@services/template/ai-factory";
import { PresetManager } from "@services/template/preset-manager";
import { StoryLearner } from "@services/template/story-learner";
import { TemplateValidator } from "@templates/validator";
import chalk from "chalk";
import { Command, Option } from "commander";
import { match } from "ts-pattern";
import { stringify as stringifyYaml } from "yaml";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  isInteractiveTerminal,
} from "@/cli/utilities/prompt-utilities";
import type { IPlatformAdapter, PlatformType } from "@/platforms";
import type { IAIGenerator } from "@/services/template";
import type { MultiStoryLearningResult } from "@/services/template/story-learner.types";
import type {
  Metadata,
  TaskTemplate,
  ValidationConfig,
} from "@/templates/schema";
import {
  CancellationError,
  ConfigurationError,
  UnknownError,
} from "@/utils/errors";
import {
  configureBasicInfo,
  configureEstimation,
  configureFilter,
  configureMetadata,
  configureTasksWithValidation,
  configureValidation,
  previewTemplate,
} from "./template-wizard";

interface CreateFromScratchOptions {
  quiet?: boolean;
}

type CreationMode = "ai" | "preset" | "story" | "stories" | "scratch";

interface CreateOptions {
  ai?: string;
  preset?: string;
  fromStories?: string;
  scratch?: boolean;
  output?: string;
  aiProvider?: "gemini" | "ollama";
  apiKey?: string;
  model?: string;
  platform?: string;
  profile?: string;
  normalize?: boolean;
  quiet?: boolean;
}

export const templateCreateCommand = new Command("create")
  .description("Create a new template interactively")
  .addOption(new Option("--ai <prompt>", "Generate template using AI").hideHelp())
  .addOption(new Option("--ai-provider <provider>", "Force AI provider: gemini|ollama").hideHelp())
  .addOption(new Option("--api-key <key>", "Google Gemini API key (if not in environment)").hideHelp())
  .addOption(new Option("--model <n>", "AI model name (e.g., gemini-2.0-flash-exp, llama3.2)").hideHelp())
  .option("--preset <name>", "Start from a preset template")
  .option(
    "--from-stories <ids>",
    "Learn template from multiple stories (comma-separated IDs)",
  )
  .option("-p, --platform <platform>", "Platform to use", "azure-devops")
  .option("--profile <name>", "Named connection profile to use")
  .option("--no-normalize", "Keep original estimation percentages")
  .option("--scratch", "Create from scratch (skip mode selection)")
  .option(
    "-o, --output <path>",
    "Output file path",
    path.resolve(
      process.cwd(),
      "createdTemplates",
      generateTemplateFilename("template"),
    ),
  )
  .option("-q, --quiet", "Suppress non-essential output", false)
  .action(async (options: CreateOptions) => {
    try {
      intro(" Atomize — Template Creator");
      if (isInteractiveTerminal()) {
        console.log(
          chalk.gray(
            "  ↑↓ to navigate · Space to toggle · Enter to confirm · Ctrl+C to cancel\n",
          ),
        );
      }
      const mode = await determineMode(options);

      const template = await match(mode)
        .with("ai", async () => await createWithAI(options))
        .with("preset", async () => await createFromPreset(options))
        .with("stories", async () => await createFromStories(options))
        .with("scratch", async () => await createFromScratch({ quiet: options.quiet }))
        .otherwise(() => {
          throw new Error("Invalid creation mode");
        });

      if (!options.output) {
        throw new ConfigurationError("Output path is not defined");
      }

      await saveTemplate(template, options.output);

      console.log(chalk.green(`\n Template saved to ${options.output}\n`));
      console.log(
        chalk.cyan("Try it out with: ") +
          chalk.gray(`atomize validate ${options.output}`),
      );
      console.log("");
      outro(`Template saved → ${options.output}`);
    } catch (error) {
      if (error instanceof CancellationError) {
        outro("Cancelled.");
        process.exit(ExitCode.Success);
      }

      cancel("Template creation failed");
      logger.error(chalk.red("Template creation failed"));

      if (error instanceof Error) {
        console.log(chalk.red(error.message));
      }

      process.exit(ExitCode.Failure);
    }
  });

/**
 * Determine creation mode
 */
async function determineMode(options: CreateOptions): Promise<CreationMode> {
  if (options.ai) {
    console.log(chalk.yellow("  AI generation is temporarily disabled. Select a mode below.\n"));
  }
  if (options.preset) return "preset";
  if (options.fromStories) return "stories";
  if (options.scratch) return "scratch";

  // No flags - show interactive menu
  const mode = assertNotCancelled(
    await select({
      message: "How would you like to create your template?",
      options: [
        {
          label: " AI-Powered - Describe what you need (free)",
          value: "ai",
          hint: "coming soon",
          disabled: true,
        },
        {
          label: "From Preset - Start with a common template",
          value: "preset",
        },
        {
          label:
            "From Multiple Stories - Learn patterns from several examples",
          value: "stories",
        },
        {
          label: " From Scratch - Build step-by-step",
          value: "scratch",
        },
      ],
    }),
  );
  return mode as CreationMode;
}

/**
 * Create template with AI
 */
async function createWithAI(options: CreateOptions): Promise<TaskTemplate> {
  console.log(chalk.cyan("\n AI Template Generation\n"));

  let aiConfig: AIConfig | null = null;
  if (options.aiProvider) {
    aiConfig = await getAIConfigForProvider(options.aiProvider, {
      apiKey: options.apiKey,
      model: options.model,
    });
  } else if (options.apiKey || options.model) {
    aiConfig = await getAIConfigForProvider("gemini", {
      apiKey: options.apiKey,
      model: options.model,
    });
  } else {
    aiConfig = await getAIConfig();
  }

  if (aiConfig.provider === "none") {
    console.log(chalk.yellow("\nFalling back to manual creation...\n"));
    return await createFromScratch({ quiet: options.quiet });
  }

  let prompt = options.ai;
  if (!prompt) {
    prompt = assertNotCancelled(
      await text({
        message: "Describe the template you need:",
        placeholder:
          "e.g. Generate tasks for User Stories with Dev and Testing tasks",
      }),
    );
  }

  const usePreset = assertNotCancelled(
    await confirm({
      message: "Use a preset as starting point?",
      initialValue: false,
    }),
  );

  let context = {};
  if (usePreset) {
    const presetManager = new PresetManager();
    const choices = await presetManager.getPresetChoices();

    if (choices.length === 0) {
      console.log(chalk.yellow("No presets available"));
    } else {
      const presetName = assertNotCancelled(
        await select({
          message: "Select preset:",
          options: choices.map((c) => ({ label: c.name, value: c.value })),
        }),
      );

      const preset = await presetManager.loadPreset(presetName as string);
      context = { preset };
    }
  }

  const generator = AIGeneratorFactory.create(aiConfig);
  if (!prompt) {
    throw new ConfigurationError("AI prompt is required");
  }
  const genSpinner = spinner();
  genSpinner.start(`Generating with ${aiConfig.provider}...`);
  let template = await generator.generateTemplate(prompt, context);
  genSpinner.stop("Template generated ✓");
  template = await refineTemplateInteractively(generator, template);

  return template;
}

/**
 * Interactive refinement loop
 */
async function refineTemplateInteractively(
  generator: IAIGenerator,
  template: TaskTemplate,
): Promise<TaskTemplate> {
  while (true) {
    console.log(chalk.cyan("\n Generated Template:\n"));
    console.log(chalk.gray(stringifyYaml(template)));

    const action = assertNotCancelled(
      await select({
        message: "What would you like to do?",
        options: [
          { label: "Accept and save", value: "accept" },
          { label: "Refine with additional instructions", value: "refine" },
          { label: "Regenerate", value: "regenerate" },
          { label: "Cancel", value: "cancel" },
        ],
      }),
    );

    if (action === "accept") {
      return template;
    }

    if (action === "refine") {
      const refinement = assertNotCancelled(
        await text({
          message: "How should I refine it?",
          placeholder: "e.g. Add more detailed testing tasks",
        }),
      );

      const refineSpinner = spinner();
      refineSpinner.start("Refining...");
      template = await generator.refineTemplate(template, refinement);
      refineSpinner.stop("Refined ✓");
    }

    if (action === "regenerate") {
      const prompt = assertNotCancelled(
        await text({
          message: "New description:",
        }),
      );

      const regenSpinner = spinner();
      regenSpinner.start("Regenerating...");
      template = await generator.generateTemplate(prompt);
      regenSpinner.stop("Regenerated ✓");
    }

    if (action === "cancel") {
      throw new UnknownError("Template generation cancelled by user");
    }
  }
}

/**
 * Create from preset
 */
async function createFromPreset(options: CreateOptions): Promise<TaskTemplate> {
  console.log(chalk.cyan("\n Create from Preset\n"));

  const presetManager = new PresetManager();
  const choices = await presetManager.getPresetChoices();

  let presetName = options.preset;

  if (presetName) {
    if (!choices.find((c) => c.value === presetName)) {
      throw new ConfigurationError(
        `Preset "${presetName}" not found. Run: atomize template presets`,
      );
    }
  } else {
    if (choices.length === 0) {
      throw new Error(
        "No presets found. Create some in templates/presets/ first.",
      );
    }

    presetName = assertNotCancelled(
      await select({
        message: "Select preset:",
        options: choices.map((c) => ({ label: c.name, value: c.value })),
      }),
    ) as string;
  }

  const template = await presetManager.loadPreset(presetName);

  console.log(chalk.green(`\nLoaded preset: ${template.name}`));

  const customize = assertNotCancelled(
    await confirm({
      message: "Customize the template?",
      initialValue: false,
    }),
  );

  if (customize) {
    return await customizeTemplate(template);
  }

  return template;
}

/**
 * Create from multiple existing stories
 */
/**
 * Validates that story IDs exist on the platform before running analysis.
 * Returns the filtered list of valid IDs, prompting the user if some are missing.
 * Skipped gracefully if the platform does not implement getWorkItem.
 * Throws ConfigurationError if none exist, CancellationError if user declines to continue.
 */
async function validateStoryIds(
  platform: IPlatformAdapter,
  storyIds: string[],
): Promise<string[]> {
  if (!platform.getWorkItem) return storyIds;

  const validateSpinner = spinner();
  validateSpinner.start(`Validating ${storyIds.length} story ID(s)...`);

  const results = await Promise.all(
    storyIds.map(async (id) => ({ id, found: !!(await platform.getWorkItem!(id)) })),
  );

  const missing = results.filter((r) => !r.found).map((r) => r.id);

  if (missing.length === storyIds.length) {
    validateSpinner.stop("Validation failed");
    throw new ConfigurationError(
      `None of the provided story IDs exist: ${missing.join(", ")}. Check the IDs and try again.`,
    );
  }

  if (missing.length > 0) {
    validateSpinner.stop(`${missing.length} story ID(s) not found`);
    console.log(chalk.yellow(`  Not found: ${missing.join(", ")}`));

    const proceed = assertNotCancelled(
      await confirm({
        message: `Continue with the ${storyIds.length - missing.length} remaining story ID(s)?`,
        initialValue: true,
      }),
    );

    if (!proceed) throw new CancellationError("Story ID validation cancelled");

    return storyIds.filter((id) => !missing.includes(id));
  }

  validateSpinner.stop(`All ${storyIds.length} story ID(s) found ✓`);
  return storyIds;
}

async function createFromStories(
  options: CreateOptions,
): Promise<TaskTemplate> {
  console.log(chalk.cyan("\n Learn from Multiple Stories\n"));

  let storyIds: string[];
  if (options.fromStories) {
    storyIds = options.fromStories
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    const storyIdsRaw = assertNotCancelled(
      await text({
        message: "Enter story IDs (comma-separated):",
      }),
    );
    storyIds = storyIdsRaw
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  if (storyIds.length === 0) {
    throw new ConfigurationError("At least one story ID is required");
  }

  let platformType = options.platform || "azure-devops";
  if (!options.platform) {
    platformType = assertNotCancelled(
      await select({
        message: "Select platform:",
        options: [
          { label: "Azure DevOps", value: "azure-devops" },
          ...(process.env.ATOMIZE_DEV === "true"
            ? [{ label: "Mock Platform (for testing)", value: "mock" }]
            : []),
        ],
      }),
    ) as string;
  }

  const shouldNormalize = options.normalize !== false;

  const connectSpinner = spinner();
  connectSpinner.start(`Connecting to ${platformType}...`);

  let platform: IPlatformAdapter | null = null;
  if (platformType === "azure-devops") {
    const { resolveAzureConfig } = await import("@config/profile-resolver");
    const config = await resolveAzureConfig(options.profile);
    platform = PlatformFactory.create("azure-devops", config);
  } else {
    platform = PlatformFactory.create(platformType as PlatformType);
  }

  await platform.authenticate();
  connectSpinner.stop("Connected ✓");

  storyIds = await validateStoryIds(platform, storyIds);

  const learner = new StoryLearner(platform);
  const learnSpinner = spinner();
  learnSpinner.start(`Learning from ${storyIds.length} stories...`);
  const result = await learner.learnFromStories(storyIds, {
    normalizePercentages: shouldNormalize,
  });
  learnSpinner.stop(`Analyzed ${result.analyses.length} stories ✓`);

  displayMultiStoryResults(result);

  if (result.variations.length > 1) {
    const choice = assertNotCancelled(
      await select({
        message: "Select template variation:",
        options: [
          {
            label: `Merged template (confidence: ${result.confidence.level} - ${result.confidence.overall}%)`,
            value: "merged",
          },
          ...result.variations.map((v, i) => ({
            label: `${v.name} (confidence: ${v.confidence.level} - ${v.confidence.overall}%)`,
            value: `variation-${i}`,
          })),
        ],
      }),
    );

    if (choice !== "merged") {
      const index = Number.parseInt(
        (choice as string).replace("variation-", ""),
        10,
      );
      const variation = result.variations[index];
      if (variation) {
        return variation.template;
      }
    }
  }

  return result.mergedTemplate;
}

/**
 * Display multi-story learning results
 */
function displayMultiStoryResults(result: MultiStoryLearningResult): void {
  console.log(
    chalk.green(
      `\nAnalyzed ${result.analyses.length} stories, skipped ${result.skipped.length}`,
    ),
  );

  if (result.skipped.length > 0) {
    console.log(chalk.yellow("\nSkipped stories:"));
    for (const s of result.skipped) {
      console.log(chalk.yellow(`  - ${s.storyId}: ${s.reason}`));
    }
  }

  // Confidence
  const confidenceColor =
    result.confidence.level === "high"
      ? chalk.green
      : result.confidence.level === "medium"
        ? chalk.yellow
        : chalk.red;
  console.log(
    confidenceColor(
      `\nConfidence: ${result.confidence.level} (${result.confidence.overall}%)`,
    ),
  );
  for (const factor of result.confidence.factors) {
    console.log(
      chalk.gray(`  ${factor.name}: ${factor.score}% - ${factor.description}`),
    );
  }

  // Patterns
  console.log(
    chalk.cyan(
      `\nPatterns: ${result.patterns.commonTasks.length} common tasks detected`,
    ),
  );
  console.log(
    chalk.gray(`  Avg tasks/story: ${result.patterns.averageTaskCount}`),
  );

  // Merged template summary
  console.log(
    chalk.green(
      `\nMerged template: ${result.mergedTemplate.tasks.length} tasks`,
    ),
  );

  // Suggestions
  if (result.suggestions.length > 0) {
    console.log(chalk.cyan("\nSuggestions:"));
    for (const s of result.suggestions) {
      const icon =
        s.severity === "important"
          ? chalk.red("!")
          : s.severity === "warning"
            ? chalk.yellow("~")
            : chalk.gray("-");
      console.log(`  ${icon} ${s.message}`);
    }
  }

  // Outliers
  if (result.outliers.length > 0) {
    console.log(chalk.yellow("\nOutliers detected:"));
    for (const o of result.outliers) {
      console.log(chalk.yellow(`  - ${o.message}`));
    }
  }

  // Variations
  if (result.variations.length > 0) {
    console.log(
      chalk.cyan(`\n${result.variations.length} template variations available`),
    );
  }
}

/**
 * Customize template interactively
 */
async function customizeTemplate(
  template: TaskTemplate,
): Promise<TaskTemplate> {
  const name = assertNotCancelled(
    await text({
      message: "Template name:",
      defaultValue: template.name,
    }),
  );

  const description = assertNotCancelled(
    await text({
      message: "Description:",
      defaultValue: template.description,
    }),
  );

  template.name = name;
  template.description = description;

  return template;
}

/**
 * Create a template from scratch using an interactive wizard
 *
 * This function guides the user through a 6-step process to create a complete
 * task template without needing to understand YAML structure
 * @param _options - Configuration options (currently only interactive flag)
 * @returns Promise<TaskTemplate> - The created template ready to be saved
 * @throws CancellationError if user cancels at any step
 * @throws ConfigurationError if validation fails
 *
 * @example
 * ```typescript
 * // Basic usage
 * const template = await createFromScratch();
 * await saveTemplate(template, "./my-template.yaml");
 * ```
 *
 * @example
 * ```typescript
 * // With options
 * const template = await createFromScratch({ interactive: true });
 * ```
 */
export async function createFromScratch(
  _options: CreateFromScratchOptions = {},
): Promise<TaskTemplate> {
  const quiet = _options.quiet === true;
  const printStep = (msg: string) => {
    if (!quiet) console.log(msg);
  };

  printStep(chalk.cyan("\nCreate Template from Scratch\n"));
  printStep(chalk.gray("Interactive template builder wizard"));
  printStep(chalk.gray("You can review and edit before saving\n"));

  const totalSteps = 6;
  let currentStep = 1;

  try {
    // Step 1: Basic Information
    printStep(chalk.blue(`\n[${currentStep}/${totalSteps}] Basic Information`));
    printStep(chalk.gray("█░░░░░"));
    printStep(
      chalk.gray("Tip: Choose a clear, descriptive name for your template\n"),
    );

    const basicInfo = await configureBasicInfo();

    // Validate basic info before continuing
    if (!basicInfo.name || basicInfo.name.trim() === "") {
      throw new ConfigurationError("Template name is required");
    }

    currentStep++;

    // Step 2: Filter Configuration
    printStep(
      chalk.blue(`\n[${currentStep}/${totalSteps}] Filter Configuration`),
    );
    printStep(chalk.gray("██░░░░"));
    printStep(
      chalk.gray(
        "Tip: Use filters to select which work items this template applies to\n",
      ),
    );

    const filterConfig = await configureFilter();

    // Validate filter has at least work item types or states
    if (
      (!filterConfig.workItemTypes ||
        filterConfig.workItemTypes.length === 0) &&
      (!filterConfig.states || filterConfig.states.length === 0) &&
      !filterConfig.customQuery
    ) {
      console.log(
        chalk.yellow(
          "\n Warning: No work item types, states, or custom query configured.",
        ),
      );
      console.log(chalk.yellow("   This template will match ALL work items."));

      const continueAnyway = assertNotCancelled(
        await confirm({
          message: "Continue with empty filter?",
          initialValue: false,
        }),
      );

      if (!continueAnyway) {
        throw new CancellationError(
          "Template creation cancelled. Please configure filter criteria.",
        );
      }
    }

    currentStep++;

    // Step 3: Task Configuration
    printStep(
      chalk.blue(`\n[${currentStep}/${totalSteps}] Task Configuration`),
    );
    printStep(chalk.gray("███░░░"));
    printStep(chalk.gray("Tip: Break work into clear, actionable tasks\n"));

    const tasks = await configureTasksWithValidation();

    // Validate we have at least one task
    if (!tasks || tasks.length === 0) {
      throw new ConfigurationError(
        "At least one task is required. Please add tasks to your template.",
      );
    }

    // Validate all tasks have titles
    const invalidTasks = tasks.filter(
      (task) => !task.title || task.title.trim() === "",
    );
    if (invalidTasks.length > 0) {
      throw new ConfigurationError(
        `${invalidTasks.length} task(s) are missing titles. All tasks must have a title.`,
      );
    }

    currentStep++;

    // Step 4: Estimation Settings
    printStep(
      chalk.blue(`\n[${currentStep}/${totalSteps}] Estimation Settings`),
    );
    printStep(chalk.gray("████░░"));
    printStep(
      chalk.gray(
        "Tip: Choose how story points will be calculated and rounded\n",
      ),
    );

    const estimation = await configureEstimation();

    currentStep++;

    // Step 5: Validation Rules (Optional)
    printStep(
      chalk.blue(
        `\n[${currentStep}/${totalSteps}] Validation Rules (Optional)`,
      ),
    );
    printStep(chalk.gray("█████░"));
    printStep(
      chalk.gray(
        "Tip: Add constraints to ensure templates are used correctly\n",
      ),
    );

    const addValidation = assertNotCancelled(
      await confirm({
        message: "Add validation rules?",
        initialValue: false,
      }),
    );

    let validation: ValidationConfig | undefined;
    if (addValidation) {
      validation = await configureValidation();
    }

    currentStep++;

    // Step 6: Metadata (Optional)
    printStep(
      chalk.blue(`\n[${currentStep}/${totalSteps}] Metadata (Optional)`),
    );
    printStep(chalk.gray("██████"));
    printStep(
      chalk.gray(
        "Tip: Metadata helps others understand when to use this template\n",
      ),
    );

    const addMetadata = assertNotCancelled(
      await confirm({
        message: "Add metadata?",
        initialValue: false,
      }),
    );

    let metadata: Metadata | undefined;
    if (addMetadata) {
      metadata = await configureMetadata();
    }

    // Construct the template
    const template: TaskTemplate = {
      version: "1.0",
      name: basicInfo.name,
      description: basicInfo.description,
      author: basicInfo.author,
      tags: basicInfo.tags,
      created: new Date().toISOString(),
      filter: filterConfig,
      tasks,
      estimation,
      validation,
      metadata,
    };

    // Preview and confirm
    console.log(chalk.green("\n✓ Template configured successfully!\n"));
    console.log(
      chalk.gray("Review your template and choose an action below.\n"),
    );

    const confirmed = await previewTemplate(template);

    if (!confirmed) {
      console.log(
        chalk.yellow(
          "\n⚠  Template creation cancelled. No changes were saved.",
        ),
      );
      throw new CancellationError("Template creation cancelled by user");
    }

    return template;
  } catch (error) {
    if (error instanceof CancellationError) {
      throw error;
    }

    if (error instanceof ConfigurationError) {
      console.log(chalk.red(`\n Configuration error: ${error.message}`));
      console.log(chalk.gray("  Please check your inputs and try again."));
      throw error;
    }

    // Unknown error
    console.log(
      chalk.red(` Error creating template: ${(error as Error).message}`),
    );
    throw error;
  }
}

/**
 * Save template to file
 */
async function saveTemplate(
  template: TaskTemplate,
  outputPath: string,
): Promise<void> {
  const validator = new TemplateValidator();
  const validation = validator.validate(template);

  if (!validation.valid) {
    console.log(chalk.red("\n  Template validation failed:\n"));
    validation.errors.forEach((err) => {
      console.log(chalk.red(`  • ${err.path}: ${err.message}`));
    });
    throw new Error("Template validation failed");
  }

  if (validation.warnings.length > 0) {
    console.log(chalk.yellow("\n  Warnings:\n"));
    validation.warnings.forEach((warn) => {
      console.log(chalk.yellow(`  • ${warn.path}: ${warn.message}`));
    });
  }

  if (existsSync(outputPath)) {
    const overwrite = assertNotCancelled(
      await confirm({
        message: "Output file already exists. Overwrite?",
        initialValue: false,
      }),
    );
    if (!overwrite) {
      throw new CancellationError("Save cancelled — file not overwritten");
    }
  }

  const yaml = stringifyYaml(template);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, yaml, "utf-8");

  logger.info(`Template saved to ${outputPath}`);
}

function generateTemplateFilename(templateName = "template") {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const shortId = randomBytes(2).toString("hex");

  return `${templateName}-${date}-${shortId}.yaml`;
}
