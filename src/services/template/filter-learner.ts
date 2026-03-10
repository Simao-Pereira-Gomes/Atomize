import type { FilterCriteria } from "@templates/schema";
import type {
  LearnedFilterCriteria,
  StoryAnalysis,
  TemplateSuggestion,
} from "./story-learner.types";

/**
 * Learns filter criteria from analyzed stories.
 * Detects common area paths, priority ranges, and estimation patterns.
 */
export class FilterLearner {
  private minFrequencyRatio = 0.5;

  /**
   * Learn filter criteria from story analyses.
   */
  learn(analyses: StoryAnalysis[]): LearnedFilterCriteria {
    if (analyses.length === 0) {
      return {};
    }

    return {
      areaPaths: this.detectAreaPaths(analyses),
      priorityRange: this.detectPriorityRange(analyses),
      estimationRange: this.detectEstimationRange(analyses),
      commonStoryTags: this.detectCommonStoryTags(analyses),
    };
  }

  /**
   * Detect common area paths from analyzed stories.
   */
  private detectAreaPaths(
    analyses: StoryAnalysis[],
  ): LearnedFilterCriteria["areaPaths"] {
    const pathCounts = new Map<string, number>();

    for (const analysis of analyses) {
      const areaPath = analysis.story.areaPath;
      if (areaPath) {
        pathCounts.set(areaPath, (pathCounts.get(areaPath) ?? 0) + 1);
      }
    }

    if (pathCounts.size === 0) {
      return undefined;
    }
    const commonPaths: string[] = [];
    let maxFrequency = 0;

    for (const [path, count] of pathCounts) {
      const ratio = count / analyses.length;
      if (ratio >= this.minFrequencyRatio) {
        commonPaths.push(path);
        maxFrequency = Math.max(maxFrequency, count);
      }
    }

    if (commonPaths.length === 0) {
      // If no path meets threshold, return the most common one
      let mostCommonPath = "";
      let mostCommonCount = 0;
      for (const [path, count] of pathCounts) {
        if (count > mostCommonCount) {
          mostCommonPath = path;
          mostCommonCount = count;
        }
      }
      if (mostCommonPath) {
        return {
          values: [mostCommonPath],
          frequency: mostCommonCount,
        };
      }
      return undefined;
    }

    return {
      values: commonPaths,
      frequency: maxFrequency,
    };
  }

  /**
   * Detect priority range from analyzed stories.
   */
  private detectPriorityRange(
    analyses: StoryAnalysis[],
  ): LearnedFilterCriteria["priorityRange"] {
    const priorities = analyses
      .map((a) => a.story.priority)
      .filter((p): p is number => p !== undefined);

    if (priorities.length === 0) {
      return undefined;
    }

    const sorted = [...priorities].sort((a, b) => a - b);
    const min = sorted[0] ?? 1;
    const max = sorted[sorted.length - 1] ?? 5;

    // Find most common priority
    const priorityCounts = new Map<number, number>();
    for (const p of priorities) {
      priorityCounts.set(p, (priorityCounts.get(p) ?? 0) + 1);
    }

    let mostCommon = min;
    let maxCount = 0;
    for (const [priority, count] of priorityCounts) {
      if (count > maxCount) {
        mostCommon = priority;
        maxCount = count;
      }
    }

    return {
      min,
      max,
      mostCommon,
    };
  }

  /**
   * Detect estimation range from analyzed stories.
   */
  private detectEstimationRange(
    analyses: StoryAnalysis[],
  ): LearnedFilterCriteria["estimationRange"] {
    const estimations = analyses
      .map((a) => a.story.estimation)
      .filter((e): e is number => e !== undefined && e > 0);

    if (estimations.length === 0) {
      return undefined;
    }

    const sorted = [...estimations].sort((a, b) => a - b);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const average =
      Math.round(
        (estimations.reduce((a, b) => a + b, 0) / estimations.length) * 100,
      ) / 100;

    return {
      min,
      max,
      average,
    };
  }

  /**
   * Detect common story tags from analyzed stories.
   */
  private detectCommonStoryTags(
    analyses: StoryAnalysis[],
  ): LearnedFilterCriteria["commonStoryTags"] {
    const tagCounts = new Map<string, number>();

    for (const analysis of analyses) {
      for (const tag of analysis.story.tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    if (tagCounts.size === 0) {
      return undefined;
    }

    const tagArray: Array<{
      tag: string;
      frequency: number;
      frequencyRatio: number;
    }> = [];

    for (const [tag, count] of tagCounts) {
      tagArray.push({
        tag,
        frequency: count,
        frequencyRatio: Math.round((count / analyses.length) * 100) / 100,
      });
    }

    tagArray.sort((a, b) => b.frequency - a.frequency);
    return tagArray.filter((t) => t.frequencyRatio >= 0.2);
  }

  /**
   * Apply learned filters to template filter criteria.
   */
  applyToTemplate(
    templateFilter: FilterCriteria,
    learnedFilters: LearnedFilterCriteria,
    options: {
      includeAreaPaths?: boolean;
      includePriority?: boolean;
      includeEstimation?: boolean;
    } = {},
  ): FilterCriteria {
    const result = { ...templateFilter };

    if (options.includeAreaPaths && learnedFilters.areaPaths) {
      result.areaPaths = learnedFilters.areaPaths.values;
    }

    if (options.includePriority && learnedFilters.priorityRange) {
      result.priority = {
        min: learnedFilters.priorityRange.min,
        max: learnedFilters.priorityRange.max,
      };
    }

    return result;
  }

  /**
   * Generate suggestions based on learned filters.
   */
  generateSuggestions(
    learnedFilters: LearnedFilterCriteria,
  ): TemplateSuggestion[] {
    const suggestions: TemplateSuggestion[] = [];

    if (
      learnedFilters.areaPaths &&
      learnedFilters.areaPaths.values.length > 0
    ) {
      const paths = learnedFilters.areaPaths.values;
      if (paths.length === 1) {
        suggestions.push({
          type: "improve-filter",
          message: `All analyzed stories are in area path "${paths[0]}". Consider adding this to the template filter.`,
          severity: "info",
        });
      } else {
        suggestions.push({
          type: "improve-filter",
          message: `Stories span ${paths.length} area paths: ${paths.join(", ")}. Consider if the template should be scoped to specific areas.`,
          severity: "info",
        });
      }
    }

    if (learnedFilters.priorityRange) {
      const { min, max } = learnedFilters.priorityRange;
      if (min === max) {
        suggestions.push({
          type: "improve-filter",
          message: `All analyzed stories have priority ${min}. Consider adding a priority filter.`,
          severity: "info",
        });
      } else if (max - min <= 1) {
        suggestions.push({
          type: "improve-filter",
          message: `Stories have a narrow priority range (${min}-${max}). Consider if this template applies to specific priority levels.`,
          severity: "info",
        });
      }
    }

    if (learnedFilters.estimationRange) {
      const { min, max, average } = learnedFilters.estimationRange;
      if (max - min <= 3) {
        suggestions.push({
          type: "improve-filter",
          message: `Stories have similar estimations (${min}-${max} points, avg ${average}). This template works well for stories of this size.`,
          severity: "info",
        });
      }
    }

    if (
      learnedFilters.commonStoryTags &&
      learnedFilters.commonStoryTags.length > 0
    ) {
      const highFreqTags = learnedFilters.commonStoryTags.filter(
        (t) => t.frequencyRatio >= 0.8,
      );
      if (highFreqTags.length > 0) {
        suggestions.push({
          type: "improve-filter",
          message: `Tags "${highFreqTags.map((t) => t.tag).join('", "')}" appear in 80%+ of analyzed stories. Consider adding to the filter's include tags.`,
          severity: "info",
        });
      }
    }

    return suggestions;
  }

  /**
   * Get a summary of learned filters for display.
   */
  getSummary(learnedFilters: LearnedFilterCriteria): string {
    const parts: string[] = [];

    if (learnedFilters.areaPaths) {
      parts.push(`Area paths: ${learnedFilters.areaPaths.values.join(", ")}`);
    }

    if (learnedFilters.priorityRange) {
      const { min, max, mostCommon } = learnedFilters.priorityRange;
      parts.push(`Priority range: ${min}-${max} (most common: ${mostCommon})`);
    }

    if (learnedFilters.estimationRange) {
      const { min, max, average } = learnedFilters.estimationRange;
      parts.push(`Estimation range: ${min}-${max} (average: ${average})`);
    }

    if (
      learnedFilters.commonStoryTags &&
      learnedFilters.commonStoryTags.length > 0
    ) {
      const topTags = learnedFilters.commonStoryTags.slice(0, 5);
      parts.push(
        `Common tags: ${topTags.map((t) => `${t.tag} (${Math.round(t.frequencyRatio * 100)}%)`).join(", ")}`,
      );
    }

    return parts.length > 0 ? parts.join("\n") : "No filter criteria learned";
  }
}
