import inquirer from "inquirer";
import chalk from "chalk";
import { match } from "ts-pattern";

export type AIProvider = "gemini" | "ollama" | "none";

export interface AIConfig {
  provider: AIProvider;
  geminiKey?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}

/**
 * Check if Ollama is available and running
 */
export async function checkOllama(
  url = "http://localhost:11434"
): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(2000), // 2 second timeout
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
  url = "http://localhost:11434"
): Promise<string[]> {
  try {
    const response = await fetch(`${url}/api/tags`);
    const data = (await response.json()) as {
      models?: Array<{ name: string }>;
    };
    return data.models?.map((m: any) => m.name) || [];
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

  // If both available, let user choose
  if (geminiKey && ollamaAvailable) {
    const { provider } = await inquirer.prompt([
      {
        type: "list",
        name: "provider",
        message: "Which AI provider would you like to use?",
        choices: [
          { name: "Google Gemini (Cloud, Free tier)", value: "gemini" },
          { name: "Ollama (Local, Completely free)", value: "ollama" },
        ],
      },
    ]);

    return createConfig(provider, geminiKey);
  }

  if (geminiKey) {
    console.log(chalk.cyan("Using Google Gemini AI"));
    return createConfig("gemini", geminiKey);
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
  provider: AIProvider
): Promise<AIConfig> {
  return match(provider)
    .with("none", () => {
      {
        showSetupInstructions();
      }
      return { provider: "none" } as AIConfig;
    })
    .with("gemini", () => {
      {
        const geminiKey = process.env.GOOGLE_AI_API_KEY;
        if (!geminiKey) {
          throw new Error(
            "GOOGLE_AI_API_KEY environment variable not found.\n" +
              "Get a free API key at: https://makersuite.google.com/app/apikey"
          );
        }
        return createConfig("gemini", geminiKey);
      }
    })
    .with("ollama", async () => {
      {
        const available = await checkOllama();
        if (!available) {
          throw new Error(
            "Ollama is not running.\n" +
              "Install from: https://ollama.ai\n" +
              "Then run: ollama serve"
          );
        }
        // Check for available models
        const models = await getOllamaModels();
        if (models.length === 0) {
          throw new Error(
            "No Ollama models found.\n" +
              "Download a model: ollama pull llama3.2"
          );
        }
        // Let user choose model if multiple available
        let selectedModel = "llama3.2";
        if (models.length > 1) {
          const { model } = await inquirer.prompt([
            {
              type: "list",
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
    .otherwise(() => {
      throw new Error(`Unknown AI provider: ${provider}`);
    });
}

/**
 * Create AI config object
 */
function createConfig(
  provider: AIProvider,
  geminiKey?: string,
  ollamaModel = "llama3.2"
): AIConfig {
  return {
    provider,
    geminiKey,
    ollamaUrl: "http://localhost:11434",
    ollamaModel,
  };
}

/**
 * Show setup instructions when no AI is available
 */
function showSetupInstructions(): void {
  console.log(chalk.yellow("\n⚠️  No AI provider configured\n"));
  console.log("Choose one of these free options:\n");

  console.log(chalk.cyan("1. Google Gemini (Cloud - Recommended):"));
  console.log(
    chalk.gray(
      "   • Get free API key: https://makersuite.google.com/app/apikey"
    )
  );
  console.log(chalk.gray("   • Set environment variable:"));
  console.log(chalk.gray('     export GOOGLE_AI_API_KEY="your-key-here"\n'));

  console.log(chalk.cyan("2. Ollama (Local - Complete Privacy):"));
  console.log(chalk.gray("   • Install: https://ollama.ai"));
  console.log(chalk.gray("   • Download model: ollama pull llama3.2"));
  console.log(chalk.gray("   • Start service: ollama serve\n"));
}
