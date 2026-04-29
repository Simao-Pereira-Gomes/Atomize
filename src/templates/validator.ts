import { TemplateValidationError } from "@utils/errors";
import type { ZodError } from "zod";
import type { $ZodIssue } from "zod/v4/core";
import { extractCustomFieldRefs } from "@/core/condition-evaluator.js";
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
  /** When true, strict mode will not promote this warning to an error. */
  nonBlocking?: boolean;
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

    if (effectiveMode === "strict" && warnings.length > 0) {
      const promotable = warnings.filter((w) => !w.nonBlocking);
      const retained = warnings.filter((w) => w.nonBlocking);
      errors = [...errors, ...promotable.map((w) => this.warningToError(w))];
      warnings = retained;
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

    if (!hasStrictRule && total > 100) {
      warnings.push({
        path: "tasks",
        message: `Total estimation is ${total}% (exceeds 100%). This is valid when tasks span multiple roles. You will be prompted to normalise at generate time.`,
        nonBlocking: true,
      });
    }
    this.validateTaskConditions(template, warnings);
    this.validateTaskDependencies(template, warnings);
    this.validateSavedQueryConflict(template, warnings);

    return warnings;
  }

  private validateTaskConditions(
    template: TaskTemplate,
    warnings: ValidationWarning[],
  ) {
    template.tasks.forEach((task, index) => {
      if (task.condition) {
        const customFieldRefs = extractCustomFieldRefs(task.condition);
        if (customFieldRefs.length > 0) {
          warnings.push({
            path: `tasks[${index}].condition`,
            message: `Condition references custom field(s) [${customFieldRefs.join(", ")}] on the parent story. Run validation with --profile <name> (or choose Online when prompted) to verify these fields exist in ADO.`,
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

  private validateSavedQueryConflict(
    template: TaskTemplate,
    warnings: ValidationWarning[],
  ) {
    const f = template.filter;
    if (!f.savedQuery) return;

    const hasStructuredFields =
      f.workItemTypes ||
      f.states ||
      f.statesExclude ||
      f.statesWereEver ||
      f.tags?.include ||
      f.tags?.exclude ||
      f.areaPaths ||
      f.areaPathsUnder ||
      f.iterations ||
      f.iterationsUnder ||
      f.assignedTo ||
      f.changedAfter ||
      f.createdAfter ||
      f.priority;

    if (hasStructuredFields) {
      warnings.push({
        path: "filter.savedQuery",
        message:
          "savedQuery and structured filter fields are both set. Structured filter fields will be ignored — the saved query controls which items are returned.",
        suggestion:
          "Remove workItemTypes, states, tags, etc. from the filter when using savedQuery.",
      });
    }
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

  private handleZodError(err: $ZodIssue): string | undefined {
    if (err.code === "too_small") {
      if (err.path.includes("tasks"))
        return "Add at least one task to the template.";
      if (err.minimum === 1)
        return "This field cannot be empty. Please provide a value.";
      if (err.path.includes("estimationPercent"))
        return "Estimation percentage cannot be negative.";
    }
    if (err.code === "too_big" && err.path.includes("estimationPercent")) {
      return "A single task's estimation cannot exceed 100%. Split the work across multiple tasks if needed.";
    }
    if (err.code === "invalid_type") {
      if (err.expected === "string")
        return `Expected a text value but received ${String(err.input)}. Wrap the value in quotes.`;
      if (err.expected === "number")
        return `Expected a number but received ${String(err.input)}. Remove quotes from numeric values.`;
    }
    if (err.code === "invalid_format" && err.format === "email") {
      return 'Use a valid email address format (e.g., user@example.com) or the special value "@Me".';
    }
    return undefined;
  }

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
