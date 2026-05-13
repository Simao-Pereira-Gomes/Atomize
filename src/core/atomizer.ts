import { logger } from "@config/logger";
import type { FilterCriteria } from "@platforms/interfaces/filter.interface";
import type { GenerationPlatform } from "@platforms/interfaces/platform-capabilities";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type {
  TaskTemplate,
  TaskDefinition as TemplateTaskDefinition,
} from "@templates/schema";
import { DependencyResolver } from "./dependency-resolver.js";
import type { CalculatedTask } from "./estimation-calculator";
import { FilterEngine } from "./filter-engine";
import { StoryBatchProcessor } from "./story-batch-processor";
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
  | "task_created"
  | "dependency_created"
  | "complete";

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
  /** Number of dependencies created so far */
  dependenciesCreated?: number;
  /** Error message if type is story_error */
  error?: string;
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
}

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
  private filterEngine: FilterEngine;
  private dependencyResolver: DependencyResolver;
  private storyProcessor: StoryProcessor;
  private storyBatchProcessor: StoryBatchProcessor;

  constructor(
    private platform: GenerationPlatform,
    filterEngine = new FilterEngine(),
    dependencyResolver = new DependencyResolver(),
    storyProcessor = new StoryProcessor(platform),
    storyBatchProcessor = new StoryBatchProcessor(),
  ) {
    this.filterEngine = filterEngine;
    this.dependencyResolver = dependencyResolver;
    this.storyProcessor = storyProcessor;
    this.storyBatchProcessor = storyBatchProcessor;
  }

  /**
   * Atomize user stories into tasks
   */
  async atomize(
    template: TaskTemplate,
    options: AtomizationOptions = {},
  ): Promise<AtomizationReport> {
    const startTime = Date.now();

    logger.info("Starting atomization process...");
    logger.info(`Template: ${template.name}`);
    logger.info(`Dry run: ${options.dryRun ? "Yes" : "No"}`);

    const connectUserEmail = await this.platform.getConnectUserEmail();

    let platformFilter: FilterCriteria;
    if (options.storyIds && options.storyIds.length > 0) {
      logger.info(`Fetching ${options.storyIds.length} specific work item(s) by ID`);
      platformFilter = {
        workItemIds: options.storyIds,
        excludeIfHasTasks: template.filter.excludeIfHasTasks,
      };
    } else {
      platformFilter = this.filterEngine.convertFilter(
        template.filter,
        connectUserEmail,
      );
      if (options.limit !== undefined) platformFilter.limit = options.limit;

      const filterValidation = this.filterEngine.validateFilter(template.filter);
      if (!filterValidation.valid) {
        throw new Error(`Invalid filter: ${filterValidation.errors.join(", ")}`);
      }
    }

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

    const { results, errors } = await this.storyBatchProcessor.process({
      stories,
      orderedTasks,
      template,
      connectUserEmail,
      options,
      warnings,
      concurrency: storyConcurrency,
      storyProcessor: this.storyProcessor,
    });

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
   * Get a summary of what would be generated (dry run)
   */
  async preview(template: TaskTemplate): Promise<AtomizationReport> {
    return this.atomize(template, { dryRun: true });
  }

  /**
   * Count how many stories match the filter
   */
  async countMatchingStories(template: TaskTemplate): Promise<number> {
    const connectUserEmail = await this.platform.getConnectUserEmail();
    const platformFilter = this.filterEngine.convertFilter(
      template.filter,
      connectUserEmail,
    );
    const stories = await this.platform.queryWorkItems(platformFilter);
    return stories.length;
  }
}
