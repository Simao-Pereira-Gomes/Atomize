import { getAzureDevOpsConfigInteractive } from "@config/azure-devops.config";
import { logger } from "@config/logger";
import { Atomizer } from "@core/atomizer";
import { PlatformFactory } from "@platforms/platform-factory";
import { TemplateLoader } from "@templates/loader";
import { TemplateValidator } from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { match } from "ts-pattern";
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
	.option("-v, --verbose", "Show detailed output", false)
	.action(async (templateArg: string | undefined, options) => {
		try {
			const type = process.platform === "win32" ? "rawlist" : "list";
			console.log(chalk.blue.bold("\n Atomize - Task Generator\n"));

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
						type: type,
						name: "platform",
						message: "Select platform:",
						choices: [
							{ name: "Mock (for testing)", value: "mock" },
							{ name: "Azure DevOps", value: "azure-devops" },
						],
						default: "azure-devops",
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

			logger.info(`Loading template: ${templatePath}`);
			if (!templatePath) {
				throw new Error("Template path is required");
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
					console.log(chalk.red(`  ${err.path}: ${err.message}`));
				});
				process.exit(1);
			}

			if (validation.warnings.length > 0) {
				console.log(chalk.yellow(" Template warnings:"));
				validation.warnings.forEach((warn) => {
					console.log(chalk.yellow(`  - ${warn.path}: ${warn.message}`));
				});
				console.log("");
			}

			logger.info(`Initializing ${options.platform} platform...`);

			// Parse and validate concurrency settings
			const MIN_CONCURRENCY = 1;
			const MAX_STORY_CONCURRENCY = 10;
			const MAX_TASK_CONCURRENCY = 20;

			let taskConcurrency = parseInt(options.taskConcurrency, 10) || 5;
			let storyConcurrency = parseInt(options.storyConcurrency, 10) || 3;

			if (taskConcurrency < MIN_CONCURRENCY || taskConcurrency > MAX_TASK_CONCURRENCY) {
				console.log(
					chalk.yellow(
						`Task concurrency must be between ${MIN_CONCURRENCY} and ${MAX_TASK_CONCURRENCY}. Using default (5).`,
					),
				);
				taskConcurrency = 5;
			}

			if (storyConcurrency < MIN_CONCURRENCY || storyConcurrency > MAX_STORY_CONCURRENCY) {
				console.log(
					chalk.yellow(
						`Story concurrency must be between ${MIN_CONCURRENCY} and ${MAX_STORY_CONCURRENCY}. Using default (3).`,
					),
				);
				storyConcurrency = 3;
			}

			logger.info(
				`Concurrency settings: ${storyConcurrency} stories, ${taskConcurrency} tasks`,
			);

			let platform: IPlatformAdapter;
			try {
				platform = await match(options.platform)
					.with("azure-devops", async () => {
						const azureConfig = await getAzureDevOpsConfigInteractive();
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
			await platform.authenticate();

			const metadata = platform.getPlatformMetadata();
			console.log(
				chalk.gray(`Platform: ${metadata.name} v${metadata.version}`),
			);
			console.log(chalk.gray(`Connected: ${metadata.connected ? "✓" : "✗"}\n`));

			const atomizer = new Atomizer(platform);
			console.log(chalk.cyan(" Filter Criteria:"));
			if (template.filter.workItemTypes) {
				console.log(
					chalk.gray(`  Types: ${template.filter.workItemTypes.join(", ")}`),
				);
			}
			if (template.filter.states) {
				console.log(
					chalk.gray(`  States: ${template.filter.states.join(", ")}`),
				);
			}
			if (template.filter.tags?.include) {
				console.log(
					chalk.gray(
						`  Tags (include): ${template.filter.tags.include.join(", ")}`,
					),
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
				storyConcurrency,
			});

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

			process.exit(report.storiesFailed > 0 ? 1 : 0);
		} catch (error) {
			console.log("");
			logger.error(chalk.red("Generation failed"));

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
