import { select } from "@clack/prompts";
import chalk from "chalk";
import { stringify as stringifyYaml } from "yaml";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";
import type { TaskTemplate } from "@/templates/schema";
import { CancellationError } from "@/utils/errors";
import { displayTemplatePreview } from "../template-wizard";

const output = createCommandOutput(resolveCommandOutputPolicy({}));

export type PreviewLoopAction =
  | { next: "save"; template: TaskTemplate }
  | { next: "edit"; template: TaskTemplate }
  | { next: "regenerate" };

export async function runPreviewLoop(template: TaskTemplate): Promise<PreviewLoopAction> {
  while (true) {
    displayTemplatePreview(template);

    const action = assertNotCancelled(
      await select({
        message: "What would you like to do?",
        options: [
          { label: "Save template", value: "save" },
          { label: "View full YAML", value: "yaml" },
          { label: "Edit template (opens wizard)", value: "edit" },
          { label: "Regenerate", value: "regenerate" },
          { label: "Cancel", value: "cancel" },
        ],
      }),
    ) as string;

    if (action === "save") return { next: "save", template };
    if (action === "cancel") throw new CancellationError("Template creation cancelled");
    if (action === "edit") return { next: "edit", template };
    if (action === "regenerate") return { next: "regenerate" };

    // "yaml"
    output.print(chalk.cyan("\nFull YAML:\n"));
    output.print(chalk.gray(stringifyYaml(template)));
    output.blankLine();
  }
}
