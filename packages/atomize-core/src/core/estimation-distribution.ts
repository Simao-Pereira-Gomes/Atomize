import { copyCount, type TaskDefinition } from "../templates/schema";
import { distributeEstimationPercentages } from "@sppg2001/atomize-schema";
import type { EstimationPercentage } from "../utils/estimation-normalizer";
import { logger } from "../logger";

export interface EstimationDistributionOptions {
  forceNormalize?: boolean;
  enableLogging?: boolean;
  /** The Template's estimation.normalize; "always" and "never" override the auto policy and forceNormalize. */
  mode?: "auto" | "always" | "never";
}

export interface EstimationDistributionResult {
  totalBefore: number;
  totalAfter: number;
  normalized: boolean;
}

/**
 * Owns the runtime normalization policy for active task percentages.
 *
 * In the default "auto" mode, totals under 100% are normalized to allocate the full parent
 * estimate, and totals over 100% (valid for multi-role templates) are only normalized when the
 * caller explicitly requests it. A Template's estimation.normalize of "always" or "never"
 * replaces that policy.
 */
export function distributeActiveTaskPercentages<T extends EstimationPercentage>(
  tasks: T[],
  options: EstimationDistributionOptions = {},
): EstimationDistributionResult {
  const totalBefore = totalEstimationPercent(tasks);
  const mode = options.mode ?? "auto";
  const normalized = distributeEstimationPercentages(tasks, mode, options.forceNormalize);
  if (normalized && (options.enableLogging ?? true)) logger.debug("Normalized estimation percentages");

  return {
    totalBefore,
    totalAfter: totalEstimationPercent(tasks),
    normalized,
  };
}

export function totalEstimationPercent(tasks: EstimationPercentage[]): number {
  return tasks.reduce((sum, task) => sum + (task.estimationPercent ?? 0), 0);
}

/** The percent a Template's unconditional task definitions always allocate, counting each repeated copy. */
export function totalUnconditionalEstimationPercent(
  tasks: Array<Pick<TaskDefinition, "condition" | "estimationPercent" | "repeat">>,
): number {
  return tasks
    .filter((task) => !task.condition)
    .reduce((sum, task) => sum + (task.estimationPercent ?? 0) * copyCount(task), 0);
}

export function shouldOfferOverageNormalization(
  tasks: EstimationPercentage[],
): { shouldOffer: boolean; total: number } {
  const total = totalEstimationPercent(tasks);
  return { shouldOffer: total > 100, total };
}
