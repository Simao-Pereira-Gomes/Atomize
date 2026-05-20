import type {
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
import { formatScope, sanitizeTty } from "@/cli/utilities/prompt-utilities";
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

        const overrideMap = new Map(overrides.map(({ active, overridden }) => [active.name, overridden]));

        output.blankLine();
        for (const item of items) {
          printCatalogItem(item, output, overrideMap.get(item.name));
        }

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

      const templateOverrideMap = new Map(templateShadows.map(({ active, overridden }) => [active.name, overridden]));
      const mixinOverrideMap = new Map(mixinShadows.map(({ active, overridden }) => [active.name, overridden]));

      if (templates.length > 0) {
        output.print(chalk.bold("\n  Templates"));
        output.blankLine();
        for (const item of templates) {
          printCatalogItem(item, output, templateOverrideMap.get(item.name));
        }
      }

      if (mixins.length > 0) {
        output.print(chalk.bold("\n  Mixins"));
        output.blankLine();
        for (const item of mixins) {
          printCatalogItem(item, output, mixinOverrideMap.get(item.name));
        }
      }

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
  overriddenItem?: TemplateCatalogItem,
): void {
  output.print(chalk.cyan(`  ${sanitizeTty(item.name)}`));
  output.print(chalk.gray(`    ${sanitizeTty(item.displayName)}`));
  output.print(chalk.gray(`    ${sanitizeTty(item.description)}`));
  output.print(chalk.gray(`    ref: ${sanitizeTty(item.ref)}  scope: ${formatScope(item.scope)}`));
  const pathSuffix = item.scope === "builtin" ? " (read-only)" : "";
  output.print(chalk.gray(`    path: ${sanitizeTty(item.path)}${pathSuffix}`));
  if (overriddenItem) {
    const overriddenSuffix = overriddenItem.scope === "builtin" ? " (read-only)" : "";
    output.print(chalk.yellow(`    ⚠ overrides: ${formatScope(overriddenItem.scope)} at ${sanitizeTty(overriddenItem.path)}${overriddenSuffix}`));
  }
  output.blankLine();
}
