import { match } from "ts-pattern";
import { logger } from "../logger";
import type {
  TaskDefinition as PlatformTaskDefinition,
  WorkItem,
} from "../platforms/interfaces/work-item.interface";
import type {
  EstimationConfig,
  TaskDefinition as TemplateTaskDefinition,
} from "../templates/schema";
import { getErrorMessage } from "../utils/errors";
import { ConditionEvaluator } from "./condition-evaluator.js";
import { resolveStoryEstimate, type StoryEstimateResolution } from "./estimation-conversion";
import { distributeActiveTaskPercentages } from "./estimation-distribution";
import { type EstimationFieldMapping, readStoryEstimate } from "./estimation-field-mapping";
import { interpolateValue } from "./template-interpolator.js";

/**
 * Estimation result for a single task
 */
export interface CalculatedTask extends PlatformTaskDefinition {
  templateId?: string;
  estimationPercent?: number;
  estimationFixed?: number;
}

/**
 * Result of task calculation including skipped tasks
 */
export interface TaskCalculationResult {
  calculatedTasks: CalculatedTask[];
  skippedTasks: Array<{
    templateTask: TemplateTaskDefinition;
    reason: string;
  }>;
  /** Set when the Story Estimate could not be resolved and the policy left estimates blank or skipped the Story. */
  unresolvedEstimate?: { action: "blank" | "skip"; reason: string };
  /** Set when the Story Estimate could not be resolved and defaultParentEstimation was used instead. */
  defaultEstimateReason?: string;
}

/**
 * Estimation Calculator
 * Calculates task estimations based on parent story estimation and template percentages
 */
export class EstimationCalculator {
  private conditionEvaluator: ConditionEvaluator;

  constructor(conditionEvaluator: ConditionEvaluator = new ConditionEvaluator()) {
    this.conditionEvaluator = conditionEvaluator;
  }

  /**
   * Calculate tasks with detailed result including skipped tasks
   */
  calculateTasksWithSkipped(
    story: WorkItem,
    connectUserEmail: string,
    templateTasks: TemplateTaskDefinition[],
    estimationConfig?: EstimationConfig,
    forceNormalize = false,
    fieldMapping?: EstimationFieldMapping,
  ): TaskCalculationResult {
    logger.debug(
      `EstimationCalculator: Calculating tasks for story ${story.id}`
    );

    const resolution = this.resolveParentEstimate(story, estimationConfig, fieldMapping);

    if (resolution.kind === "skip") {
      logger.warn(`Story ${story.id}: ${resolution.reason}. Skipping the Story.`);
      return {
        calculatedTasks: [],
        skippedTasks: [],
        unresolvedEstimate: { action: "skip", reason: resolution.reason },
      };
    }
    if (resolution.kind === "blank") {
      logger.warn(`Story ${story.id}: ${resolution.reason}. Task Estimates will be left blank.`);
    }

    const calculatedTasks: CalculatedTask[] = [];
    const skippedTasks: Array<{
      templateTask: TemplateTaskDefinition;
      reason: string;
    }> = [];

    for (const templateTask of templateTasks) {
      logger.debug(
        `Processing template task: ${templateTask.title} (Condition: ${templateTask.condition ? JSON.stringify(templateTask.condition) : "none"})`
      );

      // Evaluate condition if present
      if (templateTask.condition) {
        let conditionMet: boolean;
        try {
          conditionMet = this.conditionEvaluator.evaluateCondition(
            templateTask.condition,
            story,
            fieldMapping?.storySource,
          );
        } catch (error) {
          const reason = `Condition evaluation error: ${getErrorMessage(error)}`;
          logger.error(`Skipping task "${templateTask.title}" - ${reason}`);
          skippedTasks.push({ templateTask, reason });
          continue;
        }

        if (!conditionMet) {
          const reason = `Condition not met: ${JSON.stringify(templateTask.condition)}`;
          logger.debug(`Skipping task "${templateTask.title}" - ${reason}`);
          skippedTasks.push({ templateTask, reason });
          continue;
        }

        logger.debug(
          `Task "${templateTask.title}" - condition met: ${JSON.stringify(templateTask.condition)}`
        );
      }

      let resolvedPercent: number | undefined;
      try {
        resolvedPercent = this.resolveEffectivePercent(templateTask, story, fieldMapping);
      } catch (error) {
        const reason = `Condition evaluation error: ${getErrorMessage(error)}`;
        logger.error(`Skipping task "${templateTask.title}" - ${reason}`);
        skippedTasks.push({ templateTask, reason });
        continue;
      }
      const calculatedTask = this.buildCalculatedTask(
        templateTask,
        story,
        connectUserEmail,
        0,
        resolvedPercent,
      );

      calculatedTasks.push(calculatedTask);
    }

    if (fieldMapping) {
      for (const task of calculatedTasks) {
        task.workItemType = fieldMapping.taskWorkItemType;
        if (fieldMapping.taskTarget.kind === "override") {
          task.estimateFields = [...fieldMapping.taskTarget.fields];
        }
      }
    }

    distributeActiveTaskPercentages(calculatedTasks, {
      forceNormalize,
      enableLogging: true,
    });

    for (const calculatedTask of calculatedTasks) {
      calculatedTask.estimation =
        resolution.kind === "resolved"
          ? this.calculateEstimation(
              resolution.total,
              calculatedTask as TemplateTaskDefinition,
              estimationConfig,
            )
          : calculatedTask.estimationFixed;

      logger.debug(
        `Calculated task: ${calculatedTask.title} = ${calculatedTask.estimation ?? "unestimated"} (${calculatedTask.estimationPercent}%)`
      );
    }

    logger.info(
      `EstimationCalculator: Calculated ${calculatedTasks.length} tasks, skipped ${skippedTasks.length} tasks for story ${story.id}`
    );

    return {
      calculatedTasks,
      skippedTasks,
      ...(resolution.kind === "blank"
        ? { unresolvedEstimate: { action: "blank" as const, reason: resolution.reason } }
        : {}),
      ...(resolution.kind === "resolved" && resolution.fallbackReason
        ? { defaultEstimateReason: resolution.fallbackReason }
        : {}),
    };
  }

  /**
   * Resolve the effective estimation percent for a task given a story.
   * Returns the first matching conditional percent, or falls back to estimationPercent.
   */
  private resolveEffectivePercent(
    task: TemplateTaskDefinition,
    story: WorkItem,
    fieldMapping?: EstimationFieldMapping,
  ): number | undefined {
    if (task.estimationPercentCondition?.length) {
      for (const rule of task.estimationPercentCondition) {
        if (this.conditionEvaluator.evaluateCondition(rule.condition, story, fieldMapping?.storySource)) {
          logger.debug(
            `Task "${task.title}": conditional percent → ${rule.percent}%`,
          );
          return rule.percent;
        }
      }
    }
    return task.estimationPercent;
  }

  private buildCalculatedTask(
    templateTask: TemplateTaskDefinition,
    story: WorkItem,
    connectUserEmail: string,
    estimation: number,
    resolvedPercent: number | undefined,
  ): CalculatedTask {
    return {
      title: interpolateValue(templateTask.title, story),
      description: templateTask.description
        ? interpolateValue(templateTask.description, story)
        : undefined,
      estimation,
      tags: templateTask.tags,
      assignTo: this.resolveAssignment(
        templateTask.assignTo,
        story,
        connectUserEmail,
      ),
      priority: templateTask.priority,
      activity: templateTask.activity,
      iteration: story.iteration,
      areaPath: story.areaPath,
      customFields: this.interpolateCustomFields(templateTask.customFields, story),
      templateId: templateTask.id,
      estimationPercent: resolvedPercent ?? templateTask.estimationPercent,
      estimationFixed: templateTask.estimationFixed,
    };
  }

  /** The Story Estimate converted into the Task's unit with the unresolvable-estimate policy applied. */
  resolveParentEstimate(
    story: WorkItem,
    config?: EstimationConfig,
    fieldMapping?: EstimationFieldMapping,
  ): StoryEstimateResolution {
    const raw = readStoryEstimate(story, fieldMapping?.storySource ?? { kind: "default", fields: [] });
    return resolveStoryEstimate(raw, config);
  }

  /**
   * Calculate estimation for a single task
   */
  private calculateEstimation(
    parentEstimation: number,
    task: TemplateTaskDefinition,
    config?: EstimationConfig
  ): number {
    if (task.estimationFixed !== undefined) {
      return task.estimationFixed;
    }

    if (task.estimationPercent !== undefined) {
      const rawEstimation = (parentEstimation * task.estimationPercent) / 100;

      const rounded = this.roundEstimation(
        rawEstimation,
        config?.rounding || "none"
      );

      const minimum = config?.minimumTaskEstimate ?? config?.minimumTaskPoints ?? 0;
      return Math.max(rounded, minimum);
    }

    if (task.estimationFormula) {
      logger.warn(
        `Estimation formulas not yet supported: ${task.estimationFormula}`
      );
      return 0;
    }

    return 0;
  }

  /**
   * Round estimation based on rounding strategy
   * Uses half-point (0.5) precision to preserve small values while keeping reasonable granularity
   */
  private roundEstimation(
    value: number,
    strategy: "nearest" | "up" | "down" | "none"
  ): number {
    return match(strategy)
      .with("up", () => Math.ceil(value * 2) / 2) // Round up to nearest 0.5
      .with("down", () => Math.floor(value * 2) / 2) // Round down to nearest 0.5
      .with("nearest", () => Math.round(value * 2) / 2) // Round to nearest 0.5
      .otherwise(() => Math.floor(value * 100) / 100); // No rounding, keep two decimals
  }

  private interpolateCustomFields(
    fields: Record<string, string | number | boolean> | undefined,
    story: WorkItem,
  ): Record<string, string | number | boolean> | undefined {
    if (!fields || Object.keys(fields).length === 0) return undefined;

    const resolved: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === "string") {
        resolved[key] = interpolateValue(value, story, (referenceName) => {
          logger.warn(
            `Story ${story.id}: custom field "${referenceName}" referenced in task template was not found on the parent story — value will be empty.`,
          );
        });
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  /**
   * Resolve task assignment
   */
  private resolveAssignment(
    assignTo: string | undefined,
    story: WorkItem,
    connectUserEmail: string
  ) {
    if (!assignTo) return undefined;

    return match<string | string, string | undefined>(assignTo)
      .with("@ParentAssignee", "@Inherit", () => {
        return story.assignedTo;
      })
      .with("@Me", () => {
        return connectUserEmail;
      })
      .with("@Unassigned", () => {
        return undefined;
      })
      .otherwise(() => {
        return assignTo;
      });
  }

  /**
   * Calculate total estimation for tasks
   */
  calculateTotalEstimation(tasks: CalculatedTask[]): number {
    return tasks.reduce((sum, task) => sum + (task.estimation || 0), 0);
  }

  /**
   * Get estimation summary
   */
  getEstimationSummary(
    story: WorkItem,
    tasks: CalculatedTask[],
    config?: EstimationConfig,
    fieldMapping?: EstimationFieldMapping,
  ): {
    storyEstimation: number;
    totalTaskEstimation: number;
    difference: number;
    percentageUsed: number;
  } {
    const resolution = this.resolveParentEstimate(story, config, fieldMapping);
    const storyEstimation = resolution.kind === "resolved" ? resolution.total : 0;
    const totalTaskEstimation = this.calculateTotalEstimation(tasks);
    const difference = storyEstimation - totalTaskEstimation;
    const percentageUsed =
      storyEstimation > 0 ? (totalTaskEstimation / storyEstimation) * 100 : 0;

    return {
      storyEstimation,
      totalTaskEstimation,
      difference,
      percentageUsed,
    };
  }

  /**
   * Validate estimation distribution
   */
  validateEstimation(
    story: WorkItem,
    tasks: CalculatedTask[],
    config?: EstimationConfig,
    fieldMapping?: EstimationFieldMapping,
  ): {
    valid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    if (this.resolveParentEstimate(story, config, fieldMapping).kind !== "resolved") {
      return { valid: true, warnings };
    }

    const summary = this.getEstimationSummary(story, tasks, config, fieldMapping);

    if (Math.abs(summary.difference) > 0.5) {
      warnings.push(
        `Total task estimation (${summary.totalTaskEstimation}) differs from story estimation (${summary.storyEstimation}) by ${summary.difference}`
      );
    }

    const zeroEstimations = tasks.filter((t) => t.estimation === 0);
    if (zeroEstimations.length > 0) {
      warnings.push(
        `${
          zeroEstimations.length
        } task(s) have zero estimation: ${zeroEstimations
          .map((t) => t.title)
          .join(", ")}`
      );
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }
}
