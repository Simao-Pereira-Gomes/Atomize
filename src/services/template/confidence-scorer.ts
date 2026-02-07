import type {
  ConfidenceFactor,
  ConfidenceScore,
  MergedTask,
  PatternDetectionResult,
  StoryAnalysis,
} from "./story-learner.types";

/**
 * Scores confidence in a learned template using information-theoretic approaches:
 * - Sample size with dynamic weight adjustment
 * - Common-task-ratio for task consistency
 * - Cosine similarity of estimation distributions
 * - Composite merge ratio + similarity for merge quality
 */
export class ConfidenceScorer {
  score(
    analyses: StoryAnalysis[],
    patterns: PatternDetectionResult,
    mergedTasks: MergedTask[],
  ): ConfidenceScore {
    const factors: ConfidenceFactor[] = [
      this.scoreSampleSize(analyses.length),
      this.scoreTaskConsistency(analyses, patterns),
      this.scoreEstimationConsistency(analyses),
      this.scoreMergeQuality(mergedTasks, analyses),
      this.scoreEstimationCoverage(analyses),
    ];

    return this.calculateOverall(factors, analyses.length);
  }

  private scoreSampleSize(count: number): ConfidenceFactor {
    let score: number;
    if (count <= 0) {
      score = 0;
    } else if (count === 1) {
      score = 20;
    } else if (count === 2) {
      score = 40;
    } else if (count === 3) {
      score = 60;
    } else if (count === 4) {
      score = 75;
    } else {
      score = Math.min(90, 75 + (count - 4) * 5);
    }

    return {
      name: "Sample Size",
      score,
      weight: 0.25,
      description: `Based on ${count} ${count === 1 ? "story" : "stories"} analyzed`,
    };
  }

  /**
   * Score task consistency using common-task-ratio instead of coefficient of variation.
   * Measures how many tasks appear in >50% of stories relative to average tasks per story.
   */
  private scoreTaskConsistency(
    analyses: StoryAnalysis[],
    patterns: PatternDetectionResult,
  ): ConfidenceFactor {
    const totalTasks = analyses.reduce((sum, a) => sum + a.tasks.length, 0);
    if (totalTasks === 0) {
      return {
        name: "Task Consistency",
        score: 0,
        weight: 0.3,
        description: "No tasks to analyze",
      };
    }

    const commonCount = patterns.commonTasks.filter(
      (t) => t.frequencyRatio > 0.5,
    ).length;

    const avgTasksPerStory = totalTasks / analyses.length;
    const ratio = avgTasksPerStory > 0 ? commonCount / avgTasksPerStory : 0;
    const score = Math.round(Math.min(100, ratio * 100));

    return {
      name: "Task Consistency",
      score,
      weight: 0.3,
      description: `${commonCount} common tasks of ~${Math.round(avgTasksPerStory)} avg per story`,
    };
  }

  /**
   * Score estimation consistency using cosine similarity of estimation distributions.
   * Bins estimations by 10% increments and compares vectors across stories.
   */
  private scoreEstimationConsistency(
    analyses: StoryAnalysis[],
  ): ConfidenceFactor {
    if (analyses.length < 2) {
      return {
        name: "Estimation Consistency",
        score: 50,
        weight: 0.2,
        description: "Insufficient stories for comparison",
      };
    }

    // Build estimation vectors (binned by 10%)
    const vectors = analyses.map((a) => {
      const bins = new Array(10).fill(0); // 0-10%, 10-20%, ..., 90-100%
      for (const task of a.template.tasks) {
        const estimation = task.estimationPercent ?? 0;
        const binIdx = Math.min(9, Math.floor(estimation / 10));
        bins[binIdx]++;
      }
      return bins;
    });

    // Pairwise cosine similarities
    let totalSim = 0;
    let pairCount = 0;

    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const vecI = vectors[i];
        const vecJ = vectors[j];
        if (vecI && vecJ) {
          totalSim += this.cosineSimilarity(vecI, vecJ);
          pairCount++;
        }
      }
    }

    const avgSim = pairCount > 0 ? totalSim / pairCount : 0;
    const score = Math.round(avgSim * 100);

    return {
      name: "Estimation Consistency",
      score,
      weight: 0.2,
      description: `Estimation distribution similarity: ${score}%`,
    };
  }

  /**
   * Cosine similarity between two numeric vectors.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0,
      magA = 0,
      magB = 0;
    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dot += aVal * bVal;
      magA += aVal * aVal;
      magB += bVal * bVal;
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Score merge quality using composite of merge ratio and average similarity.
   * High merging + high similarity = high quality.
   */
  private scoreMergeQuality(
    mergedTasks: MergedTask[],
    analyses: StoryAnalysis[],
  ): ConfidenceFactor {
    if (mergedTasks.length === 0) {
      return {
        name: "Merge Quality",
        score: 0,
        weight: 0.15,
        description: "No tasks to merge",
      };
    }

    const totalOriginalTasks = analyses.reduce(
      (sum, a) => sum + a.tasks.length,
      0,
    );

    // Merge ratio: how much consolidation happened (0 = no merging, 1 = full merging)
    const mergeRatio =
      totalOriginalTasks > 0 ? 1 - mergedTasks.length / totalOriginalTasks : 0;

    // Average similarity within merged groups
    const avgSimilarity =
      mergedTasks.reduce((sum, m) => sum + m.similarity, 0) /
      mergedTasks.length;

    // Composite: high merging + high similarity = high quality
    const compositeScore = mergeRatio * 0.6 + avgSimilarity * 0.4;
    const score = Math.round(compositeScore * 100);

    return {
      name: "Merge Quality",
      score,
      weight: 0.15,
      description: `Merge ratio ${Math.round(mergeRatio * 100)}%, similarity ${Math.round(avgSimilarity * 100)}%`,
    };
  }

  private scoreEstimationCoverage(analyses: StoryAnalysis[]): ConfidenceFactor {
    let totalTasks = 0;
    let tasksWithEstimation = 0;

    for (const analysis of analyses) {
      for (const task of analysis.template.tasks) {
        totalTasks++;
        if ((task.estimationPercent ?? 0) > 0) {
          tasksWithEstimation++;
        }
      }
    }

    const coverage = totalTasks > 0 ? tasksWithEstimation / totalTasks : 0;
    const score = Math.round(coverage * 100);

    return {
      name: "Estimation Coverage",
      score,
      weight: 0.1,
      description: `${tasksWithEstimation}/${totalTasks} tasks have estimation values`,
    };
  }

  /**
   * Calculate overall confidence with dynamic weight adjustment for small samples.
   * Instead of a hardcoded multiplier, we add extra weight to the sample size factor
   * when the sample count is low, effectively penalizing overconfidence in other metrics.
   */
  private calculateOverall(
    factors: ConfidenceFactor[],
    sampleCount: number,
  ): ConfidenceScore {
    const baseScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

    // Dynamic extra weight on sample size factor for small samples
    const extraWeightMap: Record<number, number> = {
      1: 0.5, // +50% weight
      2: 0.25, // +25% weight
      3: 0.1, // +10% weight
      4: 0.05, // +5% weight
    };

    const extraWeight = extraWeightMap[Math.min(sampleCount, 4)] ?? 0;
    const sampleSizeFactor = factors.find((f) => f.name === "Sample Size");

    let overall: number;
    if (sampleSizeFactor && extraWeight > 0) {
      // Reduce overall by gap between 100 and sample size score, weighted by extra
      const penalty = (100 - sampleSizeFactor.score) * extraWeight;
      overall = Math.max(0, Math.round(baseScore - penalty));
    } else {
      overall = Math.round(baseScore);
    }

    let level: ConfidenceScore["level"];
    if (overall >= 75) {
      level = "high";
    } else if (overall >= 45) {
      level = "medium";
    } else {
      level = "low";
    }

    return { overall, factors, level };
  }
}
