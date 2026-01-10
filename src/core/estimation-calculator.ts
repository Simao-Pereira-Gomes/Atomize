import { logger } from "@config/logger";
import type {
  TaskDefinition as PlatformTaskDefinition,
  WorkItem,
} from "@platforms/interfaces/work-item.interface";
import type {
  EstimationConfig,
  TaskDefinition as TemplateTaskDefinition,
} from "@templates/schema";
import { match } from "ts-pattern";
import { ConditionEvaluator } from "./condition-evaluator.js";

/**
 * Estimation result for a single task
 */
export interface CalculatedTask extends PlatformTaskDefinition {
  templateId?: string;
  estimationPercent?: number;
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
}

/**
 * Estimation Calculator
 * Calculates task estimations based on parent story estimation and template percentages
 */
export class EstimationCalculator {
  private conditionEvaluator: ConditionEvaluator;

  constructor() {
    this.conditionEvaluator = new ConditionEvaluator();
  }

  /**
   * Calculate tasks with estimations for a story
   */
  calculateTasks(
    story: WorkItem,
    connectUserEmail: string,
    templateTasks: TemplateTaskDefinition[],
    estimationConfig?: EstimationConfig
  ): CalculatedTask[] {
    logger.debug(
      `EstimationCalculator: Calculating tasks for story ${story.id}`
    );

    const parentEstimation = story.estimation || 0;

    if (parentEstimation === 0) {
      logger.warn(
        `Story ${story.id} has no estimation. Tasks will have 0 estimation.`
      );
    }

    const calculatedTasks: CalculatedTask[] = [];

    for (const templateTask of templateTasks) {
      logger.debug(
        `Processing template task: ${templateTask.title} (Condition: ${templateTask.condition})`
      );

      // Evaluate condition if present
      if (templateTask.condition) {
        const conditionMet = this.conditionEvaluator.evaluateCondition(
          templateTask.condition,
          story
        );

        if (!conditionMet) {
          logger.debug(
            `Skipping task "${templateTask.title}" - condition not met: ${templateTask.condition}`
          );
          continue;
        }

        logger.debug(
          `Task "${templateTask.title}" - condition met: ${templateTask.condition}`
        );
      }

      const estimation = this.calculateEstimation(
        parentEstimation,
        templateTask,
        estimationConfig
      );

      const calculatedTask: CalculatedTask = {
        title: this.interpolateTitle(templateTask.title, story),
        description: templateTask.description
          ? this.interpolateDescription(templateTask.description, story)
          : undefined,
        estimation,
        tags: templateTask.tags,
        assignTo: this.resolveAssignment(
          templateTask.assignTo,
          story,
          connectUserEmail
        ),
        priority: templateTask.priority,
        activity: templateTask.activity,
        remainingWork: templateTask.remainingWork,
        customFields: templateTask.customFields,
        templateId: templateTask.id,
        estimationPercent: templateTask.estimationPercent,
      };

      calculatedTasks.push(calculatedTask);

      logger.debug(
        `Calculated task: ${calculatedTask.title} = ${estimation} points (${templateTask.estimationPercent}%)`
      );
    }

    logger.info(
      `EstimationCalculator: Calculated ${calculatedTasks.length} tasks for story ${story.id}`
    );

    return calculatedTasks;
  }

  /**
   * Calculate tasks with detailed result including skipped tasks
   */
  calculateTasksWithSkipped(
    story: WorkItem,
    connectUserEmail: string,
    templateTasks: TemplateTaskDefinition[],
    estimationConfig?: EstimationConfig
  ): TaskCalculationResult {
    logger.debug(
      `EstimationCalculator: Calculating tasks for story ${story.id}`
    );

    const parentEstimation = story.estimation || 0;

    if (parentEstimation === 0) {
      logger.warn(
        `Story ${story.id} has no estimation. Tasks will have 0 estimation.`
      );
    }

    const calculatedTasks: CalculatedTask[] = [];
    const skippedTasks: Array<{
      templateTask: TemplateTaskDefinition;
      reason: string;
    }> = [];

    for (const templateTask of templateTasks) {
      logger.debug(
        `Processing template task: ${templateTask.title} (Condition: ${templateTask.condition})`
      );

      // Evaluate condition if present
      if (templateTask.condition) {
        const conditionMet = this.conditionEvaluator.evaluateCondition(
          templateTask.condition,
          story
        );

        if (!conditionMet) {
          const reason = `Condition not met: ${templateTask.condition}`;
          logger.debug(`Skipping task "${templateTask.title}" - ${reason}`);
          skippedTasks.push({ templateTask, reason });
          continue;
        }

        logger.debug(
          `Task "${templateTask.title}" - condition met: ${templateTask.condition}`
        );
      }

      const estimation = this.calculateEstimation(
        parentEstimation,
        templateTask,
        estimationConfig
      );

      const calculatedTask: CalculatedTask = {
        title: this.interpolateTitle(templateTask.title, story),
        description: templateTask.description
          ? this.interpolateDescription(templateTask.description, story)
          : undefined,
        estimation,
        tags: templateTask.tags,
        assignTo: this.resolveAssignment(
          templateTask.assignTo,
          story,
          connectUserEmail
        ),
        priority: templateTask.priority,
        activity: templateTask.activity,
        remainingWork: templateTask.remainingWork,
        customFields: templateTask.customFields,
        templateId: templateTask.id,
        estimationPercent: templateTask.estimationPercent,
      };

      calculatedTasks.push(calculatedTask);

      logger.debug(
        `Calculated task: ${calculatedTask.title} = ${estimation} points (${templateTask.estimationPercent}%)`
      );
    }

    logger.info(
      `EstimationCalculator: Calculated ${calculatedTasks.length} tasks, skipped ${skippedTasks.length} tasks for story ${story.id}`
    );

    return { calculatedTasks, skippedTasks };
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

      const minimum = config?.minimumTaskPoints || 0;
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
   */
  private roundEstimation(
    value: number,
    strategy: "nearest" | "up" | "down" | "none"
  ): number {
    return match(strategy)
      .with("up", () => Math.ceil(value))
      .with("down", () => Math.floor(value))
      .with("nearest", () => Math.round(value))
      .otherwise(() => Math.floor(value * 100) / 100); // No rounding, keep two decimals
  }

  /**
   * Interpolate task title with story data
   */
  private interpolateTitle(title: string, story: WorkItem): string {
    return title
      .replace(/\${story\.title}/g, story.title)
      .replace(/\${story\.id}/g, story.id);
  }

  /**
   * Interpolate task description with story data
   */
  private interpolateDescription(description: string, story: WorkItem): string {
    return description
      .replace(/\${story\.title}/g, story.title)
      .replace(/\${story\.id}/g, story.id)
      .replace(/\${story\.description}/g, story.description || "");
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
    tasks: CalculatedTask[]
  ): {
    storyEstimation: number;
    totalTaskEstimation: number;
    difference: number;
    percentageUsed: number;
  } {
    const storyEstimation = story.estimation || 0;
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
    tasks: CalculatedTask[]
  ): {
    valid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    const summary = this.getEstimationSummary(story, tasks);

    if (Math.abs(summary.difference) > 0.5) {
      warnings.push(
        `Total task estimation (${summary.totalTaskEstimation}) differs from story estimation (${summary.storyEstimation}) by ${summary.difference}`
      );
    }

    const zeroEstimations = tasks.filter((t) => (t.estimation || 0) === 0);
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
