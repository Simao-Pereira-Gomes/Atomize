import { z } from "zod";
import {
  buildAdjacencyList,
  detectCycles,
  formatCyclePath,
} from "./graph.js";

/**
 * Accepts an ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDThh:mm:ss[.sss][Z|±hh:mm])
 * or an approved WIQL date macro (@Today, @StartOfDay, @StartOfMonth,
 * @StartOfWeek, @StartOfYear) with an optional integer offset (+N / -N).
 */
const DATE_OR_MACRO_RE =
  /^(@Today|@StartOfDay|@StartOfMonth|@StartOfWeek|@StartOfYear)(\s*[+-]\s*\d+)?$|^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/i;

const DateOrMacroSchema = z
  .string()
  .refine((v) => DATE_OR_MACRO_RE.test(v), {
    message:
      "Must be an ISO 8601 date (YYYY-MM-DD) or an approved date macro " +
      "(@Today, @StartOfDay, @StartOfMonth, @StartOfWeek, @StartOfYear) " +
      "with an optional numeric offset (e.g. @Today-7).",
  });

/** Matches ADO reference names like "Custom.ClientTier" or "System.Tags". */
const REFERENCE_NAME_RE = /^[A-Za-z][A-Za-z0-9_.]*\.[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Structured condition operators for task and estimation conditions.
 */
export const ConditionOperatorSchema = z
  .enum([
    "equals",
    "not-equals",
    "contains",
    "not-contains",
    "gt",
    "lt",
    "gte",
    "lte",
  ])
  .describe(
    "Comparison operator. equals/not-equals: exact match. contains/not-contains: substring or array membership. gt/lt/gte/lte: numeric comparison.",
  );

export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

const ConditionValueSchema = z
  .union([z.string(), z.number(), z.boolean()])
  .describe("Value to compare against. Can be a string, number, or boolean.");

/**
 * Structured task condition — evaluated against the parent story at generate time.
 *
 * Simple clause:   { field: "tags", operator: "contains", value: "backend" }
 * Custom field:    { customField: "Custom.ClientTier", operator: "equals", value: "Enterprise" }
 * AND compound:    { all: [ ...clauses ] }
 * OR  compound:    { any: [ ...clauses ] }
 */
export type Condition =
  | { field: string; operator: ConditionOperator; value: string | number | boolean }
  | { customField: string; operator: ConditionOperator; value: string | number | boolean }
  | { all: Condition[] }
  | { any: Condition[] };

const MULTI_VALUE_STANDARD_FIELDS = new Set(["tags"]);
const MULTI_VALUE_FIELD_OPERATORS = new Set<ConditionOperator>(["contains", "not-contains"]);

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({
      field: z
        .string()
        .min(1)
        .describe(
          "Standard work item field name to evaluate (e.g. 'tags', 'priority', 'state', 'title').",
        ),
      operator: ConditionOperatorSchema,
      value: ConditionValueSchema,
    }).strict().superRefine((data, ctx) => {
      if (MULTI_VALUE_STANDARD_FIELDS.has(data.field) && !MULTI_VALUE_FIELD_OPERATORS.has(data.operator)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["operator"],
          message: `Field "${data.field}" is multi-value; only "contains"/"not-contains" are supported (got "${data.operator}").`,
        });
      }
    }),
    z.object({
      customField: z
        .string()
        .regex(
          REFERENCE_NAME_RE,
          'Custom field reference must be in "Namespace.FieldName" format (e.g. "Custom.ClientTier").',
        )
        .describe(
          "Azure DevOps custom field reference in 'Namespace.FieldName' format (e.g. 'Custom.ClientTier').",
        ),
      operator: ConditionOperatorSchema,
      value: ConditionValueSchema,
    }).strict(),
    z.object({
      all: z
        .array(ConditionSchema)
        .min(1, "all requires at least one clause")
        .describe("Sub-conditions that must all match (logical AND)."),
    }).strict(),
    z.object({
      any: z
        .array(ConditionSchema)
        .min(1, "any requires at least one clause")
        .describe("Sub-conditions where at least one must match (logical OR)."),
    }).strict(),
  ]),
);


export const SavedQuerySchema = z
  .object({
    id: z
      .uuid()
      .describe("Azure DevOps saved query GUID.")
      .optional(),
    path: z
      .string()
      .min(1)
      .describe(
        "Path to the saved query in Azure DevOps (e.g. 'My Queries/Sprint Stories').",
      )
      .optional(),
  })
  .strict()
  .refine((d) => !!(d.id ?? d.path), {
    message: "savedQuery requires either id or path",
  })
  .refine((d) => !(d.id && d.path), {
    message: "savedQuery accepts id or path, not both",
  });

export const FilterCriteriaSchema = z.object({
  team: z
    .string()
    .describe(
      "Azure DevOps team name. Limits story selection to stories owned by this team.",
    )
    .optional(),
  workItemTypes: z
    .array(z.string())
    .describe("Work item types to include (e.g. ['User Story', 'Bug']).")
    .optional(),
  states: z
    .array(z.string())
    .describe("Story states to target (e.g. ['Active', 'New']).")
    .optional(),
  statesExclude: z
    .array(z.string())
    .describe("Story states to exclude from selection.")
    .optional(),
  statesWereEver: z
    .array(z.string())
    .describe("Include stories that were ever in any of these states.")
    .optional(),
  tags: z
    .object({
      include: z
        .array(z.string())
        .describe("Include stories that have at least one of these tags.")
        .optional(),
      exclude: z
        .array(z.string())
        .describe("Exclude stories that have any of these tags.")
        .optional(),
    })
    .strict()
    .describe("Tag-based filter — include or exclude stories by tag.")
    .optional(),
  areaPaths: z
    .array(z.union([z.string(), z.literal("@TeamAreas")]))
    .describe(
      "Area paths to filter by. Use '@TeamAreas' to match all areas owned by the configured team.",
    )
    .optional(),
  areaPathsUnder: z
    .array(z.string())
    .describe("Include stories in these area paths and all sub-paths.")
    .optional(),
  iterations: z
    .array(z.union([z.string(), z.literal("@CurrentIteration")]))
    .describe(
      "Iterations to filter by. Use '@CurrentIteration' for the active sprint.",
    )
    .optional(),
  iterationsUnder: z
    .array(z.string())
    .describe("Include stories in these iterations and all sub-iterations.")
    .optional(),
  assignedTo: z
    .array(z.union([z.email(), z.literal("@Me")]))
    .describe(
      "Assignee filter. Accepts email addresses or '@Me' for the authenticated user.",
    )
    .optional(),
  changedAfter: DateOrMacroSchema.describe(
    "Include stories changed after this date. ISO 8601 date or date macro (e.g. '@Today-7').",
  ).optional(),
  createdAfter: DateOrMacroSchema.describe(
    "Include stories created after this date. ISO 8601 date or date macro.",
  ).optional(),
  priority: z
    .object({
      min: z.number().describe("Minimum priority value (inclusive).").optional(),
      max: z.number().describe("Maximum priority value (inclusive).").optional(),
    })
    .strict()
    .describe("Priority range filter for story selection.")
    .optional(),
  excludeIfHasTasks: z
    .boolean()
    .describe("If true, skips stories that already have child tasks.")
    .optional(),
  savedQuery: SavedQuerySchema.describe(
    "Reference an existing Azure DevOps saved query to select stories.",
  ).optional(),
}).strict();

export const EstimationPercentConditionSchema = z.object({
  condition: ConditionSchema.describe(
    "Condition evaluated against the parent story. Applied when this condition matches.",
  ),
  percent: z
    .number()
    .min(0)
    .max(100)
    .describe("Estimation percentage used when this condition matches (0–100)."),
}).strict();

export const TaskDefinitionSchema = z.object({
  id: z
    .string()
    .describe(
      "Unique identifier for this task within the template. Referenced by 'dependsOn'.",
    )
    .optional(),
  title: z
    .string()
    .min(1, "Task title is required")
    .describe("Task title — shown as the work item title in Azure DevOps."),
  description: z
    .string()
    .describe("Additional details or notes for this task.")
    .optional(),
  estimationPercent: z
    .number()
    .min(0, "Estimation percentage cannot be negative")
    .max(100, "Estimation percentage for a single task cannot exceed 100%")
    .describe(
      "Percentage of the parent story's estimate assigned to this task (0–100). Requires estimation.strategy = 'percentage'.",
    )
    .optional(),
  estimationPercentCondition: z
    .array(EstimationPercentConditionSchema)
    .describe(
      "Conditional estimation rules evaluated in order. The first matching condition's percent is used.",
    )
    .optional(),
  estimationFixed: z
    .number()
    .min(0, "Fixed estimation cannot be negative")
    .describe(
      "Fixed point value for this task, independent of the parent story's estimate.",
    )
    .optional(),
  estimationFormula: z
    .string()
    .describe(
      "Expression for dynamic estimation (e.g. 'parent * 0.2 + 1'). Evaluated at generate time.",
    )
    .optional(),
  tags: z
    .array(z.string())
    .describe("Tags applied to the generated task.")
    .optional(),
  condition: ConditionSchema.describe(
    "Condition evaluated against the parent story. If it does not match, this task is skipped.",
  ).optional(),
  dependsOn: z
    .array(z.string())
    .describe(
      "IDs of tasks this task depends on. Atomize creates predecessor dependency links between these tasks.",
    )
    .optional(),
  assignTo: z
    .string()
    .describe("Email address or alias to assign this task to.")
    .optional(),
  priority: z
    .number()
    .describe("Priority value for the generated task.")
    .optional(),
  activity: z
    .string()
    .describe(
      "Azure DevOps activity type for this task (e.g. 'Development', 'Testing', 'Design').",
    )
    .optional(),
  acceptanceCriteria: z
    .array(z.string())
    .describe("Acceptance criteria lines for this task.")
    .optional(),
  acceptanceCriteriaAsChecklist: z
    .boolean()
    .describe(
      "If true, acceptance criteria are rendered as a markdown checklist in the task description.",
    )
    .optional(),
  customFields: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .describe(
      "Azure DevOps custom fields to set on the task. Keys must be in 'Namespace.FieldName' format (e.g. 'Custom.ClientTier').",
    )
    .optional()
    .superRefine((fields, ctx) => {
      if (!fields) return undefined;
      for (const key of Object.keys(fields)) {
        if (!REFERENCE_NAME_RE.test(key)) {
          ctx.addIssue({
            code: "custom",
            message: `Invalid field reference name "${key}". Expected format: "Namespace.FieldName" (e.g. "Custom.ClientTier").`,
            params: { code: "INVALID_CUSTOM_FIELD_REFERENCE" },
          });
        }
      }
      return undefined;
    }),
}).strict();

export const EstimationConfigSchema = z.object({
  strategy: z
    .enum(["percentage"])
    .optional()
    .default("percentage")
    .describe(
      "Estimation strategy. 'percentage' distributes the parent story's estimate across tasks proportionally.",
    ),
  source: z
    .string()
    .describe(
      "Field on the parent story to read the estimation value from (e.g. 'story-points').",
    )
    .optional(),
  rounding: z
    .enum(["nearest", "up", "down", "none"])
    .optional()
    .default("none")
    .describe(
      "Rounding mode applied to calculated task estimates: 'nearest', 'up', 'down', or 'none'.",
    ),
  minimumTaskPoints: z
    .number()
    .describe("Minimum point value any single task can receive after rounding.")
    .optional(),
  ifParentHasNoEstimation: z
    .enum(["skip", "warn", "use-default"])
    .describe(
      "Behaviour when the parent story has no estimate. 'skip' omits tasks, 'warn' logs a warning, 'use-default' falls back to defaultParentEstimation.",
    )
    .optional(),
  defaultParentEstimation: z
    .number()
    .describe(
      "Fallback estimation value used when the parent story has no estimate and ifParentHasNoEstimation is 'use-default'.",
    )
    .optional(),
}).strict();

export const ValidationModeSchema = z
  .enum(["strict", "lenient"])
  .describe("'strict' fails on any validation warning; 'lenient' allows warnings to pass.");

export const ValidationConfigSchema = z.object({
  mode: ValidationModeSchema.describe(
    "'strict' fails on any validation warning; 'lenient' allows warnings to pass.",
  ).optional(),
  totalEstimationMustBe: z
    .number()
    .describe(
      "Sum of all non-conditional task percentages must equal this value exactly. It may exceed 100 when tasks span roles.",
    )
    .optional(),
  totalEstimationRange: z
    .object({
      min: z
        .number()
        .describe("Minimum allowed total estimation percentage (inclusive)."),
      max: z
        .number()
        .describe("Maximum allowed total estimation percentage (inclusive)."),
    })
    .strict()
    .describe(
      "Sum of all non-conditional task percentages must fall within this range; bounds may exceed 100 when tasks span roles.",
    )
    .optional(),
  minTasks: z
    .number()
    .describe("Minimum number of tasks the template must define.")
    .optional(),
  maxTasks: z
    .number()
    .describe("Maximum number of tasks the template may define.")
    .optional(),
  taskEstimationRange: z
    .object({
      min: z
        .number()
        .describe("Minimum allowed estimation percentage for a single task."),
      max: z
        .number()
        .describe("Maximum allowed estimation percentage for a single task."),
    })
    .strict()
    .describe("Each task's estimation percentage must fall within this range.")
    .optional(),
  requiredTasks: z
    .array(
      z.object({
        title: z
          .string()
          .describe(
            "Required task title. Matched case-insensitively against task titles.",
          ),
        id: z
          .string()
          .describe(
            "Required task ID. Checked first; falls back to title match if absent.",
          )
          .optional(),
      }).strict(),
    )
    .describe(
      "Tasks that must be present in the template, matched by title or id.",
    )
    .optional(),
}).strict();

export const MetadataSchema = z.object({
  category: z
    .string()
    .describe(
      "Template category for discovery and grouping (e.g. 'Frontend', 'Backend', 'Infrastructure').",
    )
    .optional(),
  difficulty: z
    .enum(["beginner", "intermediate", "advanced"])
    .describe("Complexity level of the work this template targets.")
    .optional(),
  recommendedFor: z
    .array(z.string())
    .describe(
      "Work item types or story patterns this template is optimised for (e.g. ['User Story', 'Bug']).",
    )
    .optional(),
  estimationGuidelines: z
    .string()
    .describe(
      "Human-readable guidance on how to estimate stories before using this template.",
    )
    .optional(),
  notes: z
    .string()
    .describe("Free-form context for the template's authors and maintainers.")
    .optional(),
  examples: z
    .array(z.string())
    .describe(
      "Example story titles or scenarios where this template applies.",
    )
    .optional(),
  changelog: z
    .array(
      z.object({
        version: z
          .string()
          .describe("Template version this changelog entry describes."),
        date: z
          .string()
          .describe("Date of the change in YYYY-MM-DD format."),
        changes: z
          .string()
          .describe("Summary of what changed in this version."),
      }).strict(),
    )
    .describe("Version history for this template.")
    .optional(),
}).strict();

const TaskTemplateBaseSchema = z.object({
    version: z
      .string()
      .optional()
      .default("1.0")
      .describe("Schema version. Always '1.0' for the current format."),
    name: z
      .string()
      .min(1, "Template name is required")
      .describe("Unique display name for this template."),
    description: z
      .string()
      .describe("What this template is for and when to use it.")
      .optional(),
    author: z
      .string()
      .describe("Author or team that owns this template.")
      .optional(),
    tags: z
      .array(z.string())
      .describe("Tags for template discovery in the catalog.")
      .optional(),
    created: z
      .string()
      .describe("ISO 8601 date when this template was first created.")
      .optional(),
    lastModified: z
      .string()
      .describe("ISO 8601 date of the last modification.")
      .optional(),

    filter: FilterCriteriaSchema.describe(
      "Criteria used to select which stories this template applies to.",
    ),
    tasks: z
      .array(TaskDefinitionSchema)
      .min(1, "At least one task is required")
      .describe("Task definitions that will be generated from this template."),

    estimation: EstimationConfigSchema.describe(
      "Global estimation configuration for all tasks in this template.",
    ).optional(),
    validation: ValidationConfigSchema.describe(
      "Validation rules applied when this template is used.",
    ).optional(),
    metadata: MetadataSchema.describe(
      "Additional metadata for template discovery and documentation.",
    ).optional(),

    extends: z
      .string()
      .describe(
        "Name or path of a parent template this one inherits from. Resolved by the Template Library.",
      )
      .optional(),
    mixins: z
      .array(z.string())
      .describe(
        "Names or paths of mixins to compose into this template. Resolved by the Template Library.",
      )
      .optional(),
    origin: z
      .string()
      .describe(
        "Catalog ref (template:<name> or mixin:<name>) this template was derived from. Informational only — does not affect ref resolution.",
      )
      .optional(),
  }).strict();

export const ExtendingTaskTemplateSchema = TaskTemplateBaseSchema
  .partial({
    version: true,
    name: true,
    filter: true,
    tasks: true,
  })
  .extend({
    extends: z
      .string()
      .min(1)
      .describe(
        "Name or path of a parent template this one inherits from. Inherited fields such as version, name, filter, and tasks may be omitted.",
      ),
  });

export const TaskTemplateSchema = TaskTemplateBaseSchema
  .superRefine((data, ctx) => {
    const { tasks, validation: v } = data;
    const nonConditionalTasks = tasks.filter((t) => !t.condition);
    const totalPercent = nonConditionalTasks.reduce(
      (sum, t) => sum + (t.estimationPercent ?? 0),
      0,
    );
    const taskIds = new Set(tasks.map((t) => t.id).filter(Boolean));

    validateUniqueTaskIds(tasks, ctx);
    validateEstimationConstraints(v, totalPercent, ctx);

    validateTaskConstraints(v, tasks, ctx);
    validateRequiredTasks(v, tasks, ctx);

    const availableIds = Array.from(taskIds);
    const taskIndexById = new Map<string, number>();
    tasks.forEach((t, i) => {
      if (t.id) taskIndexById.set(t.id, i);
    });

    tasks.forEach((task, index) => {
      task.dependsOn?.forEach((depId) => {
        if (!taskIds.has(depId)) {
          const suggestion =
            availableIds.length > 0
              ? ` Available task IDs: ${availableIds.map((id) => `"${id}"`).join(", ")}`
              : "";
          ctx.addIssue({
            code: "custom",
            path: ["tasks", index, "dependsOn"],
            message: `Task depends on non-existent task ID: "${depId}".${suggestion}`,
            params: { code: "INVALID_DEPENDENCY" },
          });
        }
      });
    });
    reportCircularDependencies(tasks, taskIndexById, ctx);
  });

function validateTaskConstraints(
  v: TaskTemplate["validation"] | undefined,
  tasks: TaskTemplate["tasks"],
  ctx: z.RefinementCtx,
) {
  if (v?.minTasks !== undefined && tasks.length < v.minTasks) {
    const needed = v.minTasks - tasks.length;
    ctx.addIssue({
      code: "custom",
      path: ["tasks"],
      message: `Template has ${tasks.length} task(s), but minimum is ${v.minTasks}. Add ${needed} more task(s).`,
      params: { code: "TOO_FEW_TASKS" },
    });
  }
  if (v?.maxTasks !== undefined && tasks.length > v.maxTasks) {
    const excess = tasks.length - v.maxTasks;
    ctx.addIssue({
      code: "custom",
      path: ["tasks"],
      message: `Template has ${tasks.length} task(s), but maximum is ${v.maxTasks}. Remove ${excess} task(s) or increase maxTasks.`,
      params: { code: "TOO_MANY_TASKS" },
    });
  }
}

function validateUniqueTaskIds(
  tasks: z.infer<typeof TaskDefinitionSchema>[],
  ctx: z.RefinementCtx,
) {
  const firstIndexById = new Map<string, number>();

  tasks.forEach((task, index) => {
    if (!task.id) return;

    const firstIndex = firstIndexById.get(task.id);
    if (firstIndex === undefined) {
      firstIndexById.set(task.id, index);
      return;
    }

    ctx.addIssue({
      code: "custom",
      path: ["tasks", index, "id"],
      message: `Duplicate task id "${task.id}". Task IDs must be unique; first defined at tasks[${firstIndex}].`,
      params: { code: "DUPLICATE_TASK_ID", duplicateId: task.id, firstIndex },
    });
  });
}

function validateEstimationConstraints(
  v: TaskTemplate["validation"] | undefined,
  totalPercent: number,
  ctx: z.RefinementCtx,
) {
  if (v?.totalEstimationMustBe !== undefined) {
    if (totalPercent !== v.totalEstimationMustBe) {
      ctx.addIssue({
        code: "custom",
        path: ["tasks"],
        message: `Total estimation is ${totalPercent}%, but must be ${v.totalEstimationMustBe}%.`,
        params: { code: "INVALID_TOTAL_ESTIMATION" },
      });
    }
  } else if (v?.totalEstimationRange) {
    const { min, max } = v.totalEstimationRange;
    if (totalPercent < min || totalPercent > max) {
      ctx.addIssue({
        code: "custom",
        path: ["tasks"],
        message: `Total estimation is ${totalPercent}%, but must be between ${min}% and ${max}%.`,
        params: { code: "INVALID_ESTIMATION_RANGE" },
      });
    }
  }
}

function validateRequiredTasks(
  v: TaskTemplate["validation"] | undefined,
  tasks: TaskTemplate["tasks"],
  ctx: z.RefinementCtx,
) {
  if (!v?.requiredTasks || v.requiredTasks.length === 0) return;

  const taskTitles = new Set(tasks.map((t) => t.title.toLowerCase()));
  const taskIds = new Set(
    tasks.map((t) => t.id?.toLowerCase()).filter(Boolean),
  );

  for (const required of v.requiredTasks) {
    const matchById = required.id && taskIds.has(required.id.toLowerCase());
    const matchByTitle = taskTitles.has(required.title.toLowerCase());

    if (!matchById && !matchByTitle) {
      const identifier = required.id ? `id "${required.id}" or title` : "title";
      ctx.addIssue({
        code: "custom",
        path: ["tasks"],
        message: `Required task with ${identifier} "${required.title}" is missing.`,
        params: { code: "MISSING_REQUIRED_TASK" },
      });
    }
  }
}

/**
 * Detects circular dependencies in task graph and reports them as validation issues.
 */
function reportCircularDependencies(
  tasks: z.infer<typeof TaskDefinitionSchema>[],
  taskIndexById: Map<string, number>,
  ctx: z.RefinementCtx,
) {
  const adjacencyList = buildAdjacencyList(tasks);
  const { cycles } = detectCycles(adjacencyList);

  for (const cyclePath of cycles) {
    const firstTaskId = cyclePath[0];
    const taskIndex = firstTaskId ? (taskIndexById.get(firstTaskId) ?? 0) : 0;

    ctx.addIssue({
      code: "custom",
      path: ["tasks", taskIndex, "dependsOn"],
      message: `Circular dependency detected: ${formatCyclePath(cyclePath)}`,
      params: { code: "CIRCULAR_DEPENDENCY", cycle: cyclePath },
    });
  }
}

/**
 * Schema for mixin files — partial templates that contribute only tasks.
 * Mixins don't require a filter since they're composed into a full template.
 */
export const MixinTemplateSchema = z
  .object({
    name: z
      .string()
      .min(1, "Mixin name is required")
      .describe("Unique display name for this mixin."),
    description: z
      .string()
      .describe("What tasks this mixin contributes and when to include it.")
      .optional(),
    tasks: z
      .array(TaskDefinitionSchema)
      .min(1, "At least one task is required")
      .describe("Task definitions contributed by this mixin."),
    origin: z
      .string()
      .describe(
        "Catalog ref (template:<name> or mixin:<name>) this mixin was derived from. Informational only — does not affect ref resolution.",
      )
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    validateUniqueTaskIds(data.tasks, ctx);
  });

export const CURRENT_ITERATION = "@CurrentIteration" as const;
export const TEAM_AREAS = "@TeamAreas" as const;
export const TODAY = "@Today" as const;
export const START_OF_DAY = "@StartOfDay" as const;
export const START_OF_WEEK = "@StartOfWeek" as const;
export const START_OF_MONTH = "@StartOfMonth" as const;
export const START_OF_YEAR = "@StartOfYear" as const;
export const ME = "@Me" as const;

export type MixinTemplate = z.infer<typeof MixinTemplateSchema>;
export type FilterCriteria = z.infer<typeof FilterCriteriaSchema>;
export type SavedQuery = z.infer<typeof SavedQuerySchema>;
export type TaskDefinition = z.infer<typeof TaskDefinitionSchema>;
export type EstimationPercentCondition = z.infer<
  typeof EstimationPercentConditionSchema
>;
export type EstimationConfig = z.infer<typeof EstimationConfigSchema>;
export type ValidationMode = z.infer<typeof ValidationModeSchema>;
export type ValidationConfig = z.infer<typeof ValidationConfigSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;

/**
 * A template that uses `extends` and/or `mixins` and has not yet been resolved.
 * `filter` and `tasks` are inherited from the parent and therefore optional here.
 * Always resolve through `TemplateLoader` or `TemplateResolver` before validating.
 */
export type PartialTaskTemplate = Omit<TaskTemplate, "filter" | "tasks"> & {
  filter?: FilterCriteria;
  tasks?: TaskDefinition[];
};
