import type { TaskDefinition, TaskTemplate } from "@templates/schema";
import { normalizeEstimationPercentages } from "@utils/estimation-normalizer";
import chalk from "chalk";
import inquirer from "inquirer";
import { match } from "ts-pattern";
import { stringify as stringifyYaml } from "yaml";
import { CancellationError } from "@/utils/errors";
import { ListType } from "../../utilities/prompt-utilities";
import { buildTaskDefinition } from "./task-configuration";

const Actions = {
  Save: "save",
  ViewYaml: "yaml",
  Edit: "edit",
  Cancel: "cancel",
} as const;

type Action = (typeof Actions)[keyof typeof Actions];

/**
 * Normalize task estimations to sum to 100%
 */
export function normalizeEstimations(tasks: TaskDefinition[]): void {
  normalizeEstimationPercentages(tasks, {
    skipIfAlreadyNormalized: false, // Always normalize in wizard context
    enableLogging: false,
  });

  const finalTotal = tasks.reduce((s, t) => s + (t.estimationPercent || 0), 0);
  if (finalTotal !== 100) {
    console.warn(
      chalk.yellow(
        `Warning: Normalization resulted in ${finalTotal}% instead of 100%`
      )
    );
  }
}

/**
 * Display template preview and get user action
 */
export async function previewTemplate(
  template: TaskTemplate
): Promise<boolean> {
  displayTemplatePreview(template);

  const { action } = await inquirer.prompt([
    {
      type: ListType,
      name: "action",
      message: "What would you like to do?",
      choices: [
        { name: "Save template", value: Actions.Save },
        { name: "View full YAML", value: Actions.ViewYaml },
        { name: "Edit template", value: Actions.Edit },
        { name: "Cancel", value: Actions.Cancel },
      ],
    },
  ]);

  return await handlePreviewAction(action, template);
}

/**
 * Display formatted template preview
 */
function displayTemplatePreview(template: TaskTemplate): void {
  console.log(chalk.cyan("\nTemplate Preview\n"));
  console.log(chalk.cyan("═".repeat(50)));
  displayBasicInfo(template);
  displayFilterConfig(template);
  displayTasksSummary(template);
  displayEstimationConfig(template);
  displayValidationConfig(template);
  displayMetadata(template);
}

/**
 * Display basic template information
 */
function displayBasicInfo(template: TaskTemplate): void {
  console.log(chalk.bold("\nBasic Information:"));
  console.log(`  Name: ${template.name}`);
  if (template.description) {
    console.log(`  Description: ${template.description}`);
  }
  if (template.author) {
    console.log(`  Author: ${template.author}`);
  }
  if (template.tags && template.tags.length > 0) {
    console.log(`  Tags: ${template.tags.join(", ")}`);
  }
}

/**
 * Display filter configuration
 */
function displayFilterConfig(template: TaskTemplate): void {
  console.log(chalk.bold("\nFilter Configuration:"));

  if (template.filter.workItemTypes) {
    console.log(
      `  Work Item Types: ${template.filter.workItemTypes.join(", ")}`
    );
  }
  if (template.filter.states) {
    console.log(`  States: ${template.filter.states.join(", ")}`);
  }
  if (template.filter.excludeIfHasTasks) {
    console.log("  Excludes items that already have tasks");
  }
}

/**
 * Display tasks summary with progress bars
 */
function displayTasksSummary(template: TaskTemplate): void {
  console.log(chalk.bold(`\nTasks (${template.tasks.length}):`));

  const totalEstimation = template.tasks.reduce(
    (sum, task) => sum + (task.estimationPercent || 0),
    0
  );

  template.tasks.forEach((task, index) => {
    const percent = task.estimationPercent || 0;
    const bar = "■".repeat(Math.round(percent / 5));
    console.log(
      `  ${index + 1}. ${task.title} ${chalk.gray(
        `[${percent}%]`
      )} ${chalk.green(bar)}`
    );
    if (task.description) {
      console.log(chalk.gray(`     ${task.description}`));
    }
  });

  const checkMark = totalEstimation === 100 ? "✓" : "⚠";
  console.log(
    chalk.bold(`\nTotal Estimation: ${totalEstimation}% ${checkMark}`)
  );
}

/**
 * Display estimation configuration
 */
function displayEstimationConfig(template: TaskTemplate): void {
  if (template.estimation) {
    console.log(chalk.bold("\nEstimation Settings:"));
    console.log(`  Rounding: ${template.estimation.rounding}`);
  }
}

/**
 * Display validation configuration
 */
function displayValidationConfig(template: TaskTemplate): void {
  if (!template.validation) return;

  console.log(chalk.bold("\nValidation Rules:"));

  if (template.validation.totalEstimationMustBe) {
    console.log(
      `  Total estimation must be: ${template.validation.totalEstimationMustBe}%`
    );
  }

  if (template.validation.totalEstimationRange) {
    console.log(
      `  Total estimation range: ${template.validation.totalEstimationRange.min}% - ${template.validation.totalEstimationRange.max}%`
    );
  }

  if (template.validation.minTasks || template.validation.maxTasks) {
    console.log(
      `  Task count: ${template.validation.minTasks || "no min"} - ${
        template.validation.maxTasks || "no max"
      }`
    );
  }
}

/**
 * Display metadata
 */
function displayMetadata(template: TaskTemplate): void {
  if (!template.metadata) return;

  console.log(chalk.bold("\nMetadata:"));
  if (template.metadata.category) {
    console.log(`  Category: ${template.metadata.category}`);
  }
}

/**
 * Edit template interactively
 */
async function editTemplate(template: TaskTemplate): Promise<void> {
  const { section } = await inquirer.prompt([
    {
      type: ListType,
      name: "section",
      message: "What would you like to edit?",
      choices: [
        {
          name: "Basic Information (name, description, author, tags)",
          value: "basic",
        },
        { name: "Filter Configuration", value: "filter" },
        { name: "Tasks", value: "tasks" },
        { name: "Estimation Settings", value: "estimation" },
        { name: "Validation Rules", value: "validation" },
        { name: "Metadata", value: "metadata" },
        { name: "Back to preview", value: "back" },
      ],
    },
  ]);

  if (section === "back") {
    return;
  }

  await match(section)
    .with("basic", async () => {
      console.log(chalk.cyan("\nEditing Basic Information\n"));
      const { configureBasicInfo } = await import(
        "./template-wizard-helper.command"
      );
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
    })
    .with("filter", async () => {
      console.log(chalk.cyan("\nEditing Filter Configuration\n"));
      const { configureFilter } = await import(
        "./template-wizard-helper.command"
      );
      const filterConfig = await configureFilter();
      template.filter = filterConfig;
    })
    .with("tasks", async () => {
      console.log(chalk.cyan("\nEditing Tasks\n"));
      console.log(
        chalk.yellow("Note: This will replace all existing tasks.\n")
      );

      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Are you sure you want to reconfigure all tasks?",
          default: false,
        },
      ]);

      if (confirm) {
        const tasks = await configureTasksWithValidation();
        template.tasks = tasks;
      }
    })
    .with("estimation", async () => {
      console.log(chalk.cyan("\nEditing Estimation Settings\n"));
      const { configureEstimation } = await import(
        "./template-wizard-helper.command"
      );
      const estimation = await configureEstimation();
      template.estimation = estimation;
    })
    .with("validation", async () => {
      console.log(chalk.cyan("\nEditing Validation Rules\n"));
      const { addValidation } = await inquirer.prompt([
        {
          type: "confirm",
          name: "addValidation",
          message: "Enable validation rules?",
          default: !!template.validation,
        },
      ]);

      if (addValidation) {
        const { configureValidation } = await import(
          "./template-wizard-helper.command"
        );
        template.validation = await configureValidation();
      } else {
        template.validation = undefined;
      }
    })
    .with("metadata", async () => {
      console.log(chalk.cyan("\nEditing Metadata\n"));
      const { addMetadata } = await inquirer.prompt([
        {
          type: "confirm",
          name: "addMetadata",
          message: "Enable metadata?",
          default: !!template.metadata,
        },
      ]);

      if (addMetadata) {
        const { configureMetadata } = await import(
          "./template-wizard-helper.command"
        );
        template.metadata = await configureMetadata();
      } else {
        template.metadata = undefined;
      }
    })
    .otherwise(() => {
      console.log(chalk.yellow("Invalid section selected"));
    });

  console.log(chalk.green("\n✓ Section updated successfully!\n"));

  // Ask if they want to edit another section
  const { editMore } = await inquirer.prompt([
    {
      type: "confirm",
      name: "editMore",
      message: "Edit another section?",
      default: false,
    },
  ]);

  if (editMore) {
    await editTemplate(template);
  }
}

/**
 * Handle preview action
 */
async function handlePreviewAction(
  action: Action,
  template: TaskTemplate
): Promise<boolean> {
  return await match<Action>(action)
    .with(Actions.ViewYaml, async () => {
      console.log(chalk.cyan("\nFull YAML:\n"));
      console.log(chalk.gray(stringifyYaml(template)));
      console.log("");
      return await previewTemplate(template);
    })
    .with(Actions.Edit, async () => {
      await editTemplate(template);
      return await previewTemplate(template);
    })
    .with(Actions.Cancel, () => {
      throw new CancellationError("Template creation cancelled by user");
    })
    .with(Actions.Save, () => {
      return true;
    })
    .exhaustive();
}

/**
 * Show helpful hints for current step
 */
export function showStepHint(stepName: string): void {
  const hints: Record<string, string> = {
    filter:
      "Tip: Use filters to select which work items this template applies to",
    tasks:
      "Tip: Break work into clear, actionable tasks. Estimation percentages will be normalized to 100%. If you plan on set dependencies, please set task IDs.",
    estimation: "Tip: Choose how story points will be calculated and rounded",
    validation: "Tip: Add constraints to ensure templates are used correctly",
    metadata: "Tip: Metadata helps others understand when to use this template",
  };

  const hint = hints[stepName.toLowerCase()];
  if (hint) {
    console.log(chalk.gray(`\n${hint}\n`));
  }
}

/**
 * Configure tasks with improved flow and error handling
 */
export async function configureTasksWithValidation(): Promise<
  TaskDefinition[]
> {
  while (true) {
    try {
      const tasks = await collectTasks();
      await handleEstimationNormalization(tasks);
      return tasks;
    } catch (error) {
      const shouldRetry = await promptRetry(error);
      if (!shouldRetry) {
        throw error;
      }
    }
  }
}

/**
 * Collect tasks from user
 */
async function collectTasks(): Promise<TaskDefinition[]> {
  showStepHint("tasks");

  const tasks: TaskDefinition[] = [];
  let taskCounter = 1;
  let addMore = true;

  while (addMore) {
    console.log(chalk.gray(`\nTask #${taskCounter}:`));

    const wantsAdvanced = await promptForAdvancedOptions();
    const task = await buildTaskDefinition(taskCounter === 1, wantsAdvanced);

    tasks.push(task);
    taskCounter++;

    warnIfTooManyTasks(taskCounter);
    addMore = await shouldAddMoreTasks(taskCounter);
  }

  return tasks;
}

/**
 * Prompt user if they want advanced task options
 */
async function promptForAdvancedOptions(): Promise<boolean> {
  const { addAdvanced } = await inquirer.prompt([
    {
      type: "confirm",
      name: "addAdvanced",
      message: "Configure advanced options?",
      default: false,
    },
  ]);

  return addAdvanced;
}

/**
 * Warn user if they have too many tasks
 */
function warnIfTooManyTasks(taskCounter: number): void {
  if (taskCounter > 20) {
    console.log(
      chalk.yellow(
        "\n  You've added 20 tasks. Consider breaking this into multiple templates."
      )
    );
  }
}

/**
 * Ask user if they want to add more tasks
 */
async function shouldAddMoreTasks(taskCounter: number): Promise<boolean> {
  const { more } = await inquirer.prompt([
    {
      type: "confirm",
      name: "more",
      message: "Add another task?",
      default: taskCounter <= 5,
    },
  ]);

  return more;
}

/**
 * Handle estimation normalization and display results
 */
async function handleEstimationNormalization(
  tasks: TaskDefinition[]
): Promise<void> {
  const totalEstimation = tasks.reduce(
    (sum, task) => sum + (task.estimationPercent || 0),
    0
  );

  if (totalEstimation === 100) {
    console.log(chalk.green("✓ Total estimation is 100%"));
    return;
  }

  console.log(
    chalk.yellow(
      `\n  Warning: Total estimation is ${totalEstimation}% (should be 100%)`
    )
  );

  const shouldNormalize = await promptForNormalization();

  if (shouldNormalize) {
    normalizeEstimations(tasks);
    console.log(chalk.green("✓ Estimations normalized to 100%"));
    displayNormalizedEstimations(tasks);
  }
}

/**
 * Prompt user to normalize estimations
 */
async function promptForNormalization(): Promise<boolean> {
  const { normalize } = await inquirer.prompt([
    {
      type: "confirm",
      name: "normalize",
      message: "Normalize estimations to sum to 100%?",
      default: true,
    },
  ]);

  return normalize;
}

/**
 * Display normalized estimation values
 */
function displayNormalizedEstimations(tasks: TaskDefinition[]): void {
  console.log(chalk.gray("\nNormalized estimations:"));
  tasks.forEach((task, index) => {
    console.log(
      chalk.gray(`  ${index + 1}. ${task.title}: ${task.estimationPercent}%`)
    );
  });
}

/**
 * Prompt user to retry after error
 */
async function promptRetry(error: unknown): Promise<boolean> {
  console.log(chalk.red(`\nError configuring tasks: ${error}`));

  const { retry } = await inquirer.prompt([
    {
      type: "confirm",
      name: "retry",
      message: "Try again?",
      default: true,
    },
  ]);

  return retry;
}

export {
  configureBasicInfo,
  configureEstimation,
  configureFilter,
  configureMetadata,
  configureValidation,
} from "./template-wizard-helper.command";
