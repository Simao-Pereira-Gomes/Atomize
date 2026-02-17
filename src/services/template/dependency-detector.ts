import { SimilarityCalculator } from "./similarity-calculator";
import type {
  CommonTaskPattern,
  DependencyPattern,
  MergedTask,
  StoryAnalysis,
} from "./story-learner.types";

/**
 * Detects dependency patterns across multiple stories.
 * Analyzes both explicit predecessor links (from ADO) and positional ordering.
 */
export class DependencyDetector {
  private patternDetector = new SimilarityCalculator();
  private positionThreshold = 0.7;
  private explicitConfidenceBoost = 0.2;

  /**
   * Detect dependency patterns from multiple story analyses.
   * Combines explicit links (from ADO predecessor/successor) with positional ordering.
   */
  detect(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): DependencyPattern[] {
    if (analyses.length === 0 || commonTasks.length === 0) {
      return [];
    }

    const explicitDeps = this.detectExplicitDependencies(analyses, commonTasks);
    const positionalDeps = this.detectPositionalDependencies(
      analyses,
      commonTasks,
    );

    return this.mergePatterns(
      explicitDeps,
      positionalDeps,
      analyses.length,
      commonTasks,
    );
  }

  /**
   * Analyze explicit predecessor/successor links from work items.
   * Returns a map of (dependentTitle -> predecessorTitle -> count).
   */
  private detectExplicitDependencies(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): Map<string, Map<string, number>> {
    const deps = new Map<string, Map<string, number>>();

    for (const analysis of analyses) {
      const idToTitle = new Map<string, string>();
      for (const task of analysis.tasks) {
        const matched = this.matchToCommonTask(task.title, commonTasks);
        if (matched) {
          idToTitle.set(task.id, matched.canonicalTitle);
        }
      }

      for (const task of analysis.tasks) {
        if (!task.predecessorIds || task.predecessorIds.length === 0) continue;

        const dependentTitle = this.matchToCommonTask(
          task.title,
          commonTasks,
        )?.canonicalTitle;
        if (!dependentTitle) continue;

        for (const predId of task.predecessorIds) {
          const predecessorTitle = idToTitle.get(predId);
          if (!predecessorTitle) continue;

          // Don't create self-dependencies
          if (predecessorTitle === dependentTitle) continue;

          if (!deps.has(dependentTitle)) {
            deps.set(dependentTitle, new Map());
          }
          const predMap = deps.get(dependentTitle);
          if (predMap) {
            predMap.set(
              predecessorTitle,
              (predMap.get(predecessorTitle) ?? 0) + 1,
            );
          }
        }
      }
    }

    return deps;
  }

  /**
   * Analyze task ordering patterns (positional dependencies).
   * Detects when task A consistently appears before task B across stories.
   */
  private detectPositionalDependencies(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): Map<string, Map<string, { before: number; after: number }>> {
    const ordering = new Map<
      string,
      Map<string, { before: number; after: number }>
    >();

    for (const analysis of analyses) {
      const taskPositions: Array<{ title: string; position: number }> = [];

      for (let i = 0; i < analysis.template.tasks.length; i++) {
        const task = analysis.template.tasks[i];
        if (!task) continue;
        const matched = this.matchToCommonTask(task.title, commonTasks);
        if (matched) {
          taskPositions.push({
            title: matched.canonicalTitle,
            position: i,
          });
        }
      }

      for (let i = 0; i < taskPositions.length; i++) {
        for (let j = i + 1; j < taskPositions.length; j++) {
          const taskA = taskPositions[i];
          const taskB = taskPositions[j];
          if (!taskA || !taskB) continue;
          if (taskA.title === taskB.title) continue;

          if (!ordering.has(taskB.title)) {
            ordering.set(taskB.title, new Map());
          }
          const bMap = ordering.get(taskB.title);
          if (bMap) {
            const entry = bMap.get(taskA.title) ?? { before: 0, after: 0 };
            entry.before++;
            bMap.set(taskA.title, entry);
          }

          if (!ordering.has(taskA.title)) {
            ordering.set(taskA.title, new Map());
          }
          const aMap = ordering.get(taskA.title);
          if (aMap) {
            const entry = aMap.get(taskB.title) ?? { before: 0, after: 0 };
            entry.after++;
            aMap.set(taskB.title, entry);
          }
        }
      }
    }

    return ordering;
  }

  /**
   * Match a task title to a common task pattern using similarity.
   */
  matchToCommonTask(
    taskTitle: string,
    commonTasks: CommonTaskPattern[],
  ): CommonTaskPattern | undefined {
    const normalized = this.patternDetector.normalizeTitle(taskTitle);

    // First, try exact match on title variants
    for (const common of commonTasks) {
      if (common.titleVariants.includes(taskTitle)) {
        return common;
      }
    }

    // Fall back to similarity matching
    let bestMatch: CommonTaskPattern | undefined;
    let bestSim = 0;

    for (const common of commonTasks) {
      const commonNormalized = this.patternDetector.normalizeTitle(
        common.canonicalTitle,
      );
      const sim = this.patternDetector.calculateSimilarity(
        normalized,
        commonNormalized,
      );
      if (sim > bestSim && sim >= 0.6) {
        bestSim = sim;
        bestMatch = common;
      }
    }

    return bestMatch;
  }

  /**
   * Merge explicit and positional dependencies into final patterns.
   */
  private mergePatterns(
    explicitDeps: Map<string, Map<string, number>>,
    positionalDeps: Map<string, Map<string, { before: number; after: number }>>,
    totalStories: number,
    commonTasks: CommonTaskPattern[],
  ): DependencyPattern[] {
    const patterns: DependencyPattern[] = [];
    const processed = new Set<string>();

    // Process explicit dependencies first (higher confidence)
    for (const [dependent, predMap] of explicitDeps) {
      for (const [predecessor, count] of predMap) {
        const key = `${dependent}|${predecessor}`;
        processed.add(key);

        const frequencyRatio = count / totalStories;
        const confidence = Math.min(
          1,
          frequencyRatio + this.explicitConfidenceBoost,
        );

        if (frequencyRatio >= 0.3) {
          patterns.push({
            dependentTaskTitle: dependent,
            predecessorTaskTitle: predecessor,
            frequency: count,
            frequencyRatio,
            confidence,
            source: "explicit",
          });
        }
      }
    }

    // Process positional dependencies (only those not already explicit)
    for (const [dependent, predMap] of positionalDeps) {
      for (const [predecessor, counts] of predMap) {
        const key = `${dependent}|${predecessor}`;
        if (processed.has(key)) continue;

        const total = counts.before + counts.after;
        if (total === 0) continue;

        // Only consider if this task pair appears in multiple stories
        if (total < 2) continue;

        // Calculate consistency: how often does predecessor come before dependent?
        const consistency = counts.before / total;
        if (consistency < this.positionThreshold) continue;
        const dependentPattern = commonTasks.find(
          (t) => t.canonicalTitle === dependent,
        );
        const predecessorPattern = commonTasks.find(
          (t) => t.canonicalTitle === predecessor,
        );

        if (!dependentPattern || !predecessorPattern) continue;

        if (dependentPattern.frequencyRatio < 0.5) continue;
        if (predecessorPattern.frequencyRatio < 0.5) continue;

        const frequencyRatio = total / totalStories;
        const confidence = consistency * frequencyRatio;

        if (confidence >= 0.5) {
          patterns.push({
            dependentTaskTitle: dependent,
            predecessorTaskTitle: predecessor,
            frequency: counts.before,
            frequencyRatio,
            confidence,
            source: "positional",
          });
        }
      }
    }
    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Augment common tasks with dependency information.
   */
  augmentCommonTasks(
    commonTasks: CommonTaskPattern[],
    patterns: DependencyPattern[],
  ): CommonTaskPattern[] {
    const dependsOnMap = new Map<string, string[]>();
    const dependentsMap = new Map<string, string[]>();

    for (const pattern of patterns) {
      const deps = dependsOnMap.get(pattern.dependentTaskTitle) ?? [];
      if (!deps.includes(pattern.predecessorTaskTitle)) {
        deps.push(pattern.predecessorTaskTitle);
      }
      dependsOnMap.set(pattern.dependentTaskTitle, deps);
      const dependents = dependentsMap.get(pattern.predecessorTaskTitle) ?? [];
      if (!dependents.includes(pattern.dependentTaskTitle)) {
        dependents.push(pattern.dependentTaskTitle);
      }
      dependentsMap.set(pattern.predecessorTaskTitle, dependents);
    }
    return commonTasks.map((task) => ({
      ...task,
      dependsOn: dependsOnMap.get(task.canonicalTitle),
      dependents: dependentsMap.get(task.canonicalTitle),
    }));
  }

  /**
   * Generate dependsOn arrays for merged tasks based on detected patterns.
   * Converts canonical titles to task IDs.
   */
  generateDependsOn(
    mergedTasks: MergedTask[],
    patterns: DependencyPattern[],
    confidenceThreshold = 0.7,
  ): MergedTask[] {
    const titleToId = new Map<string, string>();
    for (const mt of mergedTasks) {
      if (mt.task.id) {
        const normalized = this.patternDetector.normalizeTitle(mt.task.title);
        titleToId.set(normalized, mt.task.id);
        titleToId.set(mt.task.title.toLowerCase(), mt.task.id);
      }
    }

    const highConfPatterns = patterns.filter(
      (p) => p.confidence >= confidenceThreshold,
    );

    const depsMap = new Map<string, string[]>();
    for (const pattern of highConfPatterns) {
      const normalizedDependent = this.patternDetector.normalizeTitle(
        pattern.dependentTaskTitle,
      );
      const normalizedPredecessor = this.patternDetector.normalizeTitle(
        pattern.predecessorTaskTitle,
      );

      const predecessorId =
        titleToId.get(normalizedPredecessor) ??
        titleToId.get(pattern.predecessorTaskTitle.toLowerCase());

      if (predecessorId) {
        const deps = depsMap.get(normalizedDependent) ?? [];
        if (!deps.includes(predecessorId)) {
          deps.push(predecessorId);
        }
        depsMap.set(normalizedDependent, deps);
      }
    }
    return mergedTasks.map((mt) => {
      const normalized = this.patternDetector.normalizeTitle(mt.task.title);
      const deps = depsMap.get(normalized);
      if (deps && deps.length > 0) {
        return {
          ...mt,
          learnedDependsOn: deps,
        };
      }
      return mt;
    });
  }

  /**
   * Calculate average position for tasks across stories.
   * Returns a map of canonical title -> average position (0-1).
   */
  calculateAveragePositions(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): Map<string, number> {
    const positions = new Map<string, number[]>();

    for (const analysis of analyses) {
      const taskCount = analysis.template.tasks.length;
      if (taskCount === 0) continue;

      for (let i = 0; i < taskCount; i++) {
        const task = analysis.template.tasks[i];
        if (!task) continue;

        const matched = this.matchToCommonTask(task.title, commonTasks);
        if (matched) {
          const posArr = positions.get(matched.canonicalTitle) ?? [];
          posArr.push(i / taskCount);
          positions.set(matched.canonicalTitle, posArr);
        }
      }
    }

    const avgPositions = new Map<string, number>();
    for (const [title, posArr] of positions) {
      if (posArr.length > 0) {
        const avg = posArr.reduce((a, b) => a + b, 0) / posArr.length;
        avgPositions.set(title, Math.round(avg * 100) / 100);
      }
    }

    return avgPositions;
  }
}
