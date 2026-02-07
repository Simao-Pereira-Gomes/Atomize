import { logger } from "@config/logger";
import type { IPlatformAdapter } from "@platforms/interfaces/platform.interface";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { TaskDefinition, TaskTemplate } from "@templates/schema";
import { normalizeEstimationPercentages } from "@utils/estimation-normalizer";
import { TemplateGenerationError } from "@/utils/errors";
import { ConfidenceScorer } from "./confidence-scorer";
import { OutlierDetector } from "./outlier-detector";
import { PatternDetector } from "./pattern-detector";
import type {
  LearnOptions,
  MergedTask,
  MultiStoryLearningResult,
  Outlier,
  PatternDetectionResult,
  SkippedStory,
  StoryAnalysis,
  TemplateSuggestion,
  TemplateVariation,
} from "./story-learner.types";
import { TaskMerger } from "./task-merger";

/**
 * Story Learner
 * Analyzes existing stories with tasks to generate template patterns.
 * Supports learning from single or multiple stories with pattern detection,
 * confidence scoring, and outlier detection.
 */
export class StoryLearner {
  constructor(private platform: IPlatformAdapter) {}

  /**
   * Learn template from an existing story (backward-compatible).
   * Throws if story not found or has no tasks.
   */
  async learnFromStory(
    storyId: string,
    normalizePercentages: boolean
  ): Promise<TaskTemplate> {
    logger.info(`Learning template from story: ${storyId}`);
    const story = await this.platform.getWorkItem?.(storyId);
    if (!story) {
      throw new TemplateGenerationError(`Story ${storyId} not found`);
    }

    const tasks = await this.platform.getChildren?.(storyId);
    if (!tasks || tasks.length === 0) {
      throw new TemplateGenerationError(
        `Story ${storyId} has no child tasks to learn from`
      );
    }

    logger.info(`Found ${tasks.length} tasks to analyze`);

    const template = this.generateTemplateFromTasks(
      story,
      tasks,
      normalizePercentages
    );

    logger.info("Template learned successfully");
    return template;
  }

  /**
   * Learn template from multiple stories with pattern detection,
   * confidence scoring, and outlier detection.
   */
  async learnFromStories(
    storyIds: string[],
    options: LearnOptions
  ): Promise<MultiStoryLearningResult> {
    logger.info(
      `Learning template from ${storyIds.length} stories: ${storyIds.join(", ")}`
    );

    if (storyIds.length === 0) {
      throw new TemplateGenerationError("No story IDs provided");
    }

    // 1. Analyze each story in parallel
    const results = await Promise.allSettled(
      storyIds.map((id) => this.analyzeStory(id, options))
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
        "None of the provided stories had analyzable tasks"
      );
    }

    // 2. Detect patterns
    const patternDetector = new PatternDetector();
    const patterns = patternDetector.detect(analyses);

    // 3. Merge tasks
    const taskMerger = new TaskMerger();
    const mergedTasks = taskMerger.merge(analyses, patterns);

    // 4. Build merged template
    const mergedTemplate = this.buildMergedTemplate(
      analyses,
      mergedTasks,
      options
    );

    // 5. Score confidence
    const confidenceScorer = new ConfidenceScorer();
    const confidence = confidenceScorer.score(analyses, patterns, mergedTasks);

    // 6. Detect outliers
    const outlierDetector = new OutlierDetector();
    const outliers = outlierDetector.detect(analyses, patterns);

    // 7. Generate suggestions
    const suggestions = this.generateSuggestions(
      analyses,
      patterns,
      confidence,
      outliers
    );

    // 8. Generate variations
    const variations = this.generateVariations(
      analyses,
      patterns,
      mergedTasks,
      options
    );

    logger.info(
      `Multi-story learning complete: ${analyses.length} analyzed, ${skipped.length} skipped, confidence: ${confidence.level} (${confidence.overall}%)`
    );

    return {
      analyses,
      skipped,
      mergedTemplate,
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
    options: LearnOptions
  ): Promise<StoryAnalysis> {
    const story = await this.platform.getWorkItem?.(storyId);
    if (!story) {
      throw new TemplateGenerationError(`Story ${storyId} not found`);
    }

    const tasks = (await this.platform.getChildren?.(storyId)) ?? [];
    const warnings: string[] = [];

    if (tasks.length === 0) {
      warnings.push(`Story ${storyId} has no child tasks`);
      return {
        story,
        tasks: [],
        template: this.buildEmptyTemplate(story),
        warnings,
      };
    }

    if (tasks.length === 1) {
      warnings.push(
        `Story ${storyId} has only 1 task, which may not be representative`
      );
    }

    // Detect estimation style if auto
    const style = options.estimationStyle ?? "auto";
    if (style === "auto") {
      const detected = this.detectEstimationStyle(tasks);
      if (detected !== "percentage") {
        warnings.push(
          `Detected estimation style "${detected}" for story ${storyId}`
        );
      }
    }

    const template = this.generateTemplateFromTasks(
      story,
      tasks,
      options.normalizePercentages
    );

    return { story, tasks, template, warnings };
  }

  /**
   * Build a merged template from multiple story analyses.
   */
  private buildMergedTemplate(
    analyses: StoryAnalysis[],
    mergedTasks: MergedTask[],
    options: LearnOptions
  ): TaskTemplate {
    const taskDefinitions = mergedTasks.map((mt) => mt.task);

    if (options.normalizePercentages) {
      normalizeEstimationPercentages(taskDefinitions, {
        enableLogging: false,
      });
    }

    // Collect work item types across stories
    const workItemTypes = [
      ...new Set(analyses.map((a) => a.story.type)),
    ];
    const allTags = [
      ...new Set(analyses.flatMap((a) => a.story.tags ?? [])),
    ];

    // Average parent estimation
    const estimations = analyses
      .map((a) => a.story.estimation ?? 0)
      .filter((e) => e > 0);
    const avgEstimation =
      estimations.length > 0
        ? Math.round(
            estimations.reduce((a, b) => a + b, 0) / estimations.length
          )
        : 0;

    const storyIds = analyses.map((a) => a.story.id).join(", ");

    return {
      version: "1.0",
      name: `Template learned from ${analyses.length} stories`,
      description: `Auto-generated template based on stories: ${storyIds}`,
      author: "Atomize",
      created: new Date().toISOString(),
      filter: {
        workItemTypes,
        states: ["New", "Active", "Approved"],
        tags: allTags.length > 0 ? { include: allTags } : undefined,
      },
      tasks: taskDefinitions,
      estimation: {
        strategy: "percentage",
        rounding: "none",
        minimumTaskPoints: 0,
        defaultParentEstimation: avgEstimation,
      },
    };
  }

  /**
   * Build an empty template for stories with no tasks.
   */
  private buildEmptyTemplate(story: WorkItem): TaskTemplate {
    return {
      version: "1.0",
      name: `Template from ${story.id} (no tasks)`,
      description: `Story "${story.title}" had no child tasks`,
      author: "Atomize",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: [story.type],
        states: ["New", "Active", "Approved"],
      },
      tasks: [],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };
  }

  /**
   * Generate actionable suggestions based on analysis results.
   */
  private generateSuggestions(
    analyses: StoryAnalysis[],
    patterns: PatternDetectionResult,
    confidence: { level: string },
    outliers: Outlier[]
  ): TemplateSuggestion[] {
    const suggestions: TemplateSuggestion[] = [];

    // Suggest adding more stories if confidence is low
    if (confidence.level === "low" && analyses.length < 3) {
      suggestions.push({
        type: "add-task",
        message: `Confidence is low. Consider adding more stories (currently ${analyses.length}) for better pattern detection.`,
        severity: "important",
      });
    }

    // Suggest checking estimation if inconsistent
    if (!patterns.estimationPattern.isConsistent) {
      suggestions.push({
        type: "adjust-estimation",
        message: `Mixed estimation styles detected (${patterns.estimationPattern.detectedStyle}). Consider standardizing estimation across stories.`,
        severity: "warning",
      });
    }

    // Suggest removing outlier tasks
    for (const outlier of outliers) {
      if (outlier.type === "extra-task") {
        suggestions.push({
          type: "remove-task",
          message: outlier.message,
          severity: "info",
        });
      }
    }

    // Suggest naming improvements for low-frequency tasks
    for (const task of patterns.commonTasks) {
      if (task.titleVariants.length > 2 && task.frequencyRatio >= 0.5) {
        suggestions.push({
          type: "improve-naming",
          message: `Task "${task.canonicalTitle}" has ${task.titleVariants.length} naming variants across stories. Consider standardizing the name.`,
          severity: "info",
        });
      }
    }

    // Suggest dependency if common ordering detected
    if (
      patterns.commonTasks.some(
        (t) => t.activity === "Design" && t.frequencyRatio >= 0.8
      ) &&
      patterns.commonTasks.some(
        (t) => t.activity === "Development" && t.frequencyRatio >= 0.8
      )
    ) {
      suggestions.push({
        type: "add-dependency",
        message:
          'Design and Development tasks are consistently present. Consider adding a dependency from Development to Design.',
        severity: "info",
      });
    }

    return suggestions;
  }

  /**
   * Generate template variations from the analysis.
   * Creates "comprehensive" (all tasks) and "core" (frequent tasks only) variations.
   */
  private generateVariations(
    analyses: StoryAnalysis[],
    patterns: PatternDetectionResult,
    mergedTasks: MergedTask[],
    options: LearnOptions
  ): TemplateVariation[] {
    const confidenceScorer = new ConfidenceScorer();
    const variations: TemplateVariation[] = [];

    // Variation 1: Core tasks only (frequency > 60%)
    const coreTasks = mergedTasks.filter((mt) => {
      const storyCount = new Set(mt.sources.map((s) => s.storyId)).size;
      return storyCount / analyses.length >= 0.6;
    });

    if (coreTasks.length > 0 && coreTasks.length !== mergedTasks.length) {
      const coreTemplate = this.buildMergedTemplate(
        analyses,
        coreTasks,
        options
      );
      coreTemplate.name = "Core Tasks Template";
      coreTemplate.description =
        "Tasks appearing in 60%+ of analyzed stories";

      const coreConfidence = confidenceScorer.score(
        analyses,
        patterns,
        coreTasks
      );

      variations.push({
        name: "Core Tasks",
        description: "Only tasks that appear in most stories (60%+ frequency)",
        template: coreTemplate,
        confidence: coreConfidence,
      });
    }

    // Variation 2: Comprehensive (all tasks)
    if (mergedTasks.length > 0) {
      const fullTemplate = this.buildMergedTemplate(
        analyses,
        mergedTasks,
        options
      );
      fullTemplate.name = "Comprehensive Template";
      fullTemplate.description = "All tasks found across analyzed stories";

      const fullConfidence = confidenceScorer.score(
        analyses,
        patterns,
        mergedTasks
      );

      variations.push({
        name: "Comprehensive",
        description: "All tasks from all analyzed stories",
        template: fullTemplate,
        confidence: fullConfidence,
      });
    }

    return variations;
  }

  /**
   * Generate template from story and its tasks
   */
  private generateTemplateFromTasks(
    story: WorkItem,
    tasks: WorkItem[],
    shouldNormalize: boolean
  ): TaskTemplate {
    const storyEstimation = story.estimation || 0;

    const taskDefinitions: TaskDefinition[] = tasks.map((task, index) => {
      const taskEstimation = task.estimation || 0;
      const estimationPercent =
        storyEstimation > 0
          ? Math.round((taskEstimation / storyEstimation) * 100)
          : 0;

      const title = this.extractTitlePattern(task.title, story.title);

      const id = this.generateTaskId(task.title, index);

      return {
        id,
        title,
        description: task.description,
        estimationPercent,
        activity: this.detectActivity(task.title, task.description),
        tags: task.tags,
        priority: task.priority,
      };
    });

    if (shouldNormalize) {
      this.normalizePercentages(taskDefinitions);
    } else {
      logger.info("Skipping percentage normalization as per configuration");
    }

    const filter = {
      workItemTypes: [story.type],
      states: ["New", "Active", "Approved"],
      tags: story.tags?.length ? { include: story.tags } : undefined,
    };

    const template: TaskTemplate = {
      version: "1.0",
      name: `Template learned from ${story.id}`,
      description: `Auto-generated template based on ${story.type}: ${story.title}`,
      author: "Atomize",
      created: new Date().toISOString(),
      filter,
      tasks: taskDefinitions,

      estimation: {
        strategy: "percentage",
        rounding: "none",
        minimumTaskPoints: 0,
        defaultParentEstimation: storyEstimation,
      },
    };

    return template;
  }

  /**
   * Extract title pattern by finding variables
   */
  extractTitlePattern(taskTitle: string, storyTitle: string): string {
    if (taskTitle.includes(storyTitle)) {
      //biome-ignore lint/suspicious: Simple string replacement for pattern
      return taskTitle.replace(storyTitle, "${story.title}");
    }

    const storyIdPattern = /(?:Story-|#|STORY-)(\d+)/gi;
    //biome-ignore lint/suspicious: Regex replacement for story ID
    const title = taskTitle.replace(storyIdPattern, "${story.id}");

    return title;
  }

  /**
   * Generate a unique task ID from the task title
   * Converts title to a URL-safe slug format
   */
  generateTaskId(title: string, index: number): string {
    const cleaned = title
      .toLowerCase()
      .replace(/^(task|implement|create|build|design|test|fix)\s*:?\s*/i, "")
      .replace(/\${story\.(title|id|description)}/g, "")
      .trim();

    const slug = cleaned
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Ensure we have a valid ID, fallback to index-based
    if (slug.length === 0) {
      return `task-${index + 1}`;
    }

    const maxLength = 30;
    const truncated =
      slug.length > maxLength ? slug.substring(0, maxLength) : slug;

    return truncated;
  }

  /**
   * Detect activity type from task title/description
   */
  detectActivity(title: string, description?: string): string {
    const text = `${title} ${description || ""}`.toLowerCase();

    if (/design|architect|plan|spec/i.test(text)) {
      return "Design";
    }
    if (/test|qa|verify|validation/i.test(text)) {
      return "Testing";
    }
    if (/deploy|release|publish/i.test(text)) {
      return "Deployment";
    }
    if (/document|readme|wiki/i.test(text)) {
      return "Documentation";
    }
    if (/review|code review|pr/i.test(text)) {
      return "Documentation";
    }

    return "Development";
  }

  /**
   * Detect estimation style from raw task estimation values.
   * Returns 'percentage' if values are small decimals summing to ~1,
   * 'points' for Fibonacci-like values, 'hours' otherwise.
   */
  detectEstimationStyle(
    tasks: WorkItem[]
  ): "percentage" | "hours" | "points" | "mixed" {
    const estimations = tasks
      .map((t) => t.estimation ?? 0)
      .filter((e) => e > 0);

    if (estimations.length === 0) return "percentage";

    const sum = estimations.reduce((a, b) => a + b, 0);
    const allSmall = estimations.every((e) => e <= 1);
    const sumNearOne = Math.abs(sum - 1) < 0.15;

    if (allSmall && sumNearOne) return "percentage";

    const fibNumbers = new Set([1, 2, 3, 5, 8, 13, 21, 34]);
    const allFib = estimations.every((e) => fibNumbers.has(e));
    if (allFib) return "points";

    const typicalHours = new Set([0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24]);
    const mostlyHours =
      estimations.filter((e) => typicalHours.has(e)).length /
        estimations.length >=
      0.5;
    if (mostlyHours) return "hours";

    return "mixed";
  }

  /**
   * Normalize percentages to sum to 100
   */
  private normalizePercentages(tasks: TaskDefinition[]): void {
    const total = tasks.reduce(
      (sum, task) => sum + (task.estimationPercent || 0),
      0
    );

    if (total === 0) {
      const percent = Math.floor(100 / tasks.length);
      const remainder = 100 - percent * tasks.length;

      tasks.forEach((task, index) => {
        task.estimationPercent = index === 0 ? percent + remainder : percent;
      });
    } else if (total !== 100) {
      const scale = 100 / total;
      let sum = 0;

      tasks.forEach((task, index) => {
        if (index === tasks.length - 1) {
          task.estimationPercent = 100 - sum;
        } else {
          const scaled = Math.round((task.estimationPercent || 0) * scale);
          task.estimationPercent = scaled;
          sum += scaled;
        }
      });
    }
  }
}
