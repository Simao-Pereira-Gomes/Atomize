import { chmod, writeFile } from "node:fs/promises";
import {
  cancel,
  confirm,
  intro,
  log,
  note,
  outro,
  progress,
  select,
  text,
} from "@clack/prompts";
import { logger } from "@config/logger";
import type { AtomizationReport, StoryAtomizationResult } from "@core/atomizer";
import { Atomizer, type ProgressEvent } from "@core/atomizer";
import type { ADoFieldSchema } from "@platforms/interfaces/field-schema.interface";
import type { IPlatformAdapter } from "@platforms/interfaces/platform.interface";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { PlatformFactory } from "@platforms/platform-factory";
import { TemplateLoader } from "@templates/loader";
import type { TaskTemplate } from "@templates/schema";
import { TemplateValidator } from "@templates/validator";
import { clampConcurrency } from "@utils/math";
import chalk from "chalk";
import { Command, Option } from "commander";
import { match } from "ts-pattern";
import { checkValueType } from "@/cli/commands/validate.command";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  createManagedSpinner,
  isInteractiveTerminal,
  sanitizeTty,
} from "@/cli/utilities/prompt-utilities";
import { extractCustomFieldRefs } from "@/core/condition-evaluator.js";


/** Strips sensitive fields from a WorkItem for safe report output. */
function sanitizeWorkItem(item: WorkItem): WorkItem {
  const { description: _d, customFields: _cf, platformSpecific: _ps, children, ...safe } = item;
  return children ? { ...safe, children: children.map(sanitizeWorkItem) } : safe;
}

/** Returns a copy of the report with sensitive fields stripped from all work items. */
export function sanitizeReport(report: AtomizationReport): AtomizationReport {
  return {
    ...report,
    results: report.results.map((result: StoryAtomizationResult) => ({
      ...result,
      story: sanitizeWorkItem(result.story),
      tasksCreated: result.tasksCreated.map(sanitizeWorkItem),
    })),
  };
}

export async function writeReportFile(
  outputPath: string,
  report: AtomizationReport,
  includeSensitiveReportData: boolean,
): Promise<void> {
  const reportToWrite = includeSensitiveReportData
    ? report
    : sanitizeReport(report);
  await writeFile(outputPath, JSON.stringify(reportToWrite, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });

  // Windows file permissions are ACL-based; chmod/stat POSIX mode bits are not reliable there.
  if (process.platform !== "win32") {
    await chmod(outputPath, 0o600);
  }
}

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
  return (msg: string) => {
    if (!quiet) console.log(msg);
  };
}

export interface ProgressHandle {
  start(msg: string): void;
  advance(step: number, msg: string): void;
  stop(msg: string): void;
}

interface SpinnerHandle {
  message(msg: string): void;
  stop(msg: string): void;
}

/**
 * Builds the onProgress callback for atomizer.atomize(), separating TTY
 * (spinner + progress bar) from non-TTY (plain print) output paths.
 * @internal Exported for testing
 */
export function createProgressHandler(
  isTTYSession: boolean,
  querySpinner: SpinnerHandle,
  storyProgressRef: { current: ProgressHandle | undefined },
  print: (msg: string) => void,
  logSuccess: (msg: string) => void,
  logError: (msg: string) => void,
  makeProgress: (totalStories: number) => ProgressHandle,
): (event: ProgressEvent) => void {
  return (event) => {
    switch (event.type) {
      case "query_start":
        if (isTTYSession) querySpinner.message("Querying work items...");
        break;
      case "query_complete":
        if (isTTYSession) {
          querySpinner.stop(`Found ${event.totalStories} stories`);
          storyProgressRef.current = makeProgress(event.totalStories ?? 1);
          storyProgressRef.current.start(
            `Processing stories (0/${event.totalStories})`,
          );
        } else {
          print(`Found ${event.totalStories} stories`);
        }
        break;
      case "story_start":
        if (!isTTYSession)
          print(
            `Processing ${(event.storyIndex ?? 0) + 1}/${event.totalStories}: ${sanitizeTty(event.story?.id)}...`,
          );
        break;
      case "story_complete":
        if (isTTYSession && storyProgressRef.current) {
          logSuccess(
            `[${event.completedStories}/${event.totalStories}] ${sanitizeTty(event.story?.id)}: ${sanitizeTty(event.story?.title)}`,
          );
          storyProgressRef.current.advance(
            1,
            `${event.completedStories}/${event.totalStories} stories`,
          );
        } else {
          print(
            `✓ [${event.completedStories}/${event.totalStories}] ${sanitizeTty(event.story?.id)}: ${sanitizeTty(event.story?.title)}`,
          );
        }
        break;
      case "story_error":
        if (isTTYSession && storyProgressRef.current) {
          logError(
            `[${event.completedStories}/${event.totalStories}] ${sanitizeTty(event.story?.id)}: ${sanitizeTty(event.error)}`,
          );
          storyProgressRef.current.advance(
            1,
            `${event.completedStories}/${event.totalStories} stories`,
          );
        } else {
          print(
            `✗ [${event.completedStories}/${event.totalStories}] ${sanitizeTty(event.story?.id)}: ${sanitizeTty(event.error)}`,
          );
        }
        break;
    }
  };
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

  const templatePath = templateArg ?? assertNotCancelled(
    await text({
      message: "Template file path:",
      placeholder: "templates/backend-api.yaml",
    }),
  );

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


async function loadAndValidateTemplate(
  templatePath: string,
  print: (msg: string) => void,
) {
  logger.info(`Loading template: ${templatePath}`);
  const template = await new TemplateLoader().load(templatePath);

  logger.info("Validating template...");
  const validation = new TemplateValidator().validate(template);

  if (!validation.valid) {
    cancel("Template validation failed");
    for (const err of validation.errors) {
      console.log(
        chalk.red(
          `  ${sanitizeTty(err.path)}: ${sanitizeTty(err.message)}`,
        ),
      );
    }
    process.exit(ExitCode.Failure);
  }

  console.log(chalk.cyan(`Template: ${sanitizeTty(template.name)}`));
  print(chalk.gray(`Description: ${sanitizeTty(template.description) || "N/A"}`));
  print(chalk.gray(`Tasks: ${template.tasks.length}\n`));

  if (validation.warnings.length > 0) {
    print(chalk.yellow(" Template warnings:"));
    for (const warn of validation.warnings) {
      print(chalk.yellow(`  • ${warn.path}: ${warn.message}`));
    }
    print("");
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
): Promise<IPlatformAdapter> {
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
      cancel(sanitizeTty(error.message));
      match(options.platform)
        .with("azure-devops", () => {
          console.log(chalk.yellow(" Setup Azure DevOps:"));
          console.log(chalk.gray("  Run: atomize auth add"));
          console.log(chalk.gray("  Get a PAT from: https://dev.azure.com/[your-org]/_usersSettings/tokens"));
          console.log(chalk.gray("  Required scopes: Work Items (Read, Write)\n"));
        })
        .otherwise(() => {});
    }
    process.exit(ExitCode.Failure);
  }
}

async function confirmLiveExecution(
  template: Awaited<ReturnType<TemplateLoader["load"]>>,
  options: { platform: string },
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
    outro("Cancelled.");
    process.exit(ExitCode.Success);
  }
}

/** @internal Exported for testing */
export function printReport(
  report: Awaited<ReturnType<Atomizer["atomize"]>>,
  options: { verbose: boolean },
  dryRun: boolean,
): number {
  if (report.storiesProcessed === 0) {
    console.log(chalk.yellow("No stories matched the filter criteria."));
    console.log(chalk.gray("  Check your template's filter configuration (types, states, tags).\n"));
    return ExitCode.NoMatch;
  }

  console.log("");
  console.log(chalk.cyan(" Summary:"));
  console.log(`  Template:          ${chalk.bold(report.templateName)}`);
  console.log(`  Stories processed: ${chalk.bold(report.storiesProcessed)}`);
  console.log(`  Stories success:   ${chalk.green.bold(report.storiesSuccess)}`);
  if (report.storiesFailed > 0)
    console.log(`  Stories failed:    ${chalk.red.bold(report.storiesFailed)}`);
  console.log(`  Tasks calculated:  ${chalk.bold(report.tasksCalculated)}`);
  console.log(`  Tasks created:     ${chalk.bold(report.tasksCreated)}`);
  console.log(`  Execution time:    ${chalk.gray(`${report.executionTime}ms`)}`);
  console.log("");

  if (options.verbose || report.storiesProcessed <= 5) {
    console.log(chalk.cyan(" Details:\n"));
    for (const result of report.results) {
      if (result.success) {
        console.log(chalk.green(`✓ ${sanitizeTty(result.story.id)}: ${sanitizeTty(result.story.title)}`));
        console.log(chalk.gray(`  Estimation: ${result.story.estimation || 0} points`));
        console.log(chalk.gray(`  Tasks: ${result.tasksCalculated.length}`));
        if (result.estimationSummary) {
          console.log(
            chalk.gray(
              `  Distribution: ${result.estimationSummary.totalTaskEstimation} points (${result.estimationSummary.percentageUsed.toFixed(0)}%)`,
            ),
          );
        }
        if (options.verbose && result.tasksCalculated.length > 0) {
          console.log(chalk.gray("  Task breakdown:"));
          for (const task of result.tasksCalculated) {
            console.log(chalk.gray(`    - ${sanitizeTty(task.title)}: ${task.estimation} points (${task.estimationPercent}%)`));
          }
        }
      } else {
        console.log(chalk.red(`✗ ${sanitizeTty(result.story.id)}: ${sanitizeTty(result.story.title)}`));
        console.log(chalk.red(`  Error: ${sanitizeTty(result.error)}`));
      }
      console.log("");
    }
  }

  if (report.errors.length > 0) {
    console.log(chalk.red.bold("Errors:\n"));
    for (const err of report.errors) {
      console.log(chalk.red(`  • ${sanitizeTty(err.storyId)}: ${sanitizeTty(err.error)}`));
    }
    console.log("");
  }

  if (report.warnings.length > 0) {
    console.log(chalk.yellow.bold("Warnings:\n"));
    for (const warn of report.warnings) {
      console.log(chalk.yellow(`  • ${sanitizeTty(warn)}`));
    }
    console.log("");
  }

  if (dryRun) {
    console.log(chalk.yellow("Dry run complete — no tasks were created."));
    console.log(chalk.gray("  Run with --execute to create tasks for real.\n"));
  } else if (report.storiesSuccess > 0) {
    console.log(chalk.green(`Created ${report.tasksCreated} tasks for ${report.storiesSuccess} ${report.storiesSuccess === 1 ? "story" : "stories"}.\n`));
  } else {
    console.log(chalk.red("No tasks were created.\n"));
  }

  return report.storiesFailed > 0 ? ExitCode.Failure : ExitCode.Success;
}

export const generateCommand = new Command("generate")
  .alias("gen")
  .description("Generate tasks from user stories using a template")
  .argument("[template]", "Path to template file (YAML)")
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
  .option("--profile <name>", "Named connection profile to use (uses default if omitted)")
  .action(async (templateArg: string | undefined, options) => {
    try {
      if (options.profile) {
        const { getProfile } = await import("@config/connections.config");
        const profile = await getProfile(options.profile);
        if (!profile) {
          cancel(`Profile "${options.profile}" not found. Run: atomize auth list`);
          process.exit(ExitCode.Failure);
        }
      }

      intro(" Atomize — Task Generator");

      const isTTYSession = isInteractiveTerminal();
      const willPrompt = !templateArg || options.platform === undefined || options.execute === true;
      if (isTTYSession && willPrompt) {
        console.log(chalk.gray("  ↑↓ to navigate · Space to toggle · Enter to confirm · Ctrl+C to cancel\n"));
      }

      if (options.quiet && options.verbose) {
        cancel("--quiet and --verbose are mutually exclusive.");
        process.exit(ExitCode.Failure);
      }

      const { templatePath, platform, dryRun } = await promptMissingArgs(templateArg, options);
      options.platform = platform;

      const liveExecutionError = getNonInteractiveLiveExecutionError({
        dryRun,
        isTTYSession,
        autoApprove: options.autoApprove,
      });
      if (liveExecutionError) {
        cancel(liveExecutionError);
        process.exit(ExitCode.Failure);
      }

      const isQuiet = options.quiet === true;
      const print = createPrinter(isQuiet);

      if (options.verbose) logger.level = "info";
      else if (isQuiet) logger.level = "error";

      if (dryRun) log.info("Dry-run mode — no tasks will be created");
      else log.warn("Live mode — tasks will be created");

      const template = await loadAndValidateTemplate(templatePath, print);
      const { storyConcurrency, taskConcurrency, dependencyConcurrency } = parseConcurrency(options, print);
      const platform_ = await initPlatform({ platform, profile: options.profile }, taskConcurrency);

      const authSpinner = createManagedSpinner();
      if (isTTYSession) authSpinner.start("Authenticating...");
      const AUTH_TIMEOUT_MS = 15_000;
      await Promise.race([
        platform_.authenticate(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Authentication timed out after 15s. Check your network connection and credentials.")),
            AUTH_TIMEOUT_MS,
          ),
        ),
      ]);
      const metadata = platform_.getPlatformMetadata();
      const profileLabel = options.profile ? ` · profile: ${options.profile}` : "";
      if (isTTYSession) authSpinner.stop(`Connected: ${metadata.name} v${metadata.version}${profileLabel} ✓`);
      else print(`Connected: ${metadata.name} v${metadata.version}${profileLabel} ✓`);

      await validateCustomFieldsPreFlight(template, platform_);

      const forceNormalize = await resolveNormalization(template, isTTYSession);

      const atomizer = new Atomizer(platform_);

      const hasFilterCriteria =
        template.filter.savedQuery ||
        template.filter.workItemTypes ||
        template.filter.states ||
        template.filter.tags?.include ||
        template.filter.excludeIfHasTasks;

      if (isQuiet) {
        const filterLabel = [
          template.filter.workItemTypes
            ?.map((value) => sanitizeTty(value))
            .join(", "),
          template.filter.states
            ? `states: ${template.filter.states.map((value) => sanitizeTty(value)).join(", ")}`
            : undefined,
        ].filter(Boolean).join(" · ") || "All items";
        console.log(chalk.gray(`Filter:   ${filterLabel}`));
      } else {
        console.log(chalk.cyan(" Filter Criteria:"));
        if (template.filter.savedQuery?.id)
          console.log(chalk.gray(`  Saved query ID: ${sanitizeTty(template.filter.savedQuery.id)}`));
        else if (template.filter.savedQuery?.path)
          console.log(chalk.gray(`  Saved query: ${sanitizeTty(template.filter.savedQuery.path)}`));
        else {
          if (template.filter.workItemTypes)
            console.log(
              chalk.gray(
                `  Types: ${template.filter.workItemTypes.map((value) => sanitizeTty(value)).join(", ")}`,
              ),
            );
          if (template.filter.states)
            console.log(
              chalk.gray(
                `  States: ${template.filter.states.map((value) => sanitizeTty(value)).join(", ")}`,
              ),
            );
          if (template.filter.tags?.include)
            console.log(
              chalk.gray(
                `  Tags (include): ${template.filter.tags.include.map((value) => sanitizeTty(value)).join(", ")}`,
              ),
            );
          if (template.filter.excludeIfHasTasks)
            console.log(chalk.gray("  Exclude if has tasks: Yes"));
        }
        if (options.limit !== undefined)
          console.log(chalk.gray(`  Limit: ${options.limit} items`));
        if (!hasFilterCriteria)
          console.log(chalk.gray("  Matches all work items"));
      }
      console.log("");

      if (!dryRun && isTTYSession) {
        await confirmLiveExecution(template, { platform });
      } else if (!dryRun) {
        log.warn("Live mode — acknowledged for non-interactive execution");
      }

      logger.info("Starting atomization...");
      const querySpinner = createManagedSpinner();
      const storyProgressRef: { current: ProgressHandle | undefined } = { current: undefined };

      if (isTTYSession) querySpinner.start("Querying work items...");
      else print("Querying work items...");

      const ATOMIZE_TIMEOUT_MS = 5 * 60 * 1_000;
      const report = await Promise.race([
        atomizer.atomize(template, {
          dryRun,
          continueOnError: options.continueOnError,
          limit: options.limit !== undefined ? parseInt(options.limit, 10) : undefined,
          storyConcurrency,
          dependencyConcurrency,
          forceNormalize,
          onProgress: createProgressHandler(
            isTTYSession,
            querySpinner,
            storyProgressRef,
            print,
            log.success,
            log.error,
            (total) => progress({ max: total, style: "block" }),
          ),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Generation timed out after 5 minutes. The Azure DevOps API may be unresponsive.")),
            ATOMIZE_TIMEOUT_MS,
          ),
        ),
      ]);

      if (report.storiesProcessed > 0) {
        if (isTTYSession && storyProgressRef.current) storyProgressRef.current.stop("Processing complete");
        else print("Processing complete");
      }

      const exitCode = printReport(report, options, dryRun);

      if (options.output) {
        await writeReportFile(
          options.output,
          report,
          options.includeSensitiveReportData,
        );
        if (!isQuiet) {
          console.log(
            chalk.gray(`\n  Report saved to ${sanitizeTty(options.output)}`),
          );
          if (options.includeSensitiveReportData) {
            console.log(chalk.yellow(`  Note: report contains full work-item data (descriptions, custom fields). Keep it out of shared or CI artifact directories.`));
          }
        }
      }

      outro(
        exitCode === ExitCode.NoMatch ? "No stories matched" :
        dryRun ? "Dry run complete ✓" :
        exitCode === ExitCode.Success ? "Generation complete ✓" :
        "Generation finished with errors ✗",
      );
      process.exit(exitCode);
    } catch (error) {
      cancel("Generation failed");
      if (error instanceof Error) {
        console.log(chalk.red(sanitizeTty(error.message)));
      }
      process.exit(ExitCode.Failure);
    }
  });

async function resolveNormalization(
  template: TaskTemplate,
  isTTYSession: boolean,
): Promise<boolean> {
  const total = template.tasks.reduce((s, t) => s + (t.estimationPercent ?? 0), 0);
  if (total <= 100) return false;

  if (isTTYSession) {
    return assertNotCancelled(
      await confirm({
        message: `Total task estimation is ${total}% (exceeds 100%). Normalise to 100% before generating?`,
        initialValue: false,
      }),
    );
  }

  logger.warn(`Template total estimation is ${total}% (exceeds 100%). Proceeding without normalisation. Run interactively to be prompted.`);
  return false;
}

async function collectTaskFieldErrors(
  tasks: TaskTemplate["tasks"],
  getFieldSchemas: NonNullable<IPlatformAdapter["getFieldSchemas"]>,
  errors: string[],
): Promise<void> {
  const schemas = await getFieldSchemas("Task");
  const schemaByRef = new Map<string, ADoFieldSchema>(schemas.map((f) => [f.referenceName, f]));

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (!task?.customFields) continue;

    for (const [refName, value] of Object.entries(task.customFields)) {
      const schema = schemaByRef.get(refName);
      const fieldPath = `tasks[${i}].customFields`;

      if (!schema) {
        errors.push(`${fieldPath}: Field "${refName}" not found for work item type "Task".`);
        continue;
      }

      if (schema.isReadOnly) {
        errors.push(`${fieldPath}: Field "${refName}" is read-only and cannot be set.`);
        continue;
      }

      if (typeof value === "string" && value.includes("{{")) continue;

      if (schema.allowedValues && schema.allowedValues.length > 0) {
        const strValue = String(value);
        if (!schema.allowedValues.includes(strValue)) {
          errors.push(
            `${fieldPath}: Value "${strValue}" is not in the allowed values for "${refName}": [${schema.allowedValues.join(", ")}].`,
          );
        }
        continue;
      }

      const typeError = checkValueType(refName, value, schema.type, `${fieldPath}["${refName}"]`);
      if (typeError) errors.push(`${typeError.path}: ${typeError.message}`);
    }
  }
}

async function collectConditionFieldErrors(
  conditionRefs: string[],
  workItemTypes: string[],
  getFieldSchemas: NonNullable<IPlatformAdapter["getFieldSchemas"]>,
  errors: string[],
): Promise<void> {
  const schemasByWit = new Map<string, Map<string, ADoFieldSchema>>();
  for (const wit of workItemTypes) {
    const witSchemas = await getFieldSchemas(wit);
    schemasByWit.set(wit, new Map(witSchemas.map((f) => [f.referenceName, f])));
  }

  for (const ref of conditionRefs) {
    for (const wit of workItemTypes) {
      const witSchemaMap = schemasByWit.get(wit);
      if (witSchemaMap && !witSchemaMap.has(ref)) {
        errors.push(
          `tasks[condition]: Custom field "${ref}" referenced in condition not found for work item type "${wit}".`,
        );
      }
    }
  }
}

export async function validateCustomFieldsPreFlight(
  template: TaskTemplate,
  platform: IPlatformAdapter,
): Promise<void> {
  if (!platform.getFieldSchemas) return;

  const tasksWithFields = template.tasks.filter(
    (t) => t.customFields && Object.keys(t.customFields).length > 0,
  );
  const conditionRefs = Array.from(
    new Set(
      template.tasks.flatMap((t) =>
        t.condition ? extractCustomFieldRefs(t.condition) : [],
      ),
    ),
  );

  if (tasksWithFields.length === 0 && conditionRefs.length === 0) return;

  const s = createManagedSpinner();
  s.start("Validating custom fields against ADO schema...");

  const errors: string[] = [];

  if (tasksWithFields.length > 0) {
    await collectTaskFieldErrors(template.tasks, platform.getFieldSchemas, errors);
  }

  if (conditionRefs.length > 0 && template.filter.workItemTypes?.length) {
    await collectConditionFieldErrors(
      conditionRefs,
      template.filter.workItemTypes,
      platform.getFieldSchemas,
      errors,
    );
  }

  if (errors.length > 0) {
    s.stop("Custom field validation failed");
    console.log(chalk.red("\n  Custom field errors:\n"));
    for (const err of errors) {
      console.log(chalk.red(`  • ${err}`));
    }
    cancel("Fix custom field errors before generating.");
    process.exit(ExitCode.Failure);
  }

  s.stop(`Custom fields valid ✓`);
}
