import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cancel,
  confirm,
  intro,
  multiselect,
  outro,
  select,
  text,
} from "@clack/prompts";
import { logger } from "@config/logger";
import { PlatformFactory } from "@platforms/platform-factory";
import { PresetManager } from "@services/template/preset-manager";
import { StoryLearner } from "@services/template/story-learner";
import { TemplateValidator } from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import { match } from "ts-pattern";
import { stringify as stringifyYaml } from "yaml";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  createManagedSpinner,
  isInteractiveTerminal,
} from "@/cli/utilities/prompt-utilities";
import type { IPlatformAdapter, PlatformType } from "@/platforms";
import type { MultiStoryLearningResult } from "@/services/template/story-learner.types";
import type {
  Metadata,
  TaskTemplate,
  ValidationConfig,
} from "@/templates/schema";
import { CancellationError, ConfigurationError } from "@/utils/errors";
import {
  configureBasicInfo,
  configureEstimation,
  configureFilter,
  configureMetadata,
  configureTasksWithValidation,
  configureValidation,
  editTasksInteractively,
  previewTemplate,
  type TemplateWizardContext,
} from "./template-wizard";

interface CreateFromScratchOptions {
  quiet?: boolean;
  profile?: string;
}

type CreationMode = "preset" | "stories" | "scratch";

interface CreateOptions {
  preset?: string;
  fromStories?: string;
  scratch?: boolean;
  output?: string;
  platform?: string;
  profile?: string;
  quiet?: boolean;
}

export const templateCreateCommand = new Command("create")
  .description("Create a new template interactively")
  .option("--preset <name>", "Start from a preset template")
  .option(
    "--from-stories <ids>",
    "Learn template from multiple stories (comma-separated IDs)",
  )
  .option("-p, --platform <platform>", "Platform to use", "azure-devops")
  .option("--profile <name>", "Connect to ADO using a named profile for field suggestions (uses default profile if omitted)")
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
        .with("preset", async () => await createFromPreset(options))
        .with("stories", async () => await createFromStories(options))
        .with(
          "scratch",
          async () => await createFromScratch({ quiet: options.quiet, profile: options.profile }),
        )
        .exhaustive();

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
  if (options.preset) return "preset";
  if (options.fromStories) return "stories";
  if (options.scratch) return "scratch";

  // No flags - show interactive menu
  const mode = assertNotCancelled(
    await select({
      message: "How would you like to create your template?",
      options: [
        {
          label: "From Preset - Start with a common template",
          value: "preset",
        },
        {
          label: "From Multiple Stories - Learn patterns from several examples",
          value: "stories",
        },
        {
          label: "From Scratch - Build step-by-step",
          value: "scratch",
        },
      ],
    }),
  );
  return mode as CreationMode;
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
    return await customizeTemplate(template, options.profile);
  }

  // Even without customization, show a preview so the user can confirm before saving.
  await previewTemplate(template);
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

type CustomizeSectionKey = "basicInfo" | "filter" | "tasks" | "estimation" | "validation" | "metadata";

/**
 * Customize a preset template interactively.
 *
 * Establishes an ADO connection (same fire-and-forget pattern as createFromScratch),
 * shows a multi-select section picker, then runs only the chosen wizard steps with
 * every prompt pre-filled from the preset's existing values.  Ends with the same
 * previewTemplate loop as the scratch path.
 */
async function customizeTemplate(
  template: TaskTemplate,
  profile?: string,
): Promise<TaskTemplate> {
  console.log(chalk.cyan("\nCustomize Preset\n"));
  let connectionSettled = false;
  const connectionPromise = (async () => {
    const { resolveAzureConfig } = await import("@config/profile-resolver");
    const { AzureDevOpsAdapter } = await import(
      "@platforms/adapters/azure-devops/azure-devops.adapter"
    );
    const azureConfig = await resolveAzureConfig(profile);
    const adapter = new AzureDevOpsAdapter(azureConfig);
    await adapter.authenticate();
    const [
      taskSchemas,
      liveWorkItemTypes,
      liveAreaPaths,
      liveIterationPaths,
      liveTeams,
      liveSavedQueries,
    ] = await Promise.all([
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
        getStatesForType: (type: string) =>
          adapter.getStatesForWorkItemType(type),
        areaPaths: liveAreaPaths,
        iterationPaths: liveIterationPaths,
        teams: liveTeams,
        savedQueries: liveSavedQueries,
      },
    };
  })().finally(() => {
    connectionSettled = true;
  });

  const sections = assertNotCancelled(
    await multiselect<CustomizeSectionKey>({
      message: "Which sections would you like to customize?",
      options: [
        { label: "Name & Description", value: "basicInfo" },
        { label: "Filter", value: "filter" },
        { label: "Tasks", value: "tasks" },
        { label: "Estimation", value: "estimation" },
        { label: "Validation Rules", value: "validation" },
        { label: "Metadata", value: "metadata" },
      ],
      required: false,
    }),
  ) as CustomizeSectionKey[];

  if (sections.includes("basicInfo")) {
    console.log(chalk.cyan("\nEditing Name & Description\n"));
    const basicInfo = await configureBasicInfo({
      name: template.name,
      description: template.description,
      author: template.author,
      tags: template.tags,
    });
    template.name = basicInfo.name;
    template.description = basicInfo.description;
    template.author = basicInfo.author;
    template.tags = basicInfo.tags;
  }

  // Await the ADO connection (spinner only if not yet settled).
  const wasAlreadyConnected = connectionSettled;
  const connectSpinner = createManagedSpinner();
  if (!wasAlreadyConnected) connectSpinner.start("Connecting to ADO...");

  let filterCtx: import("./template-wizard-helper.command").FilterWizardContext;
  let fieldSchemas: import("@platforms/interfaces/field-schema.interface").ADoFieldSchema[];
  let adapterForWizard: import("@platforms/adapters/azure-devops/azure-devops.adapter").AzureDevOpsAdapter;

  try {
    const conn = await connectionPromise;
    if (!wasAlreadyConnected) connectSpinner.stop("Connected ✓");
    filterCtx = conn.filterCtx;
    fieldSchemas = conn.fieldSchemas;
    adapterForWizard = conn.adapter;
  } catch (err) {
    if (!wasAlreadyConnected) connectSpinner.stop("Connection failed");
    const message = err instanceof Error ? err.message : String(err);
    const hint =
      err instanceof ConfigurationError
        ? '\n\n  Run "atomize auth add" to configure a connection profile.'
        : "";
    throw new ConfigurationError(`${message}${hint}`);
  }
  let storyFieldSchemas: import("@platforms/interfaces/field-schema.interface").ADoFieldSchema[] = [];
  let storySchemasFetched = false;

  for (const section of (
    ["filter", "tasks", "estimation", "validation", "metadata"] as const
  )) {
    if (!sections.includes(section)) continue;

    switch (section) {
      case "filter": {
        console.log(chalk.cyan("\nEditing Filter Configuration\n"));
        template.filter = await configureFilter(filterCtx, template.filter);
        // Warn if the filter would match all work items (mirrors createFromScratch behaviour).
        if (
          (!template.filter.workItemTypes || template.filter.workItemTypes.length === 0) &&
          (!template.filter.states || template.filter.states.length === 0)
        ) {
          console.log(chalk.yellow("\n Warning: No work item types or states configured."));
          console.log(chalk.yellow("   This template will match ALL work items."));
          const continueAnyway = assertNotCancelled(
            await confirm({ message: "Continue with empty filter?", initialValue: false }),
          );
          if (!continueAnyway) {
            throw new CancellationError(
              "Template creation cancelled. Please configure filter criteria.",
            );
          }
        }
        // Story schemas depend on work item type — invalidate cache after filter change.
        storySchemasFetched = false;
        break;
      }
      case "tasks": {
        console.log(chalk.cyan("\nEditing Tasks\n"));
        if (!storySchemasFetched) {
          const wit = template.filter.workItemTypes?.[0];
          storyFieldSchemas = wit ? await adapterForWizard.getFieldSchemas(wit) : [];
          storySchemasFetched = true;
        }
        template.tasks = await editTasksInteractively(
          template.tasks,
          fieldSchemas,
          storyFieldSchemas,
        );
        break;
      }
      case "estimation": {
        console.log(chalk.cyan("\nEditing Estimation Settings\n"));
        template.estimation = await configureEstimation(template.estimation);
        break;
      }
      case "validation": {
        console.log(chalk.cyan("\nEditing Validation Rules\n"));
        const enable = assertNotCancelled(
          await confirm({
            message: "Enable validation rules?",
            initialValue: !!template.validation,
          }),
        );
        template.validation = enable
          ? await configureValidation(template.validation)
          : undefined;
        break;
      }
      case "metadata": {
        console.log(chalk.cyan("\nEditing Metadata\n"));
        const enable = assertNotCancelled(
          await confirm({
            message: "Enable metadata?",
            initialValue: !!template.metadata,
          }),
        );
        template.metadata = enable
          ? await configureMetadata(template.metadata)
          : undefined;
        break;
      }
    }
  }

  if (!storySchemasFetched) {
    const wit = template.filter.workItemTypes?.[0];
    storyFieldSchemas = wit ? await adapterForWizard.getFieldSchemas(wit) : [];
  }

  // Stamp a fresh created date — this is a new template derived from a preset.
  template.created = new Date().toISOString();

  console.log(chalk.green("\n✓ Template customized successfully!\n"));
  console.log(chalk.gray("Review your template and choose an action below.\n"));

  const wizardCtx: TemplateWizardContext = {
    filterCtx,
    fieldSchemas,
    storyFieldSchemas,
    workItemType: template.filter.workItemTypes?.[0],
  };

  const confirmed = await previewTemplate(template, wizardCtx);

  if (!confirmed) {
    throw new CancellationError("Template customization cancelled by user");
  }

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
  const profile = _options.profile;
  const printStep = (msg: string) => {
    if (!quiet) console.log(msg);
  };

  printStep(chalk.cyan("\nCreate Template from Scratch\n"));
  printStep(chalk.gray("Interactive template builder wizard"));
  printStep(chalk.gray("You can review and edit before saving\n"));

  const totalSteps = 6;
  let currentStep = 1;

  try {
    let connectionSettled = false;
    const connectionPromise = (async () => {
      const { resolveAzureConfig } = await import("@config/profile-resolver");
      const { AzureDevOpsAdapter } = await import("@platforms/adapters/azure-devops/azure-devops.adapter");
      const azureConfig = await resolveAzureConfig(profile);
      const adapter = new AzureDevOpsAdapter(azureConfig);
      await adapter.authenticate();
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
      console.log(
        chalk.yellow(
          "\n Warning: No work item types or states configured.",
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

    const wizardCtx: TemplateWizardContext = {
      filterCtx,
      fieldSchemas,
      storyFieldSchemas,
      workItemType,
    };
    const confirmed = await previewTemplate(template, wizardCtx);

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
