import { TemplateValidationError } from "@utils/errors";
import type { ZodError } from "zod";
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
}

export interface ValidationWarning {
  path: string;
  message: string;
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
    const total = template.tasks
      .filter((t) => !t.condition)
      .reduce((sum, t) => sum + (t.estimationPercent ?? 0), 0);

    const hasStrictRule =
      v?.totalEstimationMustBe !== undefined ||
      v?.totalEstimationRange !== undefined;

    if (!hasStrictRule && total !== 100) {
      warnings.push({
        path: "tasks",
        message: `Total estimation is ${total}% (expected 100%).`,
      });
    }
    this.validateTaskConditions(template, warnings);

    return warnings;
  }

  private validateTaskConditions(
    template: TaskTemplate,
    warnings: ValidationWarning[]
  ) {
    template.tasks.forEach((task, index) => {
      if (task.condition) {
        const hasVariable = task.condition.includes("${");
        const hasOperator = /AND|OR|==|!=|>|<|CONTAINS/.test(task.condition);
        if (!hasVariable && !hasOperator) {
          warnings.push({
            path: `tasks[${index}].condition`,
            message: `Condition "${task.condition}" might be invalid (no variables found)`,
          });
        }
      }
    });
  }

  private convertZodErrors(zodError: ZodError): ValidationError[] {
    return zodError.issues.map((err) => ({
      path: err.path.join("."),
      message: err.message,
      code:
        (err as unknown as { params?: { code?: string } }).params?.code ||
        err.code,
    }));
  }

  /**
   * Validate and throw if invalid
   */
  validateOrThrow(template: unknown): TaskTemplate {
    const result = this.validate(template);

    if (!result.valid) {
      const errorMessages = result.errors.map((e) => `${e.path}: ${e.message}`);
      throw new TemplateValidationError(
        "Template validation failed",
        errorMessages
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
      });
      lines.push("");
    }

    if (result.warnings.length > 0) {
      lines.push("Warnings:");
      result.warnings.forEach((warn) => {
        lines.push(`${warn.path}: ${warn.message}`);
      });
    }

    return lines.join("\n");
  }
}
