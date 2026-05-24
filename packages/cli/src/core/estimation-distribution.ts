import type { TaskDefinition } from "@templates/schema";
import {
  type EstimationPercentage,
  normalizeEstimationPercentages,
} from "@utils/estimation-normalizer";

export interface EstimationDistributionOptions {
  forceNormalize?: boolean;
  enableLogging?: boolean;
}

export interface EstimationDistributionResult {
  totalBefore: number;
  totalAfter: number;
  normalized: boolean;
}

/**
 * Owns the runtime normalization policy for active task percentages.
 *
 * Totals under 100% are normalized to allocate the full parent estimate. Totals
 * over 100% are valid for multi-role templates and are only normalized when
 * the caller explicitly requests it.
 */
export function distributeActiveTaskPercentages<T extends EstimationPercentage>(
  tasks: T[],
  options: EstimationDistributionOptions = {},
): EstimationDistributionResult {
  const totalBefore = totalEstimationPercent(tasks);
  const normalized =
    totalBefore < 100 || (totalBefore > 100 && options.forceNormalize === true)
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
