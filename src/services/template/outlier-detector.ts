import { PatternDetector } from "./pattern-detector";
import type {
  Outlier,
  PatternDetectionResult,
  StoryAnalysis,
} from "./story-learner.types";

/**
 * Detects outliers across multiple story analyses using Modified Z-Score with MAD.
 * Flags anomalous estimation values, task counts, missing common tasks,
 * and extra tasks unique to individual stories.
 */
export class OutlierDetector {
  private detector = new PatternDetector();
  private readonly zThreshold = 3.5;
  private readonly commonTaskThreshold = 0.8; // Tasks in >=80% of stories are "common"
  private readonly rareTaskThreshold = 0.2; // Tasks in <20% of stories are "rare"
  private readonly madToStdDev = 0.6745; // For converting MAD to standard deviation equivalent

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

  /**
   * Calculate Median Absolute Deviation (MAD).
   * MAD is more robust to outliers than standard deviation.
   */
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

  /**
   * Calculate Modified Z-Score using MAD.
   */
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

    // If MAD is 0, all values are identical (no outliers)
    if (mad === 0) return [];

    const outliers: Outlier[] = [];

    for (const e of estimations) {
      const zScore = this.modifiedZScore(e.estimation, median, mad);
      const absZ = Math.abs(zScore);

      if (absZ > this.zThreshold) {
        // Calculate expected range based on z-threshold
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

    // If MAD is 0, all values are identical (no outliers)
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
            this.detector.calculateSimilarity(title, normalizedCanonical) >=
            0.5,
        );

        if (!hasMatch) {
          //(higher frequency = higher severity when missing)
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

      //(lower frequency = higher severity for extra tasks)
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
