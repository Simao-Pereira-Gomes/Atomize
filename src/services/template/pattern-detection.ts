import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { Condition, FilterCriteria } from "@templates/schema";
import { match } from "ts-pattern";
import type {
  CommonTaskPattern,
  ConditionalTaskPattern,
  DependencyPattern,
  EnhancedTagInfo,
  LearnedFilterCriteria,
  MergedTask,
  StoryAnalysis,
  TaskTagPattern,
  TemplateSuggestion,
} from "./story-learner.types";

// ─── Config ───────────────────────────────────────────────────────────────────

export interface PatternScoringConfig {
  bigramWeight: number;
  jaccardWeight: number;
  clusteringThreshold: number;
  mergingThreshold: number;
  dependsOnMinConfidence: number;
  conditionMinConfidence: number;
  dependencyMatchThreshold: number;
  dependencyExplicitBoost: number;
  tagCoreThreshold: number;
  tagOptionalThreshold: number;
  conditionPatternMinConfidence: number;
  conditionPatternMinSamples: number;
}

export const DEFAULT_PATTERN_SCORING_CONFIG: PatternScoringConfig = {
  bigramWeight: 0.6,
  jaccardWeight: 0.4,
  clusteringThreshold: 0.6,
  mergingThreshold: 0.45,
  dependsOnMinConfidence: 0.7,
  conditionMinConfidence: 0.75,
  dependencyMatchThreshold: 0.6,
  dependencyExplicitBoost: 0.2,
  tagCoreThreshold: 0.8,
  tagOptionalThreshold: 0.2,
  conditionPatternMinConfidence: 0.7,
  conditionPatternMinSamples: 3,
};

// ─── SimilarityCalculator ─────────────────────────────────────────────────────

export class SimilarityCalculator {
  private readonly bigramWeight: number;
  private readonly jaccardWeight: number;

  constructor(config: PatternScoringConfig = DEFAULT_PATTERN_SCORING_CONFIG) {
    this.bigramWeight = config.bigramWeight;
    this.jaccardWeight = config.jaccardWeight;
  }

  calculateSimilarity(a: string, b: string): number {
    return this.bigramWeight * this.bigramDice(a, b) + this.jaccardWeight * this.wordJaccard(a, b);
  }

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

  clusterItems<T>(
    items: T[],
    similarityFn: (a: T, b: T) => number,
    threshold: number,
  ): T[][] {
    if (items.length === 0) return [];
    const firstItem = items[0];
    if (items.length === 1 && firstItem) return [[firstItem]];
    const n = items.length;
    const simMatrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array<number>(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const rowI = simMatrix[i];
        const rowJ = simMatrix[j];
        const itemI = items[i];
        const itemJ = items[j];
        if (rowI && rowJ && itemI !== undefined && itemJ !== undefined) {
          if (i === j) {
            rowI[j] = 1;
          } else {
            const sim = similarityFn(itemI, itemJ);
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
      indices
        .map((idx) => items[idx])
        .filter((item): item is T => item !== undefined),
    );
  }

  normalizeTitle(title: string): string {
    return title
      .replace(/\$\{story\.(title|id|description)\}/g, "")
      .replace(/^(task|implement|create|build|design|test|fix)\s*:?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }
}

// ─── DependencyDetector ───────────────────────────────────────────────────────

export class DependencyDetector {
  private patternDetector: SimilarityCalculator;
  private readonly explicitConfidenceBoost: number;
  private readonly matchThreshold: number;

  constructor(config: PatternScoringConfig = DEFAULT_PATTERN_SCORING_CONFIG) {
    this.patternDetector = new SimilarityCalculator(config);
    this.explicitConfidenceBoost = config.dependencyExplicitBoost;
    this.matchThreshold = config.dependencyMatchThreshold;
  }

  detect(
    analyses: StoryAnalysis[],
    commonTasks: CommonTaskPattern[],
  ): DependencyPattern[] {
    if (analyses.length === 0 || commonTasks.length === 0) {
      return [];
    }

    const explicitDeps = this.detectExplicitDependencies(analyses, commonTasks);
    return this.mergePatterns(explicitDeps, analyses.length);
  }

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

  matchToCommonTask(
    taskTitle: string,
    commonTasks: CommonTaskPattern[],
  ): CommonTaskPattern | undefined {
    const normalized = this.patternDetector.normalizeTitle(taskTitle);

    for (const common of commonTasks) {
      if (common.titleVariants.includes(taskTitle)) {
        return common;
      }
    }

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
      if (sim > bestSim && sim >= this.matchThreshold) {
        bestSim = sim;
        bestMatch = common;
      }
    }

    return bestMatch;
  }

  private mergePatterns(
    explicitDeps: Map<string, Map<string, number>>,
    totalStories: number,
  ): DependencyPattern[] {
    const patterns: DependencyPattern[] = [];

    for (const [dependent, predMap] of explicitDeps) {
      for (const [predecessor, count] of predMap) {
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

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

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
        return { ...mt, learnedDependsOn: deps };
      }
      return mt;
    });
  }

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

// ─── TagPatternDetector ───────────────────────────────────────────────────────

export class TagPatternDetector {
  private patternDetector: SimilarityCalculator;
  private readonly coreThreshold: number;
  private readonly optionalThreshold: number;

  constructor(config: PatternScoringConfig = DEFAULT_PATTERN_SCORING_CONFIG) {
    this.patternDetector = new SimilarityCalculator(config);
    this.coreThreshold = config.tagCoreThreshold;
    this.optionalThreshold = config.tagOptionalThreshold;
  }

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

  private isMatchingTask(
    taskTitle: string,
    commonTask: CommonTaskPattern,
  ): boolean {
    if (commonTask.titleVariants.includes(taskTitle)) {
      return true;
    }

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

  private getClassification(
    frequencyRatio: number,
  ): "core" | "optional" | "rare" {
    if (frequencyRatio >= this.coreThreshold) return "core";
    if (frequencyRatio >= this.optionalThreshold) return "optional";
    return "rare";
  }

  private classifyTags(tagPatterns: TaskTagPattern[]): EnhancedTagInfo {
    const coreTags: string[] = [];
    const optionalTags: string[] = [];
    const rareTags: string[] = [];

    for (const pattern of tagPatterns) {
      switch (pattern.classification) {
        case "core": coreTags.push(pattern.tag); break;
        case "optional": optionalTags.push(pattern.tag); break;
        case "rare": rareTags.push(pattern.tag); break;
      }
    }

    return { coreTags, optionalTags, rareTags, tagPatterns };
  }

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

    if (totalTasks === 0) return {};

    const distribution: Record<string, number> = {};
    for (const [tag, count] of tagCounts) {
      distribution[tag] = Math.round((count / totalTasks) * 100 * 100) / 100;
    }

    return distribution;
  }

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

  mergeTagsWithFrequency(tagInfo: EnhancedTagInfo, coreOnly = false): string[] {
    if (coreOnly) return [...tagInfo.coreTags];
    return [...tagInfo.coreTags, ...tagInfo.optionalTags];
  }

  augmentCommonTasks(
    commonTasks: CommonTaskPattern[],
    tagPatternMap: Map<string, EnhancedTagInfo>,
  ): CommonTaskPattern[] {
    return commonTasks.map((task) => ({
      ...task,
      tagInfo: tagPatternMap.get(task.canonicalTitle),
    }));
  }

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

// ─── ConditionPatternDetector ─────────────────────────────────────────────────

export class ConditionPatternDetector {
  private patternDetector: SimilarityCalculator;
  private readonly minConfidence: number;
  private readonly minSampleSize: number;

  constructor(config: PatternScoringConfig = DEFAULT_PATTERN_SCORING_CONFIG) {
    this.patternDetector = new SimilarityCalculator(config);
    this.minConfidence = config.conditionPatternMinConfidence;
    this.minSampleSize = config.conditionPatternMinSamples;
  }

  private getAdjustedConfidence(sampleSize: number): number {
    return (
      this.minConfidence +
      Math.min((sampleSize - this.minSampleSize) * 0.003, 0.1)
    );
  }

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
    patterns.push(...this.detectPriorityConditions(analyses, commonTasks, threshold));
    patterns.push(...this.detectEstimationConditions(analyses, commonTasks, threshold));
    patterns.push(...this.detectAreaPathConditions(analyses, commonTasks, threshold));

    const compoundPatterns = this.detectCompoundConditions(
      analyses,
      patterns,
      commonTasks,
      threshold,
    );
    patterns.push(...compoundPatterns);

    return patterns;
  }

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

    if (highCorrelation > lowCorrelation + 0.3 && highCorrelation >= threshold) {
      return { confidence: highCorrelation, matchCount: taskInHighPriority, isHighPriority: true };
    }

    if (lowCorrelation > highCorrelation + 0.3 && lowCorrelation >= threshold) {
      return { confidence: lowCorrelation, matchCount: taskInLowPriority, isHighPriority: false };
    }

    return { confidence: 0, matchCount: 0, isHighPriority: true };
  }

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

    if (estimations.length < this.minSampleSize) return patterns;

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

    if (largeCorrelation > smallCorrelation + 0.3 && largeCorrelation >= threshold) {
      return { confidence: largeCorrelation, matchCount: taskInLargeStories, isLargeStory: true };
    }

    if (smallCorrelation > largeCorrelation + 0.3 && smallCorrelation >= threshold) {
      return { confidence: smallCorrelation, matchCount: taskInSmallStories, isLargeStory: false };
    }

    return { confidence: 0, matchCount: 0, isLargeStory: true };
  }

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
    if (areaPaths.size <= 1) return patterns;

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

    return { confidence: correlation, matchCount: taskInStoriesInPath };
  }

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
        this.patternDetector.calculateSimilarity(normalized, commonNormalized) >= 0.6
      ) {
        return true;
      }
    }
    return false;
  }

  private storyMatchesPattern(
    analysis: StoryAnalysis,
    pattern: ConditionalTaskPattern,
  ): boolean {
    return this.evaluateCondition(analysis.story, pattern.condition);
  }

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

  buildCondition(
    type: ConditionalTaskPattern["correlationType"],
    value: string | number,
    isPositive: boolean,
  ): Condition {
    return match(type)
      .with("tag", () =>
        isPositive
          ? { field: "tags", operator: "contains" as const, value: value as string }
          : { field: "tags", operator: "not-contains" as const, value: value as string },
      )
      .with("priority", () =>
        isPositive
          ? { field: "priority", operator: "lte" as const, value: value as number }
          : { field: "priority", operator: "gt" as const, value: value as number },
      )
      .with("estimation", () =>
        isPositive
          ? { field: "estimation", operator: "gte" as const, value: value as number }
          : { field: "estimation", operator: "lt" as const, value: value as number },
      )
      .with("areaPath", () => ({
        field: "areaPath",
        operator: "contains" as const,
        value: value as string,
      }))
      .with("compound", () => {
        throw new Error(`buildCondition called with correlationType "compound" — handle compound patterns before calling this method`);
      })
      .exhaustive();
  }

  augmentMergedTasks(
    mergedTasks: MergedTask[],
    patterns: ConditionalTaskPattern[],
    confidenceThreshold = 0.7,
  ): MergedTask[] {
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

      const compoundConditions = conditions.filter((c) => "all" in c);
      const individualConditions = conditions.filter((c) => !("all" in c));
      const pool = compoundConditions.length > 0 ? compoundConditions : individualConditions;
      const learnedCondition = pool.length === 1 ? (pool[0] as Condition) : { any: pool };

      return { ...mt, learnedCondition };
    });
  }
}

// ─── FilterLearner ────────────────────────────────────────────────────────────

export class FilterLearner {
  private minFrequencyRatio = 0.5;

  learn(analyses: StoryAnalysis[]): LearnedFilterCriteria {
    if (analyses.length === 0) return {};

    return {
      areaPaths: this.detectAreaPaths(analyses),
      priorityRange: this.detectPriorityRange(analyses),
      estimationRange: this.detectEstimationRange(analyses),
      commonStoryTags: this.detectCommonStoryTags(analyses),
    };
  }

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

    if (pathCounts.size === 0) return undefined;

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
      let mostCommonPath = "";
      let mostCommonCount = 0;
      for (const [path, count] of pathCounts) {
        if (count > mostCommonCount) {
          mostCommonPath = path;
          mostCommonCount = count;
        }
      }
      if (mostCommonPath) {
        return { values: [mostCommonPath], frequency: mostCommonCount };
      }
      return undefined;
    }

    return { values: commonPaths, frequency: maxFrequency };
  }

  private detectPriorityRange(
    analyses: StoryAnalysis[],
  ): LearnedFilterCriteria["priorityRange"] {
    const priorities = analyses
      .map((a) => a.story.priority)
      .filter((p): p is number => p !== undefined);

    if (priorities.length === 0) return undefined;

    const sorted = [...priorities].sort((a, b) => a - b);
    const min = sorted[0] ?? 1;
    const max = sorted[sorted.length - 1] ?? 5;

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

    return { min, max, mostCommon };
  }

  private detectEstimationRange(
    analyses: StoryAnalysis[],
  ): LearnedFilterCriteria["estimationRange"] {
    const estimations = analyses
      .map((a) => a.story.estimation)
      .filter((e): e is number => e !== undefined && e > 0);

    if (estimations.length === 0) return undefined;

    const sorted = [...estimations].sort((a, b) => a - b);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const average =
      Math.round(
        (estimations.reduce((a, b) => a + b, 0) / estimations.length) * 100,
      ) / 100;

    return { min, max, average };
  }

  private detectCommonStoryTags(
    analyses: StoryAnalysis[],
  ): LearnedFilterCriteria["commonStoryTags"] {
    const tagCounts = new Map<string, number>();

    for (const analysis of analyses) {
      for (const tag of analysis.story.tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    if (tagCounts.size === 0) return undefined;

    const tagArray: Array<{ tag: string; frequency: number; frequencyRatio: number }> = [];

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

  generateSuggestions(
    learnedFilters: LearnedFilterCriteria,
  ): TemplateSuggestion[] {
    const suggestions: TemplateSuggestion[] = [];

    if (learnedFilters.areaPaths && learnedFilters.areaPaths.values.length > 0) {
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

    if (learnedFilters.commonStoryTags && learnedFilters.commonStoryTags.length > 0) {
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

    if (learnedFilters.commonStoryTags && learnedFilters.commonStoryTags.length > 0) {
      const topTags = learnedFilters.commonStoryTags.slice(0, 5);
      parts.push(
        `Common tags: ${topTags.map((t) => `${t.tag} (${Math.round(t.frequencyRatio * 100)}%)`).join(", ")}`,
      );
    }

    return parts.length > 0 ? parts.join("\n") : "No filter criteria learned";
  }
}

// ─── PatternDetector ──────────────────────────────────────────────────────────

export class PatternDetector extends SimilarityCalculator {
  private dependencyDetector: DependencyDetector;
  private tagPatternDetector: TagPatternDetector;
  private conditionPatternDetector: ConditionPatternDetector;
  private filterLearner: FilterLearner;

  private readonly clusteringThreshold: number;

  constructor(
    dependencyDetector = new DependencyDetector(),
    tagPatternDetector = new TagPatternDetector(),
    conditionPatternDetector = new ConditionPatternDetector(),
    filterLearner = new FilterLearner(),
    config: PatternScoringConfig = DEFAULT_PATTERN_SCORING_CONFIG,
  ) {
    super(config);
    this.dependencyDetector = dependencyDetector;
    this.tagPatternDetector = tagPatternDetector;
    this.conditionPatternDetector = conditionPatternDetector;
    this.filterLearner = filterLearner;
    this.clusteringThreshold = config.clusteringThreshold;
  }

  detect(analyses: StoryAnalysis[]): import("./story-learner.types").PatternDetectionResult {
    if (analyses.length === 0) {
      return {
        commonTasks: [],
        activityDistribution: {},
        averageTaskCount: 0,
        taskCountStdDev: 0,
        estimationPattern: { averageTotalEstimation: 0 },
        dependencyPatterns: [],
        conditionalPatterns: [],
        learnedFilters: {},
        tagDistribution: {},
      };
    }
    let commonTasks = this.findCommonTasks(analyses);
    const dependencyPatterns = this.dependencyDetector.detect(analyses, commonTasks);
    commonTasks = this.dependencyDetector.augmentCommonTasks(commonTasks, dependencyPatterns);
    const avgPositions = this.dependencyDetector.calculateAveragePositions(analyses, commonTasks);
    commonTasks = commonTasks.map((task) => ({
      ...task,
      averagePosition: avgPositions.get(task.canonicalTitle),
    }));
    const tagPatternMap = this.tagPatternDetector.detectTaskTagPatterns(analyses, commonTasks);
    commonTasks = this.tagPatternDetector.augmentCommonTasks(commonTasks, tagPatternMap);
    const conditionalPatterns = this.conditionPatternDetector.detect(analyses, commonTasks);
    const learnedFilters = this.filterLearner.learn(analyses);
    const tagDistribution = this.tagPatternDetector.calculateTagDistribution(analyses);
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

    const groups = this.clusterItems(
      allTasks,
      (a, b) => {
        const titleSim = this.calculateSimilarity(
          a.normalizedTitle,
          b.normalizedTitle,
        );
        const activityBoost = a.activity === b.activity ? 0.15 : 0;
        return Math.min(1, titleSim + activityBoost);
      },
      this.clusteringThreshold,
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

      const modeEstimation = this.mostCommonValue(estimations);

      return {
        canonicalTitle,
        titleVariants: [...new Set(group.map((t) => t.originalTitle))],
        frequency: storyIds.size,
        frequencyRatio: storyIds.size / totalStories,
        averageEstimationPercent: Math.round(modeEstimation * 100) / 100,
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
  ): import("./story-learner.types").EstimationPattern {
    const totalEstimations: number[] = [];

    for (const analysis of analyses) {
      const storyEstimation = analysis.story.estimation ?? 0;
      totalEstimations.push(storyEstimation);
    }

    const avgTotal =
      totalEstimations.length > 0
        ? totalEstimations.reduce((a, b) => a + b, 0) / totalEstimations.length
        : 0;

    return {
      averageTotalEstimation: Math.round(avgTotal * 100) / 100,
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

  private mostCommonValue(values: number[]): number {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0] ?? 0;
    const counts = new Map<number, number>();
    for (const v of values) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let best = values[0] ?? 0;
    let bestCount = 0;
    for (const [v, c] of counts) {
      if (c > bestCount || (c === bestCount && v > best)) {
        best = v;
        bestCount = c;
      }
    }
    return best;
  }
}
