import { logger } from "@config/logger";
import type { IPlatformAdapter } from "@platforms/interfaces/platform.interface";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { TaskDefinition, TaskTemplate } from "@templates/schema";
import { TemplateGenerationError } from "@/utils/errors";

/**
 * Story Learner
 * Analyzes existing stories with tasks to generate template patterns
 */
export class StoryLearner {
  constructor(private platform: IPlatformAdapter) {}

  /**
   * Learn template from an existing story
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
   * Generate template from story and its tasks
   */
  private generateTemplateFromTasks(
    story: WorkItem,
    tasks: WorkItem[],
    normalizePercentages: boolean
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

    if (normalizePercentages) {
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
  private extractTitlePattern(taskTitle: string, storyTitle: string): string {
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
  private generateTaskId(title: string, index: number): string {
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
  private detectActivity(title: string, description?: string): string {
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
