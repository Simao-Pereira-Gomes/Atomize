/**
 * Task configuration modules
 * Separates task configuration into logical, testable sections
 */

import type { TaskDefinition } from "@templates/schema";
import inquirer from "inquirer";
import {
  ChoiceSets,
  Filters,
  Validators,
  promptConditionalSelect,
  promptMultipleItems,
  promptOptionalFeature,
} from "../../utilities/prompt-utilities";

/**
 * Configure basic task information (title, description, estimation)
 */
export async function configureBasicTaskInfo(
  isFirstTask: boolean
): Promise<
  Pick<TaskDefinition, "title" | "description" | "estimationPercent">
> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "title",
      message: "Task title:",
      validate: Validators.requiredWithMaxLength("Task title", 500),
    },
    {
      type: "input",
      name: "description",
      message: "Description (optional):",
      validate: Validators.maxLength("Description", 2000),
    },
    {
      type: "input",
      name: "estimationPercent",
      message: "Estimation percentage (0-100):",
      default: isFirstTask ? "100" : "0",
      validate: Validators.estimationPercent,
      filter: Filters.toNumber,
    },
  ]);

  return answers;
}

/**
 * Configure task assignment
 */
export async function configureTaskAssignment(): Promise<string | undefined> {
  const result = await promptConditionalSelect({
    selectPrompt: {
      name: "assignmentType",
      message: "Assign to:",
      choices: ChoiceSets.assignmentTypes,
      defaultValue: "@ParentAssignee",
    },
    conditionalPrompt: {
      name: "customEmail",
      message: "Enter email address:",
      triggerValue: "custom",
      validate: Validators.email,
    },
  });

  return result.value === "custom" ? result.customValue : result.value;
}

/**
 * Configure task activity
 */
export async function configureTaskActivity(): Promise<string | undefined> {
  const result = await promptConditionalSelect({
    selectPrompt: {
      name: "activity",
      message: "Activity type:",
      choices: ChoiceSets.activityTypes,
      defaultValue: "Development",
    },
    conditionalPrompt: {
      name: "customActivity",
      message: "Enter custom activity:",
      triggerValue: "Custom",
    },
  });

  if (result.value === "None") {
    return undefined;
  }

  return result.value === "Custom" ? result.customValue : result.value;
}

/**
 * Configure acceptance criteria
 */
export async function configureAcceptanceCriteria(): Promise<{
  criteria?: string[];
  asChecklist?: boolean;
}> {
  const feature = await promptOptionalFeature(
    "Add acceptance criteria",
    undefined,
    false
  );

  if (!feature.enabled) {
    return {};
  }

  const criteria = await promptMultipleItems<{ criterion: string }>({
    itemName: "criterion",
    prompts: [
      {
        type: "input",
        name: "criterion",
        message: (answers) =>
          `Acceptance criterion #${(answers as any)._index || 1}:`,
        validate: Validators.required("Criterion"),
      },
    ],
    continueThreshold: 3,
  });

  if (criteria.length === 0) {
    return {};
  }

  const { asChecklist } = await inquirer.prompt([
    {
      type: "confirm",
      name: "asChecklist",
      message: "Display as checklist?",
      default: true,
    },
  ]);

  return {
    criteria: criteria.map((c) => c.criterion),
    asChecklist,
  };
}

/**
 * Configure task tags
 */
export async function configureTaskTags(): Promise<string[] | undefined> {
  const feature = await promptOptionalFeature<{ taskTags: string }>(
    "Add tags",
    [
      {
        type: "input",
        name: "taskTags",
        message: "Tags (comma-separated):",
        filter: Filters.commaSeparated,
      },
    ],
    false
  );

  if (!feature.enabled || !feature.data?.taskTags) {
    return undefined;
  }

  const tags = feature.data.taskTags as unknown as string[];
  return tags.length > 0 ? tags : undefined;
}

/**
 * Configure advanced task options
 */
export async function configureAdvancedTaskOptions(): Promise<
  Pick<TaskDefinition, "dependsOn" | "condition" | "priority" | "remainingWork">
> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "dependsOn",
      message: "Depends on task IDs (comma-separated, optional):",
      filter: Filters.commaSeparated,
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
      validate: Validators.priorityRange,
    },
    {
      type: "number",
      name: "remainingWork",
      message: "Remaining work in hours (optional):",
      validate: Validators.nonNegative("Remaining work"),
    },
  ]);

  const result: Pick<
    TaskDefinition,
    "dependsOn" | "condition" | "priority" | "remainingWork"
  > = {};

  if (answers.dependsOn.length > 0) result.dependsOn = answers.dependsOn;
  if (answers.condition) result.condition = answers.condition;
  if (answers.priority) result.priority = answers.priority;
  if (answers.remainingWork) result.remainingWork = answers.remainingWork;

  return result;
}

/**
 * Build a complete task definition by orchestrating all configuration steps
 */
export async function buildTaskDefinition(
  isFirstTask: boolean,
  includeAdvanced: boolean
): Promise<TaskDefinition> {
  const basic = await configureBasicTaskInfo(isFirstTask);

  const taskDef: TaskDefinition = {
    title: basic.title,
    estimationPercent: basic.estimationPercent,
  };

  if (basic.description) {
    taskDef.description = basic.description;
  }

  if (includeAdvanced) {
    // Assignment
    const assignTo = await configureTaskAssignment();
    if (assignTo) {
      taskDef.assignTo = assignTo;
    }

    // Activity
    const activity = await configureTaskActivity();
    if (activity) {
      taskDef.activity = activity;
    }

    // Acceptance Criteria
    const acceptanceCriteria = await configureAcceptanceCriteria();
    if (acceptanceCriteria.criteria) {
      taskDef.acceptanceCriteria = acceptanceCriteria.criteria;
      if (acceptanceCriteria.asChecklist !== undefined) {
        taskDef.acceptanceCriteriaAsChecklist = acceptanceCriteria.asChecklist;
      }
    }

    // Tags
    const tags = await configureTaskTags();
    if (tags) {
      taskDef.tags = tags;
    }

    // Advanced options
    const advanced = await configureAdvancedTaskOptions();
    Object.assign(taskDef, advanced);
  }

  return taskDef;
}
