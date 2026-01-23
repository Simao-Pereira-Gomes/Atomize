import { TemplateValidationError } from "@utils/errors";
import type { ZodError } from "zod";
import type { $ZodIssue } from "zod/v4/core";
import { type TaskTemplate, TaskTemplateSchema, type ValidationMode } from "./schema";

export interface ValidationOptions {
  mode?: ValidationMode;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  mode: ValidationMode;
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
  suggestion?: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

export class TemplateValidator {
  validate(template: unknown, options?: ValidationOptions): ValidationResult {
    const parsed = TaskTemplateSchema.safeParse(template);

    const templateMode = parsed.success ? parsed.data.validation?.mode : undefined;
    const effectiveMode: ValidationMode = options?.mode ?? templateMode ?? "lenient";

    let errors: ValidationError[] = !parsed.success
      ? this.convertZodErrors(parsed.error)
      : [];
    let warnings: ValidationWarning[] = parsed.success
      ? this.collectWarnings(parsed.data)
      : [];

    // In strict mode, promote warnings to errors
    if (effectiveMode === "strict" && warnings.length > 0) {
      const promotedErrors = warnings.map((w) => this.warningToError(w));
      errors = [...errors, ...promotedErrors];
      warnings = [];
    }

    return { valid: errors.length === 0, errors, warnings, mode: effectiveMode };
  }

  private warningToError(warning: ValidationWarning): ValidationError {
    return {
      path: warning.path,
      message: warning.message,
      code: "STRICT_MODE_WARNING",
      suggestion: warning.suggestion,
    };
  }

  private collectWarnings(template: TaskTemplate): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const v = template.validation;
    const total = template.tasks.reduce(
      (sum, t) => sum + (t.estimationPercent ?? 0),
      0,
    );
    const hasStrictRule =
      v?.totalEstimationMustBe !== undefined ||
      v?.totalEstimationRange !== undefined;

    if (!hasStrictRule && total !== 100) {
      const diff = 100 - total;
      const suggestion =
        diff > 0
          ? `Add ${diff}% to existing tasks or create a new task with ${diff}% estimation.`
          : `Reduce task estimations by ${Math.abs(diff)}% to reach 100%.`;

      warnings.push({
        path: "tasks",
        message: `Total estimation is ${total}% (expected 100%).`,
        suggestion,
      });
    }
    this.validateTaskConditions(template, warnings);
    this.validateTaskDependencies(template, warnings);

    return warnings;
  }

  private validateTaskConditions(
    template: TaskTemplate,
    warnings: ValidationWarning[],
  ) {
    template.tasks.forEach((task, index) => {
      if (task.condition) {
        const hasVariable = task.condition.includes("${");
        const hasOperator = /AND|OR|==|!=|>|<|CONTAINS/.test(task.condition);
        if (!hasVariable && !hasOperator) {
          warnings.push({
            path: `tasks[${index}].condition`,
            message: `Condition "${task.condition}" might be invalid (no variables found)`,
            suggestion: `Use variables like \${story.tags} or operators like CONTAINS, ==, !=. Example: "\${story.tags} CONTAINS 'backend'"`,
          });
        }
      }
    });
  }

  private validateTaskDependencies(
    template: TaskTemplate,
    warnings: ValidationWarning[],
  ) {
    template.tasks.forEach((task, index) => {
      // Check if task has dependsOn but no id
      if (task.dependsOn && task.dependsOn.length > 0 && !task.id) {
        warnings.push({
          path: `tasks[${index}]`,
          message: `Task "${task.title}" has dependencies but no id field. Add an id to enable dependency linking.`,
          suggestion: `Add an 'id' field to this task, e.g., 'id: "${this.generateIdFromTitle(task.title)}"'`,
        });
      }

      // Check if task is referenced by others but has no id
      if (!task.id) {
        const referencingTasks = template.tasks.filter((t) =>
          t.dependsOn?.includes(task.title),
        );
        if (referencingTasks.length > 0) {
          const taskNames = referencingTasks
            .map((t) => `"${t.title}"`)
            .join(", ");
          warnings.push({
            path: `tasks[${index}]`,
            message: `Task "${task.title}" is referenced by other tasks but has no id field.`,
            suggestion: `Add 'id: "${this.generateIdFromTitle(task.title)}"' to this task. Referenced by: ${taskNames}`,
          });
        }
      }
    });
  }

  private generateIdFromTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 30);
  }

  private convertZodErrors(zodError: ZodError): ValidationError[] {
    return zodError.issues.map((err) => {
      const code =
        err.code === "custom" && typeof err.params?.code === "string"
          ? err.params.code
          : err.code;

      return {
        path: err.path.join("."),
        message: err.message,
        code,
        suggestion: this.getSuggestionForError(err, code),
      };
    });
  }

  private getSuggestionForError(
    err: $ZodIssue,
    code: string,
  ): string | undefined {
    const domainSuggestion = this.handleDomainError(err, code);
    if (domainSuggestion) return domainSuggestion;

    // Fallback to Zod schema validation errors
    return this.handleZodError(err);
  }

  /**
   * Handles custom application errors based on error codes and regex patterns.
   */
  private handleDomainError(err: $ZodIssue, code: string): string | undefined {
    switch (code) {
      case "INVALID_TOTAL_ESTIMATION":
        return this.handleNumericError(
          err.message,
          /is (\d+)%, but must be (\d+)%/,
          (current, required) => {
            const diff = required - current;
            return diff > 0
              ? `Add ${diff}% to existing tasks or create a new task with ${diff}% estimation.`
              : `Reduce task estimations by ${Math.abs(diff)}% to reach ${required}%.`;
          },
        );

      case "INVALID_ESTIMATION_RANGE":
        return this.handleNumericError(
          err.message,
          /is (\d+)%, but must be between (\d+)% and (\d+)%/,
          (current, min, max) => {
            if (current < min)
              return `Increase task estimations by ${min - current}% to meet the minimum of ${min}%.`;
            return `Reduce task estimations by ${current - max}% to stay within the maximum of ${max}%.`;
          },
        );

      case "TOO_FEW_TASKS":
        return this.handleNumericError(
          err.message,
          /has (\d+) tasks?, but minimum is (\d+)/,
          (current, required) =>
            `Add ${required - current} more task(s) to meet the minimum requirement of ${required} tasks.`,
        );

      case "TOO_MANY_TASKS":
        return this.handleNumericError(
          err.message,
          /has (\d+) tasks?, but maximum is (\d+)/,
          (current, max) =>
            `Remove ${current - max} task(s) or increase the maxTasks limit to ${current}.`,
        );

      case "INVALID_DEPENDENCY": {
        const match = err.message.match(/non-existent task ID: "([^"]+)"/);
        return match
          ? `Either add a task with id: "${match[1]}" or update the dependsOn field to reference an existing task ID.`
          : undefined;
      }

      case "CIRCULAR_DEPENDENCY": {
        const match = err.message.match(/Circular dependency detected: (.+)$/);
        if (match) {
          const cyclePath = match[1];
          return `Remove one of the dependencies in the cycle to break the loop: ${cyclePath}. Consider which task should logically come first.`;
        }
        return "Remove one of the dependencies in the cycle to break the circular reference.";
      }

      case "MISSING_REQUIRED_TASK": {
        const match = err.message.match(/title "([^"]+)"/);
        return match
          ? `Add a task with title "${match[1]}" to satisfy the required tasks constraint.`
          : "Add the missing required task to the template.";
      }

      case "MISSING_REQUIRED_CUSTOM_FIELD": {
        const match = err.message.match(/field "([^"]+)" is missing in task "([^"]+)"/);
        return match
          ? `Add customFields.${match[1]} to task "${match[2]}".`
          : "Add the required custom field to the task.";
      }

      case "INVALID_CUSTOM_FIELD_TYPE": {
        const match = err.message.match(/has type "([^"]+)", expected "([^"]+)"/);
        return match
          ? `Change the value to be a ${match[2]} type instead of ${match[1]}.`
          : "Ensure the custom field value matches the expected type.";
      }

      case "CUSTOM_FIELD_BELOW_MIN": {
        const match = err.message.match(/is (\d+(?:\.\d+)?), but minimum is (\d+(?:\.\d+)?)/);
        return match
          ? `Increase the value to at least ${match[2]}.`
          : "Increase the value to meet the minimum requirement.";
      }

      case "CUSTOM_FIELD_ABOVE_MAX": {
        const match = err.message.match(/is (\d+(?:\.\d+)?), but maximum is (\d+(?:\.\d+)?)/);
        return match
          ? `Decrease the value to at most ${match[2]}.`
          : "Decrease the value to meet the maximum requirement.";
      }

      case "CUSTOM_FIELD_TOO_SHORT": {
        const match = err.message.match(/has length (\d+), but minimum is (\d+)/);
        return match
          ? `Add at least ${Number(match[2]) - Number(match[1])} more character(s).`
          : "Add more characters to meet the minimum length.";
      }

      case "CUSTOM_FIELD_TOO_LONG": {
        const match = err.message.match(/has length (\d+), but maximum is (\d+)/);
        return match
          ? `Remove at least ${Number(match[1]) - Number(match[2])} character(s).`
          : "Remove characters to meet the maximum length.";
      }

      case "CUSTOM_FIELD_PATTERN_MISMATCH": {
        const match = err.message.match(/does not match pattern "([^"]+)"/);
        return match
          ? `Update the value to match the required pattern: ${match[1]}`
          : "Update the value to match the required pattern.";
      }

      case "CUSTOM_FIELD_INVALID_VALUE": {
        const match = err.message.match(/must be one of: (.+)\.$/);
        return match
          ? `Change the value to one of the allowed values: ${match[1]}`
          : "Change the value to one of the allowed values.";
      }

      default:
        return undefined;
    }
  }

  /**
   * Helper to reduce boilerplate for errors involving numeric extraction.
   * It extracts numbers, validates them, and passes them to a formatter.
   */
  private handleNumericError(
    message: string,
    regex: RegExp,
    formatter: (...args: number[]) => string,
  ): string | undefined {
    const values = this.extractValues(message, regex);

    if (!values || values.length === 0) return undefined;

    return formatter(...values);
  }

  /**
   * Handles standard Zod validation errors.
   */
  //TODO: fix any type
  //biome-ignore-start lint/suspicious/noExplicitAny: Need to find a better type here
  private handleZodError(err: any): string | undefined {
    const { code, path, expected, validation } = err;

    // Array/Task count errors
    if (code === "too_small") {
      if (path.includes("tasks"))
        return "Add at least one task to the template.";
      if (err.minimum === 1)
        return "This field cannot be empty. Please provide a value.";
      if (path.includes("estimationPercent"))
        return "Estimation percentage cannot be negative. Use a value between 0 and 100.";
    }

    // Number range errors
    if (code === "too_big" && path.includes("estimationPercent")) {
      return "Estimation percentage must be between 0 and 100. Current value exceeds 100%.";
    }

    // Type errors
    if (code === "invalid_type") {
      if (expected === "string")
        return `Expected a text value but received ${err.received}. Wrap the value in quotes.`;
      if (expected === "number")
        return `Expected a number but received ${err.received}. Remove quotes from numeric values.`;
    }

    // Format errors
    if (code === "invalid_string" && validation === "email") {
      return 'Use a valid email address format (e.g., user@example.com) or the special value "@Me".';
    }

    return undefined;
  }
  //biome-ignore-end lint/suspicious/noExplicitAny: Need to find a better type here

  /**
   * Helper to extract numeric values from a regex match safely.
   */
  private extractValues(message: string, pattern: RegExp): number[] {
    const match = message.match(pattern);
    if (!match) return [];
    return match.slice(1).map((val) => parseInt(val, 10));
  }

  /**
   * Validate and throw if invalid
   */
  validateOrThrow(template: unknown, options?: ValidationOptions): TaskTemplate {
    const result = this.validate(template, options);

    if (!result.valid) {
      const errorMessages = result.errors.map((e) => `${e.path}: ${e.message}`);
      const suggestions = result.errors
        .map((e) => e.suggestion)
        .filter((s): s is string => s !== undefined);

      throw new TemplateValidationError(
        "Template validation failed",
        errorMessages,
        suggestions.length > 0 ? suggestions : undefined,
      );
    }

    return template as TaskTemplate;
  }

  formatResult(result: ValidationResult): string {
    const lines: string[] = [];
    const modeLabel = result.mode === "strict" ? "[Strict Mode]" : "[Lenient Mode]";

    if (result.valid) {
      lines.push(`Template is valid! ${modeLabel}`);
    } else {
      lines.push(`Template validation failed: ${modeLabel}`);
      lines.push("");
    }

    if (result.errors.length > 0) {
      lines.push("Errors:");
      result.errors.forEach((err) => {
        lines.push(` - ${err.path}: ${err.message}`);
        if (err.suggestion) {
          lines.push(`   💡 ${err.suggestion}`);
        }
      });
      lines.push("");
    }

    if (result.warnings.length > 0) {
      lines.push("Warnings:");
      result.warnings.forEach((warn) => {
        lines.push(`${warn.path}: ${warn.message}`);
        if (warn.suggestion) {
          lines.push(`   💡 ${warn.suggestion}`);
        }
      });
    }

    return lines.join("\n");
  }
}
