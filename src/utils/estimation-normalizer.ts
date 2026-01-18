import { logger } from "@config/logger";

/**
 * Interface for objects that have estimationPercent property
 */
export interface EstimationPercentage {
  estimationPercent?: number;
}

/**
 * Options for normalization behavior
 */
export interface NormalizationOptions {
  /**
   * Whether to skip normalization if total is already close to 100%
   * Default: true
   */
  skipIfAlreadyNormalized?: boolean;

  /**
   * Tolerance for considering total as "already normalized"
   * Default: 0.01 (within 0.01% of 100)
   */
  tolerance?: number;

  /**
   * Whether to log debug information
   * Default: true
   */
  enableLogging?: boolean;
}

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
  options: NormalizationOptions = {}
): boolean {
  const {
    skipIfAlreadyNormalized = true,
    tolerance = 0.01,
    enableLogging = true,
  } = options;

  if (items.length === 0) {
    return false;
  }

  // Single item gets 100%
  if (items.length === 1) {
    const [item] = items;
    if (item) {
      item.estimationPercent = 100;
    }
    return true;
  }

  const total = items.reduce(
    (sum, item) => sum + (item.estimationPercent || 0),
    0
  );

  // If total is already 100 or close to it (within tolerance), skip normalization
  if (skipIfAlreadyNormalized && Math.abs(total - 100) < tolerance) {
    if (enableLogging) {
      logger.debug(
        `Skipping normalization: total ${total}% is already close to 100%`
      );
    }
    return false;
  }

  // If total is greater than 100, skip normalization (user explicitly set higher values)
  if (skipIfAlreadyNormalized && total > 100) {
    if (enableLogging) {
      logger.debug(
        `Skipping normalization: total ${total}% is greater than 100%`
      );
    }
    return false;
  }

  if (enableLogging) {
    logger.debug(
      `Normalizing estimation percentages: current total ${total}% -> 100%`
    );
  }

  // If total is zero, distribute equally
  if (total === 0 || Number.isNaN(total)) {
    distributeEqually(items);
    if (enableLogging) {
      logger.debug("Distributed equally among all items");
    }
    return true;
  }

  // Scale to 100%
  scaleToHundred(items, total);

  // Verify normalization
  const finalTotal = items.reduce(
    (s, t) => s + (t.estimationPercent || 0),
    0
  );

  if (enableLogging) {
    logger.debug(`Normalization complete: final total ${finalTotal}%`);
  }

  return true;
}

/**
 * Distribute estimation equally among items
 */
function distributeEqually<T extends EstimationPercentage>(items: T[]): void {
  const basePercent = Math.floor(100 / items.length);
  const remainder = 100 - basePercent * items.length;

  items.forEach((item, index) => {
    item.estimationPercent =
      index === 0 ? basePercent + remainder : basePercent;
  });
}

/**
 * Scale item estimations to sum to 100%
 */
function scaleToHundred<T extends EstimationPercentage>(
  items: T[],
  currentTotal: number
): void {
  const scale = 100 / currentTotal;
  let sum = 0;

  items.forEach((item, index) => {
    if (index === items.length - 1) {
      // Last item gets the remainder to ensure exactly 100%
      item.estimationPercent = 100 - sum;
    } else {
      const scaled = Math.round((item.estimationPercent || 0) * scale);
      item.estimationPercent = scaled;
      sum += scaled;
    }
  });
}

/**
 * Validate that estimation percentages sum to approximately 100%
 *
 * @param items - Array of items with estimationPercent property
 * @param tolerance - Tolerance for considering total as valid (default: 0.5)
 * @returns validation result with warnings if any
 */
export function validateEstimationPercentages<T extends EstimationPercentage>(
  items: T[],
  tolerance = 0.5
): { valid: boolean; total: number; warnings: string[]; suggestions: string[] } {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const total = items.reduce(
    (sum, item) => sum + (item.estimationPercent || 0),
    0
  );

  if (Math.abs(total - 100) > tolerance) {
    const diff = 100 - total;
    warnings.push(
      `Total estimation percentage (${total}%) differs from 100% by more than ${tolerance}%`
    );

    if (diff > 0) {
      suggestions.push(
        `Add ${diff.toFixed(1)}% to existing tasks or create new tasks totaling ${diff.toFixed(1)}%. You can also use normalizeEstimationPercentages() to automatically adjust.`
      );
    } else {
      suggestions.push(
        `Reduce task estimations by ${Math.abs(diff).toFixed(1)}% or use normalizeEstimationPercentages() to automatically scale down.`
      );
    }
  }

  const zeroEstimations = items.filter((t) => (t.estimationPercent || 0) === 0);
  if (zeroEstimations.length > 0) {
    warnings.push(
      `${zeroEstimations.length} item(s) have zero estimation percentage`
    );
    suggestions.push(
      `Assign estimation percentages to these items or remove them if not needed. Consider using equal distribution: ${(100 / items.length).toFixed(1)}% per task.`
    );
  }

  return {
    valid: warnings.length === 0,
    total,
    warnings,
    suggestions,
  };
}
