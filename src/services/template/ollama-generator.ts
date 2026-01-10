import { logger } from "@config/logger";
import type { TaskTemplate } from "@templates/schema";
import { TemplateValidator } from "@templates/validator";
import { parse as parseYaml } from "yaml";
import { UnknownError } from "@/utils/errors";
import type {
	AIGenerationContext,
	IAIGenerator,
} from "./ai-generator.interface";

interface OllamaOptions {
	baseUrl?: string;
	model?: string;
}

interface OllamaResponse {
	model: string;
	response: string;
	done: boolean;
}

/**
 * Ollama AI Generator
 * Uses locally-running Ollama for completely free, offline template generation
 */
export class OllamaGenerator implements IAIGenerator {
	private baseUrl: string;
	private model: string;
	private validator: TemplateValidator;

	constructor(options: OllamaOptions = {}) {
		this.baseUrl = options.baseUrl || "http://localhost:11434";
		this.model = options.model || "llama3.2";
		this.validator = new TemplateValidator();
	}

	async generateTemplate(
		prompt: string,
		context?: AIGenerationContext,
	): Promise<TaskTemplate> {
		logger.info(`Ollama: Generating template with ${this.model}...`);

		const fullPrompt = this.buildPrompt(prompt, context);

		try {
			const response = await this.generate(fullPrompt);
			const yaml = this.extractYAML(response);
			if (!yaml) {
				throw new UnknownError(
					"No YAML content extracted from Ollama response",
				);
			}
			const template = this.parseAndValidate(yaml);

			logger.info("Ollama: Template generated successfully");
			return template;
		} catch (error) {
			logger.error("Ollama: Generation failed", { error });
			throw new Error(
				`Failed to generate template: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	async refineTemplate(
		template: TaskTemplate,
		refinement: string,
	): Promise<TaskTemplate> {
		logger.info("Ollama: Refining template...");

		const prompt = this.buildRefinementPrompt(template, refinement);

		try {
			const response = await this.generate(prompt);
			const yaml = this.extractYAML(response);
			if (!yaml) {
				throw new UnknownError(
					"No YAML content extracted from Ollama response",
				);
			}
			const refined = this.parseAndValidate(yaml);

			logger.info("Ollama: Template refined successfully");
			return refined;
		} catch (error) {
			logger.error("Ollama: Refinement failed", { error });
			throw new Error(
				`Failed to refine template: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	async isAvailable(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`, {
				signal: AbortSignal.timeout(2000),
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	getProviderName(): string {
		return `Ollama (${this.model})`;
	}

	/**
	 * Generate response from Ollama
	 */
	private async generate(prompt: string): Promise<string> {
		const response = await fetch(`${this.baseUrl}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: this.model,
				prompt,
				stream: false,
				options: {
					temperature: 0.3, // Lower temperature for more consistent output
					num_predict: 2000, // Max tokens
				},
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Ollama request failed: ${error}`);
		}

		const data = (await response.json()) as OllamaResponse;
		return data.response;
	}

	/**
	 * Build the full prompt for generation
	 */
	private buildPrompt(
		userPrompt: string,
		context?: AIGenerationContext,
	): string {
		let prompt = this.getSystemPrompt();

		// Add context if provided
		if (context?.preset) {
			prompt += "\n\nEXAMPLE TEMPLATE:\n```yaml\n";
			prompt += this.templateToYAML(context.preset);
			prompt += "\n```\n";
		}

		if (context?.storyExample) {
			prompt += "\n\nEXAMPLE STORY:\n";
			prompt += JSON.stringify(context.storyExample, null, 2);
			prompt += "\n";
		}

		if (context?.additionalInstructions) {
			prompt += "\n\nADDITIONAL CONTEXT:\n";
			prompt += context.additionalInstructions;
			prompt += "\n";
		}

		// Add user's request
		prompt += `\n\nREQUEST: Create a template for: ${userPrompt}\n\n`;
		prompt += "OUTPUT (YAML only, no explanations):";

		return prompt;
	}

	/**
	 * Build refinement prompt
	 */
	private buildRefinementPrompt(
		template: TaskTemplate,
		refinement: string,
	): string {
		let prompt = this.getSystemPrompt();

		prompt += "\n\nCURRENT TEMPLATE:\n```yaml\n";
		prompt += this.templateToYAML(template);
		prompt += "\n```\n";

		prompt += `\n\nCHANGE REQUESTED: ${refinement}\n\n`;
		prompt += "OUTPUT (modified YAML only):";

		return prompt;
	}

	/**
	 * Get the system prompt
	 */
	private getSystemPrompt(): string {
		return `You are an expert at creating Atomize task breakdown templates.

TEMPLATE FORMAT:
\`\`\`yaml
version: "1.0"
name: "Template Name"
description: "What this template does"

filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active"]

tasks:
  - id: "design"
    title: "Design: \${story.title}"
    estimationPercent: 15
    activity: "Design"

  - id: "implementation"
    title: "Implementation"
    estimationPercent: 60
    activity: "Development"
    dependsOn: ["design"]

  - id: "testing"
    title: "Testing"
    estimationPercent: 25
    activity: "Testing"
    dependsOn: ["implementation"]
\`\`\`

RULES:
1. estimationPercent must total 100%
2. Use \${story.title}, \${story.id} for variables
3. Common activities: Design, Development, Testing, Documentation
4. Output ONLY the YAML template
5. If tasks have dependencies (dependsOn), they MUST have id fields
6. Task IDs should be lowercase with hyphens (e.g., "backend-api")

TASK DISTRIBUTION:
- Planning/Design: 10-20%
- Implementation: 40-60%
- Testing: 15-25%
- Documentation: 10-15%

DEPENDENCIES:
- Use dependsOn to link tasks: dependsOn: ["design", "database"]
- Creates predecessor-successor relationships in work management`;
	}

	/**
	 * Extract YAML from response
	 */
	private extractYAML(text: string): string | undefined {
		const yamlMatch = text.match(/```ya?ml\n([\s\S]*?)\n```/);
		if (yamlMatch) {
			return yamlMatch[1]?.trim();
		}

		const codeBlockMatch = text.match(/```\n([\s\S]*?)\n```/);
		if (codeBlockMatch) {
			return codeBlockMatch[1]?.trim();
		}

		const lines = text.split("\n");
		const yamlLines: string[] = [];
		let inYaml = false;

		for (const line of lines) {
			if (
				line.trim().startsWith("version:") ||
				line.trim().startsWith("name:")
			) {
				inYaml = true;
			}

			if (inYaml) {
				yamlLines.push(line);
			}
		}

		if (yamlLines.length > 0) {
			return yamlLines.join("\n").trim();
		}

		return text.trim();
	}

	/**
	 * Parse and validate YAML
	 */
	private parseAndValidate(yaml: string): TaskTemplate {
		try {
			const parsed = parseYaml(yaml);

			if (!parsed) {
				throw new Error("Empty template generated");
			}

			const validation = this.validator.validate(parsed);

			if (!validation.valid) {
				const errors = validation.errors
					.map((e) => `${e.path}: ${e.message}`)
					.join("\n");
				throw new Error(`Invalid template:\n${errors}`);
			}

			return parsed as TaskTemplate;
		} catch (error) {
			logger.error("Failed to parse YAML", { error, yaml });
			throw error;
		}
	}

	/**
	 * Convert template to YAML
	 */
	private templateToYAML(template: TaskTemplate): string {
		const { stringify } = require("yaml");
		return stringify(template);
	}
}
