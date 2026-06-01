import { confirm, select } from "@clack/prompts";
import type { ADoFieldSchema } from "@platforms/interfaces/field-schema.interface";
import type { TaskDefinition, TaskTemplate } from "@templates/schema";
import { normalizeEstimationPercentages } from "@utils/estimation-normalizer";
import chalk from "chalk";
import { match } from "ts-pattern";
import { stringify as stringifyYaml } from "yaml";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { CancellationError, getErrorMessage } from "@/utils/errors";
import { assertNotCancelled } from "../../utilities/prompt-utilities";
import { buildTaskDefinition } from "./task-configuration";
import type { FilterWizardContext } from "./template-wizard-helper.command";

/** ADO data carried through the whole template-creation session. */
export interface TemplateWizardContext {
  filterCtx: FilterWizardContext;
  fieldSchemas: ADoFieldSchema[];
  storyFieldSchemas: ADoFieldSchema[];
  workItemType: string | undefined;
}

const Actions = {
  Save: "save",
  ViewYaml: "yaml",
  Edit: "edit",
  Cancel: "cancel",
} as const;

type Action = (typeof Actions)[keyof typeof Actions];

const output = createCommandOutput(resolveCommandOutputPolicy({}));

/**
 * Normalize task estimations to sum to 100%
 *
 * This function uses the estimation normalizer utility to ensure all task
 * estimation percentages sum to exactly 100%. It handles edge cases like:
 * - Single task: Set to 100%
 * - All zeros: Distribute equally
 * - Decimals: Round intelligently with remainder adjustment
 *
 * @param tasks - Array of task definitions to normalize
 * @throws Warning if normalization fails to reach 100% (rare edge case)
 */
export function normalizeEstimations(tasks: TaskDefinition[]): void {
  normalizeEstimationPercentages(tasks, {
    skipIfAlreadyNormalized: false, // Always normalize in wizard context
    enableLogging: false,
  });

  const finalTotal = tasks.reduce((s, t) => s + (t.estimationPercent || 0), 0);
  if (finalTotal !== 100) {
    output.printAlways(
      chalk.yellow(
        `Warning: Normalization resulted in ${finalTotal}% instead of 100%`
      ),
    );
  }
}

/**
 * Display template preview and get user action
 *
 * Shows a formatted preview of the template with all sections and prompts
 * the user to choose an action: save, view YAML, edit, or cancel.
 *
 * @param template - The template to preview
 * @returns Promise<boolean> - true if user wants to save, false otherwise
 * @throws CancellationError if user chooses to cancel
 */
export async function previewTemplate(
  template: TaskTemplate,
  ctx?: TemplateWizardContext,
): Promise<boolean> {
  displayTemplatePreview(template);

  const action = assertNotCancelled(
    await select({
      message: "What would you like to do?",
      options: [
        { label: "Save template", value: Actions.Save },
        { label: "View full YAML", value: Actions.ViewYaml },
        ...(ctx ? [{ label: "Edit template", value: Actions.Edit }] : []),
        { label: "Cancel", value: Actions.Cancel },
      ],
    })
  );

  return await handlePreviewAction(action as Action, template, ctx);
}

/**
 * Display formatted template preview
 */
export function displayTemplatePreview(template: TaskTemplate): void {
  output.print(chalk.cyan("\nTemplate Preview\n"));
  output.print(chalk.cyan("═".repeat(50)));
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
  output.print(chalk.bold("\nBasic Information:"));
  output.print(`  Name: ${template.name}`);
  if (template.description) {
    output.print(`  Description: ${template.description}`);
  }
  if (template.author) {
    output.print(`  Author: ${template.author}`);
  }
  if (template.tags && template.tags.length > 0) {
    output.print(`  Tags: ${template.tags.join(", ")}`);
  }
}

/**
 * Display filter configuration
 */
function displayFilterConfig(template: TaskTemplate): void {
  output.print(chalk.bold("\nFilter Configuration:"));

  if (template.filter.workItemTypes) {
    output.print(
      `  Work Item Types: ${template.filter.workItemTypes.join(", ")}`
    );
  }
  if (template.filter.states) {
    output.print(`  States: ${template.filter.states.join(", ")}`);
  }
  if (template.filter.excludeIfHasTasks) {
    output.print("  Excludes items that already have tasks");
  }
}

/**
 * Display tasks summary with progress bars
 */
function displayTasksSummary(template: TaskTemplate): void {
  output.print(chalk.bold(`\nTasks (${template.tasks.length}):`));

  const totalEstimation = template.tasks.reduce(
    (sum, task) => sum + (task.estimationPercent || 0),
    0
  );

  template.tasks.forEach((task, index) => {
    const percent = task.estimationPercent || 0;
    const bar = "■".repeat(Math.round(percent / 5));
    output.print(
      `  ${index + 1}. ${task.title} ${chalk.gray(
        `[${percent}%]`
      )} ${chalk.green(bar)}`
    );
    if (task.description) {
      output.print(chalk.gray(`     ${task.description}`));
    }
  });

  const checkMark = totalEstimation === 100 ? "✓" : "⚠";
  output.print(
    chalk.bold(`\nTotal Estimation: ${totalEstimation}% ${checkMark}`)
  );
}

/**
 * Display estimation configuration
 */
function displayEstimationConfig(template: TaskTemplate): void {
  if (template.estimation) {
    output.print(chalk.bold("\nEstimation Settings:"));
    output.print(`  Rounding: ${template.estimation.rounding}`);
  }
}

/**
 * Display validation configuration
 */
function displayValidationConfig(template: TaskTemplate): void {
  if (!template.validation) return;

  output.print(chalk.bold("\nValidation Rules:"));

  if (template.validation.totalEstimationMustBe) {
    output.print(
      `  Total estimation must be: ${template.validation.totalEstimationMustBe}%`
    );
  }

  if (template.validation.totalEstimationRange) {
    output.print(
      `  Total estimation range: ${template.validation.totalEstimationRange.min}% - ${template.validation.totalEstimationRange.max}%`
    );
  }

  if (template.validation.minTasks || template.validation.maxTasks) {
    output.print(
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

  output.print(chalk.bold("\nMetadata:"));
  if (template.metadata.category) {
    output.print(`  Category: ${template.metadata.category}`);
  }
}

/**
 * Edit template interactively
 */
async function editTemplate(template: TaskTemplate, ctx: TemplateWizardContext): Promise<void> {
  const section = assertNotCancelled(
    await select({
      message: "What would you like to edit?",
      options: [
        {
          label: "Basic Information (name, description, author, tags)",
          value: "basic",
        },
        { label: "Filter Configuration", value: "filter" },
        { label: "Tasks", value: "tasks" },
        { label: "Estimation Settings", value: "estimation" },
        { label: "Validation Rules", value: "validation" },
        { label: "Metadata", value: "metadata" },
        { label: "Back to preview", value: "back" },
      ],
    })
  );

  if (section === "back") {
    return;
  }

  await match(section)
    .with("basic", async () => {
      output.print(chalk.cyan("\nEditing Basic Information\n"));
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
      output.print(chalk.cyan("\nEditing Filter Configuration\n"));
      const { configureFilter } = await import(
        "./template-wizard-helper.command"
      );
      const filterConfig = await configureFilter(ctx.filterCtx, template.filter);
      template.filter = filterConfig;
    })
    .with("tasks", async () => {
      output.print(chalk.cyan("\nEditing Tasks\n"));
      template.tasks = await editTasksInteractively(
        template.tasks,
        ctx.fieldSchemas,
        ctx.storyFieldSchemas,
      );
    })
    .with("estimation", async () => {
      output.print(chalk.cyan("\nEditing Estimation Settings\n"));
      const { configureEstimation } = await import(
        "./template-wizard-helper.command"
      );
      const estimation = await configureEstimation(template.estimation);
      template.estimation = estimation;
    })
    .with("validation", async () => {
      output.print(chalk.cyan("\nEditing Validation Rules\n"));
      const addValidation = assertNotCancelled(
        await confirm({
          message: "Enable validation rules?",
          initialValue: !!template.validation,
        })
      );

      if (addValidation) {
        const { configureValidation } = await import(
          "./template-wizard-helper.command"
        );
        template.validation = await configureValidation(template.validation);
      } else {
        template.validation = undefined;
      }
    })
    .with("metadata", async () => {
      output.print(chalk.cyan("\nEditing Metadata\n"));
      const addMetadata = assertNotCancelled(
        await confirm({
          message: "Enable metadata?",
          initialValue: !!template.metadata,
        })
      );

      if (addMetadata) {
        const { configureMetadata } = await import(
          "./template-wizard-helper.command"
        );
        template.metadata = await configureMetadata(template.metadata);
      } else {
        template.metadata = undefined;
      }
    })
    .otherwise(() => {
      output.print(chalk.yellow("Invalid section selected"));
    });

  output.print(chalk.green("\n✓ Section updated successfully!\n"));

  const editMore = assertNotCancelled(
    await confirm({
      message: "Edit another section?",
      initialValue: false,
    })
  );

  if (editMore) {
    await editTemplate(template, ctx);
  }
}

/**
 * Handle preview action
 */
async function handlePreviewAction(
  action: Action,
  template: TaskTemplate,
  ctx?: TemplateWizardContext,
): Promise<boolean> {
  return await match<Action>(action)
    .with(Actions.ViewYaml, async () => {
      output.print(chalk.cyan("\nFull YAML:\n"));
      output.print(chalk.gray(stringifyYaml(template)));
      output.blankLine();
      return await previewTemplate(template, ctx);
    })
    .with(Actions.Edit, async () => {
      if (ctx) await editTemplate(template, ctx);
      return await previewTemplate(template, ctx);
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
    output.print(chalk.gray(`\n${hint}\n`));
  }
}

/**
 * Configure tasks with improved flow and error handling.
 * When `defaults` is supplied a summary of the existing tasks is shown before
 * the user starts building the new list (they always rebuild from scratch, but
 * can reference what was there before).
 */
export async function configureTasksWithValidation(
  fieldSchemas: ADoFieldSchema[],
  storyFieldSchemas: ADoFieldSchema[],
  defaults?: TaskDefinition[],
): Promise<TaskDefinition[]> {
  if (defaults && defaults.length > 0) {
    output.print(chalk.gray(`\nExisting tasks (${defaults.length}):`));
    defaults.forEach((t, i) => {
      const pct = t.estimationPercent !== undefined ? chalk.gray(` [${t.estimationPercent}%]`) : "";
      output.print(chalk.gray(`  ${i + 1}. ${t.title}${pct}`));
    });
    output.blankLine();
  }

  while (true) {
    try {
      const tasks = await collectTasks(fieldSchemas, storyFieldSchemas);
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
async function collectTasks(
  fieldSchemas: ADoFieldSchema[],
  storyFieldSchemas: ADoFieldSchema[],
): Promise<TaskDefinition[]> {
  showStepHint("tasks");

  const tasks: TaskDefinition[] = [];
  let taskCounter = 1;
  let addMore = true;

  while (addMore) {
    output.print(chalk.gray(`\nTask #${taskCounter}:`));

    const wantsAdvanced = await promptForAdvancedOptions();
    const task = await buildTaskDefinition(taskCounter === 1, wantsAdvanced, fieldSchemas, storyFieldSchemas);

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
  return assertNotCancelled(
    await confirm({
      message: "Configure advanced options?",
      initialValue: false,
    })
  );
}

/**
 * Warn user if they have too many tasks
 */
function warnIfTooManyTasks(taskCounter: number): void {
  if (taskCounter > 20) {
    output.print(
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
  return assertNotCancelled(
    await confirm({
      message: "Add another task?",
      initialValue: taskCounter <= 5,
    })
  );
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
    output.print(chalk.green("✓ Total estimation is 100%"));
    return;
  }

  output.print(
    chalk.yellow(
      `\n  Warning: Total estimation is ${totalEstimation}% (should be 100%)`
    )
  );

  const shouldNormalize = await promptForNormalization();

  if (shouldNormalize) {
    normalizeEstimations(tasks);
    output.print(chalk.green("✓ Estimations normalized to 100%"));
    displayNormalizedEstimations(tasks);
  }
}

/**
 * Prompt user to normalize estimations
 */
async function promptForNormalization(): Promise<boolean> {
  return assertNotCancelled(
    await confirm({
      message: "Normalize estimations to sum to 100%?",
      initialValue: true,
    })
  );
}

/**
 * Display normalized estimation values
 */
function displayNormalizedEstimations(tasks: TaskDefinition[]): void {
  output.print(chalk.gray("\nNormalized estimations:"));
  tasks.forEach((task, index) => {
    output.print(
      chalk.gray(`  ${index + 1}. ${task.title}: ${task.estimationPercent}%`)
    );
  });
}

/**
 * Prompt user to retry after error
 */
async function promptRetry(error: unknown): Promise<boolean> {
  output.print(chalk.red(`\nError configuring tasks: ${getErrorMessage(error)}`));

  return assertNotCancelled(
    await confirm({
      message: "Try again?",
      initialValue: true,
    })
  );
}

/**
 * Per-task editing loop — lets users edit, add, or remove individual tasks
 * without having to replace the entire list.  The final task list is
 * normalization-checked before being returned.
 */
export async function editTasksInteractively(
  tasks: TaskDefinition[],
  fieldSchemas: ADoFieldSchema[],
  storyFieldSchemas: ADoFieldSchema[],
): Promise<TaskDefinition[]> {
  let currentTasks = [...tasks];

  const displayTasks = () => {
    const total = currentTasks.reduce((s, t) => s + (t.estimationPercent ?? 0), 0);
    const totalLabel =
      total === 100
        ? chalk.green("100% ✓")
        : chalk.yellow(`${total}% — doesn't sum to 100`);
    output.print(chalk.cyan(`\nTasks (${currentTasks.length}) — total: ${totalLabel}\n`));
    currentTasks.forEach((t, i) => {
      output.print(chalk.gray(`  ${i + 1}. ${t.title} [${t.estimationPercent ?? 0}%]`));
    });
    output.blankLine();
  };

  let editing = true;
  while (editing) {
    displayTasks();

    const action = assertNotCancelled(
      await select({
        message: "What would you like to do?",
        options: [
          { label: "Edit a task", value: "edit" },
          { label: "Add a task", value: "add" },
          ...(currentTasks.length > 0
            ? [{ label: "Remove a task", value: "remove" }]
            : []),
          { label: "Replace all tasks", value: "replaceAll" },
          { label: "Done", value: "done" },
        ],
      }),
    ) as string;

    switch (action) {
      case "edit": {
        const idx = assertNotCancelled(
          await select({
            message: "Select task to edit:",
            options: currentTasks.map((t, i) => ({
              label: `${i + 1}. ${t.title} [${t.estimationPercent ?? 0}%]`,
              value: i,
            })),
          }),
        ) as number;
        const wantsAdvanced = assertNotCancelled(
          await confirm({ message: "Configure advanced options?", initialValue: false }),
        );
        currentTasks[idx] = await buildTaskDefinition(
          false,
          wantsAdvanced,
          fieldSchemas,
          storyFieldSchemas,
          currentTasks[idx],
        );
        break;
      }
      case "add": {
        const wantsAdvanced = assertNotCancelled(
          await confirm({ message: "Configure advanced options?", initialValue: false }),
        );
        currentTasks.push(
          await buildTaskDefinition(
            currentTasks.length === 0,
            wantsAdvanced,
            fieldSchemas,
            storyFieldSchemas,
          ),
        );
        break;
      }
      case "remove": {
        const idx = assertNotCancelled(
          await select({
            message: "Select task to remove:",
            options: currentTasks.map((t, i) => ({
              label: `${i + 1}. ${t.title} [${t.estimationPercent ?? 0}%]`,
              value: i,
            })),
          }),
        ) as number;
        currentTasks.splice(idx, 1);
        break;
      }
      case "replaceAll": {
        const confirmed = assertNotCancelled(
          await confirm({
            message: "Replace all tasks? This cannot be undone.",
            initialValue: false,
          }),
        );
        if (confirmed) {
          currentTasks = await configureTasksWithValidation(fieldSchemas, storyFieldSchemas);
          editing = false;
        }
        break;
      }
      case "done": {
        if (currentTasks.length === 0) {
          output.print(chalk.yellow("  At least one task is required."));
          break;
        }
        editing = false;
        break;
      }
    }
  }
  if (currentTasks.reduce((s, t) => s + (t.estimationPercent ?? 0), 0) !== 100) {
    await handleEstimationNormalization(currentTasks);
  }

  return currentTasks;
}

export {
  configureBasicInfo,
  configureEstimation,
  configureFilter,
  configureMetadata,
  configureValidation,
} from "./template-wizard-helper.command";
