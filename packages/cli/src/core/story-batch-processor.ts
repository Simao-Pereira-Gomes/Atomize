import { logger } from "@config/logger";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type {
  TaskTemplate,
  TaskDefinition as TemplateTaskDefinition,
} from "@templates/schema";
import { getErrorMessage } from "@utils/errors";
import type {
  AtomizationOptions,
  ProgressCallback,
  StoryAtomizationResult,
} from "./atomizer";
import type { StoryProcessor } from "./story-processor";

export interface StoryBatchProcessorInput {
  stories: WorkItem[];
  orderedTasks: TemplateTaskDefinition[];
  template: TaskTemplate;
  connectUserEmail: string;
  options: AtomizationOptions;
  warnings: string[];
  concurrency: number;
  storyProcessor: StoryProcessor;
}

export interface StoryBatchProcessorResult {
  results: StoryAtomizationResult[];
  errors: Array<{ storyId: string; error: string }>;
}

/**
 * Owns generation batching policy for Stories: concurrency windows, progress
 * events, stop-on-error behavior, and failed-story result shaping.
 */
export class StoryBatchProcessor {
  async process(input: StoryBatchProcessorInput): Promise<StoryBatchProcessorResult> {
    const results: StoryAtomizationResult[] = new Array(input.stories.length);
    const errors: Array<{ storyId: string; error: string }> = [];
    let stopProcessing = false;
    let completedStories = 0;
    let totalTasksCreated = 0;
    const onProgress = input.options.onProgress;

    for (let i = 0; i < input.stories.length; i += input.concurrency) {
      if (stopProcessing) break;

      const batch = input.stories.slice(i, i + input.concurrency);
      const batchResults = batch.map(async (story, batchIndex) => {
        const storyIndex = i + batchIndex;

        if (stopProcessing) {
          return null;
        }

        emitStoryStart(onProgress, storyIndex, input.stories.length, story);

        try {
          const result = await input.storyProcessor.process(
            story,
            input.orderedTasks,
            input.template,
            input.connectUserEmail,
            input.options,
            input.warnings,
          );
          results[storyIndex] = result;

          completedStories++;
          totalTasksCreated += result.tasksCreated.length;

          onProgress?.({
            type: "story_complete",
            storyIndex,
            totalStories: input.stories.length,
            completedStories,
            story,
            tasksCreated: totalTasksCreated,
          });

          return result;
        } catch (error) {
          const failedResult = this.buildFailedResult(story, error);
          errors.push({ storyId: story.id, error: failedResult.error ?? "" });
          results[storyIndex] = failedResult;

          completedStories++;
          onProgress?.({
            type: "story_error",
            storyIndex,
            totalStories: input.stories.length,
            completedStories,
            story,
            error: failedResult.error,
          });

          if (!input.options.continueOnError) {
            logger.error("Stopping on first error (continueOnError=false)");
            stopProcessing = true;
          }

          return failedResult;
        }
      });

      await Promise.all(batchResults);
    }

    return {
      results: results.filter(
        (r): r is StoryAtomizationResult => r !== undefined && r !== null,
      ),
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
}

function emitStoryStart(
  onProgress: ProgressCallback | undefined,
  storyIndex: number,
  totalStories: number,
  story: WorkItem,
): void {
  onProgress?.({
    type: "story_start",
    storyIndex,
    totalStories,
    story,
  });
}
