import type { TaskDefinition } from "../templates/schema";
import {
  type EstimationPercentage,
  normalizeEstimationPercentages,
} from "../utils/estimation-normalizer";

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
  const shouldNormalize =
    mode === "always"
      ? totalBefore !== 100
      : mode === "never"
        ? false
        : totalBefore < 100 || (totalBefore > 100 && options.forceNormalize === true);
  const normalized =
    shouldNormalize
      ? normalizeEstimationPercentages(tasks, {
          skipIfAlreadyNormalized: false,
          enableLogging: options.enableLogging ?? true,
        })
      : false;

  return {
    totalBefore,
    totalAfter: totalEstimationPercent(tasks),
    normalized,
  };
}

export function normalizeLearnedTaskPercentages<T extends EstimationPercentage>(
  tasks: T[],
): EstimationDistributionResult {
  const totalBefore = totalEstimationPercent(tasks);
  const normalized = normalizeEstimationPercentages(tasks, {
    enableLogging: false,
  });

  return {
    totalBefore,
    totalAfter: totalEstimationPercent(tasks),
    normalized,
  };
}

export function totalEstimationPercent(tasks: EstimationPercentage[]): number {
  return tasks.reduce((sum, task) => sum + (task.estimationPercent ?? 0), 0);
}

export function totalUnconditionalEstimationPercent(
  tasks: Array<Pick<TaskDefinition, "condition" | "estimationPercent">>,
): number {
  return tasks
    .filter((task) => !task.condition)
    .reduce((sum, task) => sum + (task.estimationPercent ?? 0), 0);
}

export function shouldOfferOverageNormalization(
  tasks: EstimationPercentage[],
): { shouldOffer: boolean; total: number } {
  const total = totalEstimationPercent(tasks);
  return { shouldOffer: total > 100, total };
}
