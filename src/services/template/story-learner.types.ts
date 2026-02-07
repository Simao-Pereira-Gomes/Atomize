import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { TaskDefinition, TaskTemplate } from "@templates/schema";

/** Options for learning from one or many stories */
export interface LearnOptions {
  normalizePercentages: boolean;
  /** How to handle estimation values: auto-detect, hours, points, or percentage */
  estimationStyle?: "auto" | "hours" | "points" | "percentage";
}

/** The result of analyzing a single story */
export interface StoryAnalysis {
  story: WorkItem;
  tasks: WorkItem[];
  template: TaskTemplate;
  warnings: string[];
}

/** A story that was skipped during multi-story learning */
export interface SkippedStory {
  storyId: string;
  reason: string;
}

/** Aggregate result of learning from multiple stories */
export interface MultiStoryLearningResult {
  analyses: StoryAnalysis[];
  skipped: SkippedStory[];
  mergedTemplate: TaskTemplate;
  patterns: PatternDetectionResult;
  confidence: ConfidenceScore;
  suggestions: TemplateSuggestion[];
  variations: TemplateVariation[];
  outliers: Outlier[];
}

/** Pattern detection results across multiple stories */
export interface PatternDetectionResult {
  commonTasks: CommonTaskPattern[];
  activityDistribution: Record<string, number>;
  averageTaskCount: number;
  taskCountStdDev: number;
  estimationPattern: EstimationPattern;
}

/** A task pattern found across multiple stories */
export interface CommonTaskPattern {
  canonicalTitle: string;
  titleVariants: string[];
  frequency: number;
  frequencyRatio: number;
  averageEstimationPercent: number;
  estimationStdDev: number;
  activity: string;
}

/** Detected estimation style across stories */
export interface EstimationPattern {
  detectedStyle: "percentage" | "hours" | "points" | "mixed";
  averageTotalEstimation: number;
  isConsistent: boolean;
}

/** Confidence score for a learned template */
export interface ConfidenceScore {
  overall: number;
  factors: ConfidenceFactor[];
  level: "high" | "medium" | "low";
}

/** Individual factor contributing to confidence */
export interface ConfidenceFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
}

/** An actionable suggestion for template improvement */
export interface TemplateSuggestion {
  type:
    | "add-task"
    | "remove-task"
    | "adjust-estimation"
    | "add-dependency"
    | "improve-naming";
  message: string;
  taskId?: string;
  severity: "info" | "warning" | "important";
}

/** A task merged from multiple stories */
export interface MergedTask {
  task: TaskDefinition;
  sources: Array<{ storyId: string; taskTitle: string }>;
  similarity: number;
}

/** An outlier detected during analysis */
export interface Outlier {
  type: "estimation" | "task-count" | "missing-task" | "extra-task";
  storyId: string;
  message: string;
  value: number;
  expectedRange: [number, number];
  severity: number;
}

/** A template variation generated from the story set */
export interface TemplateVariation {
  name: string;
  description: string;
  template: TaskTemplate;
  confidence: ConfidenceScore;
}
