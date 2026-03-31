import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { Condition } from "@templates/schema";
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
   * Returns a slightly stricter confidence threshold as the dataset grows.
   * Larger datasets make spurious correlations easier to rule out, so we
   * raise the bar a little (up to +10 pp) to avoid over-fitting.
   */
  private getAdjustedConfidence(sampleSize: number): number {
    return (
      this.minConfidence +
      Math.min((sampleSize - this.minSampleSize) * 0.003, 0.1)
    );
  }

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

    const threshold = this.getAdjustedConfidence(analyses.length);

    const patterns: ConditionalTaskPattern[] = [];
    patterns.push(...this.detectTagConditions(analyses, commonTasks, threshold));
    patterns.push(
      ...this.detectPriorityConditions(analyses, commonTasks, threshold),
    );
    patterns.push(
      ...this.detectEstimationConditions(analyses, commonTasks, threshold),
    );
    patterns.push(
      ...this.detectAreaPathConditions(analyses, commonTasks, threshold),
    );

    const compoundPatterns = this.detectCompoundConditions(
      analyses,
      patterns,
      commonTasks,
      threshold,
    );
    patterns.push(...compoundPatterns);

    return patterns;
  }

  /**
   * Detect tag-based conditions.
   * E.g., "Task X appears only when story has tag Y"
   */
  private detectTagConditions(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
    threshold: number,
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
          threshold,
        );

        if (
          correlation.confidence >= threshold &&
          correlation.matchCount >= this.minSampleSize
        ) {
          patterns.push({
            taskCanonicalTitle: commonTask.canonicalTitle,
            condition: this.buildCondition("tag", tag, correlation.isPositive),
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
    threshold: number,
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
      positiveCorrelation >= threshold
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
      negativeCorrelation >= threshold
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
    threshold: number,
  ): ConditionalTaskPattern[] {
    const patterns: ConditionalTaskPattern[] = [];

    const priorityThresholds = [1, 2, 3];

    for (const commonTask of commonTasks) {
      if (commonTask.frequencyRatio >= 0.9) continue;
      if (commonTask.frequency < this.minSampleSize) continue;

      for (const priorityThreshold of priorityThresholds) {
        const correlation = this.calculatePriorityCorrelation(
          analyses,
          commonTask,
          priorityThreshold,
          threshold,
        );

        if (
          correlation.confidence >= threshold &&
          correlation.matchCount >= this.minSampleSize
        ) {
          patterns.push({
            taskCanonicalTitle: commonTask.canonicalTitle,
            condition: this.buildCondition("priority", priorityThreshold, correlation.isHighPriority),
            correlationType: "priority",
            correlatedValue: priorityThreshold,
            confidence: correlation.confidence,
            matchCount: correlation.matchCount,
            totalStories: analyses.length,
            explanation: correlation.isHighPriority
              ? `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of high-priority stories (priority <= ${priorityThreshold})`
              : `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of lower-priority stories (priority > ${priorityThreshold})`,
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
    threshold: number,
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
      highCorrelation >= threshold
    ) {
      return {
        confidence: highCorrelation,
        matchCount: taskInHighPriority,
        isHighPriority: true,
      };
    }

    if (
      lowCorrelation > highCorrelation + 0.3 &&
      lowCorrelation >= threshold
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
    threshold: number,
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

      for (const estThreshold of thresholds) {
        const correlation = this.calculateEstimationCorrelation(
          analyses,
          commonTask,
          estThreshold,
          threshold,
        );

        if (
          correlation.confidence >= threshold &&
          correlation.matchCount >= this.minSampleSize
        ) {
          patterns.push({
            taskCanonicalTitle: commonTask.canonicalTitle,
            condition: this.buildCondition("estimation", estThreshold, correlation.isLargeStory),
            correlationType: "estimation",
            correlatedValue: estThreshold,
            confidence: correlation.confidence,
            matchCount: correlation.matchCount,
            totalStories: analyses.length,
            explanation: correlation.isLargeStory
              ? `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of larger stories (estimation >= ${estThreshold})`
              : `Task "${commonTask.canonicalTitle}" appears in ${Math.round(correlation.confidence * 100)}% of smaller stories (estimation < ${estThreshold})`,
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
    threshold: number,
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
      largeCorrelation >= threshold
    ) {
      return {
        confidence: largeCorrelation,
        matchCount: taskInLargeStories,
        isLargeStory: true,
      };
    }

    if (
      smallCorrelation > largeCorrelation + 0.3 &&
      smallCorrelation >= threshold
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
   * Uses prefix matching (startsWith) so sub-area paths are grouped
   * under their parent path when the parent appears in the dataset.
   */
  private detectAreaPathConditions(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
    threshold: number,
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
          correlation.confidence >= threshold &&
          correlation.matchCount >= this.minSampleSize
        ) {
          patterns.push({
            taskCanonicalTitle: commonTask.canonicalTitle,
            condition: { field: "areaPath", operator: "contains", value: areaPath } satisfies Condition,
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
   * Uses prefix matching so sub-paths count toward the parent path.
   */
  private calculateAreaPathCorrelation(
    analyses: StoryAnalysis[],
    commonTask: CommonTaskPattern,
    areaPath: string,
  ): { confidence: number; matchCount: number } {
    let storiesInPath = 0;
    let taskInStoriesInPath = 0;

    for (const analysis of analyses) {
      if (analysis.story.areaPath?.startsWith(areaPath)) {
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
   * Evaluate whether a story satisfies an individual (non-compound) pattern's condition.
   */
  private storyMatchesPattern(
    analysis: StoryAnalysis,
    pattern: ConditionalTaskPattern,
  ): boolean {
    return this.evaluateCondition(analysis.story, pattern.condition);
  }

  /**
   * Evaluate a structured Condition against a story.
   */
  private evaluateCondition(story: WorkItem, condition: Condition): boolean {
    if ("all" in condition) {
      return condition.all.every((c) => this.evaluateCondition(story, c));
    }
    if ("any" in condition) {
      return condition.any.some((c) => this.evaluateCondition(story, c));
    }
    if ("field" in condition) {
      switch (condition.field) {
        case "tags": {
          const hasTag = story.tags?.includes(condition.value as string) ?? false;
          return condition.operator === "contains" ? hasTag : !hasTag;
        }
        case "priority": {
          const p = story.priority;
          if (p === undefined) return false;
          const v = condition.value as number;
          if (condition.operator === "lte") return p <= v;
          if (condition.operator === "gt") return p > v;
          return false;
        }
        case "estimation": {
          const e = story.estimation;
          if (e === undefined) return false;
          const v = condition.value as number;
          if (condition.operator === "gte") return e >= v;
          if (condition.operator === "lt") return e < v;
          return false;
        }
        case "areaPath": {
          return story.areaPath?.startsWith(condition.value as string) ?? false;
        }
        default:
          return false;
      }
    }
    return false;
  }

  /**
   * Calculate confidence for the AND combination of two patterns.
   * Counts stories where both conditions hold, and of those how many have the task.
   */
  private calculateCompoundConfidence(
    analyses: StoryAnalysis[],
    commonTask: CommonTaskPattern,
    patternA: ConditionalTaskPattern,
    patternB: ConditionalTaskPattern,
  ): { confidence: number; matchCount: number } {
    let storiesWithBoth = 0;
    let taskInStoriesWithBoth = 0;

    for (const analysis of analyses) {
      if (
        this.storyMatchesPattern(analysis, patternA) &&
        this.storyMatchesPattern(analysis, patternB)
      ) {
        storiesWithBoth++;
        if (this.storyHasTask(analysis, commonTask)) {
          taskInStoriesWithBoth++;
        }
      }
    }

    return {
      confidence:
        storiesWithBoth > 0 ? taskInStoriesWithBoth / storiesWithBoth : 0,
      matchCount: taskInStoriesWithBoth,
    };
  }

  /**
   * Detect compound AND conditions: pairs of individual patterns whose conjunction
   * has higher confidence than either condition alone.
   */
  private detectCompoundConditions(
    analyses: StoryAnalysis[],
    patterns: ConditionalTaskPattern[],
    commonTasks: CommonTaskPattern[],
    threshold: number,
  ): ConditionalTaskPattern[] {
    const compoundPatterns: ConditionalTaskPattern[] = [];

    const byTask = new Map<string, ConditionalTaskPattern[]>();
    for (const pattern of patterns) {
      if (pattern.correlationType === "compound") continue;
      const existing = byTask.get(pattern.taskCanonicalTitle) ?? [];
      existing.push(pattern);
      byTask.set(pattern.taskCanonicalTitle, existing);
    }

    for (const [taskTitle, taskPatterns] of byTask) {
      if (taskPatterns.length < 2) continue;

      const commonTask = commonTasks.find((t) => t.canonicalTitle === taskTitle);
      if (!commonTask) continue;

      for (let i = 0; i < taskPatterns.length; i++) {
        for (let j = i + 1; j < taskPatterns.length; j++) {
          const pA = taskPatterns[i];
          const pB = taskPatterns[j];
          if (!pA || !pB) continue;

          const compound = this.calculateCompoundConfidence(
            analyses,
            commonTask,
            pA,
            pB,
          );

          if (
            compound.confidence > pA.confidence &&
            compound.confidence > pB.confidence &&
            compound.confidence >= threshold &&
            compound.matchCount >= this.minSampleSize
          ) {
            compoundPatterns.push({
              taskCanonicalTitle: taskTitle,
              condition: { all: [pA.condition, pB.condition] } satisfies Condition,
              correlationType: "compound",
              correlatedValue: `${String(pA.correlatedValue)}+${String(pB.correlatedValue)}`,
              confidence: compound.confidence,
              matchCount: compound.matchCount,
              totalStories: analyses.length,
              explanation: `Task "${taskTitle}" appears in ${Math.round(compound.confidence * 100)}% of stories matching: ${pA.explanation} AND ${pB.explanation}`,
            });
          }
        }
      }
    }

    return compoundPatterns;
  }

  /**
   * Build a structured Condition for a single detected correlation.
   */
  buildCondition(
    type: ConditionalTaskPattern["correlationType"],
    value: string | number,
    isPositive: boolean,
  ): Condition {
    switch (type) {
      case "tag":
        return isPositive
          ? { field: "tags", operator: "contains", value: value as string }
          : { field: "tags", operator: "not-contains", value: value as string };
      case "priority":
        return isPositive
          ? { field: "priority", operator: "lte", value: value as number }
          : { field: "priority", operator: "gt", value: value as number };
      case "estimation":
        return isPositive
          ? { field: "estimation", operator: "gte", value: value as number }
          : { field: "estimation", operator: "lt", value: value as number };
      case "areaPath":
        return { field: "areaPath", operator: "contains", value: value as string };
      default:
        return { field: "tags", operator: "contains", value: "" };
    }
  }

  /**
   * Augment merged tasks with learned conditions.
   * Multiple conditions for the same task are combined with OR.
   * Compound AND conditions take precedence over individual ones.
   */
  augmentMergedTasks(
    mergedTasks: MergedTask[],
    patterns: ConditionalTaskPattern[],
    confidenceThreshold = 0.7,
  ): MergedTask[] {
    // Group conditions by normalized task title
    const conditionsByTask = new Map<string, Condition[]>();
    for (const pattern of patterns) {
      if (pattern.confidence < confidenceThreshold) continue;
      const normalizedTitle = this.patternDetector.normalizeTitle(
        pattern.taskCanonicalTitle,
      );
      const existing = conditionsByTask.get(normalizedTitle) ?? [];
      existing.push(pattern.condition);
      conditionsByTask.set(normalizedTitle, existing);
    }

    return mergedTasks.map((mt) => {
      const normalized = this.patternDetector.normalizeTitle(mt.task.title);

      let conditions: Condition[] = [];
      for (const [titleKey, taskConditions] of conditionsByTask) {
        if (
          this.patternDetector.calculateSimilarity(normalized, titleKey) >= 0.6
        ) {
          conditions = [...conditions, ...taskConditions];
        }
      }

      if (conditions.length === 0) return mt;

      // Prefer compound (all) patterns; fall back to combining individuals with any
      const compoundConditions = conditions.filter((c) => "all" in c);
      const individualConditions = conditions.filter((c) => !("all" in c));
      const pool = compoundConditions.length > 0 ? compoundConditions : individualConditions;
      const learnedCondition = pool.length === 1 ? (pool[0] as Condition) : { any: pool };

      return { ...mt, learnedCondition };
    });
  }
}
