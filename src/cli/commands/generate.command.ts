import { Command } from "commander";
import inquirer from "inquirer";
import { TemplateLoader } from "@templates/loader";
import { TemplateValidator } from "@templates/validator";
import { PlatformFactory } from "@platforms/platform-factory";
import { Atomizer } from "@core/atomizer";
import { logger } from "@config/logger";
import chalk from "chalk";

export const generateCommand = new Command("generate")
  .alias("gen")
  .description("Generate tasks from user stories using a template")
  .argument("[template]", "Path to template file (YAML)")
  .option("-p, --platform <platform>", "Platform to use", "mock")
  .option("--project <name>", "Project name")
  .option("--dry-run", "Preview without creating tasks", false)
  .option("--execute", "Execute task creation (opposite of dry-run)", false)
  .option(
    "--continue-on-error",
    "Continue processing even if errors occur",
    false
  )
  .option("-v, --verbose", "Show detailed output", false)
  .action(async (templateArg: string | undefined, options) => {
    try {
      console.log(chalk.blue.bold("\nAtomize - Task Generator\n"));

      let templatePath = templateArg;

      if (!templatePath) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "template",
            message: "Template file path:",
            default: "templates/backend-api.yaml",
          },
          {
            type: "list",
            name: "platform",
            message: "Select platform:",
            choices: [
              { name: "Mock (for testing)", value: "mock" },
              {
                name: "Azure DevOps",
                value: "azure-devops",
                disabled: "Coming in Phase 5",
              },
              { name: "Jira", value: "jira", disabled: "Coming soon" },
              { name: "GitHub", value: "github", disabled: "Coming soon" },
            ],
            default: "mock",
          },
          {
            type: "confirm",
            name: "dryRun",
            message: "Dry run (preview only, no actual creation)?",
            default: true,
          },
        ]);

        templatePath = answers.template;
        options.platform = answers.platform;
        options.dryRun = answers.dryRun;
      }

      const dryRun = options.execute ? false : options.dryRun;

      if (dryRun) {
        console.log(chalk.yellow("DRY RUN MODE - No tasks will be created\n"));
      } else {
        console.log(chalk.green("LIVE MODE - Tasks will be created\n"));
      }

      // Load template
      logger.info(`Loading template: ${templatePath}`);

      if (!templatePath) {
        throw new Error("No template file specified");
      }
      const loader = new TemplateLoader();
      const template = await loader.load(templatePath);

      console.log(chalk.cyan(`Template: ${template.name}`));
      console.log(chalk.gray(`Description: ${template.description || "N/A"}`));
      console.log(chalk.gray(`Tasks: ${template.tasks.length}\n`));

      logger.info("Validating template...");
      const validator = new TemplateValidator();
      const validation = validator.validate(template);

      if (!validation.valid) {
        console.log(chalk.red("Template validation failed:\n"));
        validation.errors.forEach((err) => {
          console.log(chalk.red(`  - ${err.path}: ${err.message}`));
        });
        process.exit(1);
      }

      if (validation.warnings.length > 0) {
        console.log(chalk.yellow("Template warnings:"));
        validation.warnings.forEach((warn) => {
          console.log(chalk.yellow(`  - ${warn.path}: ${warn.message}`));
        });
        console.log("");
      }

      logger.info(`Initializing ${options.platform} platform...`);

      let platform;
      try {
        platform = PlatformFactory.create(options.platform);
      } catch (error) {
        if (error instanceof Error) {
          console.log(chalk.red(`\n ${error.message}\n`));
        }
        process.exit(1);
      }

      // Authenticate
      await platform.authenticate();

      const metadata = platform.getPlatformMetadata();
      console.log(
        chalk.gray(`Platform: ${metadata.name} v${metadata.version}`)
      );
      console.log(chalk.gray(`Connected: ${metadata.connected ? "✓" : "✗"}\n`));

      const atomizer = new Atomizer(platform);

      console.log(chalk.cyan("Filter Criteria:"));
      if (template.filter.workItemTypes) {
        console.log(
          chalk.gray(`  Types: ${template.filter.workItemTypes.join(", ")}`)
        );
      }
      if (template.filter.states) {
        console.log(
          chalk.gray(`  States: ${template.filter.states.join(", ")}`)
        );
      }
      if (template.filter.tags?.include) {
        console.log(
          chalk.gray(
            `  Tags (include): ${template.filter.tags.include.join(", ")}`
          )
        );
      }
      if (template.filter.excludeIfHasTasks) {
        console.log(chalk.gray(`  Exclude if has tasks: Yes`));
      }
      console.log("");

      logger.info("Starting atomization...");

      const report = await atomizer.atomize(template, {
        dryRun,
        project: options.project,
        continueOnError: options.continueOnError,
      });

      console.log("\n" + chalk.blue("=".repeat(70)));
      console.log(chalk.blue.bold("  ATOMIZATION RESULTS"));
      console.log(chalk.blue("=".repeat(70)) + "\n");

      console.log(chalk.cyan("Summary:"));
      console.log(`  Template:          ${chalk.bold(report.templateName)}`);
      console.log(
        `  Stories processed: ${chalk.bold(report.storiesProcessed)}`
      );
      console.log(
        `  Stories success:   ${chalk.green.bold(report.storiesSuccess)}`
      );

      if (report.storiesFailed > 0) {
        console.log(
          `  Stories failed:    ${chalk.red.bold(report.storiesFailed)}`
        );
      }

      console.log(`  Tasks calculated:  ${chalk.bold(report.tasksCalculated)}`);
      console.log(`  Tasks created:     ${chalk.bold(report.tasksCreated)}`);
      console.log(
        `  Execution time:    ${chalk.gray(report.executionTime + "ms")}`
      );
      console.log("");

      if (options.verbose || report.storiesProcessed <= 5) {
        console.log(chalk.cyan("Details:\n"));

        for (const result of report.results) {
          if (result.success) {
            console.log(
              chalk.green(`${result.story.id}: ${result.story.title}`)
            );
            console.log(
              chalk.gray(`  Estimation: ${result.story.estimation || 0} points`)
            );
            console.log(
              chalk.gray(`  Tasks: ${result.tasksCalculated.length}`)
            );

            if (result.estimationSummary) {
              console.log(
                chalk.gray(
                  `  Distribution: ${
                    result.estimationSummary.totalTaskEstimation.toFixed(2)
                  } points (${result.estimationSummary.percentageUsed.toFixed(
                    0
                  )}%)`
                )
              );
            }

            if (options.verbose && result.tasksCalculated.length > 0) {
              console.log(chalk.gray("  Task breakdown:"));
              result.tasksCalculated.forEach((task) => {
                console.log(
                  chalk.gray(
                    `    - ${task.title}: ${task.estimation} points (${task.estimationPercent}%)`
                  )
                );
              });
            }
          } else {
            console.log(
              chalk.red(`✗ ${result.story.id}: ${result.story.title}`)
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

      // Final message
      if (dryRun) {
        console.log(
          chalk.yellow.bold(
            " DRY RUN COMPLETE - No tasks were actually created"
          )
        );
        console.log(
          chalk.yellow("   Run with --execute flag to create tasks for real\n")
        );
      } else {
        if (report.storiesSuccess > 0) {
          console.log(
            chalk.green.bold(
              `SUCCESS - Created ${report.tasksCreated} tasks for ${report.storiesSuccess} stories\n`
            )
          );
        } else {
          console.log(chalk.red.bold("FAILED - No tasks were created\n"));
        }
      }

      process.exit(report.storiesFailed > 0 ? 1 : 0);
    } catch (error) {
      console.log("");
      logger.error(chalk.red(" GENERATION FAILED"));
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
