import { PatternDetector } from "./pattern-detection";
import type {
  ConfidenceFactor,
  ConfidenceScore,
  DependencyPattern,
  MergedTask,
  Outlier,
  PatternDetectionResult,
  StoryAnalysis,
} from "./story-learner.types";

// ─── ConfidenceScorer ─────────────────────────────────────────────────────────

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
      this.scoreDependencyConsistency(patterns.dependencyPatterns),
      this.scoreConditionQuality(patterns),
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
      weight: 0.2,
      description: `Based on ${count} ${count === 1 ? "story" : "stories"} analyzed`,
    };
  }

  private scoreTaskConsistency(
    analyses: StoryAnalysis[],
    patterns: PatternDetectionResult,
  ): ConfidenceFactor {
    const totalTasks = analyses.reduce((sum, a) => sum + a.tasks.length, 0);
    if (totalTasks === 0) {
      return {
        name: "Task Consistency",
        score: 0,
        weight: 0.25,
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
      weight: 0.25,
      description: `${commonCount} common tasks of ~${Math.round(avgTasksPerStory)} avg per story`,
    };
  }

  private scoreEstimationConsistency(
    analyses: StoryAnalysis[],
  ): ConfidenceFactor {
    if (analyses.length < 2) {
      return {
        name: "Estimation Consistency",
        score: 50,
        weight: 0.15,
        description: "Insufficient stories for comparison",
      };
    }

    const vectors = analyses.map((a) => {
      const bins = new Array(10).fill(0);
      for (const task of a.template.tasks) {
        const estimation = task.estimationPercent ?? 0;
        const binIdx = Math.min(9, Math.floor(estimation / 10));
        bins[binIdx]++;
      }
      return bins;
    });

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
      weight: 0.15,
      description: `Estimation distribution similarity: ${score}%`,
    };
  }

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

    const mergeRatio =
      totalOriginalTasks > 0 ? 1 - mergedTasks.length / totalOriginalTasks : 0;

    const avgSimilarity =
      mergedTasks.reduce((sum, m) => sum + m.similarity, 0) /
      mergedTasks.length;

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

  private scoreDependencyConsistency(
    dependencyPatterns: DependencyPattern[],
  ): ConfidenceFactor {
    if (dependencyPatterns.length === 0) {
      return {
        name: "Dependency Consistency",
        score: 50,
        weight: 0.1,
        description: "No dependency patterns detected",
      };
    }
    const avgConfidence =
      dependencyPatterns.reduce((sum, d) => sum + d.confidence, 0) /
      dependencyPatterns.length;
    const explicitCount = dependencyPatterns.filter(
      (d) => d.source === "explicit",
    ).length;
    const explicitRatio = explicitCount / dependencyPatterns.length;
    const explicitBonus = explicitRatio * 10;

    const score = Math.round(
      Math.min(100, avgConfidence * 100 + explicitBonus),
    );

    return {
      name: "Dependency Consistency",
      score,
      weight: 0.1,
      description: `${dependencyPatterns.length} patterns (${explicitCount} explicit), avg confidence ${Math.round(avgConfidence * 100)}%`,
    };
  }

  private scoreConditionQuality(
    patterns: PatternDetectionResult,
  ): ConfidenceFactor {
    const conditionalPatterns = patterns.conditionalPatterns;

    if (conditionalPatterns.length === 0) {
      return {
        name: "Condition Quality",
        score: 50,
        weight: 0.05,
        description: "No conditional patterns detected",
      };
    }

    const avgConfidence =
      conditionalPatterns.reduce((sum, c) => sum + c.confidence, 0) /
      conditionalPatterns.length;
    const avgCoverage =
      conditionalPatterns.reduce(
        (sum, c) =>
          sum + (c.totalStories > 0 ? c.matchCount / c.totalStories : 0),
        0,
      ) / conditionalPatterns.length;

    const score = Math.round(
      Math.min(100, avgConfidence * 70 + avgCoverage * 30),
    );

    return {
      name: "Condition Quality",
      score,
      weight: 0.05,
      description: `${conditionalPatterns.length} conditions, avg confidence ${Math.round(avgConfidence * 100)}%`,
    };
  }

  private calculateOverall(
    factors: ConfidenceFactor[],
    sampleCount: number,
  ): ConfidenceScore {
    const baseScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

    const extraWeightMap: Record<number, number> = {
      1: 0.5,
      2: 0.25,
      3: 0.1,
      4: 0.05,
    };

    const extraWeight = extraWeightMap[Math.min(sampleCount, 4)] ?? 0;
    const sampleSizeFactor = factors.find((f) => f.name === "Sample Size");

    let overall: number;
    if (sampleSizeFactor && extraWeight > 0) {
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

// ─── OutlierDetector ──────────────────────────────────────────────────────────

export class OutlierDetector {
  private detector: PatternDetector;
  private readonly zThreshold = 3.5;
  private readonly commonTaskThreshold = 0.8;
  private readonly rareTaskThreshold = 0.2;
  private readonly madToStdDev = 0.6745;

  constructor(detector = new PatternDetector()) {
    this.detector = detector;
  }

  detect(
    analyses: StoryAnalysis[],
    patterns: PatternDetectionResult,
  ): Outlier[] {
    if (analyses.length < 2) return [];

    const outliers: Outlier[] = [
      ...this.detectEstimationOutliers(analyses),
      ...this.detectTaskCountOutliers(analyses, patterns),
      ...this.detectMissingCommonTasks(analyses, patterns),
      ...this.detectExtraTasks(analyses, patterns),
    ];

    return outliers;
  }

  calculateMAD(values: number[]): { median: number; mad: number } {
    if (values.length === 0) return { median: 0, mad: 0 };

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const midIndex = Math.floor(n / 2);
    const median =
      n % 2 === 1
        ? (sorted[midIndex] ?? 0)
        : ((sorted[midIndex - 1] ?? 0) + (sorted[midIndex] ?? 0)) / 2;

    const deviations = values.map((v) => Math.abs(v - median));
    const sortedDev = [...deviations].sort((a, b) => a - b);
    const mad =
      n % 2 === 1
        ? (sortedDev[midIndex] ?? 0)
        : ((sortedDev[midIndex - 1] ?? 0) + (sortedDev[midIndex] ?? 0)) / 2;

    return { median, mad };
  }

  modifiedZScore(value: number, median: number, mad: number): number {
    if (mad === 0) return 0;
    return (this.madToStdDev * (value - median)) / mad;
  }

  private detectEstimationOutliers(analyses: StoryAnalysis[]): Outlier[] {
    const estimations = analyses
      .map((a) => ({
        storyId: a.story.id,
        estimation: a.story.estimation ?? 0,
      }))
      .filter((e) => e.estimation > 0);

    if (estimations.length < 2) return [];

    const values = estimations.map((e) => e.estimation);
    const { median, mad } = this.calculateMAD(values);

    if (mad === 0) return [];

    const outliers: Outlier[] = [];

    for (const e of estimations) {
      const zScore = this.modifiedZScore(e.estimation, median, mad);
      const absZ = Math.abs(zScore);

      if (absZ > this.zThreshold) {
        const expectedLower =
          median - (this.zThreshold * mad) / this.madToStdDev;
        const expectedUpper =
          median + (this.zThreshold * mad) / this.madToStdDev;

        outliers.push({
          type: "estimation" as const,
          storyId: e.storyId,
          message: `Story ${e.storyId} has estimation ${e.estimation} which is outside the expected range [${Math.round(Math.max(0, expectedLower) * 100) / 100}, ${Math.round(expectedUpper * 100) / 100}]`,
          value: e.estimation,
          expectedRange: [
            Math.round(Math.max(0, expectedLower) * 100) / 100,
            Math.round(expectedUpper * 100) / 100,
          ] as [number, number],
          severity: Math.round((absZ / this.zThreshold) * 100) / 100,
        });
      }
    }

    return outliers;
  }

  private detectTaskCountOutliers(
    analyses: StoryAnalysis[],
    _patterns: PatternDetectionResult,
  ): Outlier[] {
    const counts = analyses.map((a) => ({
      storyId: a.story.id,
      count: a.tasks.length,
    }));

    if (counts.length < 2) return [];

    const values = counts.map((c) => c.count);
    const { median, mad } = this.calculateMAD(values);

    if (mad === 0) return [];

    const outliers: Outlier[] = [];

    for (const c of counts) {
      const zScore = this.modifiedZScore(c.count, median, mad);
      const absZ = Math.abs(zScore);

      if (absZ > this.zThreshold) {
        const expectedLower =
          median - (this.zThreshold * mad) / this.madToStdDev;
        const expectedUpper =
          median + (this.zThreshold * mad) / this.madToStdDev;

        outliers.push({
          type: "task-count" as const,
          storyId: c.storyId,
          message: `Story ${c.storyId} has ${c.count} tasks which is outside the expected range [${Math.round(Math.max(0, expectedLower))}, ${Math.round(expectedUpper)}]`,
          value: c.count,
          expectedRange: [
            Math.round(Math.max(0, expectedLower)),
            Math.round(expectedUpper),
          ] as [number, number],
          severity: Math.round((absZ / this.zThreshold) * 100) / 100,
        });
      }
    }

    return outliers;
  }

  private detectMissingCommonTasks(
    analyses: StoryAnalysis[],
    patterns: PatternDetectionResult,
  ): Outlier[] {
    const commonTasks = patterns.commonTasks.filter(
      (t) => t.frequencyRatio >= this.commonTaskThreshold,
    );
    if (commonTasks.length === 0) return [];

    const outliers: Outlier[] = [];

    for (const analysis of analyses) {
      const taskTitles = analysis.template.tasks.map((t) =>
        this.detector.normalizeTitle(t.title),
      );

      for (const commonTask of commonTasks) {
        const normalizedCanonical = this.detector.normalizeTitle(
          commonTask.canonicalTitle,
        );
        const hasMatch = taskTitles.some(
          (title) =>
            this.detector.calculateSimilarity(title, normalizedCanonical) >= 0.5,
        );

        if (!hasMatch) {
          const severity = Math.round(commonTask.frequencyRatio * 100) / 100;

          outliers.push({
            type: "missing-task",
            storyId: analysis.story.id,
            message: `Story ${analysis.story.id} is missing common task "${commonTask.canonicalTitle}" (found in ${Math.round(commonTask.frequencyRatio * 100)}% of stories)`,
            value: 0,
            expectedRange: [1, 1],
            severity,
          });
        }
      }
    }

    return outliers;
  }

  private detectExtraTasks(
    analyses: StoryAnalysis[],
    patterns: PatternDetectionResult,
  ): Outlier[] {
    const rareTasks = patterns.commonTasks.filter(
      (t) => t.frequencyRatio < this.rareTaskThreshold && t.frequency === 1,
    );

    return rareTasks.map((task) => {
      const storyId =
        analyses.find((a) =>
          a.template.tasks.some(
            (t) =>
              t.title === task.canonicalTitle ||
              task.titleVariants.includes(t.title),
          ),
        )?.story.id ?? "unknown";

      const severity = Math.round((1 - task.frequencyRatio) * 100) / 100;

      return {
        type: "extra-task" as const,
        storyId,
        message: `Task "${task.canonicalTitle}" only appears in story ${storyId} and may be story-specific`,
        value: task.frequency,
        expectedRange: [2, analyses.length] as [number, number],
        severity,
      };
    });
  }
}
