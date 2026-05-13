import { logger } from "@config/logger";
import type { CustomFieldVerificationSummary } from "@templates/custom-field-verifier";
import { getCustomFieldVerificationSummary } from "@templates/custom-field-verifier";
import type { CompositionMeta } from "@templates/loader";
import { analyzeTemplateProjectVerification } from "@templates/project-verifier";
import type { TaskTemplate } from "@templates/schema";
import type { ResolvedTemplateSource } from "@templates/source-resolver";
import type { TemplateVerificationOptions } from "@templates/template-verification";
import { verifyTemplate } from "@templates/template-verification";
import type { ValidationOptions, ValidationResult, ValidationWarning } from "@templates/validator";
import chalk from "chalk";
import type { CommandOutput } from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";

export type ConnectionMode = "offline" | "online";

export function resolveValidationOptions(options: { strict?: boolean }): ValidationOptions {
  if (options.strict) {
    return { mode: "strict" };
  }
  return {};
}

export interface ValidateCommandApplicationDeps {
  loadTemplateSource(
    source: string,
    print: (msg: string) => void,
  ): Promise<ResolvedTemplateSource>;

  resolveConnectionMode(
    options: { profile?: string; strict?: boolean },
    hasCustomFields: boolean,
  ): Promise<ConnectionMode>;

  resolveProjectVerification(
    connectionMode: ConnectionMode,
    options: { profile?: string; strict?: boolean },
  ): Promise<{
    options: TemplateVerificationOptions["project"];
    connectionWarnings: ValidationWarning[];
  }>;

  printCompositionMeta(meta: CompositionMeta, output: CommandOutput): void;

  printValidationResult(
    template: TaskTemplate,
    result: ValidationResult,
    summary: CustomFieldVerificationSummary,
    isQuiet: boolean,
    output: CommandOutput,
  ): void;
}

export interface ValidateCommandApplicationInput {
  source: string;
  options: { strict?: boolean; quiet?: boolean; profile?: string };
  output: CommandOutput;
  deps: ValidateCommandApplicationDeps;
}

export async function runValidateCommandApplication(
  input: ValidateCommandApplicationInput,
): Promise<void> {
  const { source, options, output, deps } = input;
  const isQuiet = options.quiet === true;

  if (source.startsWith("http://")) {
    throw new Error("Only HTTPS URLs are supported.");
  }

  const { template, meta, source: resolvedSource } = await deps.loadTemplateSource(
    source,
    output.print,
  );

  logger.info(`Loading template: ${resolvedSource.path ?? resolvedSource.url ?? resolvedSource.input}`);
  logger.info(`Template loaded: ${template.name}`);

  deps.printCompositionMeta(meta, output);

  const projectRequirements = analyzeTemplateProjectVerification(template);
  const connectionMode = await deps.resolveConnectionMode(
    options,
    projectRequirements.needsOnlineVerification,
  );

  const validationOptions = resolveValidationOptions(options);
  const customFieldSummary = getCustomFieldVerificationSummary(template, connectionMode);

  const projectVerification = await deps.resolveProjectVerification(connectionMode, options);
  const result = await verifyTemplate(template, {
    validation: validationOptions,
    project: projectVerification.options,
  });
  result.warnings.push(...projectVerification.connectionWarnings);

  deps.printValidationResult(template, result, customFieldSummary, isQuiet, output);

  if (result.valid && !isQuiet) {
    const hint =
      resolvedSource.kind === "url"
        ? chalk.cyan("  Install it with: ") + chalk.gray(`atomize template install ${source}`)
        : chalk.cyan("  Try it with: ") + chalk.gray(`atomize generate ${source}`);
    output.print(hint);
  }

  output.outro(result.valid ? "Validation complete ✓" : "Validation failed ✗");
  if (!result.valid) throw new ExitError(ExitCode.Failure);
}
