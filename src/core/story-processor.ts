import { logger } from "@config/logger";
import type { GenerationPlatform } from "@platforms/interfaces/platform-capabilities";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { TaskTemplate, TaskDefinition as TemplateTaskDefinition } from "@templates/schema";
import type { AtomizationOptions, StoryAtomizationResult } from "./atomizer";
import { EstimationCalculator } from "./estimation-calculator";
import { TaskMaterializer } from "./task-materializer";

/**
 * Handles the per-story transformation: condition evaluation → estimation calculation →
 * task creation → dependency linking.
 *
 * Atomizer owns batching and concurrency; StoryProcessor owns what happens to one Story.
 */
export class StoryProcessor {
  private estimationCalculator: EstimationCalculator;
  private taskMaterializer: TaskMaterializer;

  constructor(
    platform: GenerationPlatform,
    estimationCalculator = new EstimationCalculator(),
    taskMaterializer = new TaskMaterializer(platform),
  ) {
    this.estimationCalculator = estimationCalculator;
    this.taskMaterializer = taskMaterializer;
  }

  async process(
    story: WorkItem,
    orderedTasks: TemplateTaskDefinition[],
    template: TaskTemplate,
    connectUserEmail: string,
    options: Pick<AtomizationOptions, "dryRun" | "forceNormalize" | "dependencyConcurrency">,
    warnings: string[],
  ): Promise<StoryAtomizationResult> {
    logger.info(`Processing: ${story.id} - ${story.title}`);

    const { calculatedTasks, skippedTasks } =
      this.estimationCalculator.calculateTasksWithSkipped(
        story,
        connectUserEmail,
        orderedTasks,
        template.estimation,
        options.forceNormalize,
      );

    logger.info(
      `Generated ${calculatedTasks.length} tasks, skipped ${skippedTasks.length} conditional tasks`,
    );

    if (skippedTasks.length > 0) {
      skippedTasks.forEach((skipped) => {
        logger.debug(`  Skipped: "${skipped.templateTask.title}" - ${skipped.reason}`);
      });
    }

    const validation = this.estimationCalculator.validateEstimation(story, calculatedTasks);

    if (!validation.valid) {
      validation.warnings.forEach((warning) => {
        logger.warn(`${warning}`);
        warnings.push(`${story.id}: ${warning}`);
      });
    }

    const estimationSummary = this.estimationCalculator.getEstimationSummary(
      story,
      calculatedTasks,
    );

    logger.debug("Estimation summary:", estimationSummary);

    let tasksCreated: WorkItem[] = [];

    if (options.dryRun) {
      logger.info(`DRY RUN: Would create ${calculatedTasks.length} tasks`);
    } else {
      logger.info(`Creating ${calculatedTasks.length} tasks...`);
      tasksCreated = await this.taskMaterializer.materialize(
        story.id,
        calculatedTasks,
        orderedTasks,
        { dependencyConcurrency: options.dependencyConcurrency },
      );
      logger.info(`Created ${tasksCreated.length} tasks`);
    }

    return {
      story,
      tasksCalculated: calculatedTasks,
      tasksCreated,
      tasksSkipped: skippedTasks,
      success: true,
      estimationSummary,
    };
  }
}
