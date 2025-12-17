import { ZodError } from "zod";
import { TaskTemplateSchema, type TaskTemplate } from "./schema";
import { TemplateValidationError } from "@utils/errors";

import { logger } from "@config/logger";

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
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const parsed = TaskTemplateSchema.safeParse(template);

    if (!parsed.success) {
      errors.push(...this.convertZodErrors(parsed.error));
      return this.toResult(errors, warnings);
    }

    try {
      this.validateBusinessRules(parsed.data, errors, warnings);
    } catch (error) {
      errors.push({
        path: "template",
        message: error instanceof Error ? error.message : String(error),
        code: "UNKNOWN_ERROR",
      });
    }

    logger.debug(
      `Template validation complete. Errors: ${errors.length}, Warnings: ${warnings.length}`
    );

    return this.toResult(errors, warnings);
  }

  private toResult(
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): ValidationResult {
    return { valid: errors.length === 0, errors, warnings };
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

  private validateBusinessRules(
    template: TaskTemplate,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    this.validateEstimations(template, errors, warnings);
    this.validateDependencies(template, errors);
    this.validateConditionals(template, warnings);
  }

  /**
   * Validate that estimation percentages add up correctly
   */
  private validateEstimations(
    template: TaskTemplate,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const tasks = this.getUnconditionalTasks(template);
    const totalPercent = this.sumEstimations(tasks);
    const v = template.validation;

    this.validateTotalEstimation(v, totalPercent, errors, warnings);
    this.validateTaskCount(v, tasks.length, errors);
  }

  private getUnconditionalTasks(template: TaskTemplate) {
    return template.tasks.filter((t) => !t.condition);
  }

  private sumEstimations(tasks: TaskTemplate["tasks"]) {
    return tasks.reduce((sum, task) => sum + (task.estimationPercent ?? 0), 0);
  }

  private validateTotalEstimation(
    v: TaskTemplate["validation"] | undefined,
    totalPercent: number,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ) {
    if (!v) {
      if (totalPercent !== 100) {
        warnings.push(this.warnTasksTotal(totalPercent));
      }
      return;
    }

    if (v.totalEstimationMustBe !== undefined) {
      if (totalPercent !== v.totalEstimationMustBe) {
        errors.push(
          this.errTasksTotalMustBe(totalPercent, v.totalEstimationMustBe)
        );
      }
      return;
    }

    if (v.totalEstimationRange) {
      const { min, max } = v.totalEstimationRange;
      if (totalPercent < min || totalPercent > max) {
        errors.push(this.errTasksTotalRange(totalPercent, min, max));
      }
      return;
    }

    if (totalPercent !== 100) {
      warnings.push(this.warnTasksTotal(totalPercent));
    }
  }

  private validateTaskCount(
    v: TaskTemplate["validation"] | undefined,
    taskCount: number,
    errors: ValidationError[]
  ) {
    if (!v) return;

    if (v.minTasks !== undefined && taskCount < v.minTasks) {
      errors.push(this.errTooFewTasks(taskCount, v.minTasks));
    }

    if (v.maxTasks !== undefined && taskCount > v.maxTasks) {
      errors.push(this.errTooManyTasks(taskCount, v.maxTasks));
    }
  }


  private errTasksTotalMustBe(
    actual: number,
    expected: number
  ): ValidationError {
    return {
      path: "tasks",
      message: `Total estimation is ${actual}%, but must be ${expected}%`,
      code: "INVALID_TOTAL_ESTIMATION",
    };
  }

  private errTasksTotalRange(
    actual: number,
    min: number,
    max: number
  ): ValidationError {
    return {
      path: "tasks",
      message: `Total estimation is ${actual}%, but must be between ${min}% and ${max}%`,
      code: "INVALID_ESTIMATION_RANGE",
    };
  }

  private warnTasksTotal(actual: number): ValidationWarning {
    return {
      path: "tasks",
      message: `Total estimation is ${actual}% (expected 100%). Consider setting validation.totalEstimationMustBe or totalEstimationRange.`,
    };
  }

  private errTooFewTasks(actual: number, min: number): ValidationError {
    return {
      path: "tasks",
      message: `Template has ${actual} tasks, but minimum is ${min}`,
      code: "TOO_FEW_TASKS",
    };
  }

  private errTooManyTasks(actual: number, max: number): ValidationError {
    return {
      path: "tasks",
      message: `Template has ${actual} tasks, but maximum is ${max}`,
      code: "TOO_MANY_TASKS",
    };
  }


  private validateDependencies(
    template: TaskTemplate,
    errors: ValidationError[]
  ): void {
    const taskIds = new Set(
      template.tasks.filter((t) => t.id).map((t) => t.id as string)
    );

    template.tasks.forEach((task, index) => {
      if (task.dependsOn) {
        task.dependsOn.forEach((depId) => {
          if (!taskIds.has(depId)) {
            errors.push({
              path: `tasks[${index}].dependsOn`,
              message: `Task depends on non-existent task ID: "${depId}"`,
              code: "INVALID_DEPENDENCY",
            });
          }
        });
      }
    });
  }


  private validateConditionals(
    template: TaskTemplate,
    warnings: ValidationWarning[]
  ): void {
    template.tasks.forEach((task, index) => {
      if (task.condition) {
        const hasVariable = task.condition.includes("${");
        const hasOperator = /AND|OR|==|!=|>|<|CONTAINS/.test(task.condition);

        if (!hasVariable && !hasOperator) {
          warnings.push({
            path: `tasks[${index}].condition`,
            message: `Condition "${task.condition}" might be invalid (no variables or operators found)`,
          });
        }
      }
    });
  }


  private convertZodErrors(zodError: ZodError): ValidationError[] {
    return zodError.issues.map((err) => ({
      path: err.path.join("."),
      message: err.message,
      code: err.code,
    }));
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
