import { normalizeLearnedTaskPercentages } from "../../core/estimation-distribution";
import { numericStoryEstimate } from "../../core/estimation-field-mapping";
import { type EstimationSample, inferEstimation, taskEstimateShares } from "../../core/estimation-inference";
import type { WorkItem } from "../../platforms/interfaces/work-item.interface";
import type { EstimationConfig, TaskDefinition, TaskTemplate } from "../../templates/schema";
import { ConfidenceScorer } from "./confidence-analysis";
import type {
  MergedTask,
  Outlier,
  PatternDetectionResult,
  StoryAnalysis,
  TemplateSuggestion,
  TemplateVariation,
} from "./story-learner.types";

export class LearnedTemplateProductBuilder {
  buildMergedTemplate(
    analyses: StoryAnalysis[],
    mergedTasks: MergedTask[],
    estimationSource?: string,
  ): TaskTemplate {
    const taskDefinitions = mergedTasks.map((mt) => {
      const task = { ...mt.task };
      if (mt.learnedDependsOn && mt.learnedDependsOn.length > 0) {
        task.dependsOn = mt.learnedDependsOn;
      }
      if (mt.learnedCondition) task.condition = mt.learnedCondition;
      if (mt.tagClassification) {
        const suggestedTags = [
          ...mt.tagClassification.coreTags,
          ...mt.tagClassification.optionalTags.slice(0, 2),
        ];
        if (suggestedTags.length > 0) task.tags = suggestedTags;
      }
      return task;
    });

    normalizeLearnedTaskPercentages(taskDefinitions);

    const workItemTypes = [...new Set(analyses.map((a) => a.story.type))];
    const allTags = [...new Set(analyses.flatMap((a) => a.story.tags ?? []))];

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
      estimation: learnedEstimationConfig(
        analyses.map((a) => estimationSample(a.story, a.tasks)),
        estimationSource,
      ),
    };
  }

  buildEmptyTemplate(story: WorkItem): TaskTemplate {
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

  buildSingleStoryTemplate(story: WorkItem, tasks: WorkItem[], estimationSource?: string): TaskTemplate {
    const shares = taskEstimateShares(tasks.map((task) => numericStoryEstimate(task.estimation)));
    const taskDefinitions: TaskDefinition[] = tasks.map((task, index) => {
      const estimationPercent = shares[index] ?? 0;

      return {
        id: this.generateTaskId(task.title, index),
        title: this.extractTitlePattern(task.title, story.title),
        description: task.description,
        estimationPercent,
        activity: this.detectActivity(task.title, task.description),
        tags: task.tags,
        priority: task.priority,
      };
    });

    normalizeLearnedTaskPercentages(taskDefinitions);

    return {
      version: "1.0",
      name: `Template learned from ${story.id}`,
      description: `Auto-generated template based on ${story.type}: ${story.title}`,
      author: "Atomize",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: [story.type],
        states: ["New", "Active", "Approved"],
        tags: story.tags?.length ? { include: story.tags } : undefined,
      },
      tasks: taskDefinitions,
      estimation: learnedEstimationConfig([estimationSample(story, tasks)], estimationSource),
    };
  }

  generateSuggestions(
    analyses: StoryAnalysis[],
    patterns: PatternDetectionResult,
    confidence: { level: string },
    outliers: Outlier[],
  ): TemplateSuggestion[] {
    return [
      ...this.suggestEstimationChecks(analyses),
      ...this.suggestConfidenceImprovements(analyses, confidence),
      ...this.suggestOutlierRemovals(outliers),
      ...this.suggestNamingImprovements(patterns),
      ...this.suggestDependencies(patterns),
      ...this.suggestConditions(patterns),
      ...this.suggestFilterImprovements(patterns),
    ];
  }

  private suggestEstimationChecks(analyses: StoryAnalysis[]): TemplateSuggestion[] {
    const learned = inferEstimation(analyses.map((a) => estimationSample(a.story, a.tasks)));
    const table = learned.conversion?.table;
    if (!table) return [];
    return learned.lowConfidenceValues.map((value) => ({
      type: "adjust-estimation" as const,
      message: `The conversion for "${value}" (${table[value]}) was learned from a single Story; check it before relying on it.`,
      severity: "info" as const,
    }));
  }

  generateVariations(
    analyses: StoryAnalysis[],
    patterns: PatternDetectionResult,
    mergedTasks: MergedTask[],
    estimationSource?: string,
  ): TemplateVariation[] {
    const confidenceScorer = new ConfidenceScorer();
    const variations: TemplateVariation[] = [];
    const coreTasks = mergedTasks.filter((mt) => {
      const storyCount = new Set(mt.sources.map((s) => s.storyId)).size;
      return storyCount / analyses.length >= 0.6;
    });

    if (coreTasks.length > 0 && coreTasks.length !== mergedTasks.length) {
      const coreTemplate = this.buildMergedTemplate(analyses, coreTasks, estimationSource);
      coreTemplate.name = "Core Tasks Template";
      coreTemplate.description = "Tasks appearing in 60%+ of analyzed stories";
      variations.push({
        name: "Core Tasks",
        description: "Only tasks that appear in most stories (60%+ frequency)",
        template: coreTemplate,
        confidence: confidenceScorer.score(analyses, patterns, coreTasks),
      });
    }

    if (mergedTasks.length > 0) {
      const fullTemplate = this.buildMergedTemplate(analyses, mergedTasks, estimationSource);
      fullTemplate.name = "Comprehensive Template";
      fullTemplate.description = "All tasks found across analyzed stories";
      variations.push({
        name: "Comprehensive",
        description: "All tasks from all analyzed stories",
        template: fullTemplate,
        confidence: confidenceScorer.score(analyses, patterns, mergedTasks),
      });
    }

    return variations;
  }

  extractTitlePattern(taskTitle: string, storyTitle: string): string {
    if (taskTitle.includes(storyTitle)) {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is an Atomize template placeholder, not a JavaScript template.
      return taskTitle.replace(storyTitle, "${story.title}");
    }

    const storyIdPattern = /(?:Story-|#|STORY-)(\d+)/gi;
    // biome-ignore lint/suspicious/noTemplateCurlyInString: This is an Atomize template placeholder, not a JavaScript template.
    return taskTitle.replace(storyIdPattern, "${story.id}");
  }

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

    if (slug.length === 0) return `task-${index + 1}`;
    return slug.length > 30 ? slug.substring(0, 30) : slug;
  }

  detectActivity(title: string, description?: string): string {
    const text = `${title} ${description || ""}`.toLowerCase();

    if (/design|architect|plan|spec/i.test(text)) return "Design";
    if (/test|qa|verify|validation/i.test(text)) return "Testing";
    if (/deploy|release|publish/i.test(text)) return "Deployment";
    if (/document|readme|wiki/i.test(text)) return "Documentation";
    if (/review|code review|pr/i.test(text)) return "Documentation";
    return "Development";
  }

  private suggestConfidenceImprovements(
    analyses: StoryAnalysis[],
    confidence: { level: string },
  ): TemplateSuggestion[] {
    if (confidence.level !== "low" || analyses.length >= 3) return [];
    return [{
      type: "add-task",
      message: `Confidence is low. Consider adding more stories (currently ${analyses.length}) for better pattern detection.`,
      severity: "important",
    }];
  }

  private suggestOutlierRemovals(outliers: Outlier[]): TemplateSuggestion[] {
    return outliers
      .filter((outlier) => outlier.type === "extra-task")
      .map((outlier) => ({
        type: "remove-task" as const,
        message: outlier.message,
        severity: "info" as const,
      }));
  }

  private suggestNamingImprovements(
    patterns: PatternDetectionResult,
  ): TemplateSuggestion[] {
    const suggestions: TemplateSuggestion[] = [];
    for (const task of patterns.commonTasks) {
      if (task.titleVariants.length > 2 && task.frequencyRatio >= 0.5) {
        suggestions.push({
          type: "improve-naming",
          message: `Task "${task.canonicalTitle}" has ${task.titleVariants.length} naming variants across stories. Consider standardizing the name.`,
          severity: "info",
        });
      }
    }
    return suggestions;
  }

  private suggestDependencies(
    patterns: PatternDetectionResult,
  ): TemplateSuggestion[] {
    const suggestions: TemplateSuggestion[] = [];
    const hasDesign = patterns.commonTasks.some(
      (task) => task.activity === "Design" && task.frequencyRatio >= 0.8,
    );
    const hasDev = patterns.commonTasks.some(
      (task) => task.activity === "Development" && task.frequencyRatio >= 0.8,
    );
    if (hasDesign && hasDev) {
      suggestions.push({
        type: "add-dependency",
        message: "Design and Development tasks are consistently present. Consider adding a dependency from Development to Design.",
        severity: "info",
      });
    }

    for (const dep of patterns.dependencyPatterns) {
      if (dep.confidence >= 0.8) {
        suggestions.push({
          type: "add-dependency",
          message: `Detected dependency: "${dep.dependentTaskTitle}" depends on "${dep.predecessorTaskTitle}" (${Math.round(dep.confidence * 100)}% confidence, ${dep.source} source)`,
          severity: dep.source === "explicit" ? "important" : "info",
        });
      }
    }
    return suggestions;
  }

  private suggestConditions(
    patterns: PatternDetectionResult,
  ): TemplateSuggestion[] {
    return patterns.conditionalPatterns
      .filter((condition) => condition.confidence >= 0.75)
      .map((condition) => ({
        type: "add-condition" as const,
        message: condition.explanation,
        severity: "info" as const,
      }));
  }

  private suggestFilterImprovements(
    patterns: PatternDetectionResult,
  ): TemplateSuggestion[] {
    const suggestions: TemplateSuggestion[] = [];

    if (patterns.learnedFilters.commonStoryTags) {
      const highFreqTags = patterns.learnedFilters.commonStoryTags.filter(
        (tag) => tag.frequencyRatio >= 0.8,
      );
      if (highFreqTags.length > 0) {
        suggestions.push({
          type: "improve-filter",
          message: `Tags "${highFreqTags.map((tag) => tag.tag).join('", "')}" appear in 80%+ of stories. Consider adding to template filter.`,
          severity: "info",
        });
      }
    }

    if (patterns.learnedFilters.priorityRange) {
      const { min, max } = patterns.learnedFilters.priorityRange;
      if (min === max) {
        suggestions.push({
          type: "improve-filter",
          message: `All stories have priority ${min}. Consider adding a priority filter.`,
          severity: "info",
        });
      }
    }

    return suggestions;
  }
}

function estimationSample(story: WorkItem, tasks: WorkItem[]): EstimationSample {
  return {
    storyEstimate: story.estimation,
    taskEstimates: tasks.map((task) => numericStoryEstimate(task.estimation)),
  };
}

function learnedEstimationConfig(samples: EstimationSample[], source?: string): EstimationConfig {
  const learned = inferEstimation(samples);
  return {
    strategy: "percentage",
    rounding: "none",
    minimumTaskEstimate: 0,
    ...(source ? { source } : {}),
    ...(learned.conversion ? { conversion: learned.conversion } : {}),
    ...(learned.defaultStoryEstimate !== undefined ? { defaultParentEstimation: learned.defaultStoryEstimate } : {}),
  };
}
