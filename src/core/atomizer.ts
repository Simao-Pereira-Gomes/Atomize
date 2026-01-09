import { logger } from "@config/logger";
import type { IPlatformAdapter } from "@platforms/interfaces/platform.interface";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { TaskTemplate } from "@templates/schema";
import {
	type CalculatedTask,
	EstimationCalculator,
} from "./estimation-calculator";
import { FilterEngine } from "./filter-engine";

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
}

/**
 * Result for a single story
 */
export interface StoryAtomizationResult {
	story: WorkItem;
	tasksCalculated: CalculatedTask[];
	tasksCreated: WorkItem[];
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
	private estimationCalculator: EstimationCalculator;

	constructor(private platform: IPlatformAdapter) {
		this.filterEngine = new FilterEngine();
		this.estimationCalculator = new EstimationCalculator();
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

		const platformFilter = this.filterEngine.convertFilter(template.filter);

		const filterValidation = this.filterEngine.validateFilter(template.filter);
		if (!filterValidation.valid) {
			throw new Error(`Invalid filter: ${filterValidation.errors.join(", ")}`);
		}

		// Query user stories
		logger.info("Querying user stories...");
		const stories = await this.platform.queryWorkItems(platformFilter);
		const connectUserEmail = await this.platform.getConnectUserEmail();
		logger.info(`Found ${stories.length} stories`);

		if (stories.length === 0) {
			logger.warn("No stories found matching filter criteria");
		}

		const results: StoryAtomizationResult[] = [];
		const errors: Array<{ storyId: string; error: string }> = [];
		const warnings: string[] = [];

		for (const story of stories) {
			try {
				logger.info(`\nProcessing: ${story.id} - ${story.title}`);

				// Calculate tasks
				const calculatedTasks = this.estimationCalculator.calculateTasks(
					story,
					connectUserEmail,
					template.tasks,
					template.estimation,
				);

				logger.info(`Generated ${calculatedTasks.length} tasks`);

				const validation = this.estimationCalculator.validateEstimation(
					story,
					calculatedTasks,
				);

				if (!validation.valid) {
					validation.warnings.forEach((warning) => {
						logger.warn(`${warning}`);
						warnings.push(`${story.id}: ${warning}`);
					});
				}

				const estimationSummary =
					this.estimationCalculator.getEstimationSummary(
						story,
						calculatedTasks,
					);

				logger.debug("Estimation summary:", estimationSummary);

				let tasksCreated: WorkItem[] = [];

				if (options.dryRun) {
					logger.info(`DRY RUN: Would create ${calculatedTasks.length} tasks`);
				} else {
					logger.info(`Creating ${calculatedTasks.length} tasks...`);

					tasksCreated = await this.platform.createTasksBulk(
						story.id,
						calculatedTasks,
					);

					logger.info(`Created ${tasksCreated.length} tasks`);
				}

				results.push({
					story,
					tasksCalculated: calculatedTasks,
					tasksCreated,
					success: true,
					estimationSummary,
				});
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);

				logger.error(`Error processing story: ${errorMessage}`);

				errors.push({
					storyId: story.id,
					error: errorMessage,
				});

				results.push({
					story,
					tasksCalculated: [],
					tasksCreated: [],
					success: false,
					error: errorMessage,
				});

				if (!options.continueOnError) {
					logger.error("Stopping on first error (continueOnError=false)");
					break;
				}
			}
		}

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

		const executionTime = Date.now() - startTime;

		const report: AtomizationReport = {
			templateName: template.name,
			storiesProcessed: stories.length,
			storiesSuccess,
			storiesFailed,
			tasksCalculated,
			tasksCreated,
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
		const platformFilter = this.filterEngine.convertFilter(template.filter);
		const stories = await this.platform.queryWorkItems(platformFilter);
		return stories.length;
	}
}
