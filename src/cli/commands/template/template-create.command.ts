import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type AIConfig,
  getAIConfig,
  getAIConfigForProvider,
} from "@config/ai.config";
import { getAzureDevOpsConfigInteractive } from "@config/azure-devops.config";
import { logger } from "@config/logger";
import { PlatformFactory } from "@platforms/platform-factory";
import { AIGeneratorFactory } from "@services/template/ai-factory";
import { PresetManager } from "@services/template/preset-manager";
import { StoryLearner } from "@services/template/story-learner";
import { TemplateValidator } from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { match } from "ts-pattern";
import { stringify as stringifyYaml } from "yaml";
import type { IPlatformAdapter, PlatformType } from "@/platforms";
import type { IAIGenerator } from "@/services/template";
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
  configureEstimation,
  configureFilter,
  configureMetadata,
  configureTasksWithValidation,
  configureValidation,
  previewTemplate,
} from "./template-wizard-enhanced";

interface CreateFromScratchOptions {
  interactive?: boolean;
}

type CreationMode = "ai" | "preset" | "story" | "scratch";

const OS_PLATFORM = process.platform;
const ListType = OS_PLATFORM === "win32" ? "rawlist" : "list";
interface CreateOptions {
  ai?: string;
  preset?: string;
  fromStory?: string;
  scratch?: boolean;
  output?: string;
  interactive?: boolean;
  aiProvider?: "gemini" | "ollama";
  apiKey?: string;
  model?: string;
  platform?: string;
  normalize?: boolean;
}

export const templateCreateCommand = new Command("create")
  .description("Create a new template interactively")
  .option("--ai <prompt>", "Generate template using AI")
  .option("--ai-provider <provider>", "Force AI provider: gemini|ollama")
  .option("--api-key <key>", "Google Gemini API key (if not in environment)")
  .option("--model <n>", "AI model name (e.g., gemini-2.0-flash-exp, llama3.2)")
  .option("--preset <name>", "Start from a preset template")
  .option("--from-story <id>", "Learn template from existing story")
  .option(
    "-p, --platform <platform>",
    "Platform to use (azure-devops, mock)",
    "azure-devops"
  )
  .option("--normalize", "Normalize task estimation percentages to sum to 100%")
  .option("--no-normalize", "Keep original estimation percentages")
  .option("--scratch", "Create from scratch (skip mode selection)")
  .option(
    "-o, --output <path>",
    "Output file path",
    path.resolve(
      process.cwd(),
      "createdTemplates",
      generateTemplateFilename("template")
    )
  )
  .option("--no-interactive", "Skip all prompts (use with flags only)")
  .action(async (options: CreateOptions) => {
    try {
      console.log(chalk.blue.bold("\n Atomize Template Creator\n"));
      const mode = await determineMode(options);

      const template = await match(mode)
        .with("ai", async () => await createWithAI(options))
        .with("preset", async () => await createFromPreset(options))
        .with("story", async () => await createFromStory(options))
        .with("scratch", async () => await createFromScratch(options))
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
          chalk.gray(`atomize validate ${options.output}`)
      );
      console.log("");
    } catch (error) {
      console.log("");
      logger.error(chalk.red("Template creation failed"));

      if (error instanceof Error) {
        console.log(chalk.red(error.message));
      }

      process.exit(1);
    }
  });

/**
 * Determine creation mode
 */
async function determineMode(options: CreateOptions): Promise<CreationMode> {
  if (options.ai) return "ai";
  if (options.preset) return "preset";
  if (options.fromStory) return "story";
  if (options.scratch) return "scratch";

  // No flags - show interactive menu
  if (options.interactive !== false) {
    const { mode } = await inquirer.prompt([
      {
        type: ListType,
        name: "mode",
        message: "How would you like to create your template?",
        choices: [
          {
            name: " AI-Powered - Describe what you need (free)",
            value: "ai",
          },
          {
            name: "From Preset - Start with a common template",
            value: "preset",
          },
          {
            name: "From Existing Story - Learn from your work",
            value: "story",
          },
          {
            name: " From Scratch - Build step-by-step",
            value: "scratch",
          },
        ],
      },
    ]);
    return mode;
  }

  // Default to scratch if --no-interactive
  return "scratch";
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
    return await createFromScratch(options);
  }

  let prompt = options.ai;
  if (!prompt) {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "prompt",
        message: "Describe the template you need:",
        default: "Backend API development with database migrations",
      },
    ]);
    prompt = answer.prompt;
  }

  const { usePreset } = await inquirer.prompt([
    {
      type: "confirm",
      name: "usePreset",
      message: "Use a preset as starting point?",
      default: false,
    },
  ]);

  let context = {};
  if (usePreset) {
    const presetManager = new PresetManager();
    const choices = await presetManager.getPresetChoices();

    if (choices.length === 0) {
      console.log(chalk.yellow("No presets available"));
    } else {
      const { presetName } = await inquirer.prompt([
        {
          type: ListType,
          name: "presetName",
          message: "Select preset:",
          choices,
        },
      ]);

      const preset = await presetManager.loadPreset(presetName);
      context = { preset };
    }
  }

  console.log(chalk.cyan(`\nGenerating with ${aiConfig.provider}...\n`));

  const generator = AIGeneratorFactory.create(aiConfig);
  if (!prompt) {
    throw new ConfigurationError("AI prompt is required");
  }
  let template = await generator.generateTemplate(prompt, context);
  template = await refineTemplateInteractively(generator, template);

  return template;
}

/**
 * Interactive refinement loop
 */
async function refineTemplateInteractively(
  generator: IAIGenerator,
  template: TaskTemplate
): Promise<TaskTemplate> {
  while (true) {
    console.log(chalk.cyan("\n Generated Template:\n"));
    console.log(chalk.gray(stringifyYaml(template)));

    const { action } = await inquirer.prompt([
      {
        type: ListType,
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "Accept and save", value: "accept" },
          { name: "Refine with additional instructions", value: "refine" },
          { name: "Regenerate", value: "regenerate" },
          { name: "Cancel", value: "cancel" },
        ],
      },
    ]);

    if (action === "accept") {
      return template;
    }

    if (action === "refine") {
      const { refinement } = await inquirer.prompt([
        {
          type: "input",
          name: "refinement",
          message: "How should I refine it?",
          default: "Add more detailed testing tasks",
        },
      ]);

      console.log(chalk.cyan("\nRefining...\n"));
      template = await generator.refineTemplate(template, refinement);
    }

    if (action === "regenerate") {
      const { prompt } = await inquirer.prompt([
        {
          type: "input",
          name: "prompt",
          message: "New description:",
        },
      ]);

      console.log(chalk.cyan("\nRegenerating...\n"));
      template = await generator.generateTemplate(prompt);
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

  let presetName = options.preset;

  if (!presetName) {
    const choices = await presetManager.getPresetChoices();

    if (choices.length === 0) {
      throw new Error(
        "No presets found. Create some in templates/presets/ first."
      );
    }

    const answer = await inquirer.prompt([
      {
        type: ListType,
        name: "preset",
        message: "Select preset:",
        choices,
      },
    ]);

    presetName = answer.preset;
  }

  if (!presetName) {
    throw new ConfigurationError("Preset name is required");
  }

  const template = await presetManager.loadPreset(presetName);

  console.log(chalk.green(`\nLoaded preset: ${template.name}`));

  const { customize } = await inquirer.prompt([
    {
      type: "confirm",
      name: "customize",
      message: "Customize the template?",
      default: false,
    },
  ]);

  if (customize) {
    return await customizeTemplate(template);
  }

  return template;
}

/**
 * Create from existing story
 */
async function createFromStory(options: CreateOptions): Promise<TaskTemplate> {
  console.log(chalk.cyan("\n Learn from Existing Story\n"));

  let storyId = options.fromStory;
  if (!storyId) {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "storyId",
        message: "Enter story ID:",
      },
    ]);
    storyId = answer.storyId;
  }

  let platformType = options.platform || "azure-devops";
  if (!options.platform) {
    const { platform } = await inquirer.prompt([
      {
        type: ListType,
        name: "platform",
        message: "Select platform:",
        choices: [
          { name: "Azure DevOps", value: "azure-devops" },
          { name: "Mock Platform (for testing)", value: "mock" },
        ],
      },
    ]);
    platformType = platform;
  }

  let shouldNormalize = options.normalize ?? true;
  if (options.normalize === undefined) {
    const { normalize } = await inquirer.prompt<{ normalize: boolean }>([
      {
        type: "confirm",
        name: "normalize",
        message: "Normalize task percentages to sum to 100%?",
        default: true,
      },
    ]);

    shouldNormalize = normalize;
  }

  console.log(chalk.cyan(`\nConnecting to ${platformType}...\n`));

  let platform: IPlatformAdapter | null = null;
  if (platformType === "azure-devops") {
    const config = await getAzureDevOpsConfigInteractive();
    platform = PlatformFactory.create("azure-devops", config);
  } else {
    platform = PlatformFactory.create(platformType as PlatformType);
  }

  await platform.authenticate();

  const learner = new StoryLearner(platform);

  if (!storyId) {
    throw new ConfigurationError("Story ID is required");
  }
  const template = await learner.learnFromStory(storyId, shouldNormalize);

  console.log(
    chalk.green(`\nLearned template with ${template.tasks.length} tasks`)
  );

  if (shouldNormalize) {
    console.log(chalk.gray("Task percentages normalized to 100%"));
  } else {
    console.log(chalk.gray("Task percentages kept as-is from original"));
  }

  return template;
}

/**
 * Customize template interactively
 */
async function customizeTemplate(
  template: TaskTemplate
): Promise<TaskTemplate> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Template name:",
      default: template.name,
    },
    {
      type: "input",
      name: "description",
      message: "Description:",
      default: template.description,
    },
  ]);

  template.name = answers.name;
  template.description = answers.description;

  return template;
}

export async function createFromScratch(
  _options: CreateFromScratchOptions = {}
): Promise<TaskTemplate> {
  console.log(chalk.cyan("\n✨ Create Template from Scratch\n"));
  console.log(chalk.gray("Interactive template builder wizard"));
  console.log(chalk.gray("You can review and edit before saving\n"));

  const totalSteps = 6;
  let currentStep = 1;

  try {
    // Step 1: Basic Information
    console.log(
      chalk.blue(`\n[${currentStep}/${totalSteps}] Basic Information`)
    );
    console.log(chalk.gray("█░░░░░"));
    console.log(
      chalk.gray("Tip: Choose a clear, descriptive name for your template\n")
    );

    const basicInfo = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Template name:",
        validate: (input: string) => {
          if (!input || input.trim() === "") {
            return "Template name is required";
          }
          if (input.length > 200) {
            return "Template name must be 200 characters or less";
          }
          return true;
        },
      },
      {
        type: "input",
        name: "description",
        message: "Description (optional):",
        validate: (input: string) => {
          if (input && input.length > 500) {
            return "Description must be 500 characters or less";
          }
          return true;
        },
      },
      {
        type: "input",
        name: "author",
        message: "Author:",
        default: "Atomize",
      },
      {
        type: "input",
        name: "tags",
        message: "Tags (comma-separated, optional):",
        filter: (input: string) => {
          if (!input) return [];
          return input.split(",").map((t) => t.trim());
        },
      },
    ]);

    const { confirmStep1 } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmStep1",
        message: "Continue to filter configuration?",
        default: true,
      },
    ]);

    if (!confirmStep1) {
      throw new Error("Template creation cancelled by user");
    }

    currentStep++;

    // Step 2: Filter Configuration
    console.log(
      chalk.blue(`\n[${currentStep}/${totalSteps}] Filter Configuration`)
    );
    console.log(chalk.gray("██░░░░"));
    console.log(
      chalk.gray(
        "Tip: Use filters to select which work items this template applies to\n"
      )
    );

    const filterConfig = await configureFilter();

    // Validate filter has at least work item types or states
    if (
      (!filterConfig.workItemTypes ||
        filterConfig.workItemTypes.length === 0) &&
      (!filterConfig.states || filterConfig.states.length === 0)
    ) {
      console.log(
        chalk.yellow(
          "\n⚠ Warning: No work item types or states selected. Template will match all items."
        )
      );

      const { continueAnyway } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueAnyway",
          message: "Continue with empty filter?",
          default: false,
        },
      ]);

      if (!continueAnyway) {
        console.log(chalk.gray("\nReturning to filter configuration...\n"));
        // In a real implementation, we'd loop back here
        throw new Error("Please configure at least work item types or states");
      }
    }

    const { confirmStep2 } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmStep2",
        message: "Continue to task configuration?",
        default: true,
      },
    ]);

    if (!confirmStep2) {
      throw new Error("Template creation cancelled by user");
    }

    currentStep++;

    // Step 3: Task Configuration
    console.log(
      chalk.blue(`\n[${currentStep}/${totalSteps}] Task Configuration`)
    );
    console.log(chalk.gray("███░░░"));

    const tasks = await configureTasksWithValidation();

    // Validate we have at least one task
    if (tasks.length === 0) {
      throw new Error("At least one task is required");
    }

    const { confirmStep3 } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmStep3",
        message: "Continue to estimation settings?",
        default: true,
      },
    ]);

    if (!confirmStep3) {
      throw new Error("Template creation cancelled by user");
    }

    currentStep++;

    // Step 4: Estimation Settings
    console.log(
      chalk.blue(`\n[${currentStep}/${totalSteps}] Estimation Settings`)
    );
    console.log(chalk.gray("████░░"));
    console.log(
      chalk.gray(
        "💡 Tip: Choose how story points will be calculated and rounded\n"
      )
    );

    const estimation = await configureEstimation();

    const { confirmStep4 } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmStep4",
        message: "Continue to validation rules?",
        default: true,
      },
    ]);

    if (!confirmStep4) {
      throw new Error("Template creation cancelled by user");
    }

    currentStep++;

    // Step 5: Validation Rules (Optional)
    console.log(
      chalk.blue(`\n[${currentStep}/${totalSteps}] Validation Rules (Optional)`)
    );
    console.log(chalk.gray("█████░"));
    console.log(
      chalk.gray(
        "Tip: Add constraints to ensure templates are used correctly\n"
      )
    );

    const { addValidation } = await inquirer.prompt([
      {
        type: "confirm",
        name: "addValidation",
        message: "Add validation rules?",
        default: false,
      },
    ]);

    let validation: ValidationConfig | undefined;
    if (addValidation) {
      validation = await configureValidation();
    }

    const { confirmStep5 } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmStep5",
        message: "Continue to metadata?",
        default: true,
      },
    ]);

    if (!confirmStep5) {
      throw new CancellationError("Template creation cancelled by user");
    }

    currentStep++;

    // Step 6: Metadata (Optional)
    console.log(
      chalk.blue(`\n[${currentStep}/${totalSteps}] Metadata (Optional)`)
    );
    console.log(chalk.gray("██████"));
    console.log(
      chalk.gray(
        "Tip: Metadata helps others understand when to use this template\n"
      )
    );

    const { addMetadata } = await inquirer.prompt([
      {
        type: "confirm",
        name: "addMetadata",
        message: "Add metadata?",
        default: false,
      },
    ]);

    let metadata: Metadata | undefined;
    if (addMetadata) {
      metadata = await configureMetadata();
    }

    // Construct the template
    const template: TaskTemplate = {
      version: "1.0",
      name: basicInfo.name,
      description: basicInfo.description || undefined,
      author: basicInfo.author || undefined,
      tags: basicInfo.tags.length > 0 ? basicInfo.tags : undefined,
      created: new Date().toISOString(),
      filter: filterConfig,
      tasks,
      estimation,
      validation,
      metadata,
    };

    // Preview and confirm
    console.log(chalk.green("\n✓ Template created successfully!\n"));

    const confirmed = await previewTemplate(template);

    if (!confirmed) {
      console.log(
        chalk.yellow("\n Template creation cancelled. No changes were saved.")
      );
      throw new CancellationError("Template creation cancelled by user");
    }

    return template;
  } catch (error) {
    // Better error handling
    if (error instanceof CancellationError) {
      console.log(chalk.yellow("\n⚠ Template creation cancelled"));
    } else {
      console.log(
        chalk.red(`\n✗ Error creating template: ${(error as Error).message}`)
      );
    }
    throw error;
  }
}

/**
 * Save template to file
 */
async function saveTemplate(
  template: TaskTemplate,
  outputPath: string
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

/**
 * Validation helper for the entire template
 */
export function validateTemplate(template: TaskTemplate): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic validation
  if (!template.name || template.name.trim() === "") {
    errors.push("Template name is required");
  }

  if (template.name && template.name.length > 200) {
    errors.push("Template name must be 200 characters or less");
  }

  if (template.description && template.description.length > 500) {
    errors.push("Description must be 500 characters or less");
  }

  // Filter validation
  if (
    (!template.filter.workItemTypes ||
      template.filter.workItemTypes.length === 0) &&
    (!template.filter.states || template.filter.states.length === 0) &&
    !template.filter.customQuery
  ) {
    warnings.push(
      "Filter has no work item types, states, or custom query. Will match all items."
    );
  }

  // Task validation
  if (!template.tasks || template.tasks.length === 0) {
    errors.push("At least one task is required");
  }

  // Check for empty task titles
  template.tasks.forEach((task, index) => {
    if (!task.title || task.title.trim() === "") {
      errors.push(`Task #${index + 1} has no title`);
    }

    if (task.title && task.title.length > 500) {
      errors.push(`Task #${index + 1} title must be 500 characters or less`);
    }

    if (task.description && task.description.length > 2000) {
      errors.push(
        `Task #${index + 1} description must be 2000 characters or less`
      );
    }

    if (
      task.estimationPercent !== undefined &&
      (task.estimationPercent < 0 || task.estimationPercent > 100)
    ) {
      errors.push(`Task #${index + 1} estimation must be between 0 and 100%`);
    }
  });

  // Estimation validation
  const totalEstimation = template.tasks.reduce(
    (sum, task) => sum + (task.estimationPercent || 0),
    0
  );

  if (totalEstimation !== 100 && !template.validation?.totalEstimationRange) {
    warnings.push(
      `Total estimation is ${totalEstimation}% instead of 100%. Consider normalizing.`
    );
  }

  // Dependency validation
  const taskIds = new Set(
    template.tasks.map((t) => t.id).filter((id): id is string => !!id)
  );

  template.tasks.forEach((task, index) => {
    if (task.dependsOn) {
      task.dependsOn.forEach((depId) => {
        if (!taskIds.has(depId)) {
          errors.push(
            `Task #${index + 1} depends on non-existent task ID: "${depId}"`
          );
        }
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
