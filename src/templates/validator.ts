import { TemplateValidationError } from "@utils/errors";
import type { ZodError } from "zod";
import type { $ZodIssue } from "zod/v4/core";
import { type TaskTemplate, TaskTemplateSchema } from "./schema";
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
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
  validate(template: unknown): ValidationResult {
    const parsed = TaskTemplateSchema.safeParse(template);
    const errors: ValidationError[] = !parsed.success
      ? this.convertZodErrors(parsed.error)
      : [];
    const warnings: ValidationWarning[] = parsed.success
      ? this.collectWarnings(parsed.data)
      : [];

    return { valid: errors.length === 0, errors, warnings };
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
  validateOrThrow(template: unknown): TaskTemplate {
    const result = this.validate(template);

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

    if (result.valid) {
      lines.push("Template is valid!");
    } else {
      lines.push("Template validation failed:");
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
