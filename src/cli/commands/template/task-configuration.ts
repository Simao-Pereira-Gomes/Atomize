import { confirm, text } from "@clack/prompts";
import type { TaskDefinition } from "@templates/schema";
import {
  assertNotCancelled,
  ChoiceSets,
  Filters,
  promptConditionalSelect,
  promptMultipleItems,
  promptOptionalFeature,
  Validators,
} from "../../utilities/prompt-utilities";

/**
 * Configure basic task information (title, description, estimation)
 */
export async function configureBasicTaskInfo(
  isFirstTask: boolean,
): Promise<
  Pick<TaskDefinition, "title" | "description" | "estimationPercent" | "id">
> {
  const id = assertNotCancelled(
    await text({
      message: "Task ID (optional, max 30 characters):",
      placeholder: "e.g. task-setup, task-tests",
      validate: Validators.maxLength("Task ID", 30),
    }),
  );

  const title = assertNotCancelled(
    await text({
      message: "Task title:",
      validate: Validators.requiredWithMaxLength("Task title", 500),
    }),
  );

  const description = assertNotCancelled(
    await text({
      message: "Description (optional):",
      placeholder:
        "e.g. Generate tasks for User Stories with Dev and Testing tasks",
      validate: Validators.maxLength("Description", 2000),
    }),
  );

  const estimationPercentRaw = assertNotCancelled(
    await text({
      message: "Estimation percentage (0-100):",
      placeholder: isFirstTask ? "100" : "0",
      defaultValue: isFirstTask ? "100" : "0",
      validate: Validators.estimationPercent,
    }),
  );

  return {
    id: id || undefined,
    title,
    description: description || undefined,
    estimationPercent: Number(estimationPercentRaw),
  };
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
    false,
  );

  if (!feature.enabled) {
    return {};
  }

  const criteria = await promptMultipleItems<{ criterion: string }>(
    "criterion",
    async (index) => {
      const criterion = assertNotCancelled(
        await text({
          message: `Acceptance criterion #${index}:`,
          validate: Validators.required("Criterion"),
        }),
      );
      return { criterion };
    },
    3,
  );

  if (criteria.length === 0) {
    return {};
  }

  const asChecklist = assertNotCancelled(
    await confirm({
      message: "Display as checklist?",
      initialValue: true,
    }),
  );

  return {
    criteria: criteria.map((c) => c.criterion),
    asChecklist,
  };
}

/**
 * Configure task tags
 */
export async function configureTaskTags(): Promise<string[] | undefined> {
  const feature = await promptOptionalFeature<string[]>(
    "Add tags",
    async () => {
      const raw = assertNotCancelled(
        await text({
          message: "Tags (comma-separated):",
          placeholder: "e.g. api, testing, high-priority",
        }),
      );
      return Filters.commaSeparated(raw);
    },
    false,
  );

  if (!feature.enabled || !feature.data) {
    return undefined;
  }

  return feature.data.length > 0 ? feature.data : undefined;
}

/**
 * Configure advanced task options
 */
export async function configureAdvancedTaskOptions(): Promise<
  Pick<TaskDefinition, "dependsOn" | "condition" | "priority" | "remainingWork">
> {
  const dependsOnRaw = assertNotCancelled(
    await text({
      message: "Depends on task IDs (comma-separated, optional):",
      placeholder: "e.g. task-setup, task-db, task-build, task-test",
    }),
  );
  const dependsOn = Filters.commaSeparated(dependsOnRaw);

  const condition = assertNotCancelled(
    await text({
      message: "Condition (optional):",
      //biome-ignore lint/suspicious: Simple string replacement for pattern
      placeholder: "e.g. ${story.tags CONTAINS 'Backend'}",
    }),
  );

  const priorityRaw = assertNotCancelled(
    await text({
      message: "Priority (1-4, optional):",
      placeholder: "e.g. 2",
      validate: Validators.priorityRange,
    }),
  );

  const remainingWorkRaw = assertNotCancelled(
    await text({
      message: "Remaining work in hours (optional):",
      placeholder: "e.g. 8",
      validate: Validators.nonNegative("Remaining work"),
    }),
  );

  const result: Pick<
    TaskDefinition,
    "dependsOn" | "condition" | "priority" | "remainingWork"
  > = {};

  if (dependsOn.length > 0) result.dependsOn = dependsOn;
  if (condition) result.condition = condition;
  if (priorityRaw) result.priority = Number(priorityRaw);
  if (remainingWorkRaw) result.remainingWork = Number(remainingWorkRaw);

  return result;
}

/**
 * Build a complete task definition by orchestrating all configuration steps
 */
export async function buildTaskDefinition(
  isFirstTask: boolean,
  includeAdvanced: boolean,
): Promise<TaskDefinition> {
  const basic = await configureBasicTaskInfo(isFirstTask);

  const taskDef: TaskDefinition = {
    id: basic.id,
    title: basic.title,
    estimationPercent: basic.estimationPercent,
  };

  if (basic.description) {
    taskDef.description = basic.description;
  }

  if (includeAdvanced) {
    const assignTo = await configureTaskAssignment();
    if (assignTo) {
      taskDef.assignTo = assignTo;
    }
    const activity = await configureTaskActivity();
    if (activity) {
      taskDef.activity = activity;
    }
    const acceptanceCriteria = await configureAcceptanceCriteria();
    if (acceptanceCriteria.criteria) {
      taskDef.acceptanceCriteria = acceptanceCriteria.criteria;
      if (acceptanceCriteria.asChecklist !== undefined) {
        taskDef.acceptanceCriteriaAsChecklist = acceptanceCriteria.asChecklist;
      }
    }
    const tags = await configureTaskTags();
    if (tags) {
      taskDef.tags = tags;
    }
    const advanced = await configureAdvancedTaskOptions();
    Object.assign(taskDef, advanced);
  }

  return taskDef;
}
