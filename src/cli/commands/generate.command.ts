import { writeFile } from "node:fs/promises";
import {
  cancel,
  confirm,
  intro,
  log,
  note,
  outro,
  progress,
  select,
  spinner,
  text,
} from "@clack/prompts";
import { logger } from "@config/logger";
import { Atomizer, type ProgressEvent } from "@core/atomizer";
import { PlatformFactory } from "@platforms/platform-factory";
import { TemplateLoader } from "@templates/loader";
import { TemplateValidator } from "@templates/validator";
import { clampConcurrency } from "@utils/math";
import chalk from "chalk";
import { Command } from "commander";
import { match } from "ts-pattern";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  isInteractiveTerminal,
} from "@/cli/utilities/prompt-utilities";
import type { IPlatformAdapter } from "@/platforms";

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
            `Processing ${(event.storyIndex ?? 0) + 1}/${event.totalStories}: ${event.story?.id}...`,
          );
        break;
      case "story_complete":
        if (isTTYSession && storyProgressRef.current) {
          logSuccess(
            `[${event.completedStories}/${event.totalStories}] ${event.story?.id}: ${event.story?.title}`,
          );
          storyProgressRef.current.advance(
            1,
            `${event.completedStories}/${event.totalStories} stories`,
          );
        } else {
          print(
            `✓ [${event.completedStories}/${event.totalStories}] ${event.story?.id}: ${event.story?.title}`,
          );
        }
        break;
      case "story_error":
        if (isTTYSession && storyProgressRef.current) {
          logError(
            `[${event.completedStories}/${event.totalStories}] ${event.story?.id}: ${event.error}`,
          );
          storyProgressRef.current.advance(
            1,
            `${event.completedStories}/${event.totalStories} stories`,
          );
        } else {
          print(
            `✗ [${event.completedStories}/${event.totalStories}] ${event.story?.id}: ${event.error}`,
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
  options: { platform: string; dryRun: boolean; execute: boolean },
): Promise<{ templatePath: string; platform: string; dryRun: boolean }> {
  if (templateArg) {
    return {
      templatePath: templateArg,
      platform: options.platform,
      dryRun: options.execute ? false : options.dryRun,
    };
  }

  const templatePath = assertNotCancelled(
    await text({
      message: "Template file path:",
      placeholder: "templates/backend-api.yaml",
    }),
  );

  const platform = assertNotCancelled(
    await select({
      message: "Select platform:",
      options: [
        ...(process.env.ATOMIZE_DEV === "true"
          ? [{ label: "Mock (for testing)", value: "mock" }]
          : []),
        { label: "Azure DevOps", value: "azure-devops" },
      ],
      initialValue: "azure-devops",
    }),
  ) as string;

  const dryRun = assertNotCancelled(
    await confirm({
      message: "Dry run (preview only, no actual creation)?",
      initialValue: true,
    }),
  );

  return { templatePath, platform, dryRun: options.execute ? false : dryRun };
}


async function loadAndValidateTemplate(
  templatePath: string,
  print: (msg: string) => void,
) {
  logger.info(`Loading template: ${templatePath}`);
  const template = await new TemplateLoader().load(templatePath);

  print(chalk.cyan(`Template: ${template.name}`));
  print(chalk.gray(`Description: ${template.description || "N/A"}`));
  print(chalk.gray(`Tasks: ${template.tasks.length}\n`));

  logger.info("Validating template...");
  const validation = new TemplateValidator().validate(template);

  if (!validation.valid) {
    console.log(chalk.red("Template validation failed:\n"));
    for (const err of validation.errors) {
      console.log(chalk.red(`  ${err.path}: ${err.message}`));
    }
    process.exit(ExitCode.Failure);
  }

  if (validation.warnings.length > 0) {
    print(chalk.yellow(" Template warnings:"));
    for (const warn of validation.warnings) {
      print(chalk.yellow(`  - ${warn.path}: ${warn.message}`));
    }
    print("");
  }

  return template;
}

function parseConcurrency(
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
      console.log(chalk.red(`\n${error.message}\n`));
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
  if (template.filter.workItemTypes)
    filterParts.push(`Types: ${template.filter.workItemTypes.join(", ")}`);
  if (template.filter.states)
    filterParts.push(`States: ${template.filter.states.join(", ")}`);
  if (template.filter.tags?.include)
    filterParts.push(`Tags: ${template.filter.tags.include.join(", ")}`);

  note(
    [
      `Template:  ${template.name}`,
      `Filter:    ${filterParts.join(" · ") || "All items"}`,
      `Platform:  ${options.platform}`,
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

function printReport(
  report: Awaited<ReturnType<Atomizer["atomize"]>>,
  options: { verbose: boolean },
  dryRun: boolean,
): number {
  console.log(`\n${chalk.blue("=".repeat(70))}`);
  console.log(chalk.blue.bold("  ATOMIZATION RESULTS"));
  console.log(`${chalk.blue("=".repeat(70))}\n`);

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
        console.log(chalk.green(`✓ ${result.story.id}: ${result.story.title}`));
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
            console.log(chalk.gray(`    - ${task.title}: ${task.estimation} points (${task.estimationPercent}%)`));
          }
        }
      } else {
        console.log(chalk.red(`✗ ${result.story.id}: ${result.story.title}`));
        console.log(chalk.red(`  Error: ${result.error}`));
      }
      console.log("");
    }
  }

  if (report.errors.length > 0) {
    console.log(chalk.red.bold("Errors:\n"));
    for (const err of report.errors) {
      console.log(chalk.red(`  - ${err.storyId}: ${err.error}`));
    }
    console.log("");
  }

  if (report.warnings.length > 0) {
    console.log(chalk.yellow.bold("Warnings:\n"));
    for (const warn of report.warnings) {
      console.log(chalk.yellow(`  - ${warn}`));
    }
    console.log("");
  }

  if (dryRun) {
    console.log(chalk.yellow.bold("DRY RUN COMPLETE - No tasks were actually created"));
    console.log(chalk.yellow("   Run with --execute flag to create tasks for real\n"));
  } else if (report.storiesSuccess > 0) {
    console.log(chalk.green.bold(`SUCCESS - Created ${report.tasksCreated} tasks for ${report.storiesSuccess} stories\n`));
  } else {
    console.log(chalk.red.bold("FAILED - No tasks were created\n"));
  }

  return report.storiesFailed > 0 ? ExitCode.Failure : ExitCode.Success;
}

export const generateCommand = new Command("generate")
  .alias("gen")
  .description("Generate tasks from user stories using a template")
  .argument("[template]", "Path to template file (YAML)")
  .option("-p, --platform <platform>", "Platform to use", "azure-devops")
  .option("--dry-run", "Preview without creating tasks", false)
  .option("--execute", "Execute task creation (opposite of dry-run)", false)
  .option("--continue-on-error", "Continue processing even if errors occur", false)
  .option("--story-concurrency <number>", "Max concurrent stories to process (default: 3)", "3")
  .option("--task-concurrency <number>", "Max concurrent tasks to create per story (default: 5)", "5")
  .option("--dependency-concurrency <number>", "Max concurrent dependency links to create (default: 5)", "5")
  .option("-v, --verbose", "Show detailed output", false)
  .option("-o, --output <file>", "Write JSON report to file (for CI/CD)")
  .option("-q, --quiet", "Suppress non-essential output", false)
  .option("--profile <name>", "Named connection profile to use")
  .action(async (templateArg: string | undefined, options) => {
    try {
      intro(" Atomize — Task Generator");

      const isTTYSession = isInteractiveTerminal();
      if (isTTYSession) {
        console.log(chalk.gray("  ↑↓ to navigate · Space to toggle · Enter to confirm · Ctrl+C to cancel\n"));
      }

      const { templatePath, platform, dryRun } = await promptMissingArgs(templateArg, options);
      options.platform = platform;

      if (options.quiet && options.verbose) {
        cancel("--quiet and --verbose are mutually exclusive.");
        process.exit(ExitCode.Failure);
      }

      const isQuiet = options.quiet === true;
      const print = createPrinter(isQuiet);

      if (options.verbose) logger.level = "info";
      else if (isQuiet) logger.level = "error";

      print(dryRun ? chalk.yellow("DRY RUN MODE - No tasks will be created\n") : chalk.green("LIVE MODE - Tasks will be created\n"));

      const template = await loadAndValidateTemplate(templatePath, print);
      const { storyConcurrency, taskConcurrency, dependencyConcurrency } = parseConcurrency(options, print);
      const platform_ = await initPlatform({ platform, profile: options.profile }, taskConcurrency);

      const authSpinner = spinner();
      if (isTTYSession) authSpinner.start("Authenticating...");
      await platform_.authenticate();
      const metadata = platform_.getPlatformMetadata();
      if (isTTYSession) authSpinner.stop(`Connected: ${metadata.name} v${metadata.version} ✓`);
      else print(`Connected: ${metadata.name} v${metadata.version} ✓`);

      const atomizer = new Atomizer(platform_);

      print(chalk.cyan(" Filter Criteria:"));
      if (template.filter.workItemTypes)
        print(chalk.gray(`  Types: ${template.filter.workItemTypes.join(", ")}`));
      if (template.filter.states)
        print(chalk.gray(`  States: ${template.filter.states.join(", ")}`));
      if (template.filter.tags?.include)
        print(chalk.gray(`  Tags (include): ${template.filter.tags.include.join(", ")}`));
      if (template.filter.excludeIfHasTasks)
        print(chalk.gray("  Exclude if has tasks: Yes"));
      print("");

      if (!dryRun && isTTYSession) {
        await confirmLiveExecution(template, { platform });
      }

      logger.info("Starting atomization...");
      const querySpinner = spinner();
      const storyProgressRef: { current: ProgressHandle | undefined } = { current: undefined };

      if (isTTYSession) querySpinner.start("Querying work items...");
      else print("Querying work items...");

      const report = await atomizer.atomize(template, {
        dryRun,
        continueOnError: options.continueOnError,
        storyConcurrency,
        dependencyConcurrency,
        onProgress: createProgressHandler(
          isTTYSession,
          querySpinner,
          storyProgressRef,
          print,
          log.success,
          log.error,
          (total) => progress({ max: total, style: "block" }),
        ),
      });

      if (isTTYSession && storyProgressRef.current) storyProgressRef.current.stop("Processing complete");
      else print("Processing complete");

      const exitCode = printReport(report, options, dryRun);

      if (options.output) {
        await writeFile(options.output, JSON.stringify(report, null, 2), "utf-8");
        if (!isQuiet) console.log(chalk.gray(`\n  Report saved to ${options.output}`));
      }

      outro(
        dryRun ? "Dry run complete" : exitCode === ExitCode.Success ? "Generation complete ✓" : "Generation finished with errors",
      );
      process.exit(exitCode);
    } catch (error) {
      cancel("Generation failed");
      if (error instanceof Error) {
        console.log(chalk.red(error.message));
        if (options.verbose) {
          console.log("");
          console.log(chalk.gray(error.stack));
        }
      }
      process.exit(ExitCode.Failure);
    }
  });
