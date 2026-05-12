import { logger } from "@config/logger";
import type { AtomizationReport } from "@core/atomizer";
import type {
  GenerationPlatform,
  PlatformAuthenticator,
  ProjectMetadataReader,
} from "@platforms/interfaces/platform-capabilities";
import type { TaskTemplate } from "@templates/schema";
import chalk from "chalk";
import type { Config } from "@/config/config";
import { writeReportFile } from "@/core/report-formatter";
import type { CommandOutputPolicy } from "../utilities/command-output";
import { ExitCode, ExitError } from "../utilities/exit-codes";
import type { OutputSink } from "../utilities/output-sink";
import type { PromptDriver } from "../utilities/prompt-driver";
import { sanitizeTty } from "../utilities/prompt-utilities";

export interface GenerateCommandOptions {
  platform?: string;
  execute: boolean;
  continueOnError: boolean;
  autoApprove?: boolean;
  storyConcurrency: string;
  taskConcurrency: string;
  dependencyConcurrency: string;
  verbose: boolean;
  output?: string;
  includeSensitiveReportData: boolean;
  quiet?: boolean;
  limit?: string;
  story?: string[];
  profile?: string;
}

export interface GenerateConcurrencySettings {
  storyConcurrency: number;
  taskConcurrency: number;
  dependencyConcurrency: number;
}

export interface GenerateCommandApplicationDeps {
  promptMissingArgs(
    templateArg: string | undefined,
    options: { platform: string | undefined; execute: boolean },
  ): Promise<{ templatePath: string; platform: string; dryRun: boolean }>;
  getNonInteractiveLiveExecutionError(options: {
    dryRun: boolean;
    isTTYSession: boolean;
    autoApprove?: boolean;
  }): string | undefined;
  loadTemplate(
    templatePath: string,
    output: Pick<OutputSink, "print" | "cancel">,
  ): Promise<TaskTemplate>;
  parseConcurrency(
    options: Pick<GenerateCommandOptions, "taskConcurrency" | "storyConcurrency" | "dependencyConcurrency">,
    print: (msg: string) => void,
  ): GenerateConcurrencySettings;
  initPlatform(
    options: { platform: string; profile?: string },
    taskConcurrency: number,
    output: Pick<OutputSink, "cancel" | "print">,
  ): Promise<PlatformAuthenticator & GenerationPlatform & ProjectMetadataReader>;
  resolveNormalization(
    template: TaskTemplate,
    isTTYSession: boolean,
    prompts: PromptDriver,
  ): Promise<boolean>;
  renderFilterCriteria(input: {
    template: TaskTemplate;
    storyIds: string[] | undefined;
    limit: string | undefined;
    isQuiet: boolean;
    outputPolicy: CommandOutputPolicy;
    output: OutputSink;
  }): void;
  confirmLiveExecution(
    template: TaskTemplate,
    options: { platform: string },
    output: Pick<OutputSink, "outro">,
  ): Promise<void>;
  runWorkflow(
    template: TaskTemplate,
    platform: PlatformAuthenticator & GenerationPlatform & ProjectMetadataReader,
    options: {
      dryRun: boolean;
      continueOnError: boolean;
      limit?: number;
      storyIds?: string[];
      storyConcurrency: number;
      dependencyConcurrency: number;
      forceNormalize: boolean;
      isTTYSession: boolean;
      profileLabel?: string;
    },
    output: OutputSink,
  ): Promise<AtomizationReport>;
  printReport(
    report: AtomizationReport,
    options: { verbose: boolean; quiet?: boolean },
    dryRun: boolean,
  ): number;
}

export async function runGenerateCommandApplication(input: {
  templateArg: string | undefined;
  options: GenerateCommandOptions;
  config: Config;
  prompts: PromptDriver;
  isTTYSession: boolean;
  isQuiet: boolean;
  outputPolicy: CommandOutputPolicy;
  output: OutputSink;
  deps: GenerateCommandApplicationDeps;
}): Promise<number> {
  const {
    templateArg,
    options,
    config,
    prompts,
    isTTYSession,
    isQuiet,
    outputPolicy,
    output,
    deps,
  } = input;

  const { templatePath, platform, dryRun } = await deps.promptMissingArgs(
    templateArg,
    { platform: options.platform, execute: options.execute },
  );

  const liveExecutionError = deps.getNonInteractiveLiveExecutionError({
    dryRun,
    isTTYSession,
    autoApprove: options.autoApprove,
  });
  if (liveExecutionError) {
    output.cancel(liveExecutionError);
    throw new ExitError(ExitCode.Failure);
  }

  if (outputPolicy.logLevel) {
    logger.level = outputPolicy.logLevel;
  }

  if (dryRun) output.info("Dry-run mode — no tasks will be created");
  else output.warn("Live mode — tasks will be created");

  const template = await deps.loadTemplate(templatePath, output);
  const { storyConcurrency, taskConcurrency, dependencyConcurrency } =
    deps.parseConcurrency(options, output.print);
  const platformAdapter = await deps.initPlatform(
    { platform, profile: options.profile ?? config.profile },
    taskConcurrency,
    output,
  );

  const forceNormalize = await deps.resolveNormalization(
    template,
    isTTYSession,
    prompts,
  );

  const storyIds: string[] | undefined = options.story?.length
    ? options.story
    : undefined;

  deps.renderFilterCriteria({
    template,
    storyIds,
    limit: options.limit,
    isQuiet,
    outputPolicy,
    output,
  });

  if (!dryRun && isTTYSession) {
    await deps.confirmLiveExecution(template, { platform }, output);
  } else if (!dryRun && outputPolicy.showClackStatus) {
    output.warn("Live mode — acknowledged for non-interactive execution");
  }

  if (storyIds && options.limit !== undefined) {
    output.warn("--limit is ignored when --story is used");
  }

  const report = await deps.runWorkflow(
    template,
    platformAdapter,
    {
      dryRun,
      continueOnError: options.continueOnError,
      limit: options.limit !== undefined ? parseInt(options.limit, 10) : undefined,
      storyIds,
      storyConcurrency,
      dependencyConcurrency,
      forceNormalize,
      isTTYSession,
      profileLabel: options.profile,
    },
    output,
  );

  const exitCode = deps.printReport(
    report,
    { verbose: options.verbose === true, quiet: isQuiet },
    dryRun,
  );

  if (options.output) {
    await writeReportFile(
      options.output,
      report,
      options.includeSensitiveReportData,
    );
    if (outputPolicy.showStandardOutput) {
      output.print(chalk.gray(`\n  Report saved to ${sanitizeTty(options.output)}`));
      if (options.includeSensitiveReportData) {
        output.print(
          chalk.yellow(
            "  Note: report contains full work-item data (descriptions, custom fields). Keep it out of shared or CI artifact directories.",
          ),
        );
      }
    }
  }

  output.outro(
    exitCode === ExitCode.NoMatch ? "No stories matched" :
    dryRun ? "Dry run complete ✓" :
    exitCode === ExitCode.Success ? "Generation complete ✓" :
    "Generation finished with errors ✗",
  );

  return exitCode;
}
