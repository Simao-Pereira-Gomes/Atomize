import { select } from "@clack/prompts";
import { type LogLevel, logger } from "@config/logger";
import {
  appendOfflineVerificationWarning,
  type CustomFieldVerificationSummary,
  checkValueType,
  getCustomFieldVerificationSummary,
  verifyTemplateCustomFields as validateCustomFieldsAgainstSchemas,
} from "@templates/custom-field-verifier";
import type { CompositionMeta } from "@templates/loader";
import type {
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import { createAzureDevOpsAdapter } from "@/cli/utilities/ado-adapter";
import type { CommandOutput } from "@/cli/utilities/command-output";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  createManagedSpinner,
  isInteractiveTerminal,
} from "@/cli/utilities/prompt-utilities";
import { fetchTemplateContent } from "@/cli/utilities/template-fetch";
import { totalUnconditionalEstimationPercent } from "@/core/estimation-distribution";
import {
  requireProjectMetadataReader,
  requireSavedQueryReader,
} from "@/platforms/capabilities";
import type {
  TaskTemplate,
  ValidationMode,
} from "@/templates/schema";
import { TemplateLibrary } from "@/templates/template-library";
import { getErrorMessage } from "@/utils/errors";
import {
  type ConnectionMode,
  type ValidateCommandApplicationDeps,
  runValidateCommandApplication,
} from "./validate-application";

export {
  appendOfflineVerificationWarning,
  type CustomFieldVerificationSummary,
  checkValueType,
  getCustomFieldVerificationSummary,
  validateCustomFieldsAgainstSchemas,
};

export { resolveValidationOptions } from "./validate-application";

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
  .argument("<source>", "Path to a YAML template file, catalog ref, or HTTPS URL")
  .option("-s, --strict", "Use strict validation mode (warnings become errors)", false)
  .option("-q, --quiet", "Suppress non-essential output", false)
  .option("--profile <name>", "Connect to ADO using a named profile for field verification (uses default profile if omitted)")
  .action(async (source: string, options: ValidateOptions) => {
    const outputPolicy = resolveCommandOutputPolicy({
      quiet: options.quiet,
      verbose: false,
    });
    const output = createCommandOutput(outputPolicy);
    output.intro(" Atomize — Template Validator");

    const commandLogLevel = resolveValidateLogLevel(options);
    if (commandLogLevel) logger.level = commandLogLevel;

    try {
      await runValidateCommandApplication({
        source,
        options,
        output,
        deps: createValidateCommandDeps(),
      });
    } catch (error) {
      if (!(error instanceof ExitError)) handleFatal(error, output);
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });

function createValidateCommandDeps(): ValidateCommandApplicationDeps {
  return {
    async loadTemplateSource(source, print) {
      return await new TemplateLibrary().loadSource(source, {
        fetchContent: fetchTemplateContent,
        onFetch: (url) => print(chalk.gray(`  Fetching ${url}\n`)),
        onNotice: (message) => print(chalk.yellow(message)),
      });
    },

    async resolveConnectionMode(options, hasCustomFields) {
      if (options.profile) return "online";
      if (isInteractiveTerminal() && hasCustomFields) {
        const choice = assertNotCancelled(
          await select({
            message: "Validate custom fields against ADO?",
            options: [
              { label: "Offline — structure and format only", value: "offline" },
              { label: "Online — connect to ADO for full field verification", value: "online" },
            ],
            initialValue: options.strict ? "online" : "offline",
          }),
        );
        return choice as ConnectionMode;
      }
      return "offline";
    },

    async resolveProjectVerification(connectionMode, options) {
      if (connectionMode === "offline") {
        return {
          options: {
            mode: "offline",
            strict: options.strict === true,
          },
          connectionWarnings: [],
        };
      }

      const s = createManagedSpinner();
      s.start("Connecting to ADO to validate project references...");

      try {
        const adapter = await createAzureDevOpsAdapter(options.profile);
        const metadataReader = requireProjectMetadataReader(adapter);
        const savedQueryReader = requireSavedQueryReader(adapter);
        s.message("Fetching ADO project metadata...");
        s.stop("ADO connection ready");
        return {
          options: {
            mode: "online",
            strict: options.strict === true,
            platform: {
              getFieldSchemas: (workItemType) => metadataReader.getFieldSchemas(workItemType),
              listSavedQueries: (folder) => savedQueryReader.listSavedQueries(folder),
            },
          },
          connectionWarnings: [],
        };
      } catch (err) {
        s.stop("Project reference validation failed");
        return {
          options: {
            mode: "online",
            strict: options.strict === true,
          },
          connectionWarnings: [{
            path: "template",
            message: `Could not validate project references against ADO: ${err instanceof Error ? err.message : String(err)}`,
          }],
        };
      }
    },

    printCompositionMeta(meta, output) {
      printCompositionMeta(meta, output);
    },

    printValidationResult(template, result, customFieldSummary, isQuiet, output) {
      printValidationResult(template, result, customFieldSummary, isQuiet, output);
    },
  };
}

function printCompositionMeta(
  meta: CompositionMeta,
  output: Pick<CommandOutput, "print" | "blankLine">,
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

function printValidationResult(
  template: TaskTemplate,
  result: ValidationResult,
  customFieldSummary: CustomFieldVerificationSummary,
  isQuiet: boolean,
  output: Pick<CommandOutput, "print" | "printAlways" | "blankLine">,
): void {
  output.blankLine();

  if (result.valid) {
    printValidSummary(template, result.warnings, result.mode, customFieldSummary, output, isQuiet);
    return;
  }

  printInvalidSummary(result.errors, result.warnings, result.mode, output);
}

export function printValidSummary(
  template: TaskTemplate,
  warnings: ValidationWarning[],
  mode: ValidationMode,
  customFieldSummary: CustomFieldVerificationSummary,
  output: Pick<CommandOutput, "print" | "printAlways" | "blankLine">,
  isQuiet: boolean,
): void {
  const modeLabel =
    mode === "strict" ? chalk.yellow("[Strict]") : chalk.gray("[Lenient]");
  output.printAlways(`${chalk.green("Template is valid!")} ${modeLabel}\n`);

  if (!isQuiet) {
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
  output: Pick<CommandOutput, "print" | "printAlways" | "blankLine">,
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
  output: Pick<CommandOutput, "print" | "blankLine">,
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
  const totalPercent = totalUnconditionalEstimationPercent(template.tasks);

  return {
    name: template.name,
    tasks: template.tasks.length,
    totalEstimation: `${totalPercent}%`,
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

function handleFatal(
  error: unknown,
  output: Pick<CommandOutput, "cancel" | "print">,
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
    const metadataReader = requireProjectMetadataReader(adapter);
    s.message("Fetching field schemas...");
    const result = await validateCustomFieldsAgainstSchemas(
      template,
      async (workItemType) => metadataReader.getFieldSchemas(workItemType),
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
