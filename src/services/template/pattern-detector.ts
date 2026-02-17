import { ConditionPatternDetector } from "./condition-pattern-detector";
import { DependencyDetector } from "./dependency-detector";
import { FilterLearner } from "./filter-learner";
import { SimilarityCalculator } from "./similarity-calculator";
import type {
  CommonTaskPattern,
  EstimationPattern,
  PatternDetectionResult,
  StoryAnalysis,
} from "./story-learner.types";
import { TagPatternDetector } from "./tag-pattern-detector";

/**
 * Detects common patterns across multiple story analyses.
 * Groups similar tasks, computes activity distributions,
 * and identifies estimation patterns.
 *
 * Extends SimilarityCalculator for text similarity and clustering utilities.
 */
export class PatternDetector extends SimilarityCalculator {
  private dependencyDetector = new DependencyDetector();
  private tagPatternDetector = new TagPatternDetector();
  private conditionPatternDetector = new ConditionPatternDetector();
  private filterLearner = new FilterLearner();

  detect(analyses: StoryAnalysis[]): PatternDetectionResult {
    if (analyses.length === 0) {
      return {
        commonTasks: [],
        activityDistribution: {},
        averageTaskCount: 0,
        taskCountStdDev: 0,
        estimationPattern: {
          detectedStyle: "mixed",
          averageTotalEstimation: 0,
          isConsistent: false,
        },
        dependencyPatterns: [],
        conditionalPatterns: [],
        learnedFilters: {},
        tagDistribution: {},
      };
    }
    let commonTasks = this.findCommonTasks(analyses);
    const dependencyPatterns = this.dependencyDetector.detect(
      analyses,
      commonTasks,
    );
    commonTasks = this.dependencyDetector.augmentCommonTasks(
      commonTasks,
      dependencyPatterns,
    );
    const avgPositions = this.dependencyDetector.calculateAveragePositions(
      analyses,
      commonTasks,
    );
    commonTasks = commonTasks.map((task) => ({
      ...task,
      averagePosition: avgPositions.get(task.canonicalTitle),
    }));
    const tagPatternMap = this.tagPatternDetector.detectTaskTagPatterns(
      analyses,
      commonTasks,
    );
    commonTasks = this.tagPatternDetector.augmentCommonTasks(
      commonTasks,
      tagPatternMap,
    );
    const conditionalPatterns = this.conditionPatternDetector.detect(
      analyses,
      commonTasks,
    );
    const learnedFilters = this.filterLearner.learn(analyses);
    const tagDistribution =
      this.tagPatternDetector.calculateTagDistribution(analyses);
    const activityDistribution = this.calculateActivityDistribution(analyses);
    const { average, stdDev } = this.calculateTaskCountStats(analyses);
    const estimationPattern = this.detectEstimationPattern(analyses);

    return {
      commonTasks,
      activityDistribution,
      averageTaskCount: average,
      taskCountStdDev: stdDev,
      estimationPattern,
      dependencyPatterns,
      conditionalPatterns,
      learnedFilters,
      tagDistribution,
    };
  }

  private findCommonTasks(analyses: StoryAnalysis[]): CommonTaskPattern[] {
    const totalStories = analyses.length;

    const allTasks: Array<{
      normalizedTitle: string;
      originalTitle: string;
      estimationPercent: number;
      activity: string;
      storyId: string;
    }> = [];

    for (const analysis of analyses) {
      for (const taskDef of analysis.template.tasks) {
        const normalized = this.normalizeTitle(taskDef.title);
        allTasks.push({
          normalizedTitle: normalized,
          originalTitle: taskDef.title,
          estimationPercent: taskDef.estimationPercent ?? 0,
          activity: taskDef.activity ?? "Development",
          storyId: analysis.story.id,
        });
      }
    }

    //  complete-linkage clustering (order-independent)
    const groups = this.clusterItems(
      allTasks,
      (task) => task.normalizedTitle,
      0.6,
    );
    return groups.map((group) => {
      const titleCounts = new Map<string, number>();
      const activityCounts = new Map<string, number>();
      const storyIds = new Set<string>();
      const estimations: number[] = [];

      for (const task of group) {
        titleCounts.set(
          task.originalTitle,
          (titleCounts.get(task.originalTitle) ?? 0) + 1,
        );
        activityCounts.set(
          task.activity,
          (activityCounts.get(task.activity) ?? 0) + 1,
        );
        storyIds.add(task.storyId);
        estimations.push(task.estimationPercent);
      }

      // Pick canonical title (most frequent, longest if tied)
      let canonicalTitle = group[0]?.originalTitle ?? "";
      let maxCount = 0;
      for (const [title, count] of titleCounts) {
        if (
          count > maxCount ||
          (count === maxCount && title.length > canonicalTitle.length)
        ) {
          canonicalTitle = title;
          maxCount = count;
        }
      }

      let activity = "Development";
      let maxActivityCount = 0;
      for (const [act, count] of activityCounts) {
        if (count > maxActivityCount) {
          activity = act;
          maxActivityCount = count;
        }
      }

      const avgEstimation =
        estimations.length > 0
          ? estimations.reduce((a, b) => a + b, 0) / estimations.length
          : 0;

      return {
        canonicalTitle,
        titleVariants: [...new Set(group.map((t) => t.originalTitle))],
        frequency: storyIds.size,
        frequencyRatio: storyIds.size / totalStories,
        averageEstimationPercent: Math.round(avgEstimation * 100) / 100,
        estimationStdDev: this.stdDev(estimations),
        activity,
      };
    });
  }

  private calculateActivityDistribution(
    analyses: StoryAnalysis[],
  ): Record<string, number> {
    const counts = new Map<string, number>();
    let total = 0;

    for (const analysis of analyses) {
      for (const task of analysis.template.tasks) {
        const activity = task.activity ?? "Development";
        counts.set(activity, (counts.get(activity) ?? 0) + 1);
        total++;
      }
    }

    const distribution: Record<string, number> = {};
    for (const [activity, count] of counts) {
      distribution[activity] = Math.round((count / total) * 100 * 100) / 100;
    }
    return distribution;
  }

  private detectEstimationPattern(
    analyses: StoryAnalysis[],
  ): EstimationPattern {
    const totalEstimations: number[] = [];
    const styles: string[] = [];

    for (const analysis of analyses) {
      const storyEstimation = analysis.story.estimation ?? 0;
      totalEstimations.push(storyEstimation);

      if (storyEstimation > 0) {
        const taskEstimations = analysis.tasks
          .map((t) => t.estimation ?? 0)
          .filter((e) => e > 0);

        if (taskEstimations.length === 0) {
          styles.push("percentage");
          continue;
        }

        const sum = taskEstimations.reduce((a, b) => a + b, 0);
        const allSmall = taskEstimations.every((e) => e <= 1);
        const sumNearOne = Math.abs(sum - 1) < 0.1;
        const fibLike = new Set([1, 2, 3, 5, 8, 13, 21, 34]);
        const allFib = taskEstimations.every((e) => fibLike.has(e));

        if (allSmall && sumNearOne) {
          styles.push("percentage");
        } else if (allFib) {
          styles.push("points");
        } else {
          styles.push("hours");
        }
      }
    }

    const uniqueStyles = [...new Set(styles)];
    const detectedStyle =
      uniqueStyles.length === 1
        ? (uniqueStyles[0] as EstimationPattern["detectedStyle"])
        : "mixed";

    const avgTotal =
      totalEstimations.length > 0
        ? totalEstimations.reduce((a, b) => a + b, 0) / totalEstimations.length
        : 0;

    return {
      detectedStyle,
      averageTotalEstimation: Math.round(avgTotal * 100) / 100,
      isConsistent: uniqueStyles.length <= 1,
    };
  }

  private calculateTaskCountStats(analyses: StoryAnalysis[]): {
    average: number;
    stdDev: number;
  } {
    const counts = analyses.map((a) => a.tasks.length);
    const average =
      counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
    return {
      average: Math.round(average * 100) / 100,
      stdDev: this.stdDev(counts),
    };
  }

  private stdDev(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.round(Math.sqrt(variance) * 100) / 100;
  }
}
