import { SimilarityCalculator } from "./similarity-calculator";
import type {
  CommonTaskPattern,
  ConditionalTaskPattern,
  MergedTask,
  StoryAnalysis,
} from "./story-learner.types";

/**
 * Detects correlations between story attributes and task presence.
 * Generates condition expressions compatible with ConditionEvaluator.
 */
export class ConditionPatternDetector {
  private patternDetector = new SimilarityCalculator();
  private minConfidence = 0.7;
  private minSampleSize = 3;

  /**
   * Detect conditional patterns for tasks.
   * Finds correlations between story attributes and task presence.
   */
  detect(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): ConditionalTaskPattern[] {
    if (analyses.length < this.minSampleSize) {
      return [];
    }

    const patterns: ConditionalTaskPattern[] = [];
    patterns.push(...this.detectTagConditions(analyses, commonTasks));
    patterns.push(...this.detectPriorityConditions(analyses, commonTasks));
    patterns.push(...this.detectEstimationConditions(analyses, commonTasks));
    patterns.push(...this.detectAreaPathConditions(analyses, commonTasks));
    return this.filterAndDeduplicatePatterns(patterns);
  }

  /**
   * Detect tag-based conditions.
   * E.g., "Task X appears only when story has tag Y"
   */
  private detectTagConditions(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): ConditionalTaskPattern[] {
    const patterns: ConditionalTaskPattern[] = [];

    const allStoryTags = new Set<string>();
    for (const analysis of analyses) {
      for (const tag of analysis.story.tags ?? []) {
        allStoryTags.add(tag);
      }
    }

    for (const commonTask of commonTasks) {
      if (commonTask.frequencyRatio >= 0.9) continue;
      if (commonTask.frequency < this.minSampleSize) continue;

      for (const tag of allStoryTags) {
        const correlation = this.calculateTagCorrelation(
          analyses,
          commonTask,
          tag,
        );

        if (
          correlation.confidence >= this.minConfidence &&
          correlation.matchCount >= this.minSampleSize
        ) {
          patterns.push({
            taskCanonicalTitle: commonTask.canonicalTitle,
            conditionExpression: this.generateConditionExpression(
              "tag",
              tag,
              correlation.isPositive,
            ),
            correlationType: "tag",
            correlatedValue: tag,
            confidence: correlation.confidence,
            matchCount: correlation.matchCount,
            totalStories: analyses.length,
            explanation: correlation.isPositive
              ? `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of stories with tag "${tag}"`
              : `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of stories without tag "${tag}"`,
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Calculate correlation between task presence and story tag.
   */
  private calculateTagCorrelation(
    analyses: StoryAnalysis[],
    commonTask: CommonTaskPattern,
    tag: string,
  ): { confidence: number; matchCount: number; isPositive: boolean } {
    let storiesWithTag = 0;
    let storiesWithoutTag = 0;
    let taskInStoriesWithTag = 0;
    let taskInStoriesWithoutTag = 0;

    for (const analysis of analyses) {
      const hasTag = analysis.story.tags?.includes(tag) ?? false;
      const hasTask = this.storyHasTask(analysis, commonTask);

      if (hasTag) {
        storiesWithTag++;
        if (hasTask) taskInStoriesWithTag++;
      } else {
        storiesWithoutTag++;
        if (hasTask) taskInStoriesWithoutTag++;
      }
    }

    const positiveCorrelation =
      storiesWithTag > 0 ? taskInStoriesWithTag / storiesWithTag : 0;

    const negativeCorrelation =
      storiesWithoutTag > 0 ? taskInStoriesWithoutTag / storiesWithoutTag : 0;
    if (
      positiveCorrelation > negativeCorrelation + 0.3 &&
      positiveCorrelation >= this.minConfidence
    ) {
      return {
        confidence: positiveCorrelation,
        matchCount: taskInStoriesWithTag,
        isPositive: true,
      };
    }

    // Check if there's a strong negative correlation
    // Task appears significantly more often without the tag
    if (
      negativeCorrelation > positiveCorrelation + 0.3 &&
      negativeCorrelation >= this.minConfidence
    ) {
      return {
        confidence: negativeCorrelation,
        matchCount: taskInStoriesWithoutTag,
        isPositive: false,
      };
    }

    return { confidence: 0, matchCount: 0, isPositive: true };
  }

  /**
   * Detect priority-based conditions.
   * E.g., "Task X appears only for high-priority stories (priority <= 2)"
   */
  private detectPriorityConditions(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): ConditionalTaskPattern[] {
    const patterns: ConditionalTaskPattern[] = [];

    const priorityThresholds = [1, 2, 3];

    for (const commonTask of commonTasks) {
      if (commonTask.frequencyRatio >= 0.9) continue;
      if (commonTask.frequency < this.minSampleSize) continue;

      for (const threshold of priorityThresholds) {
        const correlation = this.calculatePriorityCorrelation(
          analyses,
          commonTask,
          threshold,
        );

        if (
          correlation.confidence >= this.minConfidence &&
          correlation.matchCount >= this.minSampleSize
        ) {
          patterns.push({
            taskCanonicalTitle: commonTask.canonicalTitle,
            conditionExpression: this.generateConditionExpression(
              "priority",
              threshold,
              correlation.isHighPriority,
            ),
            correlationType: "priority",
            correlatedValue: threshold,
            confidence: correlation.confidence,
            matchCount: correlation.matchCount,
            totalStories: analyses.length,
            explanation: correlation.isHighPriority
              ? `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of high-priority stories (priority <= ${threshold})`
              : `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of lower-priority stories (priority > ${threshold})`,
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Calculate correlation between task presence and story priority.
   */
  private calculatePriorityCorrelation(
    analyses: StoryAnalysis[],
    commonTask: CommonTaskPattern,
    priorityThreshold: number,
  ): { confidence: number; matchCount: number; isHighPriority: boolean } {
    let highPriorityStories = 0;
    let lowPriorityStories = 0;
    let taskInHighPriority = 0;
    let taskInLowPriority = 0;

    for (const analysis of analyses) {
      const priority = analysis.story.priority;
      if (priority === undefined) continue;

      const isHighPriority = priority <= priorityThreshold;
      const hasTask = this.storyHasTask(analysis, commonTask);

      if (isHighPriority) {
        highPriorityStories++;
        if (hasTask) taskInHighPriority++;
      } else {
        lowPriorityStories++;
        if (hasTask) taskInLowPriority++;
      }
    }

    const highCorrelation =
      highPriorityStories > 0 ? taskInHighPriority / highPriorityStories : 0;
    const lowCorrelation =
      lowPriorityStories > 0 ? taskInLowPriority / lowPriorityStories : 0;
    if (
      highCorrelation > lowCorrelation + 0.3 &&
      highCorrelation >= this.minConfidence
    ) {
      return {
        confidence: highCorrelation,
        matchCount: taskInHighPriority,
        isHighPriority: true,
      };
    }

    if (
      lowCorrelation > highCorrelation + 0.3 &&
      lowCorrelation >= this.minConfidence
    ) {
      return {
        confidence: lowCorrelation,
        matchCount: taskInLowPriority,
        isHighPriority: false,
      };
    }

    return { confidence: 0, matchCount: 0, isHighPriority: true };
  }

  /**
   * Detect estimation-based conditions.
   * E.g., "Task X appears only for large stories (estimation >= 13)"
   */
  private detectEstimationConditions(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): ConditionalTaskPattern[] {
    const patterns: ConditionalTaskPattern[] = [];

    const estimations = analyses
      .map((a) => a.story.estimation)
      .filter((e): e is number => e !== undefined && e > 0)
      .sort((a, b) => a - b);

    if (estimations.length < this.minSampleSize) {
      return patterns;
    }

    const median = estimations[Math.floor(estimations.length / 2)] ?? 0;
    const q75 = estimations[Math.floor((estimations.length * 3) / 4)] ?? median;

    const thresholds = [...new Set([median, q75])].filter((t) => t > 0);

    for (const commonTask of commonTasks) {
      if (commonTask.frequencyRatio >= 0.9) continue;
      if (commonTask.frequency < this.minSampleSize) continue;

      for (const threshold of thresholds) {
        const correlation = this.calculateEstimationCorrelation(
          analyses,
          commonTask,
          threshold,
        );

        if (
          correlation.confidence >= this.minConfidence &&
          correlation.matchCount >= this.minSampleSize
        ) {
          patterns.push({
            taskCanonicalTitle: commonTask.canonicalTitle,
            conditionExpression: this.generateConditionExpression(
              "estimation",
              threshold,
              correlation.isLargeStory,
            ),
            correlationType: "estimation",
            correlatedValue: threshold,
            confidence: correlation.confidence,
            matchCount: correlation.matchCount,
            totalStories: analyses.length,
            explanation: correlation.isLargeStory
              ? `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of larger stories (estimation >= ${threshold})`
              : `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of smaller stories (estimation < ${threshold})`,
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Calculate correlation between task presence and story estimation.
   */
  private calculateEstimationCorrelation(
    analyses: StoryAnalysis[],
    commonTask: CommonTaskPattern,
    estimationThreshold: number,
  ): { confidence: number; matchCount: number; isLargeStory: boolean } {
    let largeStories = 0;
    let smallStories = 0;
    let taskInLargeStories = 0;
    let taskInSmallStories = 0;

    for (const analysis of analyses) {
      const estimation = analysis.story.estimation;
      if (estimation === undefined) continue;

      const isLarge = estimation >= estimationThreshold;
      const hasTask = this.storyHasTask(analysis, commonTask);

      if (isLarge) {
        largeStories++;
        if (hasTask) taskInLargeStories++;
      } else {
        smallStories++;
        if (hasTask) taskInSmallStories++;
      }
    }

    const largeCorrelation =
      largeStories > 0 ? taskInLargeStories / largeStories : 0;
    const smallCorrelation =
      smallStories > 0 ? taskInSmallStories / smallStories : 0;

    if (
      largeCorrelation > smallCorrelation + 0.3 &&
      largeCorrelation >= this.minConfidence
    ) {
      return {
        confidence: largeCorrelation,
        matchCount: taskInLargeStories,
        isLargeStory: true,
      };
    }

    if (
      smallCorrelation > largeCorrelation + 0.3 &&
      smallCorrelation >= this.minConfidence
    ) {
      return {
        confidence: smallCorrelation,
        matchCount: taskInSmallStories,
        isLargeStory: false,
      };
    }

    return { confidence: 0, matchCount: 0, isLargeStory: true };
  }

  /**
   * Detect area path conditions.
   */
  private detectAreaPathConditions(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): ConditionalTaskPattern[] {
    const patterns: ConditionalTaskPattern[] = [];

    const areaPaths = new Set<string>();
    for (const analysis of analyses) {
      if (analysis.story.areaPath) {
        areaPaths.add(analysis.story.areaPath);
      }
    }
    if (areaPaths.size <= 1) {
      return patterns;
    }

    for (const commonTask of commonTasks) {
      if (commonTask.frequencyRatio >= 0.9) continue;
      if (commonTask.frequency < this.minSampleSize) continue;

      for (const areaPath of areaPaths) {
        const correlation = this.calculateAreaPathCorrelation(
          analyses,
          commonTask,
          areaPath,
        );

        if (
          correlation.confidence >= this.minConfidence &&
          correlation.matchCount >= this.minSampleSize
        ) {
          patterns.push({
            taskCanonicalTitle: commonTask.canonicalTitle,
            conditionExpression: `\${story.areaPath} CONTAINS "${areaPath}"`,
            correlationType: "areaPath",
            correlatedValue: areaPath,
            confidence: correlation.confidence,
            matchCount: correlation.matchCount,
            totalStories: analyses.length,
            explanation: `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of stories in area path "${areaPath}"`,
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Calculate correlation between task presence and area path.
   */
  private calculateAreaPathCorrelation(
    analyses: StoryAnalysis[],
    commonTask: CommonTaskPattern,
    areaPath: string,
  ): { confidence: number; matchCount: number } {
    let storiesInPath = 0;
    let taskInStoriesInPath = 0;

    for (const analysis of analyses) {
      if (analysis.story.areaPath === areaPath) {
        storiesInPath++;
        if (this.storyHasTask(analysis, commonTask)) {
          taskInStoriesInPath++;
        }
      }
    }

    const correlation =
      storiesInPath > 0 ? taskInStoriesInPath / storiesInPath : 0;

    return {
      confidence: correlation,
      matchCount: taskInStoriesInPath,
    };
  }

  /**
   * Check if a story has a task matching the common task pattern.
   */
  private storyHasTask(
    analysis: StoryAnalysis,
    commonTask: CommonTaskPattern,
  ): boolean {
    for (const taskDef of analysis.template.tasks) {
      if (commonTask.titleVariants.includes(taskDef.title)) {
        return true;
      }
      const normalized = this.patternDetector.normalizeTitle(taskDef.title);
      const commonNormalized = this.patternDetector.normalizeTitle(
        commonTask.canonicalTitle,
      );
      if (
        this.patternDetector.calculateSimilarity(
          normalized,
          commonNormalized,
        ) >= 0.6
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate condition expression for ConditionEvaluator.
   */
  generateConditionExpression(
    type: ConditionalTaskPattern["correlationType"],
    value: string | number,
    isPositive: boolean,
  ): string {
    switch (type) {
      case "tag":
        return isPositive
          ? `\${story.tags} CONTAINS "${value}"`
          : `\${story.tags} NOT CONTAINS "${value}"`;
      case "priority":
        return isPositive
          ? `\${story.priority} <= ${value}`
          : `\${story.priority} > ${value}`;
      case "estimation":
        return isPositive
          ? `\${story.estimation} >= ${value}`
          : `\${story.estimation} < ${value}`;
      case "areaPath":
        return `\${story.areaPath} CONTAINS "${value}"`;
      default:
        return "";
    }
  }

  /**
   * Filter patterns by confidence and deduplicate.
   */
  private filterAndDeduplicatePatterns(
    patterns: ConditionalTaskPattern[],
  ): ConditionalTaskPattern[] {
    const sorted = [...patterns].sort((a, b) => b.confidence - a.confidence);
    const seen = new Map<string, ConditionalTaskPattern>();
    for (const pattern of sorted) {
      const existing = seen.get(pattern.taskCanonicalTitle);
      if (!existing || pattern.confidence > existing.confidence) {
        seen.set(pattern.taskCanonicalTitle, pattern);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Augment merged tasks with learned conditions.
   */
  augmentMergedTasks(
    mergedTasks: MergedTask[],
    patterns: ConditionalTaskPattern[],
    confidenceThreshold = 0.7,
  ): MergedTask[] {
    const conditionMap = new Map<string, string>();
    for (const pattern of patterns) {
      if (pattern.confidence >= confidenceThreshold) {
        conditionMap.set(
          pattern.taskCanonicalTitle,
          pattern.conditionExpression,
        );
      }
    }

    return mergedTasks.map((mt) => {
      const normalized = this.patternDetector.normalizeTitle(mt.task.title);
      for (const [title, condition] of conditionMap) {
        const normalizedTitle = this.patternDetector.normalizeTitle(title);
        if (
          this.patternDetector.calculateSimilarity(
            normalized,
            normalizedTitle,
          ) >= 0.6
        ) {
          return {
            ...mt,
            learnedCondition: condition,
          };
        }
      }

      return mt;
    });
  }
}
