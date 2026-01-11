import { logger } from "../config/logger.js";
import type { WorkItem } from "../platforms/interfaces/work-item.interface.js";

/**
 * Evaluates conditional expressions for task conditions
 * Supports: ${variable}, CONTAINS, NOT CONTAINS, ==, !=, >, <, >=, <=, AND, OR
 */
export class ConditionEvaluator {
  /**
   * Evaluates a condition string against a work item (story)
   * @param condition - The condition string (e.g., '${story.tags} CONTAINS "backend"' or '${story.tags} NOT CONTAINS "frontend"')
   * @param story - The work item to evaluate against
   * @returns true if condition passes, false otherwise
   */
  public evaluateCondition(condition: string, story: WorkItem): boolean {
    if (!condition || condition.trim() === "") {
      return true; // Empty conditions always pass
    }

    try {
      let normalizedCondition = condition.trim();
      if (
        (normalizedCondition.startsWith('"') && normalizedCondition.endsWith('"')) ||
        (normalizedCondition.startsWith("'") && normalizedCondition.endsWith("'"))
      ) {
        normalizedCondition = normalizedCondition.slice(1, -1);
      }

      const interpolated = this.interpolateVariables(normalizedCondition, story);
      logger.debug(`Evaluating condition: "${condition}" => "${interpolated}"`);
      const result = this.evaluateExpression(interpolated);

      logger.debug(`Condition result: ${result}`);

      return result;
    } catch (error) {
      logger.error(
        `Error evaluating condition "${condition}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false; // Fail-safe: invalid conditions evaluate to false
    }
  }

  /**
   * Interpolates ${...} variables in the condition string
   */
  private interpolateVariables(condition: string, story: WorkItem): string {
    return condition.replace(/\$\{([^}]+)\}/g, (_match, path) => {
      const value = this.resolveVariablePath(path.trim(), story);
      const stringValue = this.valueToString(value);
      if (stringValue === "") {
        return '""';
      }
      return stringValue;
    });
  }

  /**
   * Resolves a variable path like "story.tags" or "story.customFields.component"
   */
  private resolveVariablePath(path: string, story: WorkItem): unknown {
    const normalizedPath = path.replace(/^story\./, "");
    const parts = normalizedPath.split(".");
    let value: unknown = story;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      if (typeof value === "object" && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Converts a value to a string representation for comparison
   */
  private valueToString(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "";
      }
      return value.join(",");
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Evaluates an expression with operators (AND, OR, CONTAINS, ==, etc.)
   */
  private evaluateExpression(expression: string): boolean {
    // Handle logical operators (AND, OR) - process from left to right
    // Split by OR first (lower precedence)
    if (expression.includes(" OR ")) {
      const parts = this.splitByOperator(expression, " OR ");
      return parts.some((part) => this.evaluateExpression(part.trim()));
    }

    // Split by AND (higher precedence)
    if (expression.includes(" AND ")) {
      const parts = this.splitByOperator(expression, " AND ");
      return parts.every((part) => this.evaluateExpression(part.trim()));
    }

    // Evaluate single comparison
    return this.evaluateComparison(expression);
  }

  /**
   * Splits expression by operator, respecting quoted strings
   */
  private splitByOperator(expression: string, operator: string): string[] {
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";

    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];

      if ((char === '"' || char === "'") && expression[i - 1] !== "\\") {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
        }
      }

      if (
        !inQuotes &&
        expression.substring(i, i + operator.length) === operator
      ) {
        parts.push(current);
        current = "";
        i += operator.length - 1;
      } else {
        current += char;
      }
    }

    parts.push(current);
    return parts;
  }

  /**
   * Evaluates a single comparison (CONTAINS, NOT CONTAINS, ==, !=, >, <, >=, <=)
   */
  private evaluateComparison(expression: string): boolean {
    expression = expression.trim();

    // Check each operator (check NOT CONTAINS before CONTAINS to avoid false matches)
    if (expression.includes(" NOT CONTAINS ")) {
      return this.evaluateNotContains(expression);
    }
    if (expression.includes(" CONTAINS ")) {
      return this.evaluateContains(expression);
    }
    // Check for operators with flexible spacing (==, !=, >=, <=, >, <)
    // Match operators with at least one space on either side or no spaces at all
    if (/\s*==\s*/.test(expression) && expression.includes("==")) {
      return this.evaluateEquals(expression, "==");
    }
    if (/\s*!=\s*/.test(expression) && expression.includes("!=")) {
      return this.evaluateEquals(expression, "!=");
    }
    if (/\s*>=\s*/.test(expression) && expression.includes(">=")) {
      return this.evaluateNumericComparison(expression, ">=");
    }
    if (/\s*<=\s*/.test(expression) && expression.includes("<=")) {
      return this.evaluateNumericComparison(expression, "<=");
    }
    if (/\s*>\s*/.test(expression) && expression.includes(">") && !expression.includes(">=")) {
      return this.evaluateNumericComparison(expression, ">");
    }
    if (/\s*<\s*/.test(expression) && expression.includes("<") && !expression.includes("<=")) {
      return this.evaluateNumericComparison(expression, "<");
    }

    // If no operator, check truthiness
    return this.evaluateTruthiness(expression);
  }

  /**
   * Evaluates CONTAINS operator
   */
  private evaluateContains(expression: string): boolean {
    const parts = expression.split(" CONTAINS ");
    if (parts.length < 2 || !parts[0] || !parts[1]) return false;

    const leftValue = this.unquote(parts[0].trim()).toLowerCase();
    const rightValue = this.unquote(parts[1].trim()).toLowerCase();

    // If left side is empty, it can't contain anything
    if (leftValue === "") {
      return false;
    }

    return leftValue.includes(rightValue);
  }

  /**
   * Evaluates NOT CONTAINS operator
   */
  private evaluateNotContains(expression: string): boolean {
    const parts = expression.split(" NOT CONTAINS ");
    if (parts.length < 2 || !parts[0] || !parts[1]) return false;

    const leftValue = this.unquote(parts[0].trim()).toLowerCase();
    const rightValue = this.unquote(parts[1].trim()).toLowerCase();

    // If left side is empty, it doesn't contain anything (so NOT CONTAINS is true)
    if (leftValue === "") {
      return true;
    }

    return !leftValue.includes(rightValue);
  }

  /**
   * Evaluates == or != operator
   */
  private evaluateEquals(expression: string, operator: "==" | "!="): boolean {
    const regex = new RegExp(`\\s*${operator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`);
    const parts = expression.split(regex);
    if (parts.length < 2 || !parts[0] || !parts[1]) return false;

    const leftValue = this.unquote(parts[0].trim());
    const rightValue = this.unquote(parts[1].trim());
    const isEqual = leftValue === rightValue;
    return operator === "==" ? isEqual : !isEqual;
  }

  /**
   * Evaluates numeric comparisons (>, <, >=, <=)
   */
  private evaluateNumericComparison(
    expression: string,
    operator: ">" | "<" | ">=" | "<="
  ): boolean {
    const regex = new RegExp(`\\s*${operator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`);
    const parts = expression.split(regex);
    if (parts.length < 2 || !parts[0] || !parts[1]) return false;

    const leftValue = Number.parseFloat(this.unquote(parts[0].trim()));
    const rightValue = Number.parseFloat(this.unquote(parts[1].trim()));

    if (Number.isNaN(leftValue) || Number.isNaN(rightValue)) {
      logger.warn(
        `Non-numeric values in comparison: "${parts[0]}" ${operator} "${parts[1]}"`
      );
      return false;
    }

    switch (operator) {
      case ">":
        return leftValue > rightValue;
      case "<":
        return leftValue < rightValue;
      case ">=":
        return leftValue >= rightValue;
      case "<=":
        return leftValue <= rightValue;
    }
  }

  /**
   * Evaluates truthiness of a value
   */
  private evaluateTruthiness(value: string): boolean {
    const unquoted = this.unquote(value).toLowerCase();

    if (unquoted === "true") return true;
    if (unquoted === "false") return false;
    if (unquoted === "") return false;
    if (unquoted === "0") return false;
    if (unquoted === "null") return false;
    if (unquoted === "undefined") return false;

    return true;
  }

  /**
   * Removes surrounding quotes from a string
   */
  private unquote(str: string): string {
    str = str.trim();
    if (
      (str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))
    ) {
      return str.slice(1, -1);
    }
    return str;
  }
}
