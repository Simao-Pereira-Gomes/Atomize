import type { StoryEstimate } from "../platforms/interfaces/work-item.interface";
import type { EstimationConversion } from "../templates/schema";
import { numericStoryEstimate } from "./estimation-field-mapping";

/** One learned-from Story: its raw Story Estimate and the Task Estimates of its child Tasks. */
export interface EstimationSample {
  storyEstimate?: StoryEstimate;
  taskEstimates: Array<number | undefined>;
}

export interface LearnedEstimation {
  /** Absent when no sample is usable, or when Task totals already match Story Estimates one-to-one. */
  conversion?: EstimationConversion;
  /** The most common Story Estimate among usable samples. */
  defaultStoryEstimate?: StoryEstimate;
  /** Table keys learned from a single Story, whose amount is a guess from one example. */
  lowConfidenceValues: string[];
}

/**
 * Each Task's share (0-100) of its own Story's total Task Estimate. Independent of units,
 * unlike dividing Task hours by Story points.
 */
export function taskEstimateShares(taskEstimates: Array<number | undefined>): number[] {
  const total = taskEstimates.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (total <= 0) return taskEstimates.map(() => 0);
  return taskEstimates.map((value) => Math.round(((value ?? 0) / total) * 100));
}

/**
 * Infers how a team's Story Estimates translate into Task totals: a table (median total per
 * value) for non-numeric estimates, or a median factor for numeric ones.
 */
export function inferEstimation(samples: EstimationSample[]): LearnedEstimation {
  const usable = samples
    .map((sample) => ({ estimate: sample.storyEstimate, total: sum(sample.taskEstimates) }))
    .filter((s): s is { estimate: StoryEstimate; total: number } => s.estimate !== undefined && s.total > 0);

  if (usable.length === 0) return { lowConfidenceValues: [] };

  const defaultStoryEstimate = mostCommon(usable.map((s) => s.estimate));
  const allNumeric = usable.every((s) => numericStoryEstimate(s.estimate) !== undefined);

  if (allNumeric) {
    const ratios = usable
      .map((s) => ({ points: numericStoryEstimate(s.estimate) ?? 0, total: s.total }))
      .filter((s) => s.points > 0)
      .map((s) => s.total / s.points);
    if (ratios.length === 0) return { defaultStoryEstimate, lowConfidenceValues: [] };
    const factor = roundTo(median(ratios), 2);
    return {
      ...(factor !== 1 ? { conversion: { factor } } : {}),
      defaultStoryEstimate,
      lowConfidenceValues: [],
    };
  }

  const totalsByValue = new Map<string, number[]>();
  for (const s of usable) {
    const key = String(s.estimate).trim();
    totalsByValue.set(key, [...(totalsByValue.get(key) ?? []), s.total]);
  }
  const table: Record<string, number> = {};
  const lowConfidenceValues: string[] = [];
  for (const [key, totals] of totalsByValue) {
    table[key] = roundTo(median(totals), 2);
    if (totals.length === 1) lowConfidenceValues.push(key);
  }
  return { conversion: { table }, defaultStoryEstimate, lowConfidenceValues };
}

function sum(values: Array<number | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
