import { logger } from "@config/logger";
import type { StoryLearningPlatform } from "@platforms/interfaces/platform-capabilities";
import type { TaskTemplate } from "@templates/schema";
import { TemplateGenerationError } from "@/utils/errors";
import { LearnedTemplateProductBuilder } from "./learned-template-product";
import { LearningSession } from "./learning-session";
import type {
  MultiStoryLearningResult,
  SkippedStory,
  StoryAnalysis,
} from "./story-learner.types";

/**
 * Story Learner
 * Analyzes existing stories with tasks to generate template patterns.
 * Supports learning from single or multiple stories with pattern detection,
 * confidence scoring, and outlier detection.
 */
export class StoryLearner {
  private readonly productBuilder = new LearnedTemplateProductBuilder();

  constructor(private platform: StoryLearningPlatform) {}

  /**
   * Learn template from an existing story (backward-compatible).
   * Throws if story not found or has no tasks.
   */
  async learnFromStory(
    storyId: string,
  ): Promise<TaskTemplate> {
    logger.info(`Learning template from story: ${storyId}`);
    const story = await this.platform.getWorkItem(storyId);
    if (!story) {
      throw new TemplateGenerationError(`Story ${storyId} not found`);
    }

    const tasks = await this.platform.getChildren(storyId);
    if (!tasks || tasks.length === 0) {
      throw new TemplateGenerationError(
        `Story ${storyId} has no child tasks to learn from`,
      );
    }

    logger.info(`Found ${tasks.length} tasks to analyze`);

    const template = this.productBuilder.buildSingleStoryTemplate(story, tasks);

    logger.info("Template learned successfully");
    return template;
  }

  /**
   * Learn template from multiple stories with pattern detection,
   * confidence scoring, and outlier detection.
   */
  async learnFromStories(
    storyIds: string[],
  ): Promise<MultiStoryLearningResult> {
    logger.info(
      `Learning template from ${storyIds.length} stories: ${storyIds.join(", ")}`,
    );

    if (storyIds.length === 0) {
      throw new TemplateGenerationError("No story IDs provided");
    }
    const results = await Promise.allSettled(
      storyIds.map((id) => this.analyzeStory(id)),
    );

    const analyses: StoryAnalysis[] = [];
    const skipped: SkippedStory[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const storyId = storyIds[i];
      if (!result || !storyId) continue;

      if (result.status === "fulfilled") {
        if (result.value.tasks.length === 0) {
          skipped.push({ storyId, reason: "No child tasks found" });
          logger.warn(`Skipping story ${storyId}: no child tasks`);
        } else {
          analyses.push(result.value);
        }
      } else {
        skipped.push({
          storyId,
          reason: result.reason?.message ?? "Unknown error",
        });
        logger.warn(`Skipping story ${storyId}: ${result.reason?.message}`);
      }
    }

    if (analyses.length === 0) {
      throw new TemplateGenerationError(
        "None of the provided stories had analyzable tasks",
      );
    }
    const learningSession = new LearningSession();
    const {
      patterns,
      mergedTasks,
      confidence,
      outliers,
    } = learningSession.run(analyses);
    const template = this.productBuilder.buildMergedTemplate(
      analyses,
      mergedTasks,
    );
    const suggestions = this.productBuilder.generateSuggestions(
      analyses,
      patterns,
      confidence,
      outliers,
    );
    const variations = this.productBuilder.generateVariations(
      analyses,
      patterns,
      mergedTasks,
    );

    logger.info(
      `Multi-story learning complete: ${analyses.length} analyzed, ${skipped.length} skipped, confidence: ${confidence.level} (${confidence.overall}%)`,
    );

    return {
      analyses,
      skipped,
      template,
      patterns,
      confidence,
      suggestions,
      variations,
      outliers,
    };
  }

  /**
   * Analyze a single story without throwing on missing tasks.
   * Returns a StoryAnalysis with an empty tasks array and a warning instead.
   */
  private async analyzeStory(
    storyId: string,
  ): Promise<StoryAnalysis> {
    const story = await this.platform.getWorkItem(storyId);
    if (!story) {
      throw new TemplateGenerationError(`Story ${storyId} not found`);
    }

    const tasks = await this.platform.getChildren(storyId);
    const warnings: string[] = [];

    if (tasks.length === 0) {
      warnings.push(`Story ${storyId} has no child tasks`);
      return {
        story,
        tasks: [],
        template: this.productBuilder.buildEmptyTemplate(story),
        warnings,
      };
    }

    if (tasks.length === 1) {
      warnings.push(
        `Story ${storyId} has only 1 task, which may not be representative`,
      );
    }


    const template = this.productBuilder.buildSingleStoryTemplate(story, tasks);

    return { story, tasks, template, warnings };
  }

  /**
   * Extract title pattern by finding variables
   */
  extractTitlePattern(taskTitle: string, storyTitle: string): string {
    return this.productBuilder.extractTitlePattern(taskTitle, storyTitle);
  }

  /**
   * Generate a unique task ID from the task title
   * Converts title to a URL-safe slug format
   */
  generateTaskId(title: string, index: number): string {
    return this.productBuilder.generateTaskId(title, index);
  }

  /**
   * Detect activity type from task title/description
   */
  detectActivity(title: string, description?: string): string {
    return this.productBuilder.detectActivity(title, description);
  }


}
