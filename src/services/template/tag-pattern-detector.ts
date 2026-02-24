import { SimilarityCalculator } from "./similarity-calculator";
import type {
  CommonTaskPattern,
  EnhancedTagInfo,
  StoryAnalysis,
  TaskTagPattern,
} from "./story-learner.types";

/**
 * Detects and analyzes tag patterns across tasks and stories.
 * Classifies tags as core, optional, or rare based on frequency.
 */
export class TagPatternDetector {
  private patternDetector = new SimilarityCalculator();
  private coreThreshold = 0.8;
  private optionalThreshold = 0.2;

  /**
   * Analyze tag patterns for common tasks.
   * Returns a map from canonical task title to enhanced tag info.
   */
  detectTaskTagPatterns(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): Map<string, EnhancedTagInfo> {
    const result = new Map<string, EnhancedTagInfo>();

    for (const commonTask of commonTasks) {
      const tagPatterns = this.calculateTagFrequency(commonTask, analyses);
      const tagInfo = this.classifyTags(tagPatterns);
      result.set(commonTask.canonicalTitle, tagInfo);
    }

    return result;
  }

  /**
   * Calculate tag frequency for a specific common task across all stories.
   */
  private calculateTagFrequency(
    commonTask: CommonTaskPattern,
    analyses: StoryAnalysis[],
  ): TaskTagPattern[] {
    const tagCounts = new Map<string, number>();
    let totalInstances = 0;

    for (const analysis of analyses) {
      for (const taskDef of analysis.template.tasks) {
        if (this.isMatchingTask(taskDef.title, commonTask)) {
          totalInstances++;
          const tags = taskDef.tags ?? [];
          for (const tag of tags) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        }
      }
    }

    if (totalInstances === 0) {
      return [];
    }
    const patterns: TaskTagPattern[] = [];
    for (const [tag, count] of tagCounts) {
      const frequencyRatio = count / totalInstances;
      patterns.push({
        tag,
        frequency: count,
        frequencyRatio,
        classification: this.getClassification(frequencyRatio),
      });
    }

    return patterns.sort((a, b) => b.frequencyRatio - a.frequencyRatio);
  }

  /**
   * Check if a task title matches a common task pattern.
   */
  private isMatchingTask(
    taskTitle: string,
    commonTask: CommonTaskPattern,
  ): boolean {
    if (commonTask.titleVariants.includes(taskTitle)) {
      return true;
    }

    // Fall back to similarity matching
    const normalizedTask = this.patternDetector.normalizeTitle(taskTitle);
    const normalizedCommon = this.patternDetector.normalizeTitle(
      commonTask.canonicalTitle,
    );
    const similarity = this.patternDetector.calculateSimilarity(
      normalizedTask,
      normalizedCommon,
    );

    return similarity >= 0.6;
  }

  /**
   * Get tag classification based on frequency ratio.
   */
  private getClassification(
    frequencyRatio: number,
  ): "core" | "optional" | "rare" {
    if (frequencyRatio >= this.coreThreshold) {
      return "core";
    }
    if (frequencyRatio >= this.optionalThreshold) {
      return "optional";
    }
    return "rare";
  }

  /**
   * Classify tags into core, optional, and rare categories.
   */
  private classifyTags(tagPatterns: TaskTagPattern[]): EnhancedTagInfo {
    const coreTags: string[] = [];
    const optionalTags: string[] = [];
    const rareTags: string[] = [];

    for (const pattern of tagPatterns) {
      switch (pattern.classification) {
        case "core":
          coreTags.push(pattern.tag);
          break;
        case "optional":
          optionalTags.push(pattern.tag);
          break;
        case "rare":
          rareTags.push(pattern.tag);
          break;
      }
    }

    return {
      coreTags,
      optionalTags,
      rareTags,
      tagPatterns,
    };
  }

  /**
   * Calculate overall tag distribution across all tasks in all stories.
   * Returns a map of tag -> percentage of tasks that have this tag.
   */
  calculateTagDistribution(analyses: StoryAnalysis[]): Record<string, number> {
    const tagCounts = new Map<string, number>();
    let totalTasks = 0;

    for (const analysis of analyses) {
      for (const taskDef of analysis.template.tasks) {
        totalTasks++;
        const tags = taskDef.tags ?? [];
        for (const tag of tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }
    }

    if (totalTasks === 0) {
      return {};
    }

    const distribution: Record<string, number> = {};
    for (const [tag, count] of tagCounts) {
      distribution[tag] = Math.round((count / totalTasks) * 100 * 100) / 100;
    }

    return distribution;
  }

  /**
   * Detect tag-based task groupings.
   * Returns groups of tasks that share common tags.
   */
  detectTagBasedGroups(
    commonTasks: CommonTaskPattern[],
  ): Map<string, CommonTaskPattern[]> {
    const groups = new Map<string, CommonTaskPattern[]>();

    for (const task of commonTasks) {
      if (!task.tagInfo) continue;
      for (const coreTag of task.tagInfo.coreTags) {
        const group = groups.get(coreTag) ?? [];
        group.push(task);
        groups.set(coreTag, group);
      }
    }

    return groups;
  }

  /**
   * Merge tags intelligently using frequency data.
   * If coreOnly is true, returns only core tags.
   * Otherwise returns core and optional tags.
   */
  mergeTagsWithFrequency(tagInfo: EnhancedTagInfo, coreOnly = false): string[] {
    if (coreOnly) {
      return [...tagInfo.coreTags];
    }
    return [...tagInfo.coreTags, ...tagInfo.optionalTags];
  }

  /**
   * Augment common tasks with tag classification information.
   */
  augmentCommonTasks(
    commonTasks: CommonTaskPattern[],
    tagPatternMap: Map<string, EnhancedTagInfo>,
  ): CommonTaskPattern[] {
    return commonTasks.map((task) => ({
      ...task,
      tagInfo: tagPatternMap.get(task.canonicalTitle),
    }));
  }

  /**
   * Get suggested tags for a merged task based on frequency analysis.
   * Returns tags that should be included in the template.
   */
  getSuggestedTags(tagInfo: EnhancedTagInfo, includeOptional = true): string[] {
    const suggested = [...tagInfo.coreTags];
    if (includeOptional) {
      for (const pattern of tagInfo.tagPatterns) {
        if (
          pattern.classification === "optional" &&
          pattern.frequencyRatio >= 0.4
        ) {
          suggested.push(pattern.tag);
        }
      }
    }
    return [...new Set(suggested)];
  }
}
