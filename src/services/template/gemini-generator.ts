import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  IAIGenerator,
  AIGenerationContext,
} from "./ai-generator.interface";
import type { TaskTemplate } from "@templates/schema";
import { parse as parseYaml } from "yaml";
import { TemplateValidator } from "@templates/validator";
import { logger } from "@config/logger";

/**
 * Google Gemini AI Generator
 * Uses Google's  Gemini API for template generation
 */
export class GeminiGenerator implements IAIGenerator {
  private client: GoogleGenerativeAI;
  private model: string;
  private validator: TemplateValidator;

  constructor(apiKey: string, model = "gemini-2.0-flash-exp") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.validator = new TemplateValidator();
  }

  async generateTemplate(
    prompt: string,
    context?: AIGenerationContext
  ): Promise<TaskTemplate> {
    logger.info("Gemini: Generating template...");

    const model = this.client.getGenerativeModel({ model: this.model });

    const fullPrompt = this.buildPrompt(prompt, context);

    try {
      const result = await model.generateContent(fullPrompt);
      const responseText = result.response.text();
      logger.debug("Gemini: Response received");
      const yaml = this.extractYAML(responseText);
      const template = this.parseAndValidate(yaml);
      logger.info("Gemini: Template generated successfully");
      return template;
    } catch (error) {
      logger.error("Gemini: Generation failed", { error });
      throw new Error(
        `Failed to generate template: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async refineTemplate(
    template: TaskTemplate,
    refinement: string
  ): Promise<TaskTemplate> {
    logger.info("Gemini: Refining template...");

    const model = this.client.getGenerativeModel({ model: this.model });
    const prompt = this.buildRefinementPrompt(template, refinement);
    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      const yaml = this.extractYAML(responseText);
      const refined = this.parseAndValidate(yaml);

      logger.info("Gemini: Template refined successfully");
      return refined;
    } catch (error) {
      logger.error("Gemini: Refinement failed", { error });
      throw new Error(
        `Failed to refine template: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      await model.generateContent("test");
      return true;
    } catch {
      return false;
    }
  }

  getProviderName(): string {
    return "Google Gemini";
  }

  /**
   * Build the full prompt for generation
   */
  private buildPrompt(
    userPrompt: string,
    context?: AIGenerationContext
  ): string {
    let prompt = this.getSystemPrompt();

    if (context?.preset) {
      prompt += "\n\nEXAMPLE TEMPLATE (use as inspiration):\n```yaml\n";
      prompt += this.templateToYAML(context.preset);
      prompt += "\n```\n";
    }

    if (context?.storyExample) {
      prompt += "\n\nEXAMPLE STORY STRUCTURE:\n";
      prompt += JSON.stringify(context.storyExample, null, 2);
      prompt += "\n";
    }

    if (context?.additionalInstructions) {
      prompt += "\n\nADDITIONAL INSTRUCTIONS:\n";
      prompt += context.additionalInstructions;
      prompt += "\n";
    }

    prompt += `\n\nUSER REQUEST: ${userPrompt}\n\n`;
    prompt +=
      "Generate a complete, valid YAML template. Output ONLY the YAML, no explanations or markdown formatting:";

    return prompt;
  }

  /**
   * Build refinement prompt
   */
  private buildRefinementPrompt(
    template: TaskTemplate,
    refinement: string
  ): string {
    let prompt = this.getSystemPrompt();

    prompt += "\n\nCURRENT TEMPLATE:\n```yaml\n";
    prompt += this.templateToYAML(template);
    prompt += "\n```\n";

    prompt += `\n\nREFINEMENT REQUEST: ${refinement}\n\n`;
    prompt +=
      "Modify the template according to the refinement request. Output ONLY the updated YAML:";

    return prompt;
  }

  /**
   * Get the system prompt with template schema and rules
   */
  private getSystemPrompt(): string {
    return `You are an expert at creating Atomize templates for breaking down user stories into development tasks.

TEMPLATE SCHEMA:
\`\`\`yaml
version: "1.0"
name: "Template Name"
description: "Brief description of what this template is for"

filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active", "Approved"]
  tags:
    include: ["backend", "api"]  # Optional
  excludeIfHasTasks: true  # Optional

tasks:
  - title: "Design: \${story.title}"
    description: "Design and architecture planning"
    estimationPercent: 15
    activity: "Design"
    tags: ["design"]
    
  - title: "Implement: \${story.title}"
    description: "Core implementation"
    estimationPercent: 50
    activity: "Development"
    
  - title: "Unit Testing"
    estimationPercent: 20
    activity: "Testing"
    
  - title: "Code Review & Documentation"
    estimationPercent: 15
    activity: "Documentation"

estimation:
  rounding: "nearest"
  minimumTaskPoints: 0
\`\`\`

CRITICAL RULES:
1. Total estimationPercent for all non-conditional tasks MUST sum to 100%
2. Use \${story.title} and \${story.id} for variable interpolation
3. Each task should have a clear, actionable title
4. Common activities: Design, Development, Testing, Documentation, Deployment
5. Output ONLY valid YAML - no markdown code blocks, no explanations

BEST PRACTICES:
- Design/Planning: 10-20%
- Implementation: 40-60%
- Testing: 15-25%
- Review/Documentation: 10-15%
- Deployment/Setup: 5-10%

VARIABLE INTERPOLATION:
- \${story.title} - Inserts the story title
- \${story.id} - Inserts the story ID
- \${story.description} - Inserts the story description`;
  }

  /**
   * Extract YAML from response (handles markdown code blocks)
   */
  private extractYAML(text: string): string {
    const yamlMatch = text.match(/```ya?ml\n([\s\S]*?)\n```/);
    if (yamlMatch) {
      return yamlMatch[1]!.trim();
    }

    const codeBlockMatch = text.match(/```\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1]!.trim();
    }
    return text.trim();
  }

  /**
   * Parse YAML and validate
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
        throw new Error(`Invalid template generated:\n${errors}`);
      }

      return parsed as TaskTemplate;
    } catch (error) {
      logger.error("Failed to parse generated YAML", { error, yaml });
      throw error;
    }
  }

  /**
   * Convert template to YAML string
   */
  private templateToYAML(template: TaskTemplate): string {
    const { stringify } = require("yaml");
    return stringify(template);
  }
}
