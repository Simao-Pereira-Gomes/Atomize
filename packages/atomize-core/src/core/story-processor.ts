import { logger } from "../logger";
import type { EstimationDefaults } from "../platforms/interfaces/estimation-defaults.interface";
import type { GenerationPlatform } from "../platforms/interfaces/platform-capabilities";
import type { StoryEstimate, WorkItem } from "../platforms/interfaces/work-item.interface";
import type { TaskTemplate, TaskDefinition as TemplateTaskDefinition } from "../templates/schema";
import type { AtomizationOptions, StoryAtomizationResult } from "./atomizer";
import { type CalculatedTask, EstimationCalculator } from "./estimation-calculator";
import { type EstimationFieldMapping, resolveEstimationFieldMapping } from "./estimation-field-mapping";
import { type ExistingTaskMatch, matchExistingTasks } from "./resume-matcher";
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

  /**
   * How a Story already skipped by excludeIfHasTasks compares with its plan, or undefined when it
   * doesn't look partly created: none of its child Tasks match a planned Task, or none is missing.
   */
  partlyCreated(
    story: WorkItem,
    orderedTasks: TemplateTaskDefinition[],
    template: TaskTemplate,
    connectUserEmail: string,
    forceNormalize?: boolean,
  ): { tasksExisting: number; tasksPlanned: number } | undefined {
    const planned = this.plan(story, orderedTasks, template, connectUserEmail, forceNormalize).calculatedTasks;
    const match = matchExistingTasks(planned, story.children ?? []);
    const tasksExisting = planned.length - match.missing.length;
    if (tasksExisting === 0 || match.missing.length === 0) return undefined;
    return { tasksExisting, tasksPlanned: planned.length };
  }

  private fieldMapping(template: TaskTemplate): EstimationFieldMapping | undefined {
    return this.estimationDefaults
      ? resolveEstimationFieldMapping(this.estimationDefaults, {
          source: template.estimation?.source,
          taskType: template.taskType,
          targetFields: template.estimation?.targetFields,
        })
      : undefined;
  }

  private plan(
    story: WorkItem,
    orderedTasks: TemplateTaskDefinition[],
    template: TaskTemplate,
    connectUserEmail: string,
    forceNormalize?: boolean,
  ) {
    return this.estimationCalculator.estimate(story, {
      tasks: orderedTasks,
      connectUserEmail,
      estimation: template.estimation,
      forceNormalize,
      fieldMapping: this.fieldMapping(template),
      taskEstimationRange: template.validation?.taskEstimationRange,
    });
  }

  async process(
    story: WorkItem,
    orderedTasks: TemplateTaskDefinition[],
    template: TaskTemplate,
    connectUserEmail: string,
    options: Pick<AtomizationOptions, "dryRun" | "forceNormalize" | "dependencyConcurrency" | "signal" | "resume"> & {
      onTaskCreated?: (task: WorkItem) => void;
    },
    warnings: string[],
  ): Promise<StoryAtomizationResult> {
    logger.info(`Processing: ${story.id} - ${story.title}`);

    const fieldMapping = this.fieldMapping(template);
    const estimation = this.plan(story, orderedTasks, template, connectUserEmail, options.forceNormalize);
    const { skippedTasks, unresolvedEstimate, defaultEstimateReason } = estimation;
    const match = options.resume ? matchExistingTasks(estimation.calculatedTasks, story.children ?? []) : undefined;
    const calculatedTasks = match ? match.missing : estimation.calculatedTasks;
    if (match) {
      warnings.push(...unlinkedWarnings(story.id, estimation.calculatedTasks, orderedTasks, match));
      const drift = fieldMapping ? estimateDrift(estimation.calculatedTasks, match, fieldMapping) : undefined;
      if (drift) warnings.push(`${story.id}: ${drift}`);
    }
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

    if (match && calculatedTasks.length === 0) {
      logger.info(`${story.id}: every planned Task already exists; nothing to resume`);
    } else if (options.dryRun) {
      logger.info(`DRY RUN: Would create ${calculatedTasks.length} tasks`);
    } else {
      logger.info(`Creating ${calculatedTasks.length} tasks...`);
      tasksCreated = await this.taskMaterializer.materialize(
        story.id,
        estimation.calculatedTasks,
        orderedTasks,
        {
          dependencyConcurrency: options.dependencyConcurrency,
          signal: options.signal,
          onTaskCreated: options.onTaskCreated,
          ...(match ? { existing: match.existing, unlinkable: match.ambiguous } : {}),
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
      ...(match ? { resume: resumeSummary(estimation.calculatedTasks, match) } : {}),
      ...(stoppedEarly ? { stoppedEarly } : {}),
      ...(unresolvedEstimate ? { unresolvedEstimate } : {}),
      ...reported,
      estimationSummary: estimation.summary,
    };
  }
}

/**
 * Compares the existing Tasks' estimates with what the plan gives the planned Tasks they stand for.
 * Resume doesn't rebalance, so a difference (the Story Estimate or Template changed) is only reported.
 * Only matched Tasks where both sides have an estimate count.
 */
function estimateDrift(planned: CalculatedTask[], match: ExistingTaskMatch, fieldMapping: EstimationFieldMapping): string | undefined {
  let existingTotal = 0;
  let plannedTotal = 0;
  planned.forEach((task, index) => {
    const workItem = match.existing[index];
    const actual = workItem ? taskEstimate(workItem, fieldMapping.taskTarget.fields) : undefined;
    if (actual === undefined || task.estimation === undefined) return;
    existingTotal += actual;
    plannedTotal += task.estimation;
  });
  if (Math.abs(existingTotal - plannedTotal) < 0.005) return undefined;
  const unit = fieldMapping.unitLabel ? ` ${fieldMapping.unitLabel}` : "";
  return `the existing Tasks' estimates total ${round(existingTotal)}${unit}; the plan expects ${round(plannedTotal)}${unit} for them`;
}

function taskEstimate(workItem: WorkItem, fields: readonly string[]): number | undefined {
  for (const field of fields) {
    const value = workItem.customFields?.[field];
    if (typeof value === "number") return value;
  }
  return undefined;
}

const round = (value: number) => Math.round(value * 100) / 100;

function resumeSummary(planned: CalculatedTask[], match: ExistingTaskMatch): NonNullable<StoryAtomizationResult["resume"]> {
  return {
    existing: planned.flatMap((task, index) => {
      const workItem = match.existing[index];
      return workItem ? [{ title: task.title, workItemId: workItem.id }] : [];
    }),
    notInPlan: match.notInPlan.map((child) => ({ title: child.title, workItemId: child.id })),
    complete: match.missing.length === 0,
  };
}

/** A warning for each dependency link resume can't make because the existing side's title is shared. */
function unlinkedWarnings(
  storyId: string,
  planned: CalculatedTask[],
  templateTasks: TemplateTaskDefinition[],
  match: ExistingTaskMatch,
): string[] {
  // dependsOn tasks are never repeated, so a Template task ID names at most one planned Task.
  const indexById = new Map(planned.flatMap((task, index) => (task.templateId ? [[task.templateId, index] as const] : [])));
  return templateTasks.flatMap((templateTask) => {
    const dependent = templateTask.id === undefined ? undefined : indexById.get(templateTask.id);
    if (dependent === undefined) return [];
    const dependentTitle = planned[dependent]?.title as string;
    return (templateTask.dependsOn ?? []).flatMap((depId) => {
      const predecessor = indexById.get(depId);
      if (predecessor === undefined) return [];
      // A link between two existing Tasks is left alone, so there is nothing to warn about.
      if (match.existing[dependent] && match.existing[predecessor]) return [];
      const predecessorTitle = planned[predecessor]?.title as string;
      const shared = match.ambiguous.has(predecessor) ? predecessorTitle : match.ambiguous.has(dependent) ? dependentTitle : undefined;
      if (shared === undefined) return [];
      const count = match.childrenTitled.get(shared) ?? 0;
      return shared === predecessorTitle
        ? [`${storyId}: ${count} child Tasks are titled "${shared}", so "${dependentTitle}" was not linked to it`]
        : [`${storyId}: ${count} child Tasks are titled "${shared}", so it was not linked to "${predecessorTitle}"`];
    });
  });
}

function withStoryEstimate(estimate: StoryEstimate | undefined): { storyEstimate?: StoryEstimate } {
  return estimate === undefined ? {} : { storyEstimate: estimate };
}
