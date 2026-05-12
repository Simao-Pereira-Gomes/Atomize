import {
  confirm,
  note,
  select,
  text,
} from "@clack/prompts";
import type { Config } from "@config/config";
import { logger } from "@config/logger";
import type { Atomizer } from "@core/atomizer";
import type {
  GenerationPlatform,
  PlatformAuthenticator,
  ProjectMetadataReader,
} from "@platforms/interfaces/platform-capabilities";
import { PlatformFactory } from "@platforms/platform-factory";
import type { CompositionMeta } from "@templates/loader";
import type { TaskTemplate } from "@templates/schema";
import { TemplateLibrary } from "@templates/template-library";
import { clampConcurrency } from "@utils/math";
import chalk from "chalk";
import { Command, Option } from "commander";
import { match } from "ts-pattern";
import { runGenerateCommandApplication } from "@/cli/commands/generate-application";
import { runGenerateWorkflow } from "@/cli/orchestrator/generate-workflow";
import {
  type CommandOutputPolicy,
  createCommandOutput,
  createCommandPrinter,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import type { OutputSinkFactory } from "@/cli/utilities/output-sink";
import type { PromptDriver } from "@/cli/utilities/prompt-driver";
import {
  assertNotCancelled,
  isInteractiveTerminal,
  sanitizeTty,
  selectOrAutocomplete,
} from "@/cli/utilities/prompt-utilities";
import { shouldOfferOverageNormalization } from "@/core/estimation-distribution";


export function getNonInteractiveLiveExecutionError(options: {
  dryRun: boolean;
  isTTYSession: boolean;
  autoApprove?: boolean;
}): string | undefined {
  if (options.dryRun || options.isTTYSession || options.autoApprove) {
    return undefined;
  }

  return (
    "Refusing live execution without confirmation in non-interactive mode. " +
    "Re-run with --auto-approve to acknowledge task creation."
  );
}

/**
 * Returns a print function that writes to stdout only when quiet mode is off.
 * @internal Exported for testing
 */
export function createPrinter(quiet: boolean): (msg: string) => void {
  return createCommandPrinter(resolveCommandOutputPolicy({ quiet, verbose: false }));
}

export function resolveCommandLogLevel(options: {
  quiet: boolean;
  verbose: boolean;
}): CommandOutputPolicy["logLevel"] {
  return resolveCommandOutputPolicy(options).logLevel;
}

export function resolveGenerateOutputPolicy(options: {
  quiet: boolean;
  verbose: boolean;
}): CommandOutputPolicy {
  return resolveCommandOutputPolicy(options);
}

interface ConcurrencySettings {
  storyConcurrency: number;
  taskConcurrency: number;
  dependencyConcurrency: number;
}

async function promptMissingArgs(
  templateArg: string | undefined,
  options: { platform: string | undefined; execute: boolean },
): Promise<{ templatePath: string; platform: string; dryRun: boolean }> {
  const interactive = isInteractiveTerminal();

  let templatePath: string;
  if (templateArg !== undefined) {
    templatePath = templateArg;
  } else {
    const source = assertNotCancelled(
      await select({
        message: "Template source:",
        options: [
          { label: "Pick from catalog", value: "catalog" },
          { label: "Enter file path", value: "path" },
        ],
      }),
    ) as string;

    if (source === "catalog") {
      const { items: templates, overrides } = await new TemplateLibrary().getCatalog("template");
      if (templates.length === 0) {
        throw new Error("No templates found. Create one with: atomize template create");
      }
      const overriddenByScope = new Map(overrides.map((o) => [o.overridden.path, o.active.scope]));
      const allTemplates = [...templates, ...overrides.map((o) => o.overridden)];
      templatePath = await selectOrAutocomplete({
        message: "Select template:",
        options: allTemplates.map((t) => ({
          label: overriddenByScope.has(t.path)
            ? `${t.displayName} (${t.scope}) — overridden by ${overriddenByScope.get(t.path)}`
            : `${t.displayName} (${t.scope})`,
          value: t.path,
          hint: t.description,
        })),
        placeholder: "Type to filter templates...",
      });
    } else {
      templatePath = assertNotCancelled(
        await text({
          message: "Template file path:",
          placeholder: "template:backend-api",
        }),
      ) as string;
    }
  }

  const platformOptions = [
    ...(process.env.ATOMIZE_DEV === "true"
      ? [{ label: "Mock (for testing)", value: "mock" }]
      : []),
    { label: "Azure DevOps", value: "azure-devops" },
  ];

  const platform = options.platform ?? (
    interactive
      ? (assertNotCancelled(
          await select({
            message: "Select platform:",
            options: platformOptions,
            initialValue: "azure-devops",
          }),
        ) as string)
      : "azure-devops"
  );

  return { templatePath, platform, dryRun: !options.execute };
}


function formatInheritanceNote(meta: CompositionMeta): string {
  if (!meta.isComposed) return "";
  const parts: string[] = [];
  if (meta.extendsRef) parts.push(`extends ${meta.extendsRef}`);
  if (meta.mixinRefs.length > 0) parts.push(`${meta.mixinRefs.length} mixin(s)`);
  return chalk.gray(` (${parts.join(", ")})`);
}

async function loadAndValidateTemplate(
  templatePath: string,
  output: Pick<ReturnType<typeof createCommandOutput>, "print" | "cancel">,
): Promise<TaskTemplate> {
  const { template, meta, source, validation } =
    await new TemplateLibrary().getRunnableTemplate(templatePath, {
      validate: false,
      onNotice: (message) => output.print(chalk.yellow(message)),
    });
  logger.info(`Loading template: ${source.path ?? source.url ?? source.input}`);

  if (!validation.valid) {
    output.cancel("Template validation failed");
    for (const err of validation.errors) {
      output.print(
        chalk.red(
          `  ${sanitizeTty(err.path)}: ${sanitizeTty(err.message)}`,
        ),
      );
    }
    throw new ExitError(ExitCode.Failure);
  }

  output.print(chalk.cyan(`Template: ${sanitizeTty(template.name)}${formatInheritanceNote(meta)}`));
  output.print(chalk.gray(`Description: ${sanitizeTty(template.description) || "N/A"}`));
  output.print(chalk.gray(`Tasks: ${template.tasks.length}\n`));

  if (validation.warnings.length > 0) {
    output.print(chalk.yellow(" Template warnings:"));
    for (const warn of validation.warnings) {
      output.print(chalk.yellow(`  • ${warn.path}: ${warn.message}`));
    }
    output.print("");
  }

  return template;
}

/** @internal Exported for testing */
export function parseConcurrency(
  options: {
    taskConcurrency: string;
    storyConcurrency: string;
    dependencyConcurrency: string;
  },
  print: (msg: string) => void,
): ConcurrencySettings {
  const MIN = 1;
  const MAX_STORY = 10;
  const MAX_TASK = 20;
  const MAX_DEP = 10;

  const rawTask = parseInt(options.taskConcurrency, 10) || 5;
  const rawStory = parseInt(options.storyConcurrency, 10) || 3;
  const rawDep = parseInt(options.dependencyConcurrency, 10) || 5;

  const taskConcurrency = clampConcurrency(rawTask, MIN, MAX_TASK, 5);
  const storyConcurrency = clampConcurrency(rawStory, MIN, MAX_STORY, 3);
  const dependencyConcurrency = clampConcurrency(rawDep, MIN, MAX_DEP, 5);

  if (rawTask !== taskConcurrency)
    print(chalk.yellow(`Task concurrency must be between ${MIN} and ${MAX_TASK}. Using default (5).`));
  if (rawStory !== storyConcurrency)
    print(chalk.yellow(`Story concurrency must be between ${MIN} and ${MAX_STORY}. Using default (3).`));
  if (rawDep !== dependencyConcurrency)
    print(chalk.yellow(`Dependency concurrency must be between ${MIN} and ${MAX_DEP}. Using default (5).`));

  logger.info(`Concurrency settings: ${storyConcurrency} stories, ${taskConcurrency} tasks`);

  return { storyConcurrency, taskConcurrency, dependencyConcurrency };
}

async function initPlatform(
  options: { platform: string; profile?: string },
  taskConcurrency: number,
  output: Pick<ReturnType<typeof createCommandOutput>, "cancel" | "print">,
): Promise<PlatformAuthenticator & GenerationPlatform & ProjectMetadataReader> {
  logger.info(`Initializing ${options.platform} platform...`);
  try {
    return await match(options.platform)
      .with("azure-devops", async () => {
        const { resolveAzureConfig } = await import("@config/profile-resolver");
        const azureConfig = await resolveAzureConfig(options.profile);
        return PlatformFactory.create("azure-devops", {
          ...azureConfig,
          maxConcurrency: taskConcurrency,
        });
      })
      .otherwise(() => PlatformFactory.create(options.platform as import("@platforms/interfaces/platform.interface").PlatformType));
  } catch (error) {
    if (error instanceof Error) {
      output.cancel(sanitizeTty(error.message));
      match(options.platform)
        .with("azure-devops", () => {
          output.print(chalk.yellow(" Setup Azure DevOps:"));
          output.print(chalk.gray("  Run: atomize auth add"));
          output.print(chalk.gray("  Get a PAT from: https://dev.azure.com/[your-org]/_usersSettings/tokens"));
          output.print(chalk.gray("  Required scopes: Work Items (Read, Write)\n"));
        })
        .otherwise(() => {});
    }
    throw new ExitError(ExitCode.Failure);
  }
}

async function confirmLiveExecution(
  template: TaskTemplate,
  options: { platform: string },
  output: Pick<ReturnType<typeof createCommandOutput>, "outro">,
): Promise<void> {
  const filterParts: string[] = [];
  if (template.filter.savedQuery?.id)
    filterParts.push(`Saved query ID: ${sanitizeTty(template.filter.savedQuery.id)}`);
  else if (template.filter.savedQuery?.path)
    filterParts.push(`Saved query: ${sanitizeTty(template.filter.savedQuery.path)}`);
  else {
    if (template.filter.workItemTypes)
      filterParts.push(
        `Types: ${template.filter.workItemTypes.map((value) => sanitizeTty(value)).join(", ")}`,
      );
    if (template.filter.states)
      filterParts.push(
        `States: ${template.filter.states.map((value) => sanitizeTty(value)).join(", ")}`,
      );
    if (template.filter.tags?.include)
      filterParts.push(
        `Tags: ${template.filter.tags.include.map((value) => sanitizeTty(value)).join(", ")}`,
      );
  }

  note(
    [
      `Template:  ${sanitizeTty(template.name)}`,
      `Filter:    ${filterParts.join(" · ") || "All items"}`,
      `Platform:  ${sanitizeTty(options.platform)}`,
      "",
      "This will CREATE tasks in your work tracking system.",
    ].join("\n"),
    "⚠  LIVE MODE",
  );

  const proceed = assertNotCancelled(
    await confirm({ message: "Proceed with task creation?", initialValue: false }),
  );
  if (!proceed) {
    output.outro("Cancelled.");
    process.exit(ExitCode.Success);
  }
}

/** @internal Exported for testing */
export function printReport(
  report: Awaited<ReturnType<Atomizer["atomize"]>>,
  options: { verbose: boolean; quiet?: boolean },
  dryRun: boolean,
): number {
  const output = createCommandOutput(
    resolveCommandOutputPolicy({
      quiet: options.quiet === true,
      verbose: options.verbose,
    }),
  );

  if (report.storiesProcessed === 0) {
    output.printAlways(chalk.yellow("No stories matched the filter criteria."));
    if (!options.quiet) {
      output.print(chalk.gray("  Check your template's filter configuration (types, states, tags).\n"));
    }
    return ExitCode.NoMatch;
  }

  if (options.quiet) {
    if (report.errors.length > 0) {
      for (const err of report.errors) {
        output.printAlways(chalk.red(`Error: ${sanitizeTty(err.storyId)}: ${sanitizeTty(err.error)}`));
      }
    }

    if (report.storiesFailed > 0) {
      output.printAlways(
        chalk.red(
          `Generation finished with ${report.storiesFailed} failed ${report.storiesFailed === 1 ? "story" : "stories"}.`,
        ),
      );
      return ExitCode.Failure;
    }

    if (dryRun) {
      output.printAlways(
        chalk.yellow(
          `Dry run complete for ${report.storiesSuccess} ${report.storiesSuccess === 1 ? "story" : "stories"}.`,
        ),
      );
    } else if (report.storiesSuccess > 0) {
      output.printAlways(
        chalk.green(
          `Created ${report.tasksCreated} tasks for ${report.storiesSuccess} ${report.storiesSuccess === 1 ? "story" : "stories"}.`,
        ),
      );
    } else {
      output.printAlways(chalk.red("No tasks were created."));
    }

    return ExitCode.Success;
  }

  output.blankLine();
  output.print(chalk.cyan(" Summary:"));
  output.print(`  Template:          ${chalk.bold(report.templateName)}`);
  output.print(`  Stories processed: ${chalk.bold(report.storiesProcessed)}`);
  output.print(`  Stories success:   ${chalk.green.bold(report.storiesSuccess)}`);
  if (report.storiesFailed > 0)
    output.print(`  Stories failed:    ${chalk.red.bold(report.storiesFailed)}`);
  output.print(`  Tasks calculated:  ${chalk.bold(report.tasksCalculated)}`);
  output.print(`  Tasks created:     ${chalk.bold(report.tasksCreated)}`);
  output.print(`  Execution time:    ${chalk.gray(`${report.executionTime}ms`)}`);
  output.blankLine();

  if (options.verbose || report.storiesProcessed <= 5) {
    output.print(chalk.cyan(" Details:\n"));
    for (const result of report.results) {
      if (result.success) {
        output.print(chalk.green(`✓ ${sanitizeTty(result.story.id)}: ${sanitizeTty(result.story.title)}`));
        output.print(chalk.gray(`  Estimation: ${result.story.estimation || 0} points`));
        output.print(chalk.gray(`  Tasks: ${result.tasksCalculated.length}`));
        if (result.estimationSummary) {
          output.print(
            chalk.gray(
              `  Distribution: ${result.estimationSummary.totalTaskEstimation} points (${result.estimationSummary.percentageUsed.toFixed(0)}%)`,
            ),
          );
        }
        if ((options.verbose || dryRun) && result.tasksCalculated.length > 0) {
          output.print(chalk.gray("  Task breakdown:"));
          for (const task of result.tasksCalculated) {
            output.print(chalk.gray(`    - ${sanitizeTty(task.title)}: ${task.estimation} points (${task.estimationPercent}%)`));
          }
        }
      } else {
        output.print(chalk.red(`✗ ${sanitizeTty(result.story.id)}: ${sanitizeTty(result.story.title)}`));
        output.print(chalk.red(`  Error: ${sanitizeTty(result.error)}`));
      }
      output.blankLine();
    }
  }

  if (report.errors.length > 0) {
    output.print(chalk.red.bold("Errors:\n"));
    for (const err of report.errors) {
      output.print(chalk.red(`  • ${sanitizeTty(err.storyId)}: ${sanitizeTty(err.error)}`));
    }
    output.blankLine();
  }

  if (report.warnings.length > 0) {
    output.print(chalk.yellow.bold("Warnings:\n"));
    for (const warn of report.warnings) {
      output.print(chalk.yellow(`  • ${sanitizeTty(warn)}`));
    }
    output.blankLine();
  }

  if (dryRun) {
    output.print(chalk.yellow("Dry run complete — no tasks were created."));
    output.print(chalk.gray("  Run with --execute to create tasks for real.\n"));
  } else if (report.storiesSuccess > 0) {
    output.print(chalk.green(`Created ${report.tasksCreated} tasks for ${report.storiesSuccess} ${report.storiesSuccess === 1 ? "story" : "stories"}.\n`));
  } else {
    output.print(chalk.red("No tasks were created.\n"));
  }

  return report.storiesFailed > 0 ? ExitCode.Failure : ExitCode.Success;
}

function renderFilterCriteria(input: {
  template: TaskTemplate;
  storyIds: string[] | undefined;
  limit: string | undefined;
  isQuiet: boolean;
  outputPolicy: CommandOutputPolicy;
  output: Pick<ReturnType<typeof createCommandOutput>, "print" | "blankLine" | "warn">;
}): void {
  const { template, storyIds, limit, isQuiet, outputPolicy, output } = input;
  const hasFilterCriteria =
    storyIds ||
    template.filter.savedQuery ||
    template.filter.workItemTypes ||
    template.filter.states ||
    template.filter.tags?.include ||
    template.filter.excludeIfHasTasks;

  if (isQuiet) {
    const filterLabel = storyIds
      ? `Story IDs: ${storyIds.map((id) => sanitizeTty(id)).join(", ")}`
      : [
          template.filter.workItemTypes
            ?.map((value) => sanitizeTty(value))
            .join(", "),
          template.filter.states
            ? `states: ${template.filter.states.map((value) => sanitizeTty(value)).join(", ")}`
            : undefined,
        ].filter(Boolean).join(" · ") || "All items";
    if (outputPolicy.showStandardOutput) {
      output.print(chalk.gray(`Filter:   ${filterLabel}`));
    }
  } else if (outputPolicy.showStandardOutput) {
    output.print(chalk.cyan(" Filter Criteria:"));
    if (storyIds) {
      output.print(
        chalk.gray(`  Story IDs: ${storyIds.map((id) => sanitizeTty(id)).join(", ")} (template filter bypassed)`),
      );
      if (template.filter.excludeIfHasTasks)
        output.print(chalk.gray("  Exclude if has tasks: Yes"));
    } else if (template.filter.savedQuery?.id) {
      output.print(chalk.gray(`  Saved query ID: ${sanitizeTty(template.filter.savedQuery.id)}`));
    } else if (template.filter.savedQuery?.path) {
      output.print(chalk.gray(`  Saved query: ${sanitizeTty(template.filter.savedQuery.path)}`));
    } else {
      if (template.filter.workItemTypes)
        output.print(
          chalk.gray(
            `  Types: ${template.filter.workItemTypes.map((value) => sanitizeTty(value)).join(", ")}`,
          ),
        );
      if (template.filter.states)
        output.print(
          chalk.gray(
            `  States: ${template.filter.states.map((value) => sanitizeTty(value)).join(", ")}`,
          ),
        );
      if (template.filter.tags?.include)
        output.print(
          chalk.gray(
            `  Tags (include): ${template.filter.tags.include.map((value) => sanitizeTty(value)).join(", ")}`,
          ),
        );
      if (template.filter.excludeIfHasTasks)
        output.print(chalk.gray("  Exclude if has tasks: Yes"));
    }
    if (!storyIds && limit !== undefined)
      output.print(chalk.gray(`  Limit: ${limit} items`));
    if (!hasFilterCriteria)
      output.print(chalk.gray("  Matches all work items"));
  }
  if (outputPolicy.showStandardOutput) {
    output.blankLine();
  }
}

export function makeGenerateCommand(makeOutput: OutputSinkFactory, prompts: PromptDriver, config: Config): Command {
  return new Command("generate")
  .alias("gen")
  .description("Generate tasks from user stories using a template")
  .argument("[template]", "Path to a YAML template file or catalog ref (e.g. template:backend-api)")
  .option("-p, --platform <platform>", "Platform to use")
  .option("--execute", "Execute task creation (default is dry-run preview)", false)
  .option("--continue-on-error", "Continue processing remaining stories if one fails", false)
  .option("--auto-approve", "Acknowledge live execution in non-interactive mode", false)
  .addOption(new Option("--story-concurrency <number>", "Max concurrent stories to process").default("3").hideHelp())
  .addOption(new Option("--task-concurrency <number>", "Max concurrent tasks to create per story").default("5").hideHelp())
  .addOption(new Option("--dependency-concurrency <number>", "Max concurrent dependency links to create").default("5").hideHelp())
  .option("-v, --verbose", "Show detailed output", false)
  .option("-o, --output <file>", "Write JSON report to file")
  .option(
    "--include-sensitive-report-data",
    "Include work item descriptions, custom fields, and platform-specific data in the JSON report (--output only)",
    false,
  )
  .option("-q, --quiet", "Suppress non-essential output", false)
  .option("--limit <number>", "Cap the number of work items processed (useful for testing)")
  .option(
    "--story <ids...>",
    "Fetch specific work items by ID, bypassing the template filter. excludeIfHasTasks still applies.",
  )
  .option("--profile <name>", "Named connection profile to use (uses default if omitted)")
  .action(async (templateArg: string | undefined, options) => {
      try {
      const isTTYSession = isInteractiveTerminal();
      const isQuiet = options.quiet === true;
      const outputPolicy = resolveGenerateOutputPolicy({
        quiet: isQuiet,
        verbose: options.verbose === true,
      });
      const output = makeOutput({ quiet: isQuiet, verbose: options.verbose === true });
        if (options.profile) {
        const { getProfile } = await import("@config/connections.config");
        const profile = await getProfile(options.profile);
        if (!profile) {
          output.cancel(`Profile "${options.profile}" not found. Run: atomize auth list`);
          throw new ExitError(ExitCode.Failure);
        }
      }

      output.intro(" Atomize — Task Generator");
      const willPrompt = !templateArg || options.platform === undefined || options.execute === true;
      if (isTTYSession && willPrompt && outputPolicy.showStandardOutput) {
        output.print(chalk.gray("  ↑↓ to navigate · Space to toggle · Enter to confirm · Ctrl+C to cancel\n"));
      }

      if (options.quiet && options.verbose) {
        output.cancel("--quiet and --verbose are mutually exclusive.");
        throw new ExitError(ExitCode.Failure);
      }

      const exitCode = await runGenerateCommandApplication({
        templateArg,
        options,
        config,
        prompts,
        isTTYSession,
        isQuiet,
        outputPolicy,
        output,
        deps: {
          promptMissingArgs,
          getNonInteractiveLiveExecutionError,
          loadTemplate: loadAndValidateTemplate,
          parseConcurrency,
          initPlatform,
          resolveNormalization,
          renderFilterCriteria,
          confirmLiveExecution,
          runWorkflow: runGenerateWorkflow,
          printReport,
        },
      });
      process.exit(exitCode);
    } catch (error) {
      if (!(error instanceof ExitError)) {
        const output = makeOutput({
          quiet: options.quiet === true,
          verbose: options.verbose === true,
        });
        output.cancel("Generation failed");
        if (error instanceof Error) {
          output.print(chalk.red(sanitizeTty(error.message)));
        }
      }
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });
}


async function resolveNormalization(
  template: TaskTemplate,
  isTTYSession: boolean,
  prompts: PromptDriver,
): Promise<boolean> {
  const { shouldOffer, total } = shouldOfferOverageNormalization(template.tasks);
  if (!shouldOffer) return false;

  if (isTTYSession) {
    return prompts.confirm({
      message: `Total task estimation is ${total}% (exceeds 100%). Normalise to 100% before generating?`,
      initialValue: false,
    });
  }

  logger.warn(`Template total estimation is ${total}% (exceeds 100%). Proceeding without normalisation. Run interactively to be prompted.`);
  return false;
}

export { validateCustomFieldsPreFlight } from "@/cli/orchestrator/generation-preflight";
