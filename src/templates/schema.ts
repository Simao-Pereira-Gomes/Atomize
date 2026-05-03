import { z } from "zod";
import {
  buildAdjacencyList,
  detectCycles,
  formatCyclePath,
} from "@/utils/graph.js";

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
export const ConditionOperatorSchema = z.enum([
  "equals",
  "not-equals",
  "contains",
  "not-contains",
  "gt",
  "lt",
  "gte",
  "lte",
]);

export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

const ConditionValueSchema = z.union([z.string(), z.number(), z.boolean()]);

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

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({
      field: z.string().min(1),
      operator: ConditionOperatorSchema,
      value: ConditionValueSchema,
    }),
    z.object({
      customField: z
        .string()
        .regex(
          REFERENCE_NAME_RE,
          'Custom field reference must be in "Namespace.FieldName" format (e.g. "Custom.ClientTier").',
        ),
      operator: ConditionOperatorSchema,
      value: ConditionValueSchema,
    }),
    z.object({ all: z.array(ConditionSchema).min(1, "all requires at least one clause") }),
    z.object({ any: z.array(ConditionSchema).min(1, "any requires at least one clause") }),
  ]),
);


export const SavedQuerySchema = z
  .object({
    id: z.uuid().optional(),
    path: z.string().min(1).optional(),
  })
  .refine((d) => !!(d.id ?? d.path), {
    message: "savedQuery requires either id or path",
  })
  .refine((d) => !(d.id && d.path), {
    message: "savedQuery accepts id or path, not both",
  });

export const FilterCriteriaSchema = z.object({
  team: z.string().optional(),
  workItemTypes: z.array(z.string()).optional(),
  states: z.array(z.string()).optional(),
  statesExclude: z.array(z.string()).optional(),
  statesWereEver: z.array(z.string()).optional(),
  tags: z
    .object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    })
    .optional(),
  areaPaths: z
    .array(z.union([z.string(), z.literal("@TeamAreas")]))
    .optional(),
  areaPathsUnder: z.array(z.string()).optional(),
  iterations: z
    .array(z.union([z.string(), z.literal("@CurrentIteration")]))
    .optional(),
  iterationsUnder: z.array(z.string()).optional(),
  assignedTo: z.array(z.union([z.email(), z.literal("@Me")])).optional(),
  changedAfter: DateOrMacroSchema.optional(),
  createdAfter: DateOrMacroSchema.optional(),
  priority: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  excludeIfHasTasks: z.boolean().optional(),
  savedQuery: SavedQuerySchema.optional(),
});

export const EstimationPercentConditionSchema = z.object({
  condition: ConditionSchema,
  percent: z.number().min(0).max(100),
});

export const TaskDefinitionSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  estimationPercent: z
    .number()
    .min(0, "Estimation percentage cannot be negative")
    .max(100, "Estimation percentage for a single task cannot exceed 100%")
    .optional(),
  estimationPercentCondition: z
    .array(EstimationPercentConditionSchema)
    .optional(),
  estimationFixed: z
    .number()
    .min(0, "Fixed estimation cannot be negative")
    .optional(),
  estimationFormula: z.string().optional(),
  tags: z.array(z.string()).optional(),
  condition: ConditionSchema.optional(),
  dependsOn: z.array(z.string()).optional(),
  assignTo: z.string().optional(),
  priority: z.number().optional(),
  activity: z.string().optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  acceptanceCriteriaAsChecklist: z.boolean().optional(),
  customFields: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
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
});

export const EstimationConfigSchema = z.object({
  strategy: z.enum(["percentage"]).default("percentage"),
  source: z.string().optional(),
  rounding: z.enum(["nearest", "up", "down", "none"]).default("none"),
  minimumTaskPoints: z.number().optional(),
  ifParentHasNoEstimation: z.enum(["skip", "warn", "use-default"]).optional(),
  defaultParentEstimation: z.number().optional(),
});

export const ValidationModeSchema = z.enum(["strict", "lenient"]);

export const ValidationConfigSchema = z.object({
  mode: ValidationModeSchema.optional(),
  totalEstimationMustBe: z.number().optional(),
  totalEstimationRange: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
  minTasks: z.number().optional(),
  maxTasks: z.number().optional(),
  taskEstimationRange: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
  requiredTasks: z
    .array(
      z.object({
        title: z.string(),
        id: z.string().optional(),
      }),
    )
    .optional(),
});

export const MetadataSchema = z.object({
  category: z.string().optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  recommendedFor: z.array(z.string()).optional(),
  estimationGuidelines: z.string().optional(),
  examples: z.array(z.string()).optional(),
  changelog: z
    .array(
      z.object({
        version: z.string(),
        date: z.string(),
        changes: z.string(),
      }),
    )
    .optional(),
});

export const TaskTemplateSchema = z
  .object({
    version: z.string().default("1.0"),
    name: z.string().min(1, "Template name is required"),
    description: z.string().optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
    created: z.string().optional(),
    lastModified: z.string().optional(),

    filter: FilterCriteriaSchema,
    tasks: z
      .array(TaskDefinitionSchema)
      .min(1, "At least one task is required"),

    estimation: EstimationConfigSchema.optional(),
    validation: ValidationConfigSchema.optional(),
    metadata: MetadataSchema.optional(),

    extends: z.string().optional(),
    mixins: z.array(z.string()).optional(),
  })
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
      const diff = v.totalEstimationMustBe - totalPercent;
      const hint =
        diff > 0
          ? ` Add ${diff}% to existing tasks.`
          : ` Reduce tasks by ${Math.abs(diff)}%.`;
      ctx.addIssue({
        code: "custom",
        path: ["tasks"],
        message: `Total estimation is ${totalPercent}%, but must be ${v.totalEstimationMustBe}%.${hint}`,
        params: { code: "INVALID_TOTAL_ESTIMATION" },
      });
    }
  } else if (v?.totalEstimationRange) {
    const { min, max } = v.totalEstimationRange;
    if (totalPercent < min || totalPercent > max) {
      const hint =
        totalPercent < min
          ? ` Increase by ${min - totalPercent}%.`
          : ` Reduce by ${totalPercent - max}%.`;
      ctx.addIssue({
        code: "custom",
        path: ["tasks"],
        message: `Total estimation is ${totalPercent}%, but must be between ${min}% and ${max}%.${hint}`,
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
export const MixinTemplateSchema = z.object({
  name: z.string().min(1, "Mixin name is required"),
  description: z.string().optional(),
  tasks: z.array(TaskDefinitionSchema).min(1, "At least one task is required"),
}).superRefine((data, ctx) => {
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
