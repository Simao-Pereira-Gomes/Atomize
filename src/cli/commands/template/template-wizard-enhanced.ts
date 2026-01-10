import type { TaskDefinition, TaskTemplate } from "@templates/schema";
import chalk from "chalk";
import inquirer from "inquirer";
import { match } from "ts-pattern";
import { stringify as stringifyYaml } from "yaml";
import { CancellationError } from "@/utils/errors";

const OS_PLATFORM = process.platform;
const ListType = OS_PLATFORM === "win32" ? "rawlist" : "list";

const Actions = {
  Save: "save",
  ViewYaml: "yaml",
  Edit: "edit",
  Cancel: "cancel",
} as const;

type Action = (typeof Actions)[keyof typeof Actions];

interface AssignmentAnswers {
  assignmentType: string;
  customEmail?: string;
}

interface ActivityAnswers {
  activity: string;
  customActivity?: string;
}

interface TaskTagsAnswers {
  useTags: boolean;
  taskTags?: string[];
}

/**
 * Validate that estimations are valid numbers and within range
 */
function validateEstimationPercent(input: string): boolean | string {
  const num = Number(input);

  if (Number.isNaN(num)) {
    return "Estimation must be a valid number";
  }

  if (num < 0) {
    return "Estimation cannot be negative";
  }

  if (num > 100) {
    return "Estimation cannot exceed 100%";
  }

  return true;
}

/**
 * Validate that field is not empty after trimming
 */
function validateRequired(fieldName: string) {
  return (input: string): boolean | string => {
    if (!input || input.trim() === "") {
      return `${fieldName} is required`;
    }
    return true;
  };
}

/**
 * Validate field length
 */
function validateMaxLength(fieldName: string, maxLength: number) {
  return (input: string): boolean | string => {
    if (input.length > maxLength) {
      return `${fieldName} must be ${maxLength} characters or less`;
    }
    return true;
  };
}

/**
 * Combined validation for required and max length
 */
function validateRequiredWithMaxLength(fieldName: string, maxLength: number) {
  return (input: string): boolean | string => {
    const required = validateRequired(fieldName)(input);
    if (required !== true) return required;

    return validateMaxLength(fieldName, maxLength)(input);
  };
}

export function normalizeEstimations(tasks: TaskDefinition[]): void {
  if (tasks.length === 0) return;

  if (tasks.length === 1) {
    const [task] = tasks;
    if (!task) {
      return;
    }

    task.estimationPercent = 100;
    return;
  }

  const total = tasks.reduce(
    (sum, task) => sum + (task.estimationPercent || 0),
    0
  );

  if (total === 0 || Number.isNaN(total)) {
    const basePercent = Math.floor(100 / tasks.length);
    const remainder = 100 - basePercent * tasks.length;

    tasks.forEach((task, index) => {
      task.estimationPercent =
        index === 0 ? basePercent + remainder : basePercent;
    });
    return;
  }

  // Scale to 100%
  const scale = 100 / total;
  let sum = 0;

  tasks.forEach((task, index) => {
    if (index === tasks.length - 1) {
      task.estimationPercent = 100 - sum;
    } else {
      const scaled = Math.round((task.estimationPercent || 0) * scale);
      task.estimationPercent = scaled;
      sum += scaled;
    }
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
 * Preview template before saving
 */
export async function previewTemplate(
  template: TaskTemplate
): Promise<boolean> {
  console.log(chalk.cyan("\nTemplate Preview\n"));
  console.log(chalk.cyan("═".repeat(50)));

  // Show summary
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

  // Show filter summary
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

  // Show tasks summary
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

  console.log(
    chalk.bold(
      `\nTotal Estimation: ${totalEstimation}% ${
        totalEstimation === 100 ? "✓" : "⚠"
      }`
    )
  );

  // Show estimation config
  if (template.estimation) {
    console.log(chalk.bold("\nEstimation Settings:"));
    console.log(`  Rounding: ${template.estimation.rounding}`);
  }

  // Show validation config
  if (template.validation) {
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

  // Show metadata
  if (template.metadata) {
    console.log(chalk.bold("\nMetadata:"));
    if (template.metadata.category) {
      console.log(`  Category: ${template.metadata.category}`);
    }
  }

  // Ask for action
  const { action } = await inquirer.prompt([
    {
      type: ListType,
      name: "action",
      message: "What would you like to do?",
      choices: [
        { name: "Save template", value: Actions.Save },
        { name: "View full YAML", value: Actions.ViewYaml },
        { name: "Cancel", value: Actions.Cancel },
      ],
    },
  ]);

  return await match<Action>(action)
    .with(Actions.ViewYaml, async () => {
      console.log(chalk.cyan("\nFull YAML:\n"));
      console.log(chalk.gray(stringifyYaml(template)));
      console.log("");
      return await previewTemplate(template);
    })
    .with(Actions.Edit, async () => {
      return false; // TODO: Implement going back to edits.
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
function showStepHint(stepName: string): void {
  const hints: Record<string, string> = {
    filter:
      "Tip: Use filters to select which work items this template applies to",
    tasks:
      "Tip: Break work into clear, actionable tasks. Estimation percentages will be normalized to 100%",
    estimation: "Tip: Choose how story points will be calculated and rounded",
    validation: "Tip: Add constraints to ensure templates are used correctly",
    metadata: "Tip: Metadata helps others understand when to use this template",
  };

  if (hints[stepName.toLowerCase()]) {
    console.log(chalk.gray(`\n${hints[stepName.toLowerCase()]}\n`));
  }
}

/**
 * Wrapper for configureTasks with better error handling
 */
export async function configureTasksWithValidation(): Promise<
  TaskDefinition[]
> {
  while (true) {
    try {
      showStepHint("tasks");

      const tasks: TaskDefinition[] = [];
      let taskCounter = 1;
      let addMore = true;

      // Must add at least one task
      while (addMore) {
        console.log(chalk.gray(`\nTask #${taskCounter}:`));

        const basicTask = await inquirer.prompt([
          {
            type: "input",
            name: "title",
            message: "Task title:",
            validate: validateRequiredWithMaxLength("Task title", 500),
          },
          {
            type: "input",
            name: "description",
            message: "Description (optional):",
            validate: validateMaxLength("Description", 2000),
          },
          {
            type: "input",
            name: "estimationPercent",
            message: "Estimation percentage (0-100):",
            default: taskCounter === 1 ? "100" : "0",
            validate: validateEstimationPercent,
            filter: (input: string) => Number(input),
          },
          {
            type: "confirm",
            name: "addAdvanced",
            message: "Configure advanced options?",
            default: false,
          },
        ]);

        const taskDef: TaskDefinition = {
          title: basicTask.title,
          description: basicTask.description || undefined,
          estimationPercent: basicTask.estimationPercent,
        };

        if (basicTask.addAdvanced) {
          // Assignment
          const { assignmentType, customEmail } =
            await inquirer.prompt<AssignmentAnswers>([
              {
                type: ListType,
                name: "assignmentType",
                message: "Assign to:",
                choices: [
                  { name: "Parent's assignee", value: "@ParentAssignee" },
                  { name: "Inherit from parent", value: "@Inherit" },
                  { name: "Me (current user)", value: "@Me" },
                  { name: "Custom email", value: "custom" },
                  { name: "Unassigned", value: "@Unassigned" },
                ],
                default: "@ParentAssignee",
              },
              {
                type: "input",
                name: "customEmail",
                message: "Enter email address:",
                when: (answers) => answers.assignmentType === "custom", // Remove type annotation
                validate: (input: string) => {
                  if (!input.includes("@")) {
                    return "Please enter a valid email address";
                  }
                  return true;
                },
              },
            ]);

          taskDef.assignTo =
            assignmentType === "custom" ? customEmail : assignmentType;

          // Activity
          // Activity
          const { activity, customActivity } =
            await inquirer.prompt<ActivityAnswers>([
              {
                type: ListType,
                name: "activity",
                message: "Activity type:",
                choices: [
                  { name: "Design", value: "Design" },
                  { name: "Development", value: "Development" },
                  { name: "Testing", value: "Testing" },
                  { name: "Documentation", value: "Documentation" },
                  { name: "Deployment", value: "Deployment" },
                  { name: "Requirements", value: "Requirements" },
                  { name: "Code Review", value: "Code Review" },
                  { name: "Custom", value: "Custom" },
                  { name: "None", value: "None" },
                ],
                default: "Development",
              },
              {
                type: "input",
                name: "customActivity",
                message: "Enter custom activity:",
                when: (answers) => answers.activity === "Custom",
              },
            ]);

          if (activity !== "None") {
            taskDef.activity =
              activity === "Custom" ? customActivity : activity;
          }

          // Acceptance Criteria
          const { useAcceptanceCriteria } = await inquirer.prompt([
            {
              type: "confirm",
              name: "useAcceptanceCriteria",
              message: "Add acceptance criteria?",
              default: false,
            },
          ]);

          if (useAcceptanceCriteria) {
            const criteria: string[] = [];
            let addMoreCriteria = true;

            while (addMoreCriteria) {
              const { criterion } = await inquirer.prompt([
                {
                  type: "input",
                  name: "criterion",
                  message: `Acceptance criterion #${criteria.length + 1}:`,
                  validate: validateRequired("Criterion"),
                },
              ]);

              criteria.push(criterion);

              const { more } = await inquirer.prompt([
                {
                  type: "confirm",
                  name: "more",
                  message: "Add another criterion?",
                  default: criteria.length < 3,
                },
              ]);

              addMoreCriteria = more;
            }

            if (criteria.length > 0) {
              taskDef.acceptanceCriteria = criteria;

              const { asChecklist } = await inquirer.prompt([
                {
                  type: "confirm",
                  name: "asChecklist",
                  message: "Display as checklist?",
                  default: true,
                },
              ]);

              taskDef.acceptanceCriteriaAsChecklist = asChecklist;
            }
          }

          // Tags
          const { useTags, taskTags } = await inquirer.prompt<TaskTagsAnswers>([
            {
              type: "confirm",
              name: "useTags",
              message: "Add tags?",
              default: false,
            },
            {
              type: "input",
              name: "taskTags",
              message: "Tags (comma-separated):",
              when: (answers) => answers.useTags, // Remove type annotation
              filter: (input: string) => {
                if (!input) return [];
                return input.split(",").map((t) => t.trim());
              },
            },
          ]);

          if (useTags && taskTags && taskTags.length > 0) {
            taskDef.tags = taskTags;
          }

          // Other advanced options
          const advanced = await inquirer.prompt([
            {
              type: "input",
              name: "dependsOn",
              message: "Depends on task IDs (comma-separated, optional):",
              filter: (input: string) => {
                if (!input) return [];
                return input.split(",").map((t) => t.trim());
              },
            },
            {
              type: "input",
              name: "condition",
              //biome-ignore lint/suspicious: Simple string replacement for pattern
              message: "Condition (optional, e.g., ${needsDatabase}):",
            },
            {
              type: "number",
              name: "priority",
              message: "Priority (1-4, optional):",
              validate: (input: number) => {
                if (Number.isNaN(input)) return true; // Optional
                if (input < 1 || input > 4) {
                  return "Priority must be between 1 and 4";
                }
                return true;
              },
            },
            {
              type: "number",
              name: "remainingWork",
              message: "Remaining work in hours (optional):",
              validate: (input: number) => {
                if (Number.isNaN(input)) return true; // Optional
                if (input < 0) {
                  return "Remaining work cannot be negative";
                }
                return true;
              },
            },
          ]);

          if (advanced.dependsOn.length > 0)
            taskDef.dependsOn = advanced.dependsOn;
          if (advanced.condition) taskDef.condition = advanced.condition;
          if (advanced.priority) taskDef.priority = advanced.priority;
          if (advanced.remainingWork)
            taskDef.remainingWork = advanced.remainingWork;
        }

        tasks.push(taskDef);
        taskCounter++;

        // Check if we should continue
        if (taskCounter > 20) {
          console.log(
            chalk.yellow(
              "\n⚠ You've added 20 tasks. Consider breaking this into multiple templates."
            )
          );
        }

        const { more } = await inquirer.prompt([
          {
            type: "confirm",
            name: "more",
            message: "Add another task?",
            default: taskCounter <= 5,
          },
        ]);

        addMore = more;
      }

      // Validate and normalize estimations
      const totalEstimation = tasks.reduce(
        (sum, task) => sum + (task.estimationPercent || 0),
        0
      );

      if (totalEstimation !== 100) {
        console.log(
          chalk.yellow(
            `\n⚠ Warning: Total estimation is ${totalEstimation}% (should be 100%)`
          )
        );

        const { normalize } = await inquirer.prompt([
          {
            type: "confirm",
            name: "normalize",
            message: "Normalize estimations to sum to 100%?",
            default: true,
          },
        ]);

        if (normalize) {
          normalizeEstimations(tasks);
          console.log(chalk.green("✓ Estimations normalized to 100%"));

          // Show normalized values
          console.log(chalk.gray("\nNormalized estimations:"));
          tasks.forEach((task, index) => {
            console.log(
              chalk.gray(
                `  ${index + 1}. ${task.title}: ${task.estimationPercent}%`
              )
            );
          });
        }
      } else {
        console.log(chalk.green("✓ Total estimation is 100%"));
      }

      return tasks;
    } catch (error) {
      console.log(chalk.red(`\nError configuring tasks: ${error}`));

      const { retry } = await inquirer.prompt([
        {
          type: "confirm",
          name: "retry",
          message: "Try again?",
          default: true,
        },
      ]);

      if (!retry) {
        throw error;
      }
    }
  }
}

export {
  configureEstimation,
  configureFilter,
  configureMetadata,
  configureValidation,
} from "./template-wizard-helper.command";
