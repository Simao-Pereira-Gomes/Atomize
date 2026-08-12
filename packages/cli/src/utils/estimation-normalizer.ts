import { logger } from "@config/logger";
import {
  normalizeEstimationPercentages as normalize,
  type EstimationPercentage,
  type NormalizationOptions,
} from "@sppg2001/atomize-schema";

/**
 * Interface for objects that have estimationPercent property
 */
export type { EstimationPercentage, NormalizationOptions };

/**
 * Options for normalization behavior
 */
export interface CliNormalizationOptions extends NormalizationOptions { enableLogging?: boolean; }

/**
 * Normalize estimation percentages to sum to 100%
 *
 * This utility ensures that a set of tasks with estimation percentages
 * sum to exactly 100%, which is important when:
 * - Creating templates via the wizard
 * - Tasks are filtered out due to conditions not being met
 *
 * @param items - Array of items with estimationPercent property
 * @param options - Normalization options
 * @returns true if normalization was performed, false if skipped
 */
export function normalizeEstimationPercentages<T extends EstimationPercentage>(
  items: T[],
  options: CliNormalizationOptions = {}
): boolean {
  const {
    enableLogging = true,
    ...sharedOptions
  } = options;
  const result = normalize(items, sharedOptions);
  if (enableLogging && result) logger.debug("Normalized estimation percentages");
  return result;
}
