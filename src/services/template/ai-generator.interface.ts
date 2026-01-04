import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { TaskTemplate } from "@templates/schema";

/**
 * Context for AI template generation
 */
export interface AIGenerationContext {
	preset?: TaskTemplate;
	storyExample?: WorkItem;
	additionalInstructions?: string;
}

/**
 * AI Generator interface
 * All AI providers must implement this interface
 */
export interface IAIGenerator {
	/**
	 * Generate a template from a text prompt
	 */
	generateTemplate(
		prompt: string,
		context?: AIGenerationContext,
	): Promise<TaskTemplate>;

	/**
	 * Refine an existing template with additional instructions
	 */
	refineTemplate(
		template: TaskTemplate,
		refinement: string,
	): Promise<TaskTemplate>;

	/**
	 * Check if the AI provider is available
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Get provider name
	 */
	getProviderName(): string;
}
