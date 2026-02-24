import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { TaskDefinition, TaskTemplate } from "@templates/schema";

/** Dependency pattern detected across stories */
export interface DependencyPattern {
  /** Task title of the dependent task (comes after) */
  dependentTaskTitle: string;

  /** Task title of the predecessor (comes before) */
  predecessorTaskTitle: string;

  /** Number of times this ordering was observed */
  frequency: number;

  /** Ratio of stories where this ordering held (0–1) */
  frequencyRatio: number;

  /** Confidence score (0–1) based on consistency */
  confidence: number;

  /** Source of detection */
  source: "explicit";
}

/** Tag frequency pattern for a task */
export interface TaskTagPattern {
  /** Tag name */
  tag: string;

  /** Number of times this tag appeared */
  frequency: number;

  /** Ratio across all instances of this task (0–1) */
  frequencyRatio: number;

  /** Classification based on frequency */
  classification: "core" | "optional" | "rare";
}

/** Enhanced tag information for a common task */
export interface EnhancedTagInfo {
  /** Tags appearing in ≥ 80% of instances */
  coreTags: string[];

  /** Tags appearing in 20–80% of instances */
  optionalTags: string[];

  /** Tags appearing in < 20% of instances */
  rareTags: string[];

  /** Full tag frequency breakdown */
  tagPatterns: TaskTagPattern[];
}

/** Conditional task correlation pattern */
export interface ConditionalTaskPattern {
  /** Canonical task title this condition applies to */
  taskCanonicalTitle: string;

  /** Generated condition expression */
  conditionExpression: string;

  /** Type of correlation detected */
  correlationType: "tag" | "priority" | "estimation" | "areaPath" | "compound";

  /** Value correlated with task presence */
  correlatedValue: string | number;

  /** Confidence score (0–1) */
  confidence: number;

  /** Number of stories matching this pattern */
  matchCount: number;

  /** Total number of stories analyzed */
  totalStories: number;

  /** Human-readable explanation */
  explanation: string;
}

/** Learned filter criteria from analyzed stories */
export interface LearnedFilterCriteria {
  /** Commonly observed area paths */
  areaPaths?: {
    values: string[];

    /** Number of stories containing these area paths */
    frequency: number;
  };

  /** Observed priority range */
  priorityRange?: {
    min: number;
    max: number;
    mostCommon: number;
  };

  /** Observed estimation range */
  estimationRange?: {
    min: number;
    max: number;
    average: number;
  };

  /** Common story-level tags */
  commonStoryTags?: Array<{
    tag: string;
    frequency: number;
    frequencyRatio: number;
  }>;
}

/** Options controlling template learning behavior */
export interface LearnOptions {
  /** Normalize estimations to percentages */
  normalizePercentages: boolean;
}

/** Result of analyzing a single story */
export interface StoryAnalysis {
  /** Source story */
  story: WorkItem;

  /** Tasks associated with the story */
  tasks: WorkItem[];

  /** Generated template from this story */
  template: TaskTemplate;

  /** Non-blocking analysis warnings */
  warnings: string[];
}

/** Story skipped during multi-story learning */
export interface SkippedStory {
  /** Story identifier */
  storyId: string;

  /** Reason for skipping */
  reason: string;
}

/** Aggregate result from multi-story learning */
export interface MultiStoryLearningResult {
  /** Individual story analyses */
  analyses: StoryAnalysis[];

  /** Stories excluded from analysis */
  skipped: SkippedStory[];

  /** Final merged template */
  mergedTemplate: TaskTemplate;

  /** Detected patterns across stories */
  patterns: PatternDetectionResult;

  /** Overall confidence score */
  confidence: ConfidenceScore;

  /** Actionable improvement suggestions */
  suggestions: TemplateSuggestion[];

  /** Generated template variations */
  variations: TemplateVariation[];

  /** Detected anomalies/outliers */
  outliers: Outlier[];
}

/** Pattern detection results across multiple stories */
export interface PatternDetectionResult {
  /** Tasks appearing across stories */
  commonTasks: CommonTaskPattern[];

  /** Distribution of activity types */
  activityDistribution: Record<string, number>;

  /** Mean number of tasks per story */
  averageTaskCount: number;

  /** Standard deviation of task counts */
  taskCountStdDev: number;

  /** Detected estimation characteristics */
  estimationPattern: EstimationPattern;

  /** Learned task dependencies */
  dependencyPatterns: DependencyPattern[];

  /** Learned conditional task presence rules */
  conditionalPatterns: ConditionalTaskPattern[];

  /** Learned filter criteria */
  learnedFilters: LearnedFilterCriteria;

  /** Tag frequency distribution */
  tagDistribution: Record<string, number>;
}

/** Task pattern observed across stories */
export interface CommonTaskPattern {
  /** Canonicalized task title */
  canonicalTitle: string;

  /** Observed title variations */
  titleVariants: string[];

  /** Number of occurrences */
  frequency: number;

  /** Occurrence ratio (0–1) */
  frequencyRatio: number;

  /** Mean estimation percentage */
  averageEstimationPercent: number;

  /** Estimation variability */
  estimationStdDev: number;

  /** Most common activity classification */
  activity: string;

  /** Learned tag classification */
  tagInfo?: EnhancedTagInfo;

  /** Learned predecessor tasks */
  dependsOn?: string[];

  /** Learned dependent tasks */
  dependents?: string[];

  /** Average relative position (0–1) */
  averagePosition?: number;
}

/** Estimation statistics across stories */
export interface EstimationPattern {
  /** Mean total estimation across analyzed stories */
  averageTotalEstimation: number;
}

/** Overall confidence score */
export interface ConfidenceScore {
  /** Aggregated confidence value (0–1) */
  overall: number;

  /** Individual contributing factors */
  factors: ConfidenceFactor[];

  /** Confidence classification */
  level: "high" | "medium" | "low";
}

/** Individual factor contributing to confidence */
export interface ConfidenceFactor {
  /** Factor name */
  name: string;

  /** Factor score (0–1) */
  score: number;

  /** Weight applied to factor */
  weight: number;

  /** Explanation of factor impact */
  description: string;
}

/** Actionable template improvement suggestion */
export interface TemplateSuggestion {
  /** Suggestion category */
  type:
    | "add-task"
    | "remove-task"
    | "adjust-estimation"
    | "add-dependency"
    | "add-condition"
    | "improve-naming"
    | "improve-filter";

  /** Human-readable recommendation */
  message: string;

  /** Related task (if applicable) */
  taskId?: string;

  /** Suggestion importance */
  severity: "info" | "warning" | "important";
}

/** Task merged from multiple stories */
export interface MergedTask {
  /** Final merged task definition */
  task: TaskDefinition;

  /** Source task references */
  sources: Array<{ storyId: string; taskTitle: string }>;

  /** Similarity score used during merge */
  similarity: number;

  /** Learned dependencies */
  learnedDependsOn?: string[];

  /** Learned tag classification */
  tagClassification?: EnhancedTagInfo;

  /** Learned conditional expression */
  learnedCondition?: string;
}

/** Anomaly detected during analysis */
export interface Outlier {
  /** Outlier classification */
  type: "estimation" | "task-count" | "missing-task" | "extra-task";

  /** Story identifier */
  storyId: string;

  /** Explanation of anomaly */
  message: string;

  /** Observed value */
  value: number;

  /** Expected value range */
  expectedRange: [number, number];

  /** Severity/impact score */
  severity: number;
}

/** Generated template variation */
export interface TemplateVariation {
  /** Variation name */
  name: string;

  /** Variation description */
  description: string;

  /** Template definition */
  template: TaskTemplate;

  /** Confidence score for this variation */
  confidence: ConfidenceScore;
}
