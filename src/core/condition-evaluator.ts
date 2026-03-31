import { logger } from "../config/logger.js";
import type { WorkItem } from "../platforms/interfaces/work-item.interface.js";
import type { Condition, ConditionOperator } from "../templates/schema.js";

/**
 * Extracts all ADO custom field reference names (e.g. "Custom.ClientTier") from a
 * structured Condition by recursively traversing compound clauses.
 */
export function extractCustomFieldRefs(condition: Condition): string[] {
  const refs: string[] = [];

  function traverse(cond: Condition): void {
    if ("customField" in cond) {
      if (!refs.includes(cond.customField)) refs.push(cond.customField);
    } else if ("all" in cond) {
      cond.all.forEach(traverse);
    } else if ("any" in cond) {
      cond.any.forEach(traverse);
    }
  }

  traverse(condition);
  return refs;
}

/**
 * Evaluates structured task conditions against a parent work item (story).
 */
export class ConditionEvaluator {
  /**
   * Evaluates a structured condition against a work item.
   * @returns true if the condition passes (or condition is absent), false otherwise.
   */
  public evaluateCondition(
    condition: Condition | undefined | null,
    story: WorkItem,
  ): boolean {
    if (!condition) return true;

    try {
      return this.evaluate(condition, story);
    } catch (error) {
      logger.error(
        `Error evaluating condition: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private evaluate(condition: Condition, story: WorkItem): boolean {
    if ("all" in condition) {
      return condition.all.every((c) => this.evaluate(c, story));
    }
    if ("any" in condition) {
      return condition.any.some((c) => this.evaluate(c, story));
    }
    if ("customField" in condition) {
      const fieldValue = story.customFields?.[condition.customField];
      return this.applyOperator(fieldValue, condition.operator, condition.value);
    }
    const fieldValue = this.resolveField(condition.field, story);
    return this.applyOperator(fieldValue, condition.operator, condition.value);
  }

  /**
   * Resolves a dot-notation field path against a story (e.g. "tags", "customFields.Foo").
   */
  private resolveField(field: string, story: WorkItem): unknown {
    const parts = field.split(".");
    let value: unknown = story;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      if (typeof value === "object" && part in (value as object)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  private applyOperator(
    fieldValue: unknown,
    operator: ConditionOperator,
    compareValue: string | number | boolean,
  ): boolean {
    switch (operator) {
      case "equals":
        return this.compareEquals(fieldValue, compareValue);
      case "not-equals":
        return !this.compareEquals(fieldValue, compareValue);
      case "contains":
        return this.compareContains(fieldValue, compareValue);
      case "not-contains":
        return !this.compareContains(fieldValue, compareValue);
      case "gt":
        return this.compareNumeric(fieldValue, compareValue, (a, b) => a > b);
      case "lt":
        return this.compareNumeric(fieldValue, compareValue, (a, b) => a < b);
      case "gte":
        return this.compareNumeric(fieldValue, compareValue, (a, b) => a >= b);
      case "lte":
        return this.compareNumeric(fieldValue, compareValue, (a, b) => a <= b);
    }
  }

  private compareEquals(
    left: unknown,
    right: string | number | boolean,
  ): boolean {
    if (left === null || left === undefined) return false;
    if (Array.isArray(left)) {
      return left.some(
        (item) => String(item).toLowerCase() === String(right).toLowerCase(),
      );
    }
    if (typeof left === "boolean") {
      return left === (right === true || right === "true");
    }
    if (typeof left === "number" || typeof right === "number") {
      return Number(left) === Number(right);
    }
    return String(left).toLowerCase() === String(right).toLowerCase();
  }

  private compareContains(
    left: unknown,
    right: string | number | boolean,
  ): boolean {
    if (left === null || left === undefined) return false;
    const target = String(right).toLowerCase();
    if (Array.isArray(left)) {
      return left.some((item) => String(item).toLowerCase().includes(target));
    }
    return String(left).toLowerCase().includes(target);
  }

  private compareNumeric(
    left: unknown,
    right: string | number | boolean,
    compare: (a: number, b: number) => boolean,
  ): boolean {
    const a = Number(left);
    const b = Number(right);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      logger.warn(`Non-numeric values in numeric comparison: "${left}" vs "${right}"`);
      return false;
    }
    return compare(a, b);
  }
}
