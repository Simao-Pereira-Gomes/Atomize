import {
  buildSystemPrompt,
  buildUserPrompt,
  MAX_ATTEMPTS,
  parseAndValidate,
} from "@services/template/llm-template-generator";
import chalk from "chalk";
import type { AIProvider } from "@/ai/providers/provider.interface";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { createManagedSpinner } from "@/cli/utilities/prompt-utilities";
import type { TaskTemplate } from "@/templates/schema";

const output = createCommandOutput(resolveCommandOutputPolicy({}));

export interface GenerationResult {
  template: TaskTemplate | null;
  lastRawOutput: string;
  prevErrors: string[];
}

export async function runGeneration(
  provider: AIProvider,
  description: string,
  groundingContext: string | null,
): Promise<GenerationResult> {
  const systemPrompt = buildSystemPrompt();
  let prevErrors: string[] = [];
  let lastRawOutput = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const userPrompt = buildUserPrompt(
      description,
      groundingContext,
      prevErrors.length > 0 ? prevErrors : undefined,
    );

    if (attempt === 1) {
      output.print(chalk.cyan("\n━━━ Generating template ━━━\n"));
      let rawOutput = "";
      for await (const chunk of provider.stream(systemPrompt, userPrompt)) {
        output.write(chalk.gray(chunk));
        rawOutput += chunk;
      }
      output.write("\n");
      lastRawOutput = rawOutput;
    } else {
      const retrySpinner = createManagedSpinner();
      retrySpinner.start(`Retrying (attempt ${attempt}/${MAX_ATTEMPTS})…`);
      lastRawOutput = await provider.generate(systemPrompt, userPrompt);
      retrySpinner.stop(`Attempt ${attempt}/${MAX_ATTEMPTS} complete`);
      output.print(chalk.cyan(`\n━━━ Revised template (attempt ${attempt}) ━━━\n`));
      output.print(chalk.gray(lastRawOutput));
      output.write("\n");
    }

    const parsed = parseAndValidate(lastRawOutput);
    if (parsed.ok) return { template: parsed.template, lastRawOutput, prevErrors };

    prevErrors = parsed.errors;
    if (attempt < MAX_ATTEMPTS) {
      output.warn(
        `Validation failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${parsed.errors.slice(0, 3).join("; ")}`,
      );
    }
  }

  return { template: null, lastRawOutput, prevErrors };
}

export function buildMinimalTemplate(description: string): TaskTemplate {
  return {
    version: "1.0",
    name: description.slice(0, 60).trim() || "Generated Template",
    filter: { workItemTypes: ["User Story"], states: ["Active"], excludeIfHasTasks: true },
    tasks: [{ title: "Task 1", estimationPercent: 100 }],
  };
}
