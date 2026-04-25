import { confirm, select, text } from "@clack/prompts";
import type { ADoFieldSchema } from "@platforms/interfaces/field-schema.interface";
import type { Condition, EstimationPercentCondition, TaskDefinition } from "@templates/schema";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import {
  assertNotCancelled,
  ChoiceSets,
  Filters,
  promptConditionalSelect,
  promptMultipleItems,
  promptOptionalFeature,
  selectOrAutocomplete,
  Validators,
} from "../../utilities/prompt-utilities";
import {
  configureCustomFields,
  hasPickableFields,
  pickFieldOnline,
  promptPicklistValue,
  promptTypedValue,
} from "./custom-fields-wizard";

const output = createCommandOutput(resolveCommandOutputPolicy({}));

/** Known story fields a condition clause can reference, with human-readable labels. */
const STORY_FIELDS: Array<{ label: string; value: string }> = [
  { label: "Tags (array)", value: "tags" },
  { label: "Title", value: "title" },
  { label: "State", value: "state" },
  { label: "Estimation (points)", value: "estimation" },
  { label: "Priority", value: "priority" },
  { label: "Description", value: "description" },
  { label: "Assigned To", value: "assignedTo" },
  { label: "Work Item Type", value: "type" },
  { label: "Area Path", value: "areaPath" },
  { label: "Iteration", value: "iteration" },
];

type OperatorSet = "string" | "number" | "boolean" | "array" | "enum" | "datetime";

const OPERATORS: Record<OperatorSet, Array<{ label: string; value: string }>> = {
  string: [
    { label: "equals", value: "equals" },
    { label: "not-equals", value: "not-equals" },
    { label: "contains (substring)", value: "contains" },
    { label: "not-contains", value: "not-contains" },
  ],
  number: [
    { label: "equals", value: "equals" },
    { label: "not-equals", value: "not-equals" },
    { label: "greater than (>)", value: "gt" },
    { label: "less than (<)", value: "lt" },
    { label: "greater than or equal (>=)", value: "gte" },
    { label: "less than or equal (<=)", value: "lte" },
  ],
  boolean: [
    { label: "equals", value: "equals" },
    { label: "not-equals", value: "not-equals" },
  ],
  array: [
    { label: "contains (array element)", value: "contains" },
    { label: "not-contains", value: "not-contains" },
  ],
  enum: [
    { label: "equals", value: "equals" },
    { label: "not-equals", value: "not-equals" },
  ],
  datetime: [
    { label: "equals", value: "equals" },
    { label: "not-equals", value: "not-equals" },
    { label: "greater than (>)", value: "gt" },
    { label: "less than (<)", value: "lt" },
    { label: "greater than or equal (>=)", value: "gte" },
    { label: "less than or equal (<=)", value: "lte" },
  ],
};

const STORY_FIELD_OPERATOR_SET: Record<string, OperatorSet> = {
  tags:        "array",
  estimation:  "number",
  priority:    "number",
  title:       "string",
  state:       "string",
  description: "string",
  assignedTo:  "string",
  type:        "string",
  areaPath:    "string",
  iteration:   "string",
};
const ACTIVITY_FIELD_REF = "Microsoft.VSTS.Common.Activity";


function operatorSetForSchema(schema: ADoFieldSchema): OperatorSet {
  if (schema.allowedValues && schema.allowedValues.length > 0) return "enum";
  switch (schema.type) {
    case "boolean":  return "boolean";
    case "integer":
    case "decimal":  return "number";
    case "datetime": return "datetime";
    default:         return "string";
  }
}

/**
 * Interactively build a single Condition clause or compound condition.
 * Called recursively for compound conditions.
 *
 * @param storyFieldSchemas  Live ADO field schemas for the parent story WIT.
 *   Used to power the autocomplete picker and type-aware value prompts for
 *   the custom-field branch.  Pass an empty array when no schemas are available
 *   (e.g. no WIT was selected); the picker will fall back to free-text entry.
 */
async function buildConditionNode(storyFieldSchemas: ADoFieldSchema[]): Promise<Condition> {
  const conditionOptions = [
    { label: "Story field  (tags, state, estimation, …)", value: "field" },
    ...(hasPickableFields(storyFieldSchemas)
      ? [{ label: "Custom ADO field", value: "customField" }]
      : []),
    { label: "ALL must be true  (AND)", value: "all" },
    { label: "ANY must be true  (OR)", value: "any" },
  ];

  const type = assertNotCancelled(
    await select({
      message: "Condition type:",
      options: conditionOptions,
    }),
  ) as string;

  if (type === "field") {
    const field = assertNotCancelled(
      await select({
        message: "Story field:",
        options: STORY_FIELDS,
      }),
    ) as string;

    const operator = assertNotCancelled(
      await select({
        message: "Operator:",
        options: OPERATORS[STORY_FIELD_OPERATOR_SET[field] ?? "string"],
      }),
    ) as string;

    const valueRaw = assertNotCancelled(
      await text({
        message: "Value to compare:",
        validate: Validators.required("Value"),
      }),
    );

    const value = valueRaw.trim();
    const numericValue = Number(value);
    const parsedValue: string | number | boolean =
      value === "true" ? true
      : value === "false" ? false
      : !Number.isNaN(numericValue) && value !== "" ? numericValue
      : value;

    return { field, operator: operator as Condition extends { field: string; operator: infer O } ? O : never, value: parsedValue };
  }

  if (type === "customField") {
    const fieldSchema = await pickFieldOnline(storyFieldSchemas);
    if (!fieldSchema) return buildConditionNode(storyFieldSchemas); // unreachable in practice

    const operator = assertNotCancelled(
      await select({
        message: "Operator:",
        options: OPERATORS[operatorSetForSchema(fieldSchema)],
      }),
    ) as string;

    const rawValue =
      fieldSchema.allowedValues && fieldSchema.allowedValues.length > 0
        ? await promptPicklistValue(fieldSchema)
        : await promptTypedValue(fieldSchema);

    return { customField: fieldSchema.referenceName, operator: operator as Condition extends { customField: string; operator: infer O } ? O : never, value: rawValue as string | number | boolean };
  }

  // Compound: all or any — collect at least 2 clauses
  const clauses: Condition[] = [];
  let adding = true;
  while (adding) {
    const isFirst = clauses.length === 0;
    const isSecond = clauses.length === 1;

    output.print(
      isFirst
        ? "  Add the first clause:"
        : isSecond
          ? "  Add the second clause:"
          : `  Clause #${clauses.length + 1}:`,
    );
    clauses.push(await buildConditionNode(storyFieldSchemas));

    if (clauses.length < 2) {
      // Need at least 2 clauses for a compound condition
      adding = true;
    } else {
      adding = assertNotCancelled(
        await confirm({ message: "Add another clause?", initialValue: false }),
      );
    }
  }

  return type === "all" ? { all: clauses } : { any: clauses };
}

/**
 * Configure basic task information (title, description, estimation).
 * When `defaults` is supplied every prompt is pre-filled with the existing values.
 */
export async function configureBasicTaskInfo(
  isFirstTask: boolean,
  storyFieldSchemas: ADoFieldSchema[],
  defaults?: TaskDefinition,
): Promise<
  Pick<
    TaskDefinition,
    | "title"
    | "description"
    | "estimationPercent"
    | "estimationPercentCondition"
    | "id"
  >
> {
  const id = assertNotCancelled(
    await text({
      message: "Task ID (optional, max 30 characters):",
      placeholder: "e.g. task-setup, task-tests",
      initialValue: defaults?.id ?? "",
      validate: Validators.maxLength("Task ID", 30),
    }),
  );

  const title = assertNotCancelled(
    await text({
      message: "Task title:",
      initialValue: defaults?.title ?? "",
      validate: Validators.requiredWithMaxLength("Task title", 500),
    }),
  );

  const description = assertNotCancelled(
    await text({
      message: "Description (optional):",
      placeholder:
        "e.g. Generate tasks for User Stories with Dev and Testing tasks",
      initialValue: defaults?.description ?? "",
      validate: Validators.maxLength("Description", 2000),
    }),
  );

  const fallbackPct = isFirstTask ? "100" : "0";
  const estimationPercentRaw = assertNotCancelled(
    await text({
      message: "Estimation percentage (0-100):",
      placeholder: fallbackPct,
      initialValue: defaults?.estimationPercent !== undefined
        ? String(defaults.estimationPercent)
        : fallbackPct,
      validate: Validators.estimationPercent,
    }),
  );

  const conditionalPercents = await promptOptionalFeature<
    EstimationPercentCondition[]
  >(
    "Add conditional percentages (override based on story conditions)",
    async () =>
      promptMultipleItems<EstimationPercentCondition>(
        "conditional percentage",
        async (index) => {
          output.print(`  Configure condition #${index}:`);
          const condition = await buildConditionNode(storyFieldSchemas);
          const percentRaw = assertNotCancelled(
            await text({
              message: `Percentage for condition #${index} (0-100):`,
              validate: Validators.estimationPercent,
            }),
          );
          return { condition, percent: Number(percentRaw) };
        },
      ),
    false,
  );

  return {
    id: id || undefined,
    title,
    description: description || undefined,
    estimationPercent: Number(estimationPercentRaw),
    estimationPercentCondition:
      conditionalPercents.enabled && conditionalPercents.data?.length
        ? conditionalPercents.data
        : undefined,
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
 * Configure task activity.
 *
 * Live allowed values are fetched from `Microsoft.VSTS.Common.Activity` and
 * presented to the user. Falls back to free-text input when the Activity field
 * has no picklist values.  When `defaults` is supplied the prompt is pre-filled.
 */
export async function configureTaskActivity(
  fieldSchemas: ADoFieldSchema[],
  defaults?: string,
): Promise<string | undefined> {
  const liveValues = fieldSchemas
    .find((f) => f.referenceName === ACTIVITY_FIELD_REF)
    ?.allowedValues;

  if (liveValues && liveValues.length > 0) {
    const options = [
      ...liveValues.map((v) => ({ label: v, value: v })),
      { label: "None (no activity)", value: "" },
    ];

    const adoDefault = liveValues.includes("Development") ? "Development" : liveValues[0];
    const initialValue =
      defaults && liveValues.includes(defaults) ? defaults : adoDefault;
    const chosen = await selectOrAutocomplete({
      message: "Activity type:",
      options,
      placeholder: "Type to filter…",
      initialValue,
    });

    return chosen || undefined;
  }

  // Activity field not a picklist in this project — free-text entry
  const raw = assertNotCancelled(
    await text({
      message: "Activity type (leave blank for none):",
      placeholder: "e.g. Development, Testing",
      initialValue: defaults ?? "",
    }),
  );
  return raw.trim() || undefined;
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
 * Configure task tags.
 * When `defaults` is supplied the prompt is pre-filled with existing values.
 */
export async function configureTaskTags(defaults?: string[]): Promise<string[] | undefined> {
  const feature = await promptOptionalFeature<string[]>(
    "Add tags",
    async () => {
      const raw = assertNotCancelled(
        await text({
          message: "Tags (comma-separated):",
          placeholder: "e.g. api, testing, high-priority",
          initialValue: defaults?.join(", ") ?? "",
        }),
      );
      return Filters.commaSeparated(raw);
    },
    !!(defaults && defaults.length > 0),
  );

  if (!feature.enabled || !feature.data) {
    return undefined;
  }

  return feature.data.length > 0 ? feature.data : undefined;
}

/**
 * Configure advanced task options.
 * When `defaults` is supplied dependsOn and priority are pre-filled.
 */
export async function configureAdvancedTaskOptions(
  storyFieldSchemas: ADoFieldSchema[],
  defaults?: TaskDefinition,
): Promise<Pick<TaskDefinition, "dependsOn" | "condition" | "priority">> {
  const dependsOnRaw = assertNotCancelled(
    await text({
      message: "Depends on task IDs (comma-separated, optional):",
      placeholder: "e.g. task-setup, task-db, task-build, task-test",
      initialValue: defaults?.dependsOn?.join(", ") ?? "",
    }),
  );
  const dependsOn = Filters.commaSeparated(dependsOnRaw);

  const addCondition = assertNotCancelled(
    await confirm({ message: "Add a task condition?", initialValue: false }),
  );

  let condition: Condition | undefined;
  if (addCondition) {
    condition = await buildConditionNode(storyFieldSchemas);
  }

  const priorityRaw = assertNotCancelled(
    await text({
      message: "Priority (1-4, optional):",
      placeholder: "e.g. 2",
      initialValue: defaults?.priority !== undefined ? String(defaults.priority) : "",
      validate: Validators.priorityRange,
    }),
  );

  const result: Pick<TaskDefinition, "dependsOn" | "condition" | "priority"> = {};

  if (dependsOn.length > 0) result.dependsOn = dependsOn;
  if (condition) result.condition = condition;
  if (priorityRaw) result.priority = Number(priorityRaw);

  return result;
}

/**
 * Build a complete task definition by orchestrating all configuration steps.
 * When `defaults` is supplied every prompt is pre-filled with the existing values,
 * allowing the user to edit only the fields they want to change.
 */
export async function buildTaskDefinition(
  isFirstTask: boolean,
  includeAdvanced: boolean,
  fieldSchemas: ADoFieldSchema[],
  storyFieldSchemas: ADoFieldSchema[],
  defaults?: TaskDefinition,
): Promise<TaskDefinition> {
  const basic = await configureBasicTaskInfo(isFirstTask, storyFieldSchemas, defaults);

  const taskDef: TaskDefinition = {
    id: basic.id,
    title: basic.title,
    estimationPercent: basic.estimationPercent,
  };

  if (basic.description) {
    taskDef.description = basic.description;
  }

  if (basic.estimationPercentCondition) {
    taskDef.estimationPercentCondition = basic.estimationPercentCondition;
  }

  if (includeAdvanced) {
    const assignTo = await configureTaskAssignment();
    if (assignTo) {
      taskDef.assignTo = assignTo;
    }
    const activity = await configureTaskActivity(fieldSchemas, defaults?.activity);
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
    const tags = await configureTaskTags(defaults?.tags);
    if (tags) {
      taskDef.tags = tags;
    }
    const advanced = await configureAdvancedTaskOptions(storyFieldSchemas, defaults);
    Object.assign(taskDef, advanced);
  }

  const customFields = await configureCustomFields(fieldSchemas, storyFieldSchemas);
  if (Object.keys(customFields).length > 0) {
    taskDef.customFields = customFields;
  }

  return taskDef;
}
