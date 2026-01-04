import type { AIConfig } from "@config/ai.config";
import { logger } from "@config/logger";
import { match } from "ts-pattern";
import { AiProviderError } from "@/utils/errors";
import type { IAIGenerator } from "./ai-generator.interface";
import { GeminiGenerator } from "./gemini-generator";
import { OllamaGenerator } from "./ollama-generator";

/**
 * Factory for creating AI generators
 */
//biome-ignore lint/complexity : The any type is used here for flexibility
export class AIGeneratorFactory {
	/**
	 * Create an AI generator based on configuration
	 */
	static create(config: AIConfig): IAIGenerator {
		logger.debug(`Creating AI generator: ${config.provider}`);

		return match(config.provider)
			.with("gemini", () => {
				if (!config.geminiKey) {
					throw new AiProviderError("Gemini API key is required", "gemini");
				}
				return new GeminiGenerator(config.geminiKey);
			})
			.with("ollama", () => {
				return new OllamaGenerator({
					baseUrl: config.ollamaUrl,
					model: config.ollamaModel,
				});
			})
			.with("none", () => {
				throw new AiProviderError("No AI provider configured", "none");
			})
			.otherwise(() => {
				throw new AiProviderError(
					`Unknown AI provider: ${config.provider}`,
					config.provider,
				);
			});
	}

	/**
	 * Create generator with auto-detection
	 * Tries Gemini first, then Ollama, throws if neither available
	 */
	static async createAuto(): Promise<IAIGenerator> {
		const geminiKey = process.env.GOOGLE_AI_API_KEY;

		if (geminiKey) {
			logger.info("Using Gemini AI");
			return new GeminiGenerator(geminiKey);
		}

		const ollama = new OllamaGenerator();
		if (await ollama.isAvailable()) {
			logger.info("Using Ollama AI");
			return ollama;
		}

		throw new AiProviderError(
			"No AI provider available. Please configure Gemini or Ollama.",
			"none",
		);
	}
}
