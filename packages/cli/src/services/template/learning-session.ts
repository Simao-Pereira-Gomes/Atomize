import { ConfidenceScorer, OutlierDetector } from "./confidence-analysis";
import {
  ConditionPatternDetector,
  DEFAULT_PATTERN_SCORING_CONFIG,
  DependencyDetector,
  FilterLearner,
  PatternDetector,
  type PatternScoringConfig,
  SimilarityCalculator,
  TagPatternDetector,
} from "./pattern-detection";
import type {
  ConfidenceScore,
  MergedTask,
  Outlier,
  PatternDetectionResult,
  StoryAnalysis,
} from "./story-learner.types";
import { TaskMerger } from "./task-merger";

export interface LearningSessionResult {
  patterns: PatternDetectionResult;
  mergedTasks: MergedTask[];
  confidence: ConfidenceScore;
  outliers: Outlier[];
}

/**
 * Owns the multi-story learning recipe once stories have been analyzed.
 *
 * Fetching source stories and shaping final template variants stay outside this
 * module; detector ordering and confidence/outlier policy live here.
 */
export class LearningSession {
  private readonly patternDetector: PatternDetector;
  private readonly taskMerger: TaskMerger;
  private readonly confidenceScorer: ConfidenceScorer;
  private readonly outlierDetector: OutlierDetector;

  constructor(overrides: {
    scoringConfig?: Partial<PatternScoringConfig>;
    patternDetector?: PatternDetector;
    taskMerger?: TaskMerger;
    confidenceScorer?: ConfidenceScorer;
    outlierDetector?: OutlierDetector;
  } = {}) {
    const config: PatternScoringConfig = { ...DEFAULT_PATTERN_SCORING_CONFIG, ...overrides.scoringConfig };

    const dependencyDetector = new DependencyDetector(config);
    const tagPatternDetector = new TagPatternDetector(config);
    const conditionPatternDetector = new ConditionPatternDetector(config);

    const patternDetector = overrides.patternDetector ?? new PatternDetector(
      dependencyDetector,
      tagPatternDetector,
      conditionPatternDetector,
      new FilterLearner(),
      config,
    );
    this.patternDetector = patternDetector;
    this.taskMerger = overrides.taskMerger ?? new TaskMerger(
      new SimilarityCalculator(config),
      dependencyDetector,
      tagPatternDetector,
      conditionPatternDetector,
      config,
    );
    this.confidenceScorer = overrides.confidenceScorer ?? new ConfidenceScorer();
    this.outlierDetector = overrides.outlierDetector ?? new OutlierDetector(patternDetector);
  }

  run(analyses: StoryAnalysis[]): LearningSessionResult {
    const patterns = this.patternDetector.detect(analyses);
    const mergedTasks = this.taskMerger.merge(analyses, patterns);
    const confidence = this.confidenceScorer.score(
      analyses,
      patterns,
      mergedTasks,
    );
    const outliers = this.outlierDetector.detect(analyses, patterns);

    return {
      patterns,
      mergedTasks,
      confidence,
      outliers,
    };
  }
}
