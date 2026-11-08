import { logger } from "../logger";
import type { FilterCriteria } from "../platforms/interfaces/filter.interface";
import type { GenerationPlatform } from "../platforms/interfaces/platform-capabilities";
import type { StoryEstimate, WorkItem } from "../platforms/interfaces/work-item.interface";
import type {
  TaskTemplate,
  TaskDefinition as TemplateTaskDefinition,
} from "../templates/schema";
import { runWithConcurrency } from "../utils/concurrency";
import { GenerationTimeoutError, getErrorMessage } from "../utils/errors";
import { DependencyResolver } from "./dependency-resolver.js";
import type { CalculatedTask } from "./estimation-calculator";
import { FilterEngine } from "./filter-engine";
import { StoryProcessor } from "./story-processor";

/**
 * Progress event types
 */
export type ProgressEventType =
  | "query_start"
  | "query_complete"
  | "story_start"
  | "story_complete"
  | "story_error"
  | "task_created";

/**
 * Progress event data
 */
export interface ProgressEvent {
  type: ProgressEventType;
  /** Current story index (0-based) */
  storyIndex?: number;
  /** Total number of stories */
  totalStories?: number;
  /** Number of stories completed so far */
  completedStories?: number;
  /** Current story being processed */
  story?: WorkItem;
  /** Number of tasks created so far */
  tasksCreated?: number;
  /** Error message if type is story_error */
  error?: string;
  /** The task that was just created (type: task_created) */
  task?: WorkItem;
}

/**
 * Progress callback function
 */
export type ProgressCallback = (event: ProgressEvent) => void;

/**
 * Atomization options
 */
export interface AtomizationOptions {
  /** Dry run mode - don't actually create tasks */
  dryRun?: boolean;

  /** Project name override */
  project?: string;

  /** Stop on first error or continue */
  continueOnError?: boolean;

  /** Maximum concurrent stories to process (default: 3) */
  storyConcurrency?: number;

  /** Maximum concurrent dependency links to create (default: 5) */
  dependencyConcurrency?: number;

  /** Cap the number of work items processed (useful for testing) */
  limit?: number;

  /** Progress callback for reporting progress */
  onProgress?: ProgressCallback;

  /** Force normalisation of task estimations to 100% even when total exceeds 100% */
  forceNormalize?: boolean;

  /** Fetch these specific work item IDs directly, bypassing the template filter (excludeIfHasTasks still applies) */
  storyIds?: string[];

  /** Batch-level cancellation: checked between story batches and before each story starts. In-flight batches still complete — see ADR-0057. */
  signal?: AbortSignal;

  /**
   * Deadline for the whole run. When it passes, the run's signal is aborted (so no new Story or
   * Task work starts) and `atomize` rejects with a GenerationTimeoutError. No deadline when omitted.
   */
  timeoutMs?: number;
}

/** What every Story in one run is processed with. */
interface StoryRun {
  orderedTasks: TemplateTaskDefinition[];
  template: TaskTemplate;
  connectUserEmail: string;
  options: AtomizationOptions;
  warnings: string[];
}

/** Which Stories a run covers: specific Story IDs, or the Template's filter. */
export type StoryScopeOptions = Pick<AtomizationOptions, "storyIds" | "limit">;

/** The deadline surfaces use for an interactive Generation Run. */
export const DEFAULT_GENERATION_TIMEOUT_MS = 5 * 60 * 1_000;

/**
 * Result for a single story
 */
export interface StoryAtomizationResult {
  story: WorkItem;
  tasksCalculated: CalculatedTask[];
  tasksCreated: WorkItem[];
  tasksSkipped?: Array<{
    templateTask: TemplateTaskDefinition;
    reason: string;
  }>;
  success: boolean;
  error?: string;
  /** Present when the Story was skipped because its Story Estimate could not be resolved. */
  skipReason?: string;
  /** Why the Story Estimate could not be resolved, and whether Task Estimates were left blank or the Story skipped. */
  unresolvedEstimate?: { action: "blank" | "skip"; reason: string };
  /** Unit of the Task Estimates when they go to the platform's default fields (e.g. "hours"); absent when the unit is unknown. */
  estimateUnit?: string;
  /** The raw Story Estimate as read through the effective source (e.g. "L" from an overridden size field); absent when the Story has none. */
  storyEstimate?: StoryEstimate;
  estimationSummary?: {
    storyEstimation: number;
    totalTaskEstimation: number;
    difference: number;
    percentageUsed: number;
  };
}

/**
 * Overall atomization report
 */
export interface AtomizationReport {
  /** Template used */
  templateName: string;

  /** Number of stories processed */
  storiesProcessed: number;

  /** Number of stories successfully atomized */
  storiesSuccess: number;

  /** Number of stories that failed */
  storiesFailed: number;

  /** Total tasks calculated */
  tasksCalculated: number;

  /** Total tasks created */
  tasksCreated: number;

  /** Total tasks skipped (conditional tasks not met) */
  tasksSkipped: number;

  /** Results for each story */
  results: StoryAtomizationResult[];

  /** Errors encountered */
  errors: Array<{ storyId: string; error: string }>;

  /** Warnings */
  warnings: string[];

  /** Execution time in ms */
  executionTime: number;

  /** Dry run mode */
  dryRun: boolean;
}

/**
 * Atomizer
 * Main orchestrator that generates tasks from user stories based on templates
 */
export class Atomizer {
  private readonly filterEngine = new FilterEngine();
  private readonly dependencyResolver = new DependencyResolver();
  private readonly storyProcessor: StoryProcessor;

  constructor(private readonly platform: GenerationPlatform) {
    this.storyProcessor = new StoryProcessor(platform);
  }

  /**
   * Atomize user stories into tasks
   */
  async atomize(
    template: TaskTemplate,
    options: AtomizationOptions = {},
  ): Promise<AtomizationReport> {
    const { timeoutMs } = options;
    if (timeoutMs === undefined) return await this.run(template, options);

    const deadline = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        deadline.abort();
        reject(new GenerationTimeoutError(timeoutMs));
      }, timeoutMs);
    });
    const run = this.run(template, { ...options, signal });
    // A run still winding down after the deadline settles later; its outcome is no longer reported.
    run.catch(() => undefined);
    try {
      return await Promise.race([run, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async run(
    template: TaskTemplate,
    options: AtomizationOptions,
  ): Promise<AtomizationReport> {
    const startTime = Date.now();

    logger.info("Starting atomization process...");
    logger.info(`Template: ${template.name}`);
    logger.info(`Dry run: ${options.dryRun ? "Yes" : "No"}`);

    const connectUserEmail = await this.platform.getConnectUserEmail();
    const platformFilter = this.storyQuery(template, options, connectUserEmail);

    const onProgress = options.onProgress;

    // Query user stories
    logger.info("Querying user stories...");
    onProgress?.({ type: "query_start" });
    const stories = await this.platform.queryWorkItems(platformFilter);
    logger.info(`Found ${stories.length} stories`);
    onProgress?.({ type: "query_complete", totalStories: stories.length });

    if (stories.length === 0) {
      logger.warn("No stories found matching filter criteria");
    }

    const warnings: string[] = [];

    // Resolve task dependencies once (same for all stories)
    const orderedTasks = this.dependencyResolver.resolveDependencies(
      template.tasks,
    );
    logger.debug(`Resolved ${orderedTasks.length} tasks in dependency order`);

    // Process stories in parallel batches
    const storyConcurrency = options.storyConcurrency ?? 3;
    logger.info(
      `Processing ${stories.length} stories (concurrency: ${storyConcurrency})`,
    );

    const { results, errors } = await this.processStories(
      stories,
      { orderedTasks, template, connectUserEmail, options, warnings },
      storyConcurrency,
    );

    const storiesSuccess = results.filter((r) => r.success).length;
    const storiesFailed = results.filter((r) => !r.success).length;
    const tasksCalculated = results.reduce(
      (sum, r) => sum + r.tasksCalculated.length,
      0,
    );
    const tasksCreated = results.reduce(
      (sum, r) => sum + r.tasksCreated.length,
      0,
    );
    const tasksSkipped = results.reduce(
      (sum, r) => sum + (r.tasksSkipped?.length || 0),
      0,
    );

    const executionTime = Date.now() - startTime;

    const report: AtomizationReport = {
      templateName: template.name,
      storiesProcessed: stories.length,
      storiesSuccess,
      storiesFailed,
      tasksCalculated,
      tasksCreated,
      tasksSkipped,
      results,
      errors,
      warnings,
      executionTime,
      dryRun: options.dryRun || false,
    };

    logger.info(`\n${"=".repeat(60)}`);
    logger.info("ATOMIZATION COMPLETE");
    logger.info("=".repeat(60));
    logger.info(`Template:          ${report.templateName}`);
    logger.info(`Stories processed: ${report.storiesProcessed}`);
    logger.info(`Stories success:   ${report.storiesSuccess}`);
    logger.info(`Stories failed:    ${report.storiesFailed}`);
    logger.info(`Tasks calculated:  ${report.tasksCalculated}`);
    logger.info(`Tasks created:     ${report.tasksCreated}`);
    logger.info(`Tasks skipped:     ${report.tasksSkipped}`);
    logger.info(`Execution time:    ${report.executionTime}ms`);
    logger.info(`Mode:              ${report.dryRun ? "DRY RUN" : "LIVE"}`);
    logger.info("=".repeat(60));

    if (errors.length > 0) {
      logger.error(`\n${errors.length} error(s) encountered:`);
      errors.forEach((err) => {
        logger.error(`  • ${err.storyId}: ${err.error}`);
      });
    }

    if (warnings.length > 0) {
      logger.warn(`\n${warnings.length} warning(s):`);
      warnings.forEach((warn) => {
        logger.warn(`  • ${warn}`);
      });
    }

    return report;
  }

  /**
   * Processes Stories through a concurrency pool: the next Story starts as soon as a slot frees
   * up. Stops starting Stories on the first failure (unless continueOnError) or once the signal is
   * aborted; Stories already started still finish.
   */
  private async processStories(
    stories: WorkItem[],
    run: StoryRun,
    concurrency: number,
  ): Promise<{ results: StoryAtomizationResult[]; errors: Array<{ storyId: string; error: string }> }> {
    const results: StoryAtomizationResult[] = new Array(stories.length);
    const errors: Array<{ storyId: string; error: string }> = [];
    let stopProcessing = false;
    let completedStories = 0;
    let totalTasksCreated = 0;
    const onProgress = run.options.onProgress;
    const signal = run.options.signal;
    const isCancelled = () => stopProcessing || signal?.aborted === true;

    await runWithConcurrency(
      stories,
      concurrency,
      async (story, storyIndex) => {
        onProgress?.({ type: "story_start", storyIndex, totalStories: stories.length, story });

        const onTaskCreated = onProgress
          ? (task: WorkItem) => {
              totalTasksCreated++;
              onProgress({
                type: "task_created",
                task,
                story,
                storyIndex,
                totalStories: stories.length,
                completedStories,
                tasksCreated: totalTasksCreated,
              });
            }
          : undefined;

        try {
          const result = await this.storyProcessor.process(
            story,
            run.orderedTasks,
            run.template,
            run.connectUserEmail,
            { ...run.options, onTaskCreated },
            run.warnings,
          );
          results[storyIndex] = result;
          completedStories++;

          onProgress?.({
            type: "story_complete",
            storyIndex,
            totalStories: stories.length,
            completedStories,
            story,
            tasksCreated: totalTasksCreated,
          });
        } catch (error) {
          const failedResult = this.buildFailedResult(story, error);
          errors.push({ storyId: story.id, error: failedResult.error ?? "" });
          results[storyIndex] = failedResult;

          completedStories++;
          onProgress?.({
            type: "story_error",
            storyIndex,
            totalStories: stories.length,
            completedStories,
            story,
            error: failedResult.error,
          });

          if (!run.options.continueOnError) {
            logger.error("Stopping on first error (continueOnError=false)");
            stopProcessing = true;
          }
        }
      },
      { shouldStop: isCancelled },
    );

    return {
      results: results.filter((r): r is StoryAtomizationResult => r !== undefined),
      errors,
    };
  }

  private buildFailedResult(
    story: WorkItem,
    error: unknown,
  ): StoryAtomizationResult {
    const errorMessage = getErrorMessage(error);
    logger.error(`Error processing story ${story.id}: ${errorMessage}`);

    return {
      story,
      tasksCalculated: [],
      tasksCreated: [],
      success: false,
      error: errorMessage,
    };
  }

  /**
   * The Stories a run with these options would process: the given Story IDs, or the Template's
   * filter (validated, and capped by `limit`). The same step `atomize` starts with.
   */
  async queryStories(
    template: TaskTemplate,
    options: StoryScopeOptions = {},
  ): Promise<WorkItem[]> {
    const connectUserEmail = await this.platform.getConnectUserEmail();
    return await this.platform.queryWorkItems(this.storyQuery(template, options, connectUserEmail));
  }

  private storyQuery(
    template: TaskTemplate,
    options: StoryScopeOptions,
    connectUserEmail: string,
  ): FilterCriteria {
    if (options.storyIds && options.storyIds.length > 0) {
      logger.info(`Fetching ${options.storyIds.length} specific work item(s) by ID`);
      return {
        workItemIds: options.storyIds,
        excludeIfHasTasks: template.filter.excludeIfHasTasks,
      };
    }

    const filterValidation = this.filterEngine.validateFilter(template.filter);
    if (!filterValidation.valid) {
      throw new Error(`Invalid filter: ${filterValidation.errors.join(", ")}`);
    }
    const platformFilter = this.filterEngine.convertFilter(template.filter, connectUserEmail);
    if (options.limit !== undefined) platformFilter.limit = options.limit;
    return platformFilter;
  }
}
