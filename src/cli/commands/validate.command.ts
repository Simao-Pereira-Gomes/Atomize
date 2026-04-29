import { select } from "@clack/prompts";
import { type LogLevel, logger } from "@config/logger";
import type { ADoFieldSchema } from "@platforms/interfaces/field-schema.interface";
import { type CompositionMeta, TemplateLoader } from "@templates/loader";
import {
  TemplateValidator,
  type ValidationError,
  type ValidationOptions,
  type ValidationResult,
  type ValidationWarning,
} from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode } from "@/cli/utilities/exit-codes";
import { createAzureDevOpsAdapter } from "@/cli/utilities/ado-adapter";
import { assertNotCancelled, createManagedSpinner, isInteractiveTerminal } from "@/cli/utilities/prompt-utilities";
import { getErrorMessage } from "@/utils/errors";
import { resolveTemplateRefToPath } from "@/cli/utilities/template-ref";
import { extractCustomFieldRefs } from "@/core/condition-evaluator.js";
import type {
  TaskDefinition,
  TaskTemplate,
  ValidationMode,
} from "@/templates/schema";

export interface CustomFieldVerificationSummary {
  count: number;
  verificationStatus: "none" | "offline-unverified" | "online-verified";
}

type ValidateOptions = {
  strict?: boolean;
  quiet?: boolean;
  profile?: string;
};

export function resolveValidateLogLevel(options: {
  quiet?: boolean;
}): LogLevel | undefined {
  return resolveCommandOutputPolicy({ quiet: options.quiet, verbose: false }).logLevel;
}

export const validateCommand = new Command("validate")
  .description("Validate a template file")
  .argument("<template>", "Path to template file (YAML)")
  .option("-s, --strict", "Use strict validation mode (warnings become errors)", false)
  .option("-q, --quiet", "Suppress non-essential output", false)
  .option("--profile <name>", "Connect to ADO using a named profile for field verification (uses default profile if omitted)")
  .action(async (templatePath: string, options: ValidateOptions) => {
    const outputPolicy = resolveCommandOutputPolicy({
      quiet: options.quiet,
      verbose: false,
    });
    const output = createCommandOutput(outputPolicy);
    output.intro(" Atomize — Template Validator");
    try {
      const commandLogLevel = resolveValidateLogLevel(options);
      if (commandLogLevel) {
        logger.level = commandLogLevel;
      }

      const { template, meta } = await loadTemplate(templatePath);

      printCompositionMeta(meta, output);

      const tasksWithCustomFields = template.tasks.filter(
        (t) => t.customFields && Object.keys(t.customFields).length > 0,
      );
      const hasConditionCustomFieldRefs = template.tasks.some(
        (t) => t.condition && extractCustomFieldRefs(t.condition).length > 0,
      );
      const hasSavedQuery = !!(template.filter.savedQuery?.id || template.filter.savedQuery?.path);
      const needsOnlineValidation = tasksWithCustomFields.length > 0 || hasConditionCustomFieldRefs || hasSavedQuery;

      const connectionMode = await resolveConnectionMode(options, needsOnlineValidation);

      const validationOptions = resolveValidationOptions(options);
      const result = validateTemplate(template, validationOptions);
      const customFieldSummary = getCustomFieldVerificationSummary(
        template,
        connectionMode,
      );

      if (connectionMode === "offline") {
        appendOfflineVerificationWarning(
          result,
          tasksWithCustomFields.length,
          options.strict === true,
        );
        if (hasSavedQuery) {
          result.warnings.push({
            path: "filter.savedQuery",
            message:
              "Template uses a saved query that could not be verified. " +
              "Run with --profile <name> (or choose Online when prompted) to validate the query exists.",
          });
        }
      } else {
        // Online: fetch live schema and validate
        const profile = options.profile; 
        if (tasksWithCustomFields.length > 0 || hasConditionCustomFieldRefs) {
          const schemaErrors = await validateCustomFieldsOnline(template, profile);
          result.errors.push(...schemaErrors.errors);
          result.warnings.push(...schemaErrors.warnings);
          if (schemaErrors.errors.length > 0) {
            result.valid = false;
          }
        }
        if (hasSavedQuery) {
          const queryErrors = await validateSavedQueryOnline(template, profile);
          result.errors.push(...queryErrors.errors);
          result.warnings.push(...queryErrors.warnings);
          if (queryErrors.errors.length > 0) {
            result.valid = false;
          }
        }
      }

      printValidationResult(template, result, customFieldSummary, output);
      if (result.valid && !options.quiet) {
        output.print(chalk.cyan("  Try it with: ") + chalk.gray(`atomize generate ${templatePath}`));
      }
      output.outro(result.valid ? "Validation complete ✓" : "Validation failed ✗");
      if (!result.valid) process.exit(ExitCode.Failure);
    } catch (error) {
      handleFatal(error, output);
      process.exit(ExitCode.Failure);
    }
  });

type ConnectionMode = "offline" | "online";

async function resolveConnectionMode(
  options: ValidateOptions,
  hasCustomFields: boolean,
): Promise<ConnectionMode> {
  if (options.profile) return "online";

  if (isInteractiveTerminal() && hasCustomFields) {
    const choice = assertNotCancelled(
      await select({
        message: "Validate custom fields against ADO?",
        options: [
          { label: "Offline — structure and format only", value: "offline" },
          { label: "Online — connect to ADO for full field verification", value: "online" },
        ],
        // strict implies wanting the full picture; default to online
        initialValue: options.strict ? "online" : "offline",
      }),
    );
    return choice as ConnectionMode;
  }

  return "offline";
}

export function resolveValidationOptions(options: ValidateOptions): ValidationOptions {
  if (options.strict) {
    return { mode: "strict" };
  }
  return {};
}

async function loadTemplate(templatePath: string) {
  const resolvedPath = await resolveTemplateRefToPath(templatePath);
  logger.info(`Loading template: ${resolvedPath}`);
  const loader = new TemplateLoader();
  const { template, meta } = await loader.loadWithMeta(resolvedPath);
  logger.info(`Template loaded: ${template.name}`);
  return { template, meta };
}

function printCompositionMeta(
  meta: CompositionMeta,
  output: ReturnType<typeof createCommandOutput>,
): void {
  if (!meta.isComposed) return;

  output.print(chalk.bold("Inheritance:"));
  if (meta.extendsRef) {
    const display = meta.resolvedExtendsPath ?? meta.extendsRef;
    output.print(chalk.gray(`  extends  → ${display}`));
  }
  for (const path of meta.resolvedMixinPaths) {
    output.print(chalk.gray(`  mixin    → ${path}`));
  }
  output.blankLine();
}

function validateTemplate(template: unknown, options?: ValidationOptions) {
  logger.info("Validating template...");
  const validator = new TemplateValidator();
  return validator.validate(template, options);
}


function printValidationResult(
  template: TaskTemplate,
  result: ValidationResult,
  customFieldSummary: CustomFieldVerificationSummary,
  output: ReturnType<typeof createCommandOutput>,
): void {
  output.blankLine();

  if (result.valid) {
    printValidSummary(template, result.warnings, result.mode, customFieldSummary, output);
    return;
  }

  printInvalidSummary(result.errors, result.warnings, result.mode, output);
}

export function printValidSummary(
  template: TaskTemplate,
  warnings: ValidationWarning[],
  mode: ValidationMode,
  customFieldSummary: CustomFieldVerificationSummary,
  output: Pick<ReturnType<typeof createCommandOutput>, "policy" | "print" | "printAlways" | "blankLine">,
): void {
  const modeLabel =
    mode === "strict" ? chalk.yellow("[Strict]") : chalk.gray("[Lenient]");
  output.printAlways(`${chalk.green("Template is valid!")} ${modeLabel}\n`);

  if (!output.policy.quiet) {
    const summary = getTemplateSummary(template);
    output.print(chalk.bold("Summary:"));
    output.print(`  Name: ${chalk.cyan(summary.name)}`);
    output.print(`  Tasks: ${chalk.cyan(summary.tasks)}`);
    output.print(`  Total Estimation: ${chalk.cyan(summary.totalEstimation)}`);
    if (customFieldSummary.count > 0) {
      output.print(`  Custom Fields: ${chalk.cyan(customFieldSummary.count)} (${formatVerificationStatus(customFieldSummary.verificationStatus)})`);
    }
    printWarnings(warnings, output);
  }
}

function printInvalidSummary(
  errors: ValidationError[],
  warnings: ValidationWarning[],
  mode: ValidationMode,
  output: Pick<ReturnType<typeof createCommandOutput>, "print" | "printAlways" | "blankLine">,
): void {
  const modeLabel =
    mode === "strict" ? chalk.yellow("[Strict]") : chalk.gray("[Lenient]");
  output.printAlways(`${chalk.red("Template validation failed")} ${modeLabel}\n`);
  output.printAlways(chalk.red.bold("Errors:"));
  errors.forEach((err) => {
    output.printAlways(chalk.red(`  • ${err.path}: ${err.message}`));
  });

  printWarnings(warnings, output, true);

  output.printAlways(`\n${chalk.gray("Fix the errors above and try again.")}`);
}

function printWarnings(
  warnings: ValidationWarning[],
  output: Pick<ReturnType<typeof createCommandOutput>, "print" | "blankLine">,
  boldTitle = false,
): void {
  if (!warnings?.length) return;

  output.blankLine();
  output.print(
    boldTitle ? chalk.yellow.bold("Warnings:") : chalk.yellow("Warnings:"),
  );

  warnings.forEach((warn) => {
    output.print(chalk.yellow(`  • ${warn.path}: ${warn.message}`));
  });
}

export function getTemplateSummary(template: TaskTemplate) {
  const totalPercent = template.tasks
    .filter((t: TaskDefinition) => !t.condition)
    .reduce(
      (sum: number, task: TaskDefinition) =>
        sum + (task.estimationPercent ?? 0),
      0,
    );

  return {
    name: template.name,
    tasks: template.tasks.length,
    totalEstimation: `${totalPercent}%`,
  };
}

export function getCustomFieldVerificationSummary(
  template: TaskTemplate,
  connectionMode: ConnectionMode,
): CustomFieldVerificationSummary {
  const count = template.tasks.reduce((sum, task) => {
    return sum + Object.keys(task.customFields ?? {}).length;
  }, 0);

  if (count === 0) {
    return {
      count: 0,
      verificationStatus: "none",
    };
  }

  return {
    count,
    verificationStatus:
      connectionMode === "online" ? "online-verified" : "offline-unverified",
  };
}

function formatVerificationStatus(
  verificationStatus: CustomFieldVerificationSummary["verificationStatus"],
): string {
  switch (verificationStatus) {
    case "online-verified":
      return "verified against ADO";
    case "offline-unverified":
      return "not verified against ADO";
    default:
      return "none";
  }
}

export function appendOfflineVerificationWarning(
  result: ValidationResult,
  customFieldTaskCount: number,
  strict: boolean,
): void {
  if (customFieldTaskCount === 0) return;

  const warning: ValidationWarning = {
    path: "tasks[*].customFields",
    message:
      `${customFieldTaskCount} task(s) have custom fields that could not be verified. ` +
      "Run with --profile <name> (or choose Online when prompted) to validate field names, types, and picklist values.",
  };

  if (strict) {
    result.errors.push({
      path: warning.path,
      message: warning.message,
      code: "STRICT_MODE_WARNING",
    });
    result.valid = false;
    return;
  }

  result.warnings.push(warning);
}

function handleFatal(
  error: unknown,
  output: Pick<ReturnType<typeof createCommandOutput>, "cancel" | "print">,
): void {
  output.cancel("Validation failed");
  logger.error(chalk.red("Validation failed"));

  const message = getErrorMessage(error);
  output.print(chalk.red(message));
}

export async function validateCustomFieldsOnline(
  template: TaskTemplate,
  profile: string | undefined,
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
  const s = createManagedSpinner();
  s.start("Connecting to ADO to validate custom fields...");

  try {
    const adapter = await createAzureDevOpsAdapter(profile);
    s.message("Fetching field schemas...");
    const result = await validateCustomFieldsAgainstSchemas(
      template,
      async (workItemType) => adapter.getFieldSchemas(workItemType),
    );

    s.stop("Custom field validation complete");
    return result;
  } catch (err) {
    s.stop("Custom field validation failed");
    return {
      errors: [],
      warnings: [{
        path: "tasks[*].customFields",
        message: `Could not validate custom fields against ADO: ${err instanceof Error ? err.message : String(err)}`,
      }],
    };
  }
}

export async function validateCustomFieldsAgainstSchemas(
  template: TaskTemplate,
  getSchemas: (workItemType: string) => Promise<ADoFieldSchema[]>,
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const taskSchemas = await getSchemas("Task");
  const schemaByRef = new Map(taskSchemas.map((f) => [f.referenceName, f]));

  for (let i = 0; i < template.tasks.length; i++) {
    const task = template.tasks[i];
    if (!task?.customFields || Object.keys(task.customFields).length === 0) continue;

    for (const [refName, value] of Object.entries(task.customFields)) {
      const path = `tasks[${i}].customFields["${refName}"]`;
      const schema = schemaByRef.get(refName);

      if (!schema) {
        errors.push({
          path,
          message: `Field "${refName}" not found for work item type "Task".`,
          code: "CUSTOM_FIELD_NOT_FOUND",
        });
        continue;
      }

      if (schema.isReadOnly) {
        errors.push({
          path,
          message: `Field "${refName}" is read-only and cannot be set.`,
          code: "CUSTOM_FIELD_READ_ONLY",
        });
        continue;
      }

      if (typeof value === "string" && value.includes("{{")) continue;

      if (schema.allowedValues && schema.allowedValues.length > 0) {
        const strValue = String(value);
        if (!schema.allowedValues.includes(strValue)) {
          errors.push({
            path,
            message: `Value "${strValue}" is not in the allowed values for "${refName}": [${schema.allowedValues.join(", ")}].`,
            code: "CUSTOM_FIELD_INVALID_PICKLIST_VALUE",
          });
        }
        continue;
      }

      const typeError = checkValueType(refName, value, schema.type, path);
      if (typeError) errors.push(typeError);

      if (
        !schema.isMultiline &&
        schema.type === "string" &&
        typeof value === "string" &&
        value.includes("\n")
      ) {
        warnings.push({
          path,
          message: `Field "${refName}" is a single-line field but the value contains newlines. ADO may strip or reject them.`,
        });
      }
    }
  }

  const conditionRefs = Array.from(
    new Set(
      template.tasks.flatMap((t) =>
        t.condition ? extractCustomFieldRefs(t.condition) : [],
      ),
    ),
  );

  if (conditionRefs.length > 0) {
    const workItemTypes = template.filter.workItemTypes;
    if (!workItemTypes || workItemTypes.length === 0) {
      warnings.push({
        path: "tasks[*].condition",
        message:
          "Template has task conditions referencing custom fields but no workItemTypes filter is set — cannot verify condition field references.",
      });
    } else {
      const storySchemasByWit = new Map<string, Map<string, ADoFieldSchema>>();
      for (const wit of workItemTypes) {
        const witSchemas = await getSchemas(wit);
        storySchemasByWit.set(wit, new Map(witSchemas.map((f) => [f.referenceName, f])));
      }

      for (const ref of conditionRefs) {
        for (const wit of workItemTypes) {
          const witSchemaMap = storySchemasByWit.get(wit);
          if (witSchemaMap && !witSchemaMap.has(ref)) {
            errors.push({
              path: "tasks[*].condition",
              message: `Field "${ref}" referenced in a task condition was not found on work item type "${wit}".`,
              code: "CONDITION_FIELD_NOT_FOUND",
            });
          }
        }
      }
    }
  }

  return { errors, warnings };
}

async function validateSavedQueryOnline(
  template: TaskTemplate,
  profile: string | undefined,
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const savedQuery = template.filter.savedQuery;
  if (!savedQuery) return { errors, warnings };

  const s = createManagedSpinner();
  s.start("Connecting to ADO to validate saved query...");

  try {
    const adapter = await createAzureDevOpsAdapter(profile);

    s.message("Fetching saved queries...");
    const queries = await adapter.listSavedQueries();

    if (savedQuery.id) {
      const found = queries.some((q) => q.id === savedQuery.id);
      if (!found) {
        errors.push({
          path: "filter.savedQuery.id",
          message: `Saved query with ID "${savedQuery.id}" was not found in this project. Run: atomize queries list`,
          code: "SAVED_QUERY_NOT_FOUND",
        });
      }
    } else if (savedQuery.path) {
      const found = queries.some((q) => q.path === savedQuery.path);
      if (!found) {
        errors.push({
          path: "filter.savedQuery.path",
          message: `Saved query at path "${savedQuery.path}" was not found in this project. Run: atomize queries list`,
          code: "SAVED_QUERY_NOT_FOUND",
        });
      }
    }

    s.stop("Saved query validation complete");
  } catch (err) {
    s.stop("Saved query validation failed");
    warnings.push({
      path: "filter.savedQuery",
      message: `Could not validate saved query against ADO: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return { errors, warnings };
}

export function checkValueType(
  refName: string,
  value: string | number | boolean,
  type: ADoFieldSchema["type"],
  path: string,
): ValidationError | undefined {
  switch (type) {
    case "integer": {
      const n = Number(value);
      if (typeof value !== "number" && !Number.isFinite(n)) {
        return { path, message: `Field "${refName}" expects an integer, got "${value}".`, code: "CUSTOM_FIELD_TYPE_MISMATCH" };
      }
      if (Number.isFinite(n) && !Number.isInteger(n)) {
        return { path, message: `Field "${refName}" expects a whole number, got "${value}".`, code: "CUSTOM_FIELD_TYPE_MISMATCH" };
      }
      return undefined;
    }
    case "decimal":
      if (typeof value !== "number" && !Number.isFinite(Number(value))) {
        return { path, message: `Field "${refName}" expects a decimal number, got "${value}".`, code: "CUSTOM_FIELD_TYPE_MISMATCH" };
      }
      return undefined;
    case "boolean":
      if (typeof value !== "boolean" && value !== "true" && value !== "false") {
        return {
          path,
          message: `Field "${refName}" expects a boolean (true/false), got "${value}".`,
          code: "CUSTOM_FIELD_TYPE_MISMATCH",
        };
      }
      return undefined;
    case "datetime": {
      const DATE_OR_MACRO_RE =
        /^(@Today|@StartOfDay|@StartOfMonth|@StartOfWeek|@StartOfYear)(\s*[+-]\s*\d+)?$|^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/i;
      if (typeof value === "string" && !DATE_OR_MACRO_RE.test(value)) {
        return {
          path,
          message: `Field "${refName}" expects an ISO 8601 date or @Today macro, got "${value}".`,
          code: "CUSTOM_FIELD_TYPE_MISMATCH",
        };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}
