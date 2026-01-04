import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type AIConfig,
	getAIConfig,
	getAIConfigForProvider,
} from "@config/ai.config";
import { getAzureDevOpsConfigInteractive } from "@config/azure-devops.config";
import { logger } from "@config/logger";
import { PlatformFactory } from "@platforms/platform-factory";
import { AIGeneratorFactory } from "@services/template/ai-factory";
import { PresetManager } from "@services/template/preset-manager";
import { StoryLearner } from "@services/template/story-learner";
import type {
	Metadata,
	TaskTemplate,
	ValidationConfig,
} from "@templates/schema";
import { TemplateValidator } from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { match } from "ts-pattern";
import { stringify as stringifyYaml } from "yaml";
import type { IPlatformAdapter, PlatformType } from "@/platforms";
import type { IAIGenerator } from "@/services/template";
import { ConfigurationError, UnknownError } from "@/utils/errors";
import {
	configureEstimation,
	configureFilter,
	configureMetadata,
	configureTasks,
	configureValidation,
} from "./template-wizard-helper.command";

type CreationMode = "ai" | "preset" | "story" | "scratch";

const OS_PLATFORM = process.platform;
const ListType = OS_PLATFORM === "win32" ? "rawlist" : "list";
interface CreateOptions {
	ai?: string;
	preset?: string;
	fromStory?: string;
	scratch?: boolean;
	output?: string;
	interactive?: boolean;
	aiProvider?: "gemini" | "ollama";
	apiKey?: string;
	model?: string;
	platform?: string;
	normalize?: boolean;
}

export const templateCreateCommand = new Command("create")
	.description("Create a new template interactively")
	.option("--ai <prompt>", "Generate template using AI")
	.option("--ai-provider <provider>", "Force AI provider: gemini|ollama")
	.option("--api-key <key>", "Google Gemini API key (if not in environment)")
	.option("--model <n>", "AI model name (e.g., gemini-2.0-flash-exp, llama3.2)")
	.option("--preset <name>", "Start from a preset template")
	.option("--from-story <id>", "Learn template from existing story")
	.option(
		"-p, --platform <platform>",
		"Platform to use (azure-devops, mock)",
		"azure-devops",
	)
	.option("--normalize", "Normalize task estimation percentages to sum to 100%")
	.option("--no-normalize", "Keep original estimation percentages")
	.option("--scratch", "Create from scratch (skip mode selection)")
	.option(
		"-o, --output <path>",
		"Output file path",
		path.resolve(
			process.cwd(),
			"createdTemplates",
			generateTemplateFilename("template"),
		),
	)
	.option("--no-interactive", "Skip all prompts (use with flags only)")
	.action(async (options: CreateOptions) => {
		try {
			console.log(chalk.blue.bold("\n Atomize Template Creator\n"));
			const mode = await determineMode(options);

			const template = await match(mode)
				.with("ai", async () => await createWithAI(options))
				.with("preset", async () => await createFromPreset(options))
				.with("story", async () => await createFromStory(options))
				.with("scratch", async () => await createFromScratch(options))
				.otherwise(() => {
					throw new Error("Invalid creation mode");
				});

			if (!options.output) {
				throw new ConfigurationError("Output path is not defined");
			}

			await saveTemplate(template, options.output);

			console.log(chalk.green(`\n Template saved to ${options.output}\n`));
			console.log(
				chalk.cyan("Try it out with: ") +
					chalk.gray(`atomize validate ${options.output}`),
			);
			console.log("");
		} catch (error) {
			console.log("");
			logger.error(chalk.red("Template creation failed"));

			if (error instanceof Error) {
				console.log(chalk.red(error.message));
			}

			process.exit(1);
		}
	});

/**
 * Determine creation mode
 */
async function determineMode(options: CreateOptions): Promise<CreationMode> {
	if (options.ai) return "ai";
	if (options.preset) return "preset";
	if (options.fromStory) return "story";
	if (options.scratch) return "scratch";

	// No flags - show interactive menu
	if (options.interactive !== false) {
		const { mode } = await inquirer.prompt([
			{
				type: ListType,
				name: "mode",
				message: "How would you like to create your template?",
				choices: [
					{
						name: " AI-Powered - Describe what you need (free)",
						value: "ai",
					},
					{
						name: "From Preset - Start with a common template",
						value: "preset",
					},
					{
						name: "From Existing Story - Learn from your work",
						value: "story",
					},
					{
						name: " From Scratch - Build step-by-step",
						value: "scratch",
					},
				],
			},
		]);
		return mode;
	}

	// Default to scratch if --no-interactive
	return "scratch";
}

/**
 * Create template with AI
 */
async function createWithAI(options: CreateOptions): Promise<TaskTemplate> {
	console.log(chalk.cyan("\n AI Template Generation\n"));

	let aiConfig: AIConfig | null = null;
	if (options.aiProvider) {
		aiConfig = await getAIConfigForProvider(options.aiProvider, {
			apiKey: options.apiKey,
			model: options.model,
		});
	} else if (options.apiKey || options.model) {
		aiConfig = await getAIConfigForProvider("gemini", {
			apiKey: options.apiKey,
			model: options.model,
		});
	} else {
		aiConfig = await getAIConfig();
	}

	if (aiConfig.provider === "none") {
		console.log(chalk.yellow("\nFalling back to manual creation...\n"));
		return await createFromScratch(options);
	}

	let prompt = options.ai;
	if (!prompt) {
		const answer = await inquirer.prompt([
			{
				type: "input",
				name: "prompt",
				message: "Describe the template you need:",
				default: "Backend API development with database migrations",
			},
		]);
		prompt = answer.prompt;
	}

	const { usePreset } = await inquirer.prompt([
		{
			type: "confirm",
			name: "usePreset",
			message: "Use a preset as starting point?",
			default: false,
		},
	]);

	let context = {};
	if (usePreset) {
		const presetManager = new PresetManager();
		const choices = await presetManager.getPresetChoices();

		if (choices.length === 0) {
			console.log(chalk.yellow("No presets available"));
		} else {
			const { presetName } = await inquirer.prompt([
				{
					type: ListType,
					name: "presetName",
					message: "Select preset:",
					choices,
				},
			]);

			const preset = await presetManager.loadPreset(presetName);
			context = { preset };
		}
	}

	console.log(chalk.cyan(`\nGenerating with ${aiConfig.provider}...\n`));

	const generator = AIGeneratorFactory.create(aiConfig);
	if (!prompt) {
		throw new ConfigurationError("AI prompt is required");
	}
	let template = await generator.generateTemplate(prompt, context);
	template = await refineTemplateInteractively(generator, template);

	return template;
}

/**
 * Interactive refinement loop
 */
async function refineTemplateInteractively(
	generator: IAIGenerator,
	template: TaskTemplate,
): Promise<TaskTemplate> {
	while (true) {
		console.log(chalk.cyan("\n Generated Template:\n"));
		console.log(chalk.gray(stringifyYaml(template)));

		const { action } = await inquirer.prompt([
			{
				type: ListType,
				name: "action",
				message: "What would you like to do?",
				choices: [
					{ name: "Accept and save", value: "accept" },
					{ name: "Refine with additional instructions", value: "refine" },
					{ name: "Regenerate", value: "regenerate" },
					{ name: "Cancel", value: "cancel" },
				],
			},
		]);

		if (action === "accept") {
			return template;
		}

		if (action === "refine") {
			const { refinement } = await inquirer.prompt([
				{
					type: "input",
					name: "refinement",
					message: "How should I refine it?",
					default: "Add more detailed testing tasks",
				},
			]);

			console.log(chalk.cyan("\nRefining...\n"));
			template = await generator.refineTemplate(template, refinement);
		}

		if (action === "regenerate") {
			const { prompt } = await inquirer.prompt([
				{
					type: "input",
					name: "prompt",
					message: "New description:",
				},
			]);

			console.log(chalk.cyan("\nRegenerating...\n"));
			template = await generator.generateTemplate(prompt);
		}

		if (action === "cancel") {
			throw new UnknownError("Template generation cancelled by user");
		}
	}
}

/**
 * Create from preset
 */
async function createFromPreset(options: CreateOptions): Promise<TaskTemplate> {
	console.log(chalk.cyan("\n Create from Preset\n"));

	const presetManager = new PresetManager();

	let presetName = options.preset;

	if (!presetName) {
		const choices = await presetManager.getPresetChoices();

		if (choices.length === 0) {
			throw new Error(
				"No presets found. Create some in templates/presets/ first.",
			);
		}

		const answer = await inquirer.prompt([
			{
				type: ListType,
				name: "preset",
				message: "Select preset:",
				choices,
			},
		]);

		presetName = answer.preset;
	}

	if (!presetName) {
		throw new ConfigurationError("Preset name is required");
	}

	const template = await presetManager.loadPreset(presetName);

	console.log(chalk.green(`\nLoaded preset: ${template.name}`));

	const { customize } = await inquirer.prompt([
		{
			type: "confirm",
			name: "customize",
			message: "Customize the template?",
			default: false,
		},
	]);

	if (customize) {
		return await customizeTemplate(template);
	}

	return template;
}

/**
 * Create from existing story
 */
async function createFromStory(options: CreateOptions): Promise<TaskTemplate> {
	console.log(chalk.cyan("\n Learn from Existing Story\n"));

	let storyId = options.fromStory;
	if (!storyId) {
		const answer = await inquirer.prompt([
			{
				type: "input",
				name: "storyId",
				message: "Enter story ID:",
			},
		]);
		storyId = answer.storyId;
	}

	let platformType = options.platform || "azure-devops";
	if (!options.platform) {
		const { platform } = await inquirer.prompt([
			{
				type: ListType,
				name: "platform",
				message: "Select platform:",
				choices: [
					{ name: "Azure DevOps", value: "azure-devops" },
					{ name: "Mock Platform (for testing)", value: "mock" },
				],
			},
		]);
		platformType = platform;
	}

	let shouldNormalize = options.normalize ?? true;
	if (options.normalize === undefined) {
		const { normalize } = await inquirer.prompt<{ normalize: boolean }>([
			{
				type: "confirm",
				name: "normalize",
				message: "Normalize task percentages to sum to 100%?",
				default: true,
			},
		]);

		shouldNormalize = normalize;
	}

	console.log(chalk.cyan(`\nConnecting to ${platformType}...\n`));

	let platform: IPlatformAdapter | null = null;
	if (platformType === "azure-devops") {
		const config = await getAzureDevOpsConfigInteractive();
		platform = PlatformFactory.create("azure-devops", config);
	} else {
		platform = PlatformFactory.create(platformType as PlatformType);
	}

	await platform.authenticate();

	const learner = new StoryLearner(platform);

	if (!storyId) {
		throw new ConfigurationError("Story ID is required");
	}
	const template = await learner.learnFromStory(storyId, shouldNormalize);

	console.log(
		chalk.green(`\nLearned template with ${template.tasks.length} tasks`),
	);

	if (shouldNormalize) {
		console.log(chalk.gray("Task percentages normalized to 100%"));
	} else {
		console.log(chalk.gray("Task percentages kept as-is from original"));
	}

	return template;
}

/**
 * Create from scratch (wizard)
 */
async function createFromScratch(
	_options: CreateOptions,
): Promise<TaskTemplate> {
	console.log(chalk.cyan("\n   Create Template from Scratch\n"));
	console.log(chalk.gray("Interactive template builder wizard\n"));

	console.log(chalk.blue("Step 1: Basic Information"));
	const basicInfo = await inquirer.prompt([
		{
			type: "input",
			name: "name",
			message: "Template name:",
			validate: (input: string) => {
				if (!input || input.trim() === "") {
					return "Template name is required";
				}
				return true;
			},
		},
		{
			type: "input",
			name: "description",
			message: "Description:",
		},
		{
			type: "input",
			name: "author",
			message: "Author:",
			default: "Atomize",
		},
		{
			type: "input",
			name: "tags",
			message: "Tags (comma-separated, optional):",
			filter: (input: string) => {
				if (!input) return [];
				return input.split(",").map((t) => t.trim());
			},
		},
	]);

	// Step 2: Filter Configuration
	console.log(chalk.blue("\nStep 2: Filter Configuration"));
	const filterConfig = await configureFilter();

	// Step 3: Tasks
	console.log(chalk.blue("\nStep 3: Task Configuration"));
	const tasks = await configureTasks();

	// Step 4: Estimation Settings
	console.log(chalk.blue("\nStep 4: Estimation Settings"));
	const estimation = await configureEstimation();

	// Step 5: Optional Validation Rules
	const { addValidation } = await inquirer.prompt([
		{
			type: "confirm",
			name: "addValidation",
			message: "Add validation rules?",
			default: false,
		},
	]);

	let validation: ValidationConfig | undefined;
	if (addValidation) {
		console.log(chalk.blue("\nStep 5: Validation Rules"));
		validation = await configureValidation();
	}

	// Step 6: Optional Metadata
	const { addMetadata } = await inquirer.prompt([
		{
			type: "confirm",
			name: "addMetadata",
			message: "Add metadata?",
			default: false,
		},
	]);

	let metadata: Metadata | undefined;
	if (addMetadata) {
		console.log(chalk.blue("\nStep 6: Metadata"));
		metadata = await configureMetadata();
	}

	const template: TaskTemplate = {
		version: "1.0",
		name: basicInfo.name,
		description: basicInfo.description || undefined,
		author: basicInfo.author || undefined,
		tags: basicInfo.tags.length > 0 ? basicInfo.tags : undefined,
		created: new Date().toISOString(),
		filter: filterConfig,
		tasks,
		estimation,
		validation,
		metadata,
	};

	console.log(chalk.green("\n✓ Template created successfully!\n"));

	return template;
}

/**
 * Customize template interactively
 */
async function customizeTemplate(
	template: TaskTemplate,
): Promise<TaskTemplate> {
	const answers = await inquirer.prompt([
		{
			type: "input",
			name: "name",
			message: "Template name:",
			default: template.name,
		},
		{
			type: "input",
			name: "description",
			message: "Description:",
			default: template.description,
		},
	]);

	template.name = answers.name;
	template.description = answers.description;

	return template;
}

/**
 * Save template to file
 */
async function saveTemplate(
	template: TaskTemplate,
	outputPath: string,
): Promise<void> {
	const validator = new TemplateValidator();
	const validation = validator.validate(template);

	if (!validation.valid) {
		console.log(chalk.red("\n  Template validation failed:\n"));
		validation.errors.forEach((err) => {
			console.log(chalk.red(`  • ${err.path}: ${err.message}`));
		});
		throw new Error("Template validation failed");
	}

	if (validation.warnings.length > 0) {
		console.log(chalk.yellow("\n  Warnings:\n"));
		validation.warnings.forEach((warn) => {
			console.log(chalk.yellow(`  • ${warn.path}: ${warn.message}`));
		});
	}

	const yaml = stringifyYaml(template);
	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, yaml, "utf-8");

	logger.info(`Template saved to ${outputPath}`);
}

function generateTemplateFilename(templateName = "template") {
	const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
	const shortId = randomBytes(2).toString("hex");

	return `${templateName}-${date}-${shortId}.yaml`;
}
