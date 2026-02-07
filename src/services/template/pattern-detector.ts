import type {
  CommonTaskPattern,
  EstimationPattern,
  PatternDetectionResult,
  StoryAnalysis,
} from "./story-learner.types";

/**
 * Detects common patterns across multiple story analyses.
 * Groups similar tasks, computes activity distributions,
 * and identifies estimation patterns.
 */
export class PatternDetector {
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
      };
    }

    const commonTasks = this.findCommonTasks(analyses);
    const activityDistribution = this.calculateActivityDistribution(analyses);
    const { average, stdDev } = this.calculateTaskCountStats(analyses);
    const estimationPattern = this.detectEstimationPattern(analyses);

    return {
      commonTasks,
      activityDistribution,
      averageTaskCount: average,
      taskCountStdDev: stdDev,
      estimationPattern,
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

  /**
   * Composite similarity combining bigram Dice coefficient and word Jaccard.
   * Bigram Dice captures partial word matches ("setup" vs "set-up"),
   * while word Jaccard preserves semantic chunking.
   */
  calculateSimilarity(a: string, b: string): number {
    return 0.6 * this.bigramDice(a, b) + 0.4 * this.wordJaccard(a, b);
  }

  /**
   * Bigram Dice coefficient for character-level similarity.
   * Uses overlapping character pairs (bigrams) for fuzzy matching.
   */
  bigramDice(a: string, b: string): number {
    const getBigrams = (s: string): Set<string> => {
      const normalized = s.toLowerCase().replace(/\s+/g, " ");
      const bigrams = new Set<string>();
      for (let i = 0; i < normalized.length - 1; i++) {
        bigrams.add(normalized.substring(i, i + 2));
      }
      return bigrams;
    };

    const bigramsA = getBigrams(a);
    const bigramsB = getBigrams(b);

    if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
    if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

    let intersection = 0;
    for (const bg of bigramsA) {
      if (bigramsB.has(bg)) intersection++;
    }

    return (2 * intersection) / (bigramsA.size + bigramsB.size);
  }

  /**
   * Jaccard similarity on word tokens.
   * Returns a value between 0 (no overlap) and 1 (identical token sets).
   */
  wordJaccard(a: string, b: string): number {
    const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
    const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection++;
    }

    const union = new Set([...tokensA, ...tokensB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Complete-linkage agglomerative clustering.
   * Groups items by similarity threshold using the minimum similarity between
   * any two items in different clusters.
   */
  clusterItems<T>(
    items: T[],
    keyFn: (item: T) => string,
    threshold: number,
  ): T[][] {
    if (items.length === 0) return [];
    const firstItem = items[0];
    if (items.length === 1 && firstItem) return [[firstItem]];
    const keys = items.map(keyFn);
    const n = keys.length;
    const simMatrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array<number>(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const rowI = simMatrix[i];
        const rowJ = simMatrix[j];
        const keyI = keys[i];
        const keyJ = keys[j];
        if (rowI && rowJ && keyI !== undefined && keyJ !== undefined) {
          if (i === j) {
            rowI[j] = 1;
          } else {
            const sim = this.calculateSimilarity(keyI, keyJ);
            rowI[j] = sim;
            rowJ[i] = sim;
          }
        }
      }
    }

    const clusters: number[][] = items.map((_, idx) => [idx]);
    while (clusters.length > 1) {
      let bestPair: [number, number] | null = null;
      let bestSim = -1;

      // Find pair with highest complete-linkage similarity
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const clusterI = clusters[i];
          const clusterJ = clusters[j];
          if (!clusterI || !clusterJ) continue;
          let minSim = 1;
          for (const idxA of clusterI) {
            for (const idxB of clusterJ) {
              minSim = Math.min(minSim, simMatrix[idxA]?.[idxB] ?? 0);
            }
          }
          if (minSim > bestSim) {
            bestSim = minSim;
            bestPair = [i, j];
          }
        }
      }

      if (bestSim < threshold || !bestPair) break;
      const [i, j] = bestPair;
      const clusterI = clusters[i];
      const clusterJ = clusters[j];
      if (clusterI && clusterJ) {
        clusters[i] = [...clusterI, ...clusterJ];
      }
      clusters.splice(j, 1);
    }

    return clusters.map((indices) =>
      indices.map((idx) => items[idx]).filter((item): item is T => item !== undefined)
    );
  }

  /**
   * Normalize a task title for comparison.
   * Strips template variables and common prefixes.
   */
  normalizeTitle(title: string): string {
    return title
      .replace(/\$\{story\.(title|id|description)\}/g, "")
      .replace(/^(task|implement|create|build|design|test|fix)\s*:?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  private stdDev(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.round(Math.sqrt(variance) * 100) / 100;
  }
}
