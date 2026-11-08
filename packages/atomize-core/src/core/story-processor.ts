import { logger } from "../logger";
import type { EstimationDefaults } from "../platforms/interfaces/estimation-defaults.interface";
import type { GenerationPlatform } from "../platforms/interfaces/platform-capabilities";
import type { StoryEstimate, WorkItem } from "../platforms/interfaces/work-item.interface";
import type { TaskTemplate, TaskDefinition as TemplateTaskDefinition } from "../templates/schema";
import type { AtomizationOptions, StoryAtomizationResult } from "./atomizer";
import { EstimationCalculator } from "./estimation-calculator";
import { resolveEstimationFieldMapping } from "./estimation-field-mapping";
import { TaskMaterializer } from "./task-materializer";

/**
 * Handles the per-story transformation: condition evaluation → estimation calculation →
 * task creation → dependency linking.
 *
 * Atomizer owns batching and concurrency; StoryProcessor owns what happens to one Story.
 */
export class StoryProcessor {
  private readonly estimationCalculator = new EstimationCalculator();
  private readonly taskMaterializer: TaskMaterializer;
  private readonly estimationDefaults: EstimationDefaults | undefined;

  constructor(platform: GenerationPlatform) {
    this.taskMaterializer = new TaskMaterializer(platform);
    this.estimationDefaults = platform.getEstimationDefaults?.();
  }

  async process(
    story: WorkItem,
    orderedTasks: TemplateTaskDefinition[],
    template: TaskTemplate,
    connectUserEmail: string,
    options: Pick<AtomizationOptions, "dryRun" | "forceNormalize" | "dependencyConcurrency" | "signal"> & {
      onTaskCreated?: (task: WorkItem) => void;
    },
    warnings: string[],
  ): Promise<StoryAtomizationResult> {
    logger.info(`Processing: ${story.id} - ${story.title}`);

    const fieldMapping = this.estimationDefaults
      ? resolveEstimationFieldMapping(this.estimationDefaults, {
          source: template.estimation?.source,
          taskType: template.taskType,
          targetFields: template.estimation?.targetFields,
        })
      : undefined;

    const estimation = this.estimationCalculator.estimate(story, {
      tasks: orderedTasks,
      connectUserEmail,
      estimation: template.estimation,
      forceNormalize: options.forceNormalize,
      fieldMapping,
      taskEstimationRange: template.validation?.taskEstimationRange,
    });
    const { calculatedTasks, skippedTasks, unresolvedEstimate, defaultEstimateReason } = estimation;
    const reported = {
      ...(fieldMapping?.unitLabel ? { estimateUnit: fieldMapping.unitLabel } : {}),
      ...withStoryEstimate(estimation.storyEstimate),
    };

    logger.info(
      `Generated ${calculatedTasks.length} tasks, skipped ${skippedTasks.length} conditional tasks`,
    );

    if (unresolvedEstimate?.action === "skip") {
      const skipReason = `${unresolvedEstimate.reason}; Story skipped (ifParentHasNoEstimation: skip)`;
      warnings.push(`${story.id}: ${skipReason}`);
      return {
        story,
        tasksCalculated: [],
        tasksCreated: [],
        tasksSkipped: [],
        success: true,
        unresolvedEstimate,
        ...reported,
        skipReason,
      };
    }
    if (unresolvedEstimate?.action === "blank") {
      warnings.push(`${story.id}: ${unresolvedEstimate.reason}; Task Estimates left blank`);
    }
    if (defaultEstimateReason) {
      warnings.push(`${story.id}: ${defaultEstimateReason}; used defaultParentEstimation`);
    }

    for (const skipped of skippedTasks) {
      logger.debug(`  Skipped: "${skipped.templateTask.title}" - ${skipped.reason}`);
    }
    for (const warning of estimation.warnings) {
      logger.warn(warning);
      warnings.push(`${story.id}: ${warning}`);
    }

    logger.debug("Estimation summary:", estimation.summary);

    let tasksCreated: WorkItem[] = [];
    let stoppedEarly = false;

    if (options.dryRun) {
      logger.info(`DRY RUN: Would create ${calculatedTasks.length} tasks`);
    } else {
      logger.info(`Creating ${calculatedTasks.length} tasks...`);
      tasksCreated = await this.taskMaterializer.materialize(
        story.id,
        calculatedTasks,
        orderedTasks,
        {
          dependencyConcurrency: options.dependencyConcurrency,
          signal: options.signal,
          onTaskCreated: options.onTaskCreated,
        },
      );
      logger.info(`Created ${tasksCreated.length} tasks`);
      stoppedEarly = options.signal?.aborted === true && tasksCreated.length < calculatedTasks.length;
      if (stoppedEarly) {
        const warning = `${story.id}: the run stopped after ${tasksCreated.length} of ${calculatedTasks.length} Tasks were created`;
        logger.warn(warning);
        warnings.push(warning);
      }
    }

    return {
      story,
      tasksCalculated: calculatedTasks,
      tasksCreated,
      tasksSkipped: skippedTasks,
      success: true,
      ...(stoppedEarly ? { stoppedEarly } : {}),
      ...(unresolvedEstimate ? { unresolvedEstimate } : {}),
      ...reported,
      estimationSummary: estimation.summary,
    };
  }
}

function withStoryEstimate(estimate: StoryEstimate | undefined): { storyEstimate?: StoryEstimate } {
  return estimate === undefined ? {} : { storyEstimate: estimate };
}
