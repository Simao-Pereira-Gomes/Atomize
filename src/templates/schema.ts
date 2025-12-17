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
  assignedTo: z.array(z.string()).optional(),
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
  estimationPercent: z.number().min(0).max(100).optional(),
  estimationFixed: z.number().min(0).optional(),
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

// Estimation configuration schema
export const EstimationConfigSchema = z.object({
  strategy: z
    .enum(["percentage", "fixed", "hours", "fibonacci"])
    .default("percentage"),
  source: z.string().optional(),
  rounding: z.enum(["nearest", "up", "down"]).default("nearest"),
  minimumTaskPoints: z.number().optional(),
  ifParentHasNoEstimation: z.enum(["skip", "warn", "use-default"]).optional(),
  defaultParentEstimation: z.number().optional(),
});

// Validation rules schema
export const ValidationConfigSchema = z.object({
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

export const TaskTemplateSchema = z.object({
  version: z.string().default("1.0"),
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  created: z.string().optional(),
  lastModified: z.string().optional(),

  filter: FilterCriteriaSchema,
  tasks: z.array(TaskDefinitionSchema).min(1, "At least one task is required"),

  estimation: EstimationConfigSchema.optional(),
  validation: ValidationConfigSchema.optional(),
  metadata: MetadataSchema.optional(),

  variables: z.record(z.string(), z.any()).optional(),
  extends: z.string().optional(),
});

export type FilterCriteria = z.infer<typeof FilterCriteriaSchema>;
export type TaskDefinition = z.infer<typeof TaskDefinitionSchema>;
export type EstimationConfig = z.infer<typeof EstimationConfigSchema>;
export type ValidationConfig = z.infer<typeof ValidationConfigSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;
