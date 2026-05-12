import type {
  CatalogOverride,
  TemplateCatalogItem,
  TemplateCatalogKind,
} from "@services/template/template-catalog";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import { sanitizeTty } from "@/cli/utilities/prompt-utilities";
import { TemplateLibrary } from "@/templates/template-library";
import { getErrorMessage } from "@/utils/errors";

type ListOptions = {
  type?: TemplateCatalogKind;
};

export const templateListCommand = new Command("list")
  .aliases(["ls"])
  .description("List available templates and mixins")
  .option("--type <type>", "Filter by type: template or mixin")
  .action(async (options: ListOptions) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));

    try {
      const library = new TemplateLibrary();

      if (options.type !== undefined) {
        const type = library.parseCatalogKind(options.type);
        output.intro(` Atomize — ${capitalize(type)}s`);

        const { items, overrides } = await library.getCatalog(type);
        if (items.length === 0) {
          output.outro(`No ${type}s found.`);
          return;
        }

        output.blankLine();
        for (const item of items) {
          printCatalogItem(item, output);
        }

        printOverrideWarnings(overrides, output);

        const usage =
          type === "mixin"
            ? 'Use with: mixins: ["mixin:<name>"]'
            : 'Use with: extends: "template:<name>"';
        output.outro(chalk.gray(usage));
        return;
      }
      output.intro(" Atomize — Templates & Mixins");

      const [{ items: templates, overrides: templateShadows }, { items: mixins, overrides: mixinShadows }] =
        await Promise.all([
          library.getCatalog("template"),
          library.getCatalog("mixin"),
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

      printOverrideWarnings([...templateShadows, ...mixinShadows], output);

      output.outro(
        chalk.gray(
          'Templates: extends: "template:<name>"  ·  Mixins: mixins: ["mixin:<name>"]',
        ),
      );
    } catch (error) {
      if (!(error instanceof ExitError)) output.cancel(getErrorMessage(error));
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });

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

function printOverrideWarnings(
  overrides: CatalogOverride[],
  output: ReturnType<typeof createCommandOutput>,
): void {
  if (overrides.length === 0) return;
  output.print(chalk.yellow("  ⚠ Overridden (not active):"));
  for (const { overridden, active } of overrides) {
    output.print(
      chalk.gray(
        `    ${sanitizeTty(overridden.ref)} (${overridden.scope}) — overridden by ${active.scope}-scoped "${sanitizeTty(active.name)}"`,
      ),
    );
  }
  output.blankLine();
}
