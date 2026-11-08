import { distributeEstimationPercentages, taskEstimationRangeViolations } from "@sppg2001/atomize-schema";
import { match } from "ts-pattern";
import { logger } from "../logger";
import type {
  TaskDefinition as PlatformTaskDefinition,
  StoryEstimate,
  WorkItem,
} from "../platforms/interfaces/work-item.interface";
import type {
  EstimationConfig,
  TaskTemplate,
  TaskDefinition as TemplateTaskDefinition,
} from "../templates/schema";
import { getErrorMessage, TemplateValidationError } from "../utils/errors";
import { ConditionEvaluator } from "./condition-evaluator.js";
import { resolveStoryEstimate, type StoryEstimateResolution } from "./estimation-conversion";
import { type EstimationFieldMapping, readStoryEstimate } from "./estimation-field-mapping";
import { repeatTasks, withOrdinal } from "./task-repeater";
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

export interface EstimationSummary {
  /** The Story Estimate in the Task's unit; 0 when it could not be resolved. */
  storyEstimation: number;
  totalTaskEstimation: number;
  difference: number;
  percentageUsed: number;
}

/** What one Story's Tasks are estimated with. */
export interface StoryEstimationInput {
  /** The Template's Task definitions, in dependency order. */
  tasks: TemplateTaskDefinition[];
  /** Who `@Me` assigns to. */
  connectUserEmail?: string;
  estimation?: EstimationConfig;
  /** Normalise the active percentages to 100% even when they add up to more. */
  forceNormalize?: boolean;
  /** Which Story field supplies the Story Estimate and where Task Estimates go; the platform default when omitted. */
  fieldMapping?: EstimationFieldMapping;
  taskEstimationRange?: NonNullable<TaskTemplate["validation"]>["taskEstimationRange"];
}

/** One Story's Task Estimates, worked out from a single reading of its Story Estimate. */
export interface StoryEstimation extends TaskCalculationResult {
  summary: EstimationSummary;
  /** Where the Task Estimates don't add up to the Story Estimate, or some are zero; empty when it was unresolvable. */
  warnings: string[];
  /** The Story Estimate as read, before conversion; absent when the Story has none. */
  storyEstimate?: StoryEstimate;
}

/**
 * Estimation Calculator: turns a Story Estimate into Task Estimates by converting it to the Task's
 * unit and distributing it across the active Tasks by percentage.
 */
export class EstimationCalculator {
  private readonly conditionEvaluator = new ConditionEvaluator();

  /**
   * Estimates one Story's Tasks. The Story Estimate is read and converted once, and the
   * Unresolvable Story Estimate policy (blank, skip or use-default) is applied once; a skipped
   * Story has no Tasks. Throws a TemplateValidationError when the active allocation breaks
   * `taskEstimationRange`.
   */
  estimate(story: WorkItem, input: StoryEstimationInput): StoryEstimation {
    const storyEstimate = readStoryEstimate(story, input.fieldMapping?.storySource ?? { kind: "default", fields: [] });
    const resolution = resolveStoryEstimate(storyEstimate, input.estimation);
    const calculation = this.calculateTasks(story, input, resolution);
    const summary = this.summarize(resolution, calculation.calculatedTasks);
    return {
      ...calculation,
      summary,
      warnings: resolution.kind === "resolved" ? distributionWarnings(summary, calculation.calculatedTasks) : [],
      ...(storyEstimate === undefined ? {} : { storyEstimate }),
    };
  }

  private calculateTasks(
    story: WorkItem,
    input: StoryEstimationInput,
    resolution: StoryEstimateResolution,
  ): TaskCalculationResult {
    const connectUserEmail = input.connectUserEmail ?? "";
    const templateTasks = input.tasks;
    const estimationConfig = input.estimation;
    const forceNormalize = input.forceNormalize ?? false;
    const fieldMapping = input.fieldMapping;
    const taskEstimationRange = input.taskEstimationRange;
    logger.debug(
      `EstimationCalculator: Calculating tasks for story ${story.id}`
    );

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

    const skippedTasks: Array<{
      templateTask: TemplateTaskDefinition;
      reason: string;
    }> = [];
    // Conditions and percents resolve once per template task, so a repeated task's
    // copies are produced all together or not at all.
    const activeTasks: TemplateTaskDefinition[] = [];
    const resolvedPercents = new Map<TemplateTaskDefinition, number | undefined>();

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
      activeTasks.push(templateTask);
      resolvedPercents.set(templateTask, resolvedPercent);
    }

    const calculatedTasks: CalculatedTask[] = repeatTasks(activeTasks).map((copy) => {
      const calculatedTask = this.buildCalculatedTask(
        copy.task,
        story,
        connectUserEmail,
        0,
        resolvedPercents.get(copy.task),
      );
      calculatedTask.title = withOrdinal(calculatedTask.title, copy);
      return calculatedTask;
    });

    if (fieldMapping) {
      for (const task of calculatedTasks) {
        task.workItemType = fieldMapping.taskWorkItemType;
        if (fieldMapping.taskTarget.kind === "override") {
          task.estimateFields = [...fieldMapping.taskTarget.fields];
        }
      }
    }

    // "auto" fills totals under 100% and keeps overage unless forced; "always" and "never" replace that.
    if (distributeEstimationPercentages(calculatedTasks, estimationConfig?.normalize ?? "auto", forceNormalize)) {
      logger.debug("Normalized estimation percentages");
    }

    const allocationErrors = taskEstimationRangeViolations(calculatedTasks, taskEstimationRange);
    if (allocationErrors.length) {
      const errors = allocationErrors.map(error => `${calculatedTasks[error.index]?.title ?? "Task"}: ${error.message}`);
      throw new TemplateValidationError(
        `Task allocation violates validation.taskEstimationRange. ${errors.join(" ")}`,
        errors,
      );
    }

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
            `Story ${story.id}: custom field "${referenceName}" referenced in task template was not found on the parent story, so the value will be empty.`,
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

  private summarize(resolution: StoryEstimateResolution, tasks: CalculatedTask[]): EstimationSummary {
    const storyEstimation = resolution.kind === "resolved" ? resolution.total : 0;
    const totalTaskEstimation = tasks.reduce((sum, task) => sum + (task.estimation || 0), 0);
    return {
      storyEstimation,
      totalTaskEstimation,
      difference: storyEstimation - totalTaskEstimation,
      percentageUsed: storyEstimation > 0 ? (totalTaskEstimation / storyEstimation) * 100 : 0,
    };
  }
}

/** Task Estimates that don't add up to the Story Estimate (beyond half a unit), or that are zero. */
function distributionWarnings(summary: EstimationSummary, tasks: CalculatedTask[]): string[] {
  const warnings: string[] = [];
  if (Math.abs(summary.difference) > 0.5) {
    warnings.push(
      `Total task estimation (${summary.totalTaskEstimation}) differs from story estimation (${summary.storyEstimation}) by ${summary.difference}`,
    );
  }
  const zero = tasks.filter((task) => task.estimation === 0);
  if (zero.length > 0) {
    warnings.push(`${zero.length} task(s) have zero estimation: ${zero.map((task) => task.title).join(", ")}`);
  }
  return warnings;
}
