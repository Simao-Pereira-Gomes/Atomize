import { existsSync } from "node:fs";
import path from "node:path";
import {
  confirm,
  select,
  text,
} from "@clack/prompts";
import { logger } from "@config/logger";
import { PlatformFactory } from "@platforms/platform-factory";
import { StoryLearner } from "@services/template/story-learner";
import { TemplateCatalog } from "@services/template/template-catalog";
import { TemplateResolver } from "@services/template/template-resolver";
import type { MixinTemplate, PartialTaskTemplate } from "@templates/schema";
import { TemplateValidator } from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import { match } from "ts-pattern";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  createManagedSpinner,
  createManagedSpinner,
  isInteractiveTerminal,
  selectOrAutocomplete,
} from "@/cli/utilities/prompt-utilities";
import type { IPlatformAdapter, PlatformType } from "@/platforms";
import type { MultiStoryLearningResult } from "@/services/template/story-learner.types";
import type {
  Metadata,
  TaskTemplate,
  ValidationConfig,
} from "@/templates/schema";

type AnyTaskTemplate = TaskTemplate | PartialTaskTemplate;

import { createAzureDevOpsAdapter } from "@/cli/utilities/ado-adapter";
import { CancellationError, ConfigurationError } from "@/utils/errors";
import { createWithAI } from "./ai-creation";
import { customizeTemplate } from "./template-customize";
import {
  configureBasicInfo,
  configureEstimation,
  configureFilter,
  configureMetadata,
  configureTasksWithValidation,
  configureValidation,
  previewTemplate,
  type TemplateWizardContext,
} from "./template-wizard";
import {
  configureTemplateComposition,
  promptMixinRefs,
} from "./template-wizard-helper.command";

const defaultOutput = createCommandOutput(resolveCommandOutputPolicy({}));

interface CreateFromScratchOptions {
  quiet?: boolean;
  profile?: string;
}

type CreationMode = "template" | "stories" | "scratch" | "ai";
type CreationTarget = "template" | "mixin";

interface CreateOptions {
  type?: CreationTarget;
  from?: string;
  fromStories?: string;
  scratch?: boolean;
  ai?: boolean;
  ground?: boolean;
  aiProfile?: string;
  saveAs?: string;
  platform?: string;
  profile?: string;
  quiet?: boolean;
}

export const templateCreateCommand = new Command("create")
  .description("Create a new template interactively")
  .option("--type <type>", "Create as template or mixin")
  .option("--from <name>", "Start from an existing template")
  .option(
    "--from-stories <ids>",
    "Learn template from multiple stories (comma-separated IDs)",
  )
  .option("-p, --platform <platform>", "Platform to use", "azure-devops")
  .option("--profile <name>", "Connect to ADO using a named profile for field suggestions (uses default profile if omitted)")
  .option("--scratch", "Create from scratch (skip mode selection)")
  .option("--ai", "Use AI-assisted generation (describe the template in natural language)")
  .option("--ground", "Ground AI generation with patterns from your Azure DevOps workspace")
  .option("--ai-profile <name>", "AI provider profile to use (uses default AI profile if omitted)")
  .option("--save-as <name>", "Name to save the template under")
  .option("-q, --quiet", "Suppress non-essential output", false)
  .action(async (options: CreateOptions) => {
    const output = createCommandOutput(
      resolveCommandOutputPolicy({ quiet: options.quiet, verbose: false }),
    );
    try {
      output.intro(" Atomize — Template Creator");
      if (isInteractiveTerminal()) {
        output.print(
          chalk.gray(
            "  ↑↓ to navigate · Space to toggle · Enter to confirm · Ctrl+C to cancel\n",
          ),
        );
      }
      const target = await determineCreationTarget(options);
      const created =
        target === "mixin"
          ? await createMixin({ quiet: options.quiet, profile: options.profile })
          : await createFullTemplate(options);

      const saved = await saveCreatedTemplate(created, target, options.saveAs);
      output.print(chalk.green(`\n Template saved to ${saved.path}\n`));
      output.print(chalk.cyan("Use it with: ") + chalk.gray(saved.ref));
      output.blankLine();
      output.outro(`Template saved → ${saved.path}`);
    } catch (error) {
      if (error instanceof CancellationError) {
        output.outro("Cancelled.");
        process.exit(ExitCode.Success);
      }

      output.cancel("Template creation failed");
      logger.error(chalk.red("Template creation failed"));

      if (error instanceof Error) {
        output.print(chalk.red(error.message));
      }

      process.exit(ExitCode.Failure);
    }
  });

async function createFullTemplate(options: CreateOptions): Promise<AnyTaskTemplate> {
  const mode = await determineMode(options);

  return await match(mode)
    .with("template", async () => await createFromTemplate(options))
    .with("stories", async () => await createFromStories(options))
    .with(
      "scratch",
      async () => await createFromScratch({ quiet: options.quiet, profile: options.profile }),
    )
    .with("ai", async () => await createWithAI(options))
    .exhaustive();
}

async function determineCreationTarget(options: CreateOptions): Promise<CreationTarget> {
  if (options.type) {
    return parseCreationTarget(options.type);
  }

  if (!isInteractiveTerminal()) {
    return "template";
  }

  const target = assertNotCancelled(
    await select({
      message: "What are you creating?",
      options: [
        { label: "Template — discoverable reusable template", value: "template" },
        { label: "Mixin — discoverable reusable task group", value: "mixin" },
      ],
    }),
  ) as string;

  return parseCreationTarget(target);
}

function parseCreationTarget(value: string): CreationTarget {
  if (value === "template" || value === "mixin") {
    return value;
  }
  throw new ConfigurationError(
    `Invalid create type "${value}". Expected template or mixin.`,
  );
}

/**
 * Determine creation mode
 */
async function determineMode(options: CreateOptions): Promise<CreationMode> {
  if (options.from) return "template";
  if (options.fromStories) return "stories";
  if (options.scratch) return "scratch";
  if (options.ai) return "ai";

  // No flags - show interactive menu
  const mode = assertNotCancelled(
    await select({
      message: "How would you like to create your template?",
      options: [
        {
          label: "AI-assisted — describe in natural language",
          value: "ai",
        },
        {
          label: "Guided wizard — build step-by-step",
          value: "scratch",
        },
        {
          label: "From template — start with a built-in or saved template",
          value: "template",
        },
        {
          label: "From stories — learn patterns from existing examples",
          value: "stories",
        },
      ],
    }),
  );
  return mode as CreationMode;
}

/**
 * Create from template — offers either an inheritance link or a flat copy.
 *
 * Inheritance link: saves `extends: "template:<name>"` + a custom name/description.
 *   The resulting template is minimal; fields are resolved from the parent template at load time.
 *   Future updates to the parent template are automatically picked up.
 *
 * Flat copy: loads the parent template in full, lets the user customize it, and saves
 *   the complete resolved template (current behaviour).
 */
async function createFromTemplate(options: CreateOptions): Promise<AnyTaskTemplate> {
  defaultOutput.print(chalk.cyan("\n Create from Template\n"));

  const catalog = new TemplateCatalog();
  const templates = await catalog.listTemplates();

  let templateName = options.from;

  if (templateName) {
    templateName = templateName.startsWith("template:")
      ? templateName.slice("template:".length)
      : templateName;
    if (!templates.find((template) => template.name === templateName)) {
      throw new ConfigurationError(
        `Template "${templateName}" not found. Run: atomize template list --type template`,
      );
    }
  } else {
    if (templates.length === 0) {
      throw new Error(
        "No templates found. Create a template first.",
      );
    }

    templateName = await selectOrAutocomplete({
      message: "Select template:",
      options: templates.map((template) => ({
        label: formatCatalogChoice(template.displayName, template.scope),
        value: template.name,
        hint: template.description,
      })),
      placeholder: "Type to filter templates...",
    });
  }

  const resolver = new TemplateResolver(catalog);
  const parentTemplate = await resolver.loadTemplateRef(`template:${templateName}`);
  defaultOutput.print(chalk.green(`\nLoaded template: ${parentTemplate.name}`));
  defaultOutput.print(chalk.gray(`  ${parentTemplate.description ?? ""}\n`));

  const mode = assertNotCancelled(
    await select({
      message: "How do you want to use this template?",
      options: [
        {
          label: `Inheritance link  — saves extends: "template:${templateName}" (small template, stays in sync with template updates)`,
          value: "inherit",
        },
        {
          label: "Flat copy  — saves all fields so the template is fully self-contained",
          value: "copy",
        },
      ],
    }),
  ) as string;

  if (mode === "inherit") {
    const name = assertNotCancelled(
      await text({
        message: "Template name:",
        placeholder: `My ${parentTemplate.name}`,
        validate: (v): string | undefined => {
          if (!v || v.trim() === "") return "Name is required";
          return undefined;
        },
      }),
    ) as string;

    const description = assertNotCancelled(
      await text({
        message: "Description (optional):",
        placeholder: parentTemplate.description ?? "",
      }),
    ) as string;

    const mixins = await configureTemplateMixins(catalog);

    return {
      version: "1.0",
      extends: `template:${templateName}`,
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(mixins.length > 0 ? { mixins } : {}),
    } satisfies PartialTaskTemplate;
  }

  const customize = assertNotCancelled(
    await confirm({ message: "Customize the template?", initialValue: false }),
  );
  if (customize) {
    return await customizeTemplate(parentTemplate, options.profile);
  }
  await previewTemplate(parentTemplate);
  return parentTemplate;
}

function formatCatalogChoice(label: string, scope: string): string {
  return `${label} (${scope})`;
}

async function configureTemplateMixins(catalog: TemplateCatalog): Promise<string[]> {
  const addMixins = assertNotCancelled(
    await confirm({ message: "Add mixins?", initialValue: false }),
  );
  if (!addMixins) return [];

  const mixins = await catalog.listMixins();
  return await promptMixinRefs(mixins);
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

  const validateSpinner = createManagedSpinner();
  const validateSpinner = createManagedSpinner();
  validateSpinner.start(`Validating ${storyIds.length} story ID(s)...`);

  const results = await Promise.all(
    storyIds.map(async (id) => ({
      id,
      found: !!(await platform.getWorkItem?.(id)),
    })),
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
    defaultOutput.print(chalk.yellow(`  Not found: ${missing.join(", ")}`));

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
  defaultOutput.print(chalk.cyan("\n Learn from Multiple Stories\n"));

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

  const connectSpinner = createManagedSpinner();
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
  const learnSpinner = createManagedSpinner();
  const learnSpinner = createManagedSpinner();
  learnSpinner.start(`Learning from ${storyIds.length} stories...`);
  const result = await learner.learnFromStories(storyIds);
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
  defaultOutput.print(
    chalk.green(
      `\nAnalyzed ${result.analyses.length} stories, skipped ${result.skipped.length}`,
    ),
  );

  if (result.skipped.length > 0) {
    defaultOutput.print(chalk.yellow("\nSkipped stories:"));
    for (const s of result.skipped) {
      defaultOutput.print(chalk.yellow(`  - ${s.storyId}: ${s.reason}`));
    }
  }

  // Confidence
  const confidenceColor =
    result.confidence.level === "high"
      ? chalk.green
      : result.confidence.level === "medium"
        ? chalk.yellow
        : chalk.red;
  defaultOutput.print(
    confidenceColor(
      `\nConfidence: ${result.confidence.level} (${result.confidence.overall}%)`,
    ),
  );
  for (const factor of result.confidence.factors) {
    defaultOutput.print(
      chalk.gray(`  ${factor.name}: ${factor.score}% - ${factor.description}`),
    );
  }

  // Patterns
  defaultOutput.print(
    chalk.cyan(
      `\nPatterns: ${result.patterns.commonTasks.length} common tasks detected`,
    ),
  );
  defaultOutput.print(
    chalk.gray(`  Avg tasks/story: ${result.patterns.averageTaskCount}`),
  );

  // Merged template summary
  defaultOutput.print(
    chalk.green(
      `\nMerged template: ${result.mergedTemplate.tasks.length} tasks`,
    ),
  );

  // Suggestions
  if (result.suggestions.length > 0) {
    defaultOutput.print(chalk.cyan("\nSuggestions:"));
    for (const s of result.suggestions) {
      const icon =
        s.severity === "important"
          ? chalk.red("!")
          : s.severity === "warning"
            ? chalk.yellow("~")
            : chalk.gray("-");
      defaultOutput.print(`  ${icon} ${s.message}`);
    }
  }

  // Outliers
  if (result.outliers.length > 0) {
    defaultOutput.print(chalk.yellow("\nOutliers detected:"));
    for (const o of result.outliers) {
      defaultOutput.print(chalk.yellow(`  - ${o.message}`));
    }
  }

  // Variations
  if (result.variations.length > 0) {
    defaultOutput.print(
      chalk.cyan(`\n${result.variations.length} template variations available`),
    );
  }
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
 * await catalog.saveUserTemplate({ kind: "template", name: "my-template", template });
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
  const profile = _options.profile;
  const output = createCommandOutput(
    resolveCommandOutputPolicy({ quiet, verbose: false }),
  );
  const printStep = output.print;

  printStep(chalk.cyan("\nCreate Template from Scratch\n"));
  printStep(chalk.gray("Interactive template builder wizard"));
  printStep(chalk.gray("You can review and edit before saving\n"));

  const totalSteps = 6;
  let currentStep = 1;

  try {
    const catalog = new TemplateCatalog();
    const [templates, mixins] = await Promise.all([
      catalog.listTemplates(),
      catalog.listMixins(),
    ]);
    const { extendsRef, mixins: selectedMixins } = await configureTemplateComposition({
      templates,
      mixins,
    });

    let connectionSettled = false;
    const connectionPromise = (async () => {
      const adapter = await createAzureDevOpsAdapter(profile);
      const [taskSchemas, liveWorkItemTypes, liveAreaPaths, liveIterationPaths, liveTeams, liveSavedQueries] = await Promise.all([
        adapter.getFieldSchemas("Task"),
        adapter.getWorkItemTypes(),
        adapter.getAreaPaths(),
        adapter.getIterationPaths(),
        adapter.getTeams(),
        adapter.listSavedQueries(),
      ]);

      return {
        adapter,
        fieldSchemas: taskSchemas,
        filterCtx: {
          workItemTypes: liveWorkItemTypes,
          getStatesForType: (type: string) => adapter.getStatesForWorkItemType(type),
          areaPaths: liveAreaPaths,
          iterationPaths: liveIterationPaths,
          teams: liveTeams,
          savedQueries: liveSavedQueries,
        },
      };
    })().finally(() => { connectionSettled = true; });

    // Step 1: Basic Information (runs concurrently with the connection above)
    printStep(chalk.blue(`\n[${currentStep}/${totalSteps}] Basic Information`));
    printStep(chalk.gray("█░░░░░"));
    printStep(
      chalk.gray("Tip: Choose a clear, descriptive name for your template\n"),
    );

    const basicInfo = await configureBasicInfo();

    if (!basicInfo.name || basicInfo.name.trim() === "") {
      throw new ConfigurationError("Template name is required");
    }

    currentStep++;

    let filterCtx: import("./template-wizard-helper.command").FilterWizardContext;
    let fieldSchemas: import("@platforms/interfaces/field-schema.interface").ADoFieldSchema[];
    let adapterForWizard: import("@platforms/adapters/azure-devops/azure-devops.adapter").AzureDevOpsAdapter;

    const wasAlreadyConnected = connectionSettled;
    const connectSpinner = createManagedSpinner();
    if (!wasAlreadyConnected) connectSpinner.start("Connecting to ADO...");
    try {
      const conn = await connectionPromise;
      if (!wasAlreadyConnected) connectSpinner.stop("Connected ✓");
      filterCtx = conn.filterCtx;
      fieldSchemas = conn.fieldSchemas;
      adapterForWizard = conn.adapter;
    } catch (err) {
      if (!wasAlreadyConnected) connectSpinner.stop("Connection failed");
      const message = err instanceof Error ? err.message : String(err);
      const hint = err instanceof ConfigurationError
        ? '\n\n  Run "atomize auth add" to configure a connection profile.'
        : "";
      throw new ConfigurationError(`${message}${hint}`);
    }

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

    const filterConfig = await configureFilter(filterCtx);

    // Validate filter has at least work item types or states
    if (
      (!filterConfig.workItemTypes ||
        filterConfig.workItemTypes.length === 0) &&
      (!filterConfig.states || filterConfig.states.length === 0)
    ) {
      output.print(
        chalk.yellow(
          "\n Warning: No work item types or states configured.",
        ),
      );
      output.print(chalk.yellow("   This template will match ALL work items."));

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

    const workItemType = filterConfig.workItemTypes?.[0];
    const storyFieldSchemas = workItemType
      ? await adapterForWizard.getFieldSchemas(workItemType)
      : [];

    const tasks = await configureTasksWithValidation(fieldSchemas, storyFieldSchemas);

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
    const template: TaskTemplate = {
      version: "1.0",
      ...(extendsRef ? { extends: extendsRef } : {}),
      ...(selectedMixins.length > 0 ? { mixins: selectedMixins } : {}),
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
    output.print(chalk.green("\n✓ Template configured successfully!\n"));
    output.print(
      chalk.gray("Review your template and choose an action below.\n"),
    );

    const wizardCtx: TemplateWizardContext = {
      filterCtx,
      fieldSchemas,
      storyFieldSchemas,
      workItemType,
    };
    const confirmed = await previewTemplate(template, wizardCtx);

    if (!confirmed) {
      output.print(
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
      output.print(chalk.red(`\n Configuration error: ${error.message}`));
      output.print(chalk.gray("  Please check your inputs and try again."));
      throw error;
    }

    // Unknown error
    output.print(
      chalk.red(` Error creating template: ${(error as Error).message}`),
    );
    throw error;
  }
}

async function createMixin(
  options: CreateFromScratchOptions = {},
): Promise<MixinTemplate> {
  const quiet = options.quiet === true;
  const profile = options.profile;
  const output = createCommandOutput(
    resolveCommandOutputPolicy({ quiet, verbose: false }),
  );

  output.print(chalk.cyan("\nCreate Mixin\n"));
  output.print(chalk.gray("Reusable task group. Mixins do not define filters or estimation settings.\n"));

  const basicInfo = await configureBasicInfo();
  const { fieldSchemas, storyFieldSchemas } = await loadTaskWizardSchemas(profile);
  const tasks = await configureTasksWithValidation(fieldSchemas, storyFieldSchemas);

  if (tasks.length === 0) {
    throw new ConfigurationError("At least one task is required for a mixin.");
  }

  return {
    name: basicInfo.name,
    description: basicInfo.description,
    tasks,
  };
}

async function loadTaskWizardSchemas(
  profile: string | undefined,
): Promise<{
  fieldSchemas: import("@platforms/interfaces/field-schema.interface").ADoFieldSchema[];
  storyFieldSchemas: import("@platforms/interfaces/field-schema.interface").ADoFieldSchema[];
}> {
  const adapter = await createAzureDevOpsAdapter(profile);

  const [fieldSchemas, storyFieldSchemas] = await Promise.all([
    adapter.getFieldSchemas("Task"),
    adapter.getFieldSchemas("User Story"),
  ]);

  return { fieldSchemas, storyFieldSchemas };
}

async function saveCreatedTemplate(
  created: AnyTaskTemplate | MixinTemplate,
  target: CreationTarget,
  requestedName: string | undefined,
): Promise<{ path: string; ref: string }> {
  const catalog = new TemplateCatalog();
  const referenceName = requestedName
    ? parseReferenceName(requestedName)
    : await promptReferenceName(created.name);
  const targetPath = catalog.getUserTemplatePath(target, referenceName);
  const overwrite = existsSync(targetPath)
    ? assertNotCancelled(
        await confirm({
          message: `${target} "${referenceName}" already exists. Overwrite?`,
          initialValue: false,
        }),
      )
    : true;

  if (!overwrite) {
    throw new CancellationError("Save cancelled — catalog item not overwritten");
  }

  if (target === "mixin") {
    const item = await catalog.saveUserTemplate({
      kind: "mixin",
      name: referenceName,
      template: created,
      overwrite: true,
    });
    return { path: item.path, ref: item.ref };
  }

  const validation = await validateForSave(created as AnyTaskTemplate, targetPath);
  if (!validation.valid) {
    const firstError = validation.errors[0];
    const message = firstError
      ? `${firstError.path}: ${firstError.message}`
      : "Template validation failed";
    throw new Error(message);
  }

  const item = await catalog.saveUserTemplate({
    kind: target,
    name: referenceName,
    template: created,
    overwrite: true,
    validate: false,
  });
  return { path: item.path, ref: item.ref };
}

async function promptReferenceName(displayName: string): Promise<string> {
  const initialValue = slugifyTemplateName(displayName);
  const value = assertNotCancelled(
    await text({
      message: "Save as (used in refs like template:<id>):",
      placeholder: "e.g. backend-standard",
      initialValue,
      validate: (value: string | undefined) => {
        if (!value || value.trim() === "") return "Save name is required";
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value.trim())) {
          return "Letters, numbers, hyphens, and underscores only";
        }
        return undefined;
      },
    }),
  ) as string;
  return parseReferenceName(value);
}

function parseReferenceName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ConfigurationError("Reference name is required");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(trimmed)) {
    throw new ConfigurationError("Reference name must use only letters, numbers, underscores, and hyphens.");
  }
  return trimmed;
}

function slugifyTemplateName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "template";
}

async function validateForSave(
  template: AnyTaskTemplate,
  outputPath: string,
): Promise<ReturnType<TemplateValidator["validate"]>> {
  const validator = new TemplateValidator();
  if (!template.extends && (!template.mixins || template.mixins.length === 0)) {
    return validator.validate(template);
  }

  const catalog = new TemplateCatalog();
  const resolver = new TemplateResolver(catalog);
  const resolvedTemplate = await resolver.resolveRaw(template, path.resolve(outputPath));
  return validator.validate(resolvedTemplate);
}
