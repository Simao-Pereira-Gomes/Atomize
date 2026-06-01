import { select, text } from "@clack/prompts";
import { resolveAIProvider } from "@config/ai.config";
import { parseAndValidate } from "@services/template/llm-template-generator";
import chalk from "chalk";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { assertNotCancelled, createManagedSpinner } from "@/cli/utilities/prompt-utilities";
import type { TaskTemplate } from "@/templates/schema";
import { CancellationError, ConfigurationError } from "@/utils/errors";
import { customizeTemplate } from "../template-customize";
import { buildMinimalTemplate, runGeneration } from "./generation";
import { resolveGrounding } from "./grounding";
import { runPreviewLoop } from "./preview-loop";

const output = createCommandOutput(resolveCommandOutputPolicy({}));

export interface AICreationOptions {
  ai?: boolean;
  ground?: boolean;
  aiProfile?: string;
  profile?: string;
}

export async function createWithAI(options: AICreationOptions): Promise<TaskTemplate> {
  output.print(chalk.cyan("\n AI-Assisted Template Generation\n"));

  const providerSpinner = createManagedSpinner();
  providerSpinner.start("Resolving AI provider…");
  let provider: Awaited<ReturnType<typeof resolveAIProvider>>;
  try {
    provider = await resolveAIProvider(options.aiProfile);
    providerSpinner.stop(`Using provider: ${provider.id}`);
  } catch (err) {
    providerSpinner.stop("Failed to resolve AI provider");
    throw new ConfigurationError(err instanceof Error ? err.message : String(err));
  }

  const groundingContext = await resolveGrounding(options);

  const description = assertNotCancelled(
    await text({
      message: "Describe the template you need:",
      placeholder: "e.g. Backend API stories with design, implementation, and testing tasks",
      validate: (input: string | undefined): string | undefined => {
        if (!input || input.trim() === "") return "Description is required";
        return undefined;
      },
    }),
  );

  const { template, lastRawOutput, prevErrors } = await runGeneration(
    provider,
    description,
    groundingContext,
  );

  if (!template) {
    return handleGenerationFailure(lastRawOutput, prevErrors, description, options);
  }

  return handlePreviewLoop(template, options);
}

async function handleGenerationFailure(
  lastRawOutput: string,
  prevErrors: string[],
  description: string,
  options: AICreationOptions,
): Promise<TaskTemplate> {
  output.print(chalk.red("\n✖ Failed to generate a valid template after 3 attempts.\n"));
  output.print(chalk.yellow("Validation errors:"));
  for (const err of prevErrors) {
    output.print(chalk.yellow(`  • ${err}`));
  }
  output.print(chalk.gray("\nRaw output:\n"));
  output.print(chalk.gray(lastRawOutput));

  const action = assertNotCancelled(
    await select({
      message: "What would you like to do?",
      options: [
        { label: "Edit manually (opens wizard)", value: "edit" },
        { label: "Cancel", value: "cancel" },
      ],
    }),
  ) as string;

  if (action === "cancel") throw new CancellationError("AI generation cancelled");

  const parsed = parseAndValidate(lastRawOutput);
  const base = parsed.ok ? parsed.template : buildMinimalTemplate(description);
  return customizeTemplate(base, options.profile);
}

async function handlePreviewLoop(
  template: TaskTemplate,
  options: AICreationOptions,
): Promise<TaskTemplate> {
  const result = await runPreviewLoop(template);
  if (result.next === "save") return result.template;
  if (result.next === "edit") return customizeTemplate(result.template, options.profile);
  // regenerate
  return createWithAI(options);
}
