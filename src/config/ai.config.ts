import chalk from "chalk";
import inquirer from "inquirer";
import { match } from "ts-pattern";
import { AiProviderError } from "@/utils/errors";

export type AIProvider = "gemini" | "ollama" | "none";

const OS_PLATFORM = process.platform;

const ListType = OS_PLATFORM === "win32" ? "rawlist" : "list";

export interface AIConfig {
	provider: AIProvider;
	geminiKey?: string;
	geminiModel?: string;
	ollamaUrl?: string;
	ollamaModel?: string;
}

/**
 * Check if Ollama is available and running
 */
export async function checkOllama(
	url = "http://localhost:11434",
): Promise<boolean> {
	try {
		const response = await fetch(`${url}/api/tags`, {
			signal: AbortSignal.timeout(2000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Get available Ollama models
 */
export async function getOllamaModels(
	url = "http://localhost:11434",
): Promise<string[]> {
	try {
		const response = await fetch(`${url}/api/tags`);
		const data = (await response.json()) as {
			models?: Array<{ name: string }>;
		};
		return data.models?.map((m: { name: string }) => m.name) || [];
	} catch {
		return [];
	}
}

/**
 * Get AI configuration with auto-detection
 */
export async function getAIConfig(): Promise<AIConfig> {
	const geminiKey = process.env.GOOGLE_AI_API_KEY;
	const ollamaAvailable = await checkOllama();
	if (geminiKey && ollamaAvailable) {
		const { provider } = await inquirer.prompt([
			{
				type: ListType,
				name: "provider",
				message: "Which AI provider would you like to use?",
				choices: [
					{ name: " Google Gemini (Cloud, Free tier)", value: "gemini" },
					{ name: "  Ollama (Local, Completely free)", value: "ollama" },
				],
			},
		]);

		return createConfig(provider, geminiKey);
	}

	if (geminiKey) {
		console.log(chalk.cyan("Using Google Gemini AI"));

		const { model } = await inquirer.prompt([
			{
				type: ListType,
				name: "model",
				message: "Select Gemini model:",
				choices: [
					{
						name: "Gemini 2.0 Flash",
						value: "gemini-2.0-flash-exp",
					},
					{
						name: "Gemini 1.5 Flash",
						value: "gemini-1.5-flash",
					},
					{
						name: "Gemini 1.5 Pro",
						value: "gemini-1.5-pro",
					},
				],
				default: "gemini-2.0-flash-exp",
			},
		]);

		return createConfig("gemini", geminiKey, undefined, model);
	}

	if (ollamaAvailable) {
		console.log(chalk.cyan("Using Ollama (local AI)"));
		return createConfig("ollama");
	}

	showSetupInstructions();
	return { provider: "none" };
}

/**
 * Get AI config for a specific provider
 */
export async function getAIConfigForProvider(
	provider: AIProvider,
	options?: {
		apiKey?: string;
		model?: string;
	},
): Promise<AIConfig> {
	return match(provider)
		.with("gemini", async () => {
			{
				let geminiKey = options?.apiKey || process.env.GOOGLE_AI_API_KEY;
				if (!geminiKey) {
					console.log(
						chalk.yellow(
							"\nGoogle Gemini API key not found in environment variables.",
						),
					);
					console.log(
						chalk.gray(
							"Get a free API key at: https://makersuite.google.com/app/apikey\n",
						),
					);
					const { provideKey } = await inquirer.prompt([
						{
							type: "confirm",
							name: "provideKey",
							message: "Would you like to provide your API key now?",
							default: true,
						},
					]);
					if (!provideKey) {
						throw new AiProviderError(
							"Gemini API key is required. Set GOOGLE_AI_API_KEY environment variable or provide it when prompted.",
							"gemini",
						);
					}
					const { apiKey } = await inquirer.prompt([
						{
							type: "password",
							name: "apiKey",
							message: "Enter your Google Gemini API key:",
							mask: "*",
							validate: (input: string) => {
								if (!input || input.trim() === "") {
									return "API key is required";
								}
								return true;
							},
						},
					]);
					geminiKey = apiKey;
				}
				// Prompt for model selection if not provided
				let modelName = options?.model;
				if (!modelName) {
					const { model } = await inquirer.prompt([
						{
							type: ListType,
							name: "model",
							message: "Select Gemini model:",
							choices: [
								{
									name: "Gemini 2.0 Flash (Recommended - Fast & Free)",
									value: "gemini-2.0-flash-exp",
								},
								{
									name: "Gemini 1.5 Flash (Fast & Free)",
									value: "gemini-1.5-flash",
								},
								{
									name: "Gemini 1.5 Pro (More capable)",
									value: "gemini-1.5-pro",
								},
							],
							default: "gemini-2.0-flash-exp",
						},
					]);
					modelName = model;
				}
				return createConfig("gemini", geminiKey, undefined, modelName);
			}
		})
		.with("ollama", async () => {
			{
				const available = await checkOllama();
				if (!available) {
					throw new AiProviderError(
						"Ollama is not running.\n" +
							"Install from: https://ollama.ai\n" +
							"Then run: ollama serve",
						"ollama",
					);
				}
				// Check for available models
				const models = await getOllamaModels();
				if (models.length === 0) {
					throw new AiProviderError(
						"No Ollama models found.\n" +
							"Download a model: ollama pull llama3.2",
						"ollama",
					);
				}
				let selectedModel = "llama3.2";
				if (models.length > 1) {
					const { model } = await inquirer.prompt([
						{
							type: ListType,
							name: "model",
							message: "Select Ollama model:",
							choices: models,
						},
					]);
					selectedModel = model;
				}

				return createConfig("ollama", undefined, selectedModel);
			}
		})
		.with("none", () => {
			return { provider: "none" } as AIConfig;
		})
		.otherwise(() => {
			throw new AiProviderError(`Unknown AI provider: ${provider}`, provider);
		});
}

/**
 * Create AI config object
 */
function createConfig(
	provider: AIProvider,
	geminiKey?: string,
	ollamaModel = "llama3.2",
	geminiModel = "gemini-2.0-flash-exp",
): AIConfig {
	return {
		provider,
		geminiKey,
		geminiModel,
		ollamaUrl: "http://localhost:11434",
		ollamaModel,
	};
}

/**
 * Show setup instructions when no AI is available
 */
function showSetupInstructions(): void {
	console.log(chalk.yellow("\n No AI provider configured\n"));
	console.log("Choose one of these free options:\n");

	console.log(chalk.cyan("1. Google Gemini (Cloud - Recommended):"));
	console.log(
		chalk.gray(
			"   • Get free API key: https://makersuite.google.com/app/apikey",
		),
	);
	console.log(chalk.gray("   • Set environment variable:"));
	console.log(chalk.gray('     export GOOGLE_AI_API_KEY="your-key-here"\n'));
	console.log(chalk.gray(" Provide the key when prompted in future runs.\n"));

	console.log(chalk.cyan("2. Ollama (Local - Complete Privacy):"));
	console.log(chalk.gray("   • Install: https://ollama.ai"));
	console.log(chalk.gray("   • Download model: ollama pull llama3.2"));
	console.log(chalk.gray("   • Start service: ollama serve\n"));
}
