import {
  TemplateCatalog,
  type TemplateCatalogItem,
  type TemplateCatalogKind,
} from "@services/template/template-catalog";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode } from "@/cli/utilities/exit-codes";
import { sanitizeTty } from "@/cli/utilities/prompt-utilities";
import { getErrorMessage } from "@/utils/errors";

type ListOptions = {
  type?: TemplateCatalogKind;
};

const TEMPLATE_TYPES: TemplateCatalogKind[] = ["template", "mixin"];

export const templateListCommand = new Command("list")
  .aliases(["ls"])
  .description("List available templates and mixins")
  .option("--type <type>", "Filter by type: template or mixin")
  .action(async (options: ListOptions) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));

    try {
      const catalog = new TemplateCatalog();

      if (options.type !== undefined) {
        const type = parseTemplateType(options.type);
        output.intro(` Atomize — ${capitalize(type)}s`);

        const items = await catalog.listByKind(type);
        if (items.length === 0) {
          output.outro(`No ${type}s found.`);
          return;
        }

        output.blankLine();
        for (const item of items) {
          printCatalogItem(item, output);
        }

        const usage =
          type === "mixin"
            ? 'Use with: mixins: ["mixin:<name>"]'
            : 'Use with: extends: "template:<name>"';
        output.outro(chalk.gray(usage));
        return;
      }
      output.intro(" Atomize — Templates & Mixins");

      const [templates, mixins] = await Promise.all([
        catalog.listTemplates(),
        catalog.listMixins(),
      ]);

      if (templates.length === 0 && mixins.length === 0) {
        output.outro("No templates or mixins found.");
        return;
      }

      if (templates.length > 0) {
        output.print(chalk.bold("\n  Templates"));
        output.blankLine();
        for (const item of templates) {
          printCatalogItem(item, output);
        }
      }

      if (mixins.length > 0) {
        output.print(chalk.bold("\n  Mixins"));
        output.blankLine();
        for (const item of mixins) {
          printCatalogItem(item, output);
        }
      }

      output.outro(
        chalk.gray(
          'Templates: extends: "template:<name>"  ·  Mixins: mixins: ["mixin:<name>"]',
        ),
      );
    } catch (error) {
      output.cancel(getErrorMessage(error));
      process.exit(ExitCode.Failure);
    }
  });

function parseTemplateType(value: string): TemplateCatalogKind {
  if (TEMPLATE_TYPES.includes(value as TemplateCatalogKind)) {
    return value as TemplateCatalogKind;
  }
  throw new Error(`Invalid type "${value}". Expected: ${TEMPLATE_TYPES.join(", ")}.`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function printCatalogItem(
  item: TemplateCatalogItem,
  output: ReturnType<typeof createCommandOutput>,
): void {
  output.print(chalk.cyan(`  ${sanitizeTty(item.name)}`));
  output.print(chalk.gray(`    ${sanitizeTty(item.displayName)}`));
  output.print(chalk.gray(`    ${sanitizeTty(item.description)}`));
  output.print(chalk.gray(`    ref: ${sanitizeTty(item.ref)}  scope: ${item.scope}`));
  output.blankLine();
}
