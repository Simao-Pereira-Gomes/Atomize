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
import {
  getAzureDevOpsConfig,
  getAzureDevOpsConfigInteractive,
} from "@config/azure-devops.config";
import { logger } from "@config/logger";
import { Atomizer } from "@core/atomizer";
import { PlatformFactory } from "@platforms/platform-factory";
import { TemplateLoader } from "@templates/loader";
import { TemplateValidator } from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import { match } from "ts-pattern";
import {
  assertNotCancelled,
  isInteractiveTerminal,
} from "@/cli/utilities/prompt-utilities";
import type { IPlatformAdapter } from "@/platforms";

export const generateCommand = new Command("generate")
  .alias("gen")
  .description("Generate tasks from user stories using a template")
  .argument("[template]", "Path to template file (YAML)")
  .option("-p, --platform <platform>", "Platform to use", "azure-devops")
  .option("--project <name>", "Project name")
  .option("--dry-run", "Preview without creating tasks", false)
  .option("--execute", "Execute task creation (opposite of dry-run)", false)
  .option(
    "--continue-on-error",
    "Continue processing even if errors occur",
    false,
  )
  .option(
    "--story-concurrency <number>",
    "Max concurrent stories to process (default: 3)",
    "3",
  )
  .option(
    "--task-concurrency <number>",
    "Max concurrent tasks to create per story (default: 5)",
    "5",
  )
  .option(
    "--dependency-concurrency <number>",
    "Max concurrent dependency links to create (default: 5)",
    "5",
  )
  .option("-v, --verbose", "Show detailed output", false)
  .option(
    "--no-interactive",
    "Skip all prompts; requires template arg and env vars",
  )
  .option("-o, --output <file>", "Write JSON report to file (for CI/CD)")
  .option("-q, --quiet", "Suppress non-essential output", false)
  .action(async (templateArg: string | undefined, options) => {
    try {
      intro(" Atomize — Task Generator");

      const isTTYSession = isInteractiveTerminal();
      if (options.interactive !== false && isTTYSession) {
        console.log(
          chalk.gray(
            "  ↑↓ to navigate · Space to toggle · Enter to confirm · Ctrl+C to cancel\n",
          ),
        );
      }

      let templatePath = templateArg;

      if (!templatePath) {
        if (options.interactive === false) {
          cancel(
            "--no-interactive requires a template path argument.\nUsage: atomize generate <template> [--execute] [--platform azure-devops]",
          );
          process.exit(1);
        }
        templatePath = assertNotCancelled(
          await text({
            message: "Template file path:",
            placeholder: "templates/backend-api.yaml",
          }),
        );
        options.platform = assertNotCancelled(
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
        );

        options.dryRun = assertNotCancelled(
          await confirm({
            message: "Dry run (preview only, no actual creation)?",
            initialValue: true,
          }),
        );
      }

      const dryRun = options.execute ? false : options.dryRun;
      if (
        options.interactive === false &&
        options.platform === "azure-devops"
      ) {
        const missing: string[] = [];
        if (!process.env.AZURE_DEVOPS_ORG_URL)
          missing.push("AZURE_DEVOPS_ORG_URL");
        if (!process.env.AZURE_DEVOPS_PROJECT)
          missing.push("AZURE_DEVOPS_PROJECT");
        if (!process.env.AZURE_DEVOPS_PAT) missing.push("AZURE_DEVOPS_PAT");
        if (missing.length > 0) {
          cancel(
            `Missing required environment variables: ${missing.join(", ")}`,
          );
          console.log(
            chalk.gray(
              "Set them in your .env file or export them before running.",
            ),
          );
          process.exit(1);
        }
      }
      const isQuiet = options.quiet === true;
      const print = (msg: string) => {
        if (!isQuiet) console.log(msg);
      };

      if (dryRun) {
        print(chalk.yellow("DRY RUN MODE - No tasks will be created\n"));
      } else {
        print(chalk.green("LIVE MODE - Tasks will be created\n"));
      }

      logger.info(`Loading template: ${templatePath}`);
      if (!templatePath) {
        throw new Error("Template path is required");
      }
      const loader = new TemplateLoader();
      const template = await loader.load(templatePath);

      print(chalk.cyan(`Template: ${template.name}`));
      print(chalk.gray(`Description: ${template.description || "N/A"}`));
      print(chalk.gray(`Tasks: ${template.tasks.length}\n`));

      logger.info("Validating template...");
      const validator = new TemplateValidator();
      const validation = validator.validate(template);

      if (!validation.valid) {
        console.log(chalk.red("Template validation failed:\n"));
        validation.errors.forEach((err) => {
          console.log(chalk.red(`  ${err.path}: ${err.message}`));
        });
        process.exit(1);
      }

      if (validation.warnings.length > 0) {
        print(chalk.yellow(" Template warnings:"));
        validation.warnings.forEach((warn) => {
          print(chalk.yellow(`  - ${warn.path}: ${warn.message}`));
        });
        print("");
      }

      logger.info(`Initializing ${options.platform} platform...`);

      // Parse and validate concurrency settings
      const MIN_CONCURRENCY = 1;
      const MAX_STORY_CONCURRENCY = 10;
      const MAX_TASK_CONCURRENCY = 20;
      const MAX_DEPENDENCY_CONCURRENCY = 10;

      let taskConcurrency = parseInt(options.taskConcurrency, 10) || 5;
      let storyConcurrency = parseInt(options.storyConcurrency, 10) || 3;
      let dependencyConcurrency =
        parseInt(options.dependencyConcurrency, 10) || 5;

      if (
        taskConcurrency < MIN_CONCURRENCY ||
        taskConcurrency > MAX_TASK_CONCURRENCY
      ) {
        print(
          chalk.yellow(
            `Task concurrency must be between ${MIN_CONCURRENCY} and ${MAX_TASK_CONCURRENCY}. Using default (5).`,
          ),
        );
        taskConcurrency = 5;
      }

      if (
        storyConcurrency < MIN_CONCURRENCY ||
        storyConcurrency > MAX_STORY_CONCURRENCY
      ) {
        print(
          chalk.yellow(
            `Story concurrency must be between ${MIN_CONCURRENCY} and ${MAX_STORY_CONCURRENCY}. Using default (3).`,
          ),
        );
        storyConcurrency = 3;
      }

      if (
        dependencyConcurrency < MIN_CONCURRENCY ||
        dependencyConcurrency > MAX_DEPENDENCY_CONCURRENCY
      ) {
        print(
          chalk.yellow(
            `Dependency concurrency must be between ${MIN_CONCURRENCY} and ${MAX_DEPENDENCY_CONCURRENCY}. Using default (5).`,
          ),
        );
        dependencyConcurrency = 5;
      }

      logger.info(
        `Concurrency settings: ${storyConcurrency} stories, ${taskConcurrency} tasks`,
      );

      let platform: IPlatformAdapter;
      try {
        platform = await match(options.platform)
          .with("azure-devops", async () => {
            const azureConfig =
              options.interactive === false
                ? await getAzureDevOpsConfig({ promptIfMissing: false })
                : await getAzureDevOpsConfigInteractive();
            return PlatformFactory.create("azure-devops", {
              ...azureConfig,
              maxConcurrency: taskConcurrency,
            });
          })
          .otherwise(() => {
            // Other platforms (mock, jira, github)
            return PlatformFactory.create(options.platform);
          });
      } catch (error) {
        if (error instanceof Error) {
          console.log(chalk.red(`\n${error.message}\n`));
          match(options.platform)
            .with("azure-devops", () => {
              console.log(chalk.yellow(" Setup Azure DevOps:"));
              console.log(
                chalk.gray(
                  "1. Copy .env.example to .env or provide the variables manually when inquired",
                ),
              );
              console.log(
                chalk.gray(
                  "2. Fill in AZURE_DEVOPS_ORG_URL, AZURE_DEVOPS_PROJECT, and AZURE_DEVOPS_PAT",
                ),
              );
              console.log(
                chalk.gray(
                  "3. Get a PAT from: https://dev.azure.com/[your-org]/_usersSettings/tokens",
                ),
              );
              console.log(
                chalk.gray("   Required scopes: Work Items (Read, Write)\n"),
              );
            })
            .otherwise(() => {});
        }
        process.exit(1);
      }
      logger.info("Authenticating...");
      const authSpinner = spinner();
      if (isTTYSession) authSpinner.start("Authenticating...");
      await platform.authenticate();
      const metadata = platform.getPlatformMetadata();
      if (isTTYSession) {
        authSpinner.stop(`Connected: ${metadata.name} v${metadata.version} ✓`);
      } else {
        print(`Connected: ${metadata.name} v${metadata.version} ✓`);
      }

      const atomizer = new Atomizer(platform);
      print(chalk.cyan(" Filter Criteria:"));
      if (template.filter.workItemTypes) {
        print(
          chalk.gray(`  Types: ${template.filter.workItemTypes.join(", ")}`),
        );
      }
      if (template.filter.states) {
        print(chalk.gray(`  States: ${template.filter.states.join(", ")}`));
      }
      if (template.filter.tags?.include) {
        print(
          chalk.gray(
            `  Tags (include): ${template.filter.tags.include.join(", ")}`,
          ),
        );
      }
      if (template.filter.excludeIfHasTasks) {
        print(chalk.gray(`  Exclude if has tasks: Yes`));
      }
      print("");
      if (!dryRun && options.interactive !== false) {
        const filterParts: string[] = [];
        if (template.filter.workItemTypes)
          filterParts.push(
            `Types: ${template.filter.workItemTypes.join(", ")}`,
          );
        if (template.filter.states)
          filterParts.push(`States: ${template.filter.states.join(", ")}`);
        if (template.filter.tags?.include)
          filterParts.push(`Tags: ${template.filter.tags.include.join(", ")}`);

        note(
          [
            `Template:  ${template.name}`,
            `Filter:    ${filterParts.join(" · ") || "All items"}`,
            `Platform:  ${options.platform}`,
            ...(options.project ? [`Project:   ${options.project}`] : []),
            "",
            "This will CREATE tasks in your work tracking system.",
          ].join("\n"),
          "⚠  LIVE MODE",
        );

        const proceed = assertNotCancelled(
          await confirm({
            message: "Proceed with task creation?",
            initialValue: false,
          }),
        );
        if (!proceed) {
          outro("Cancelled.");
          process.exit(0);
        }
      }

      logger.info("Starting atomization...");

      const querySpinner = spinner();
      let storyProgress: ReturnType<typeof progress> | undefined;

      if (isTTYSession) querySpinner.start("Querying work items...");
      else print("Querying work items...");

      const report = await atomizer.atomize(template, {
        dryRun,
        project: options.project,
        continueOnError: options.continueOnError,
        storyConcurrency,
        dependencyConcurrency,
        onProgress: (event) => {
          switch (event.type) {
            case "query_start":
              if (isTTYSession) querySpinner.message("Querying work items...");
              break;
            case "query_complete":
              if (isTTYSession) {
                querySpinner.stop(`Found ${event.totalStories} stories`);
                storyProgress = progress({
                  max: event.totalStories ?? 1,
                  style: "block",
                });
                storyProgress.start(
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
              if (isTTYSession && storyProgress) {
                log.success(
                  `[${event.completedStories}/${event.totalStories}] ${event.story?.id}: ${event.story?.title}`,
                );
                storyProgress.advance(
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
              if (isTTYSession && storyProgress) {
                log.error(
                  `[${event.completedStories}/${event.totalStories}] ${event.story?.id}: ${event.error}`,
                );
                storyProgress.advance(
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
        },
      });

      if (isTTYSession && storyProgress)
        storyProgress.stop("Processing complete");
      else print("Processing complete");

      console.log(`\n${chalk.blue("=".repeat(70))}`);
      console.log(chalk.blue.bold("  ATOMIZATION RESULTS"));
      console.log(`${chalk.blue("=".repeat(70))}\n`);

      console.log(chalk.cyan(" Summary:"));
      console.log(`  Template:          ${chalk.bold(report.templateName)}`);
      console.log(
        `  Stories processed: ${chalk.bold(report.storiesProcessed)}`,
      );
      console.log(
        `  Stories success:   ${chalk.green.bold(report.storiesSuccess)}`,
      );

      if (report.storiesFailed > 0) {
        console.log(
          `  Stories failed:    ${chalk.red.bold(report.storiesFailed)}`,
        );
      }

      console.log(`  Tasks calculated:  ${chalk.bold(report.tasksCalculated)}`);
      console.log(`  Tasks created:     ${chalk.bold(report.tasksCreated)}`);
      console.log(
        `  Execution time:    ${chalk.gray(`${report.executionTime}ms`)}`,
      );
      console.log("");

      if (options.verbose || report.storiesProcessed <= 5) {
        console.log(chalk.cyan(" Details:\n"));

        for (const result of report.results) {
          if (result.success) {
            console.log(
              chalk.green(`✓ ${result.story.id}: ${result.story.title}`),
            );
            console.log(
              chalk.gray(
                `  Estimation: ${result.story.estimation || 0} points`,
              ),
            );
            console.log(
              chalk.gray(`  Tasks: ${result.tasksCalculated.length}`),
            );

            if (result.estimationSummary) {
              console.log(
                chalk.gray(
                  `  Distribution: ${
                    result.estimationSummary.totalTaskEstimation
                  } points (${result.estimationSummary.percentageUsed.toFixed(
                    0,
                  )}%)`,
                ),
              );
            }

            if (options.verbose && result.tasksCalculated.length > 0) {
              console.log(chalk.gray("  Task breakdown:"));
              result.tasksCalculated.forEach((task) => {
                console.log(
                  chalk.gray(
                    `    - ${task.title}: ${task.estimation} points (${task.estimationPercent}%)`,
                  ),
                );
              });
            }
          } else {
            console.log(
              chalk.red(`✗ ${result.story.id}: ${result.story.title}`),
            );
            console.log(chalk.red(`  Error: ${result.error}`));
          }
          console.log("");
        }
      }

      if (report.errors.length > 0) {
        console.log(chalk.red.bold("Errors:\n"));
        report.errors.forEach((err) => {
          console.log(chalk.red(`  - ${err.storyId}: ${err.error}`));
        });
        console.log("");
      }

      if (report.warnings.length > 0) {
        console.log(chalk.yellow.bold("Warnings:\n"));
        report.warnings.forEach((warn) => {
          console.log(chalk.yellow(`  - ${warn}`));
        });
        console.log("");
      }

      if (dryRun) {
        console.log(
          chalk.yellow.bold(
            "DRY RUN COMPLETE - No tasks were actually created",
          ),
        );
        console.log(
          chalk.yellow("   Run with --execute flag to create tasks for real\n"),
        );
      } else {
        if (report.storiesSuccess > 0) {
          console.log(
            chalk.green.bold(
              `SUCCESS - Created ${report.tasksCreated} tasks for ${report.storiesSuccess} stories\n`,
            ),
          );
        } else {
          console.log(chalk.red.bold("FAILED - No tasks were created\n"));
        }
      }
      if (options.output) {
        const reportJson = JSON.stringify(report, null, 2);
        await writeFile(options.output, reportJson, "utf-8");
        if (!isQuiet)
          console.log(chalk.gray(`\n  Report saved to ${options.output}`));
      }

      const exitCode = report.storiesFailed > 0 ? 1 : 0;
      outro(
        dryRun
          ? "Dry run complete"
          : exitCode === 0
            ? "Generation complete ✓"
            : "Generation finished with errors",
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

      process.exit(1);
    }
  });
