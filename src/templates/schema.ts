import { z } from "zod";

export const FilterCriteriaSchema = z.object({
  workItemTypes: z.array(z.string()).optional(),
  states: z.array(z.string()).optional(),
  tags: z
    .object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    })
    .optional(),
  areaPaths: z.array(z.string()).optional(),
  iterations: z.array(z.string()).optional(),
  assignedTo: z
    .array(
      z.union([
        z.email(),
        z.literal("@Me")
      ])
    )
    .optional(),
  priority: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  excludeIfHasTasks: z.boolean().optional(),
  customQuery: z.string().optional(),
  customFields: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum([
          "equals",
          "notEquals",
          "contains",
          "greaterThan",
          "lessThan",
        ]),
        value: z.union([z.string(), z.number(), z.boolean()]),
      })
    )
    .optional(),
});

export const TaskDefinitionSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  estimationPercent: z
    .number()
    .min(0, "Estimation percentage cannot be negative")
    .max(100, "Estimation percentage cannot exceed 100")
    .optional(),
  estimationFixed: z.number().min(0, "Fixed estimation cannot be negative").optional(),
  estimationFormula: z.string().optional(),
  tags: z.array(z.string()).optional(),
  condition: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  assignTo: z.string().optional(),
  priority: z.number().optional(),
  activity: z.string().optional(),
  remainingWork: z.number().optional(),
  customFields: z.record(z.string(), z.any()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  acceptanceCriteriaAsChecklist: z.boolean().optional(),
});

export const EstimationConfigSchema = z.object({
  strategy: z.enum(["percentage"]).default("percentage"), // TODO: add more strategies
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
      })
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
      })
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

    variables: z.record(z.string(), z.any()).optional(),
    extends: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const { tasks, validation: v } = data;
    const nonConditionalTasks = tasks.filter((t) => !t.condition);
    const totalPercent = nonConditionalTasks.reduce(
      (sum, t) => sum + (t.estimationPercent ?? 0),
      0
    );
    const taskIds = new Set(tasks.map((t) => t.id).filter(Boolean));

    validateEstimationConstraints(v, totalPercent, ctx);

    validateTaskConstraints(v, tasks, ctx);
    const availableIds = Array.from(taskIds);
    tasks.forEach((task, index) => {
      task.dependsOn?.forEach((depId) => {
        if (!taskIds.has(depId)) {
          const suggestion = availableIds.length > 0
            ? ` Available task IDs: ${availableIds.map(id => `"${id}"`).join(", ")}`
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
  });

function validateTaskConstraints(
  v: TaskTemplate["validation"] | undefined,
  tasks: TaskTemplate["tasks"],
  ctx: z.RefinementCtx
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

function validateEstimationConstraints(
  v: TaskTemplate["validation"] | undefined,
  totalPercent: number,
  ctx: z.RefinementCtx
) {
  if (v?.totalEstimationMustBe !== undefined) {
    if (totalPercent !== v.totalEstimationMustBe) {
      const diff = v.totalEstimationMustBe - totalPercent;
      const hint = diff > 0
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
      const hint = totalPercent < min
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

export type FilterCriteria = z.infer<typeof FilterCriteriaSchema>;
export type TaskDefinition = z.infer<typeof TaskDefinitionSchema>;
export type EstimationConfig = z.infer<typeof EstimationConfigSchema>;
export type ValidationMode = z.infer<typeof ValidationModeSchema>;
export type ValidationConfig = z.infer<typeof ValidationConfigSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;
