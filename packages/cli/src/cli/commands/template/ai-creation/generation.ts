import type { AIProvider } from "@sppg2001/atomize-ai";
import { draftTemplate } from "@sppg2001/atomize-core/services/template/ai-template-loop";
import { MAX_ATTEMPTS } from "@sppg2001/atomize-core/services/template/llm-template-generator";
import type { ProjectGrounding } from "@sppg2001/atomize-core/services/template/project-grounding";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import chalk from "chalk";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { createManagedSpinner } from "@/cli/utilities/prompt-utilities";

const output = createCommandOutput(resolveCommandOutputPolicy({}));

export interface GenerationResult {
  template: TaskTemplate | null;
  lastRawOutput: string;
  prevErrors: string[];
}

export async function runGeneration(
  provider: AIProvider,
  description: string,
  projectGrounding: ProjectGrounding | null,
): Promise<GenerationResult> {
  output.print(chalk.cyan("\n━━━ Generating template ━━━\n"));
  let retrySpinner: ReturnType<typeof createManagedSpinner> | undefined;
  let streamed = false;

  const result = await draftTemplate(provider, { prose: description, projectGrounding }, {
    onChunk: (chunk) => {
      streamed = true;
      output.write(chalk.gray(chunk));
    },
    onAttemptInvalid: (attempt, errors) => {
      if (attempt === 1 && streamed) output.write("\n");
      output.warn(
        `Validation failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${errors.slice(0, 3).join("; ")}`,
      );
    },
    onRepairStart: (attempt) => {
      retrySpinner = createManagedSpinner();
      retrySpinner.start(`Retrying (attempt ${attempt}/${MAX_ATTEMPTS})…`);
    },
    onRepairOutput: (attempt, rawOutput) => {
      retrySpinner?.stop(`Attempt ${attempt}/${MAX_ATTEMPTS} complete`);
      output.print(chalk.cyan(`\n━━━ Revised template (attempt ${attempt}) ━━━\n`));
      output.print(chalk.gray(rawOutput));
      output.write("\n");
    },
  });

  if (result.ok) {
    if (result.attempts === 1 && streamed) output.write("\n");
    return { template: result.template, lastRawOutput: "", prevErrors: [] };
  }
  return { template: null, lastRawOutput: result.rawOutput, prevErrors: result.errors };
}

export function buildMinimalTemplate(description: string): TaskTemplate {
  return {
    version: "1.0",
    name: description.slice(0, 60).trim() || "Generated Template",
    filter: { workItemTypes: ["User Story"], states: ["Active"], excludeIfHasTasks: true },
    tasks: [{ title: "Task 1", estimationPercent: 100 }],
  };
}
