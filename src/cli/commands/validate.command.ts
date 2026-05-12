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
import {
  analyzeTemplateProjectVerification,
  verifyTemplateProject,
} from "@templates/project-verifier";
import type {
  ValidationError,
  ValidationOptions,
  ValidationResult,
  ValidationWarning,
} from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import { createAzureDevOpsAdapter } from "@/cli/utilities/ado-adapter";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import { assertNotCancelled, createManagedSpinner, isInteractiveTerminal } from "@/cli/utilities/prompt-utilities";
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

export {
  appendOfflineVerificationWarning,
  type CustomFieldVerificationSummary,
  checkValueType,
  getCustomFieldVerificationSummary,
  validateCustomFieldsAgainstSchemas,
};

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
    try {
      const commandLogLevel = resolveValidateLogLevel(options);
      if (commandLogLevel) {
        logger.level = commandLogLevel;
      }

      if (source.startsWith("http://")) {
        throw new Error("Only HTTPS URLs are supported.");
      }

      const { template, meta, source: resolvedSource } = await loadTemplateSource(
        source,
        output.print,
      );

      printCompositionMeta(meta, output);

      const projectRequirements = analyzeTemplateProjectVerification(template);

      const connectionMode = await resolveConnectionMode(
        options,
        projectRequirements.needsOnlineVerification,
      );

      const validationOptions = resolveValidationOptions(options);
      const result = validateTemplate(template, validationOptions);
      const customFieldSummary = getCustomFieldVerificationSummary(
        template,
        connectionMode,
      );

      const projectVerification = await verifyProjectForValidateCommand(
        template,
        connectionMode,
        options,
      );
      result.errors.push(...projectVerification.errors);
      result.warnings.push(...projectVerification.warnings);
      if (projectVerification.errors.length > 0) {
        result.valid = false;
      }

      printValidationResult(template, result, customFieldSummary, output);
      if (result.valid && !options.quiet) {
        const hint = resolvedSource.kind === "url"
          ? chalk.cyan("  Install it with: ") + chalk.gray(`atomize template install ${source}`)
          : chalk.cyan("  Try it with: ") + chalk.gray(`atomize generate ${source}`);
        output.print(hint);
      }
      output.outro(result.valid ? "Validation complete ✓" : "Validation failed ✗");
      if (!result.valid) throw new ExitError(ExitCode.Failure);
    } catch (error) {
      if (!(error instanceof ExitError)) handleFatal(error, output);
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
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

async function loadTemplateSource(source: string, print: (msg: string) => void) {
  const loaded = await new TemplateLibrary().loadSource(source, {
    fetchContent: fetchTemplateContent,
    onFetch: (url) => print(chalk.gray(`  Fetching ${url}\n`)),
    onNotice: (message) => print(chalk.yellow(message)),
  });
  logger.info(`Loading template: ${loaded.source.path ?? loaded.source.url ?? loaded.source.input}`);
  logger.info(`Template loaded: ${loaded.template.name}`);
  return loaded;
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
  return new TemplateLibrary().validateTemplate(template, options);
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

async function verifyProjectForValidateCommand(
  template: TaskTemplate,
  connectionMode: ConnectionMode,
  options: ValidateOptions,
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
  if (connectionMode === "offline") {
    return verifyTemplateProject(template, {
      mode: "offline",
      strict: options.strict === true,
    });
  }

  const s = createManagedSpinner();
  s.start("Connecting to ADO to validate project references...");

  try {
    const adapter = await createAzureDevOpsAdapter(options.profile);
    const metadataReader = requireProjectMetadataReader(adapter);
    const savedQueryReader = requireSavedQueryReader(adapter);
    s.message("Fetching ADO project metadata...");
    const result = await verifyTemplateProject(template, {
      mode: "online",
      strict: options.strict === true,
      platform: {
        getFieldSchemas: (workItemType) => metadataReader.getFieldSchemas(workItemType),
        listSavedQueries: (folder) => savedQueryReader.listSavedQueries(folder),
      },
    });
    s.stop("Project reference validation complete");
    return result;
  } catch (err) {
    s.stop("Project reference validation failed");
    return {
      errors: [],
      warnings: [{
        path: "template",
        message: `Could not validate project references against ADO: ${err instanceof Error ? err.message : String(err)}`,
      }],
    };
  }
}
