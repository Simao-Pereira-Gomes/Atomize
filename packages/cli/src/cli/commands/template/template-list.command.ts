import { note } from "@clack/prompts";
import type {
  CatalogLineage,
  CatalogOverride,
  TemplateCatalogItem,
  TemplateCatalogKind,
  TemplateCatalogScope,
} from "@services/template/template-catalog";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import { formatScope, sanitizeTty } from "@/cli/utilities/prompt-utilities";
import { writeManagedOutput } from "@/cli/utilities/terminal-output";
import { TemplateLibrary } from "@/templates/template-library";
import { getErrorMessage } from "@/utils/errors";

type ListOptions = {
  type?: TemplateCatalogKind;
  json: boolean;
};

interface CatalogJsonItem {
  name: string;
  displayName: string;
  description: string;
  ref: string;
  scope: TemplateCatalogScope;
  kind: TemplateCatalogKind;
  path: string;
  overrides?: { name: string; ref: string; scope: TemplateCatalogScope; path: string };
  origin?: { ref: string; scope: TemplateCatalogScope };
}

export const templateListCommand = new Command("list")
  .aliases(["ls"])
  .description("List available templates and mixins")
  .option("--type <type>", "Filter by type: template or mixin")
  .option("--json", "Print results as JSON to stdout; progress is written to stderr", false)
  .action(async (options: ListOptions) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));
    const jsonMode = options.json;
    const logProgress = jsonMode
      ? (msg: string) => writeManagedOutput("stderr", msg)
      : undefined;

    try {
      const library = new TemplateLibrary();

      if (options.type !== undefined) {
        const type = library.parseCatalogKind(options.type);
        if (!jsonMode) output.intro(` Atomize — ${capitalize(type)}s`);
        else logProgress?.(`Listing ${type}s...`);

        const { items, overrides, lineage } = await library.getCatalog(type);

        if (jsonMode) {
          output.printJson(buildJsonItems(items, overrides, lineage));
          return;
        }

        if (items.length === 0) {
          output.outro(`No ${type}s found.`);
          return;
        }

        const overrideMap = new Map(overrides.map(({ active, overridden }) => [active.name, overridden]));
        const lineageMap = new Map(lineage.map(({ item, originItem }) => [item.name, originItem]));

        output.blankLine();
        for (const item of items) {
          printCatalogItem(item, output, overrideMap.get(item.name), lineageMap.get(item.name));
        }

        const usageLine =
          type === "mixin"
            ? 'mixins: ["mixin:<name>"]'
            : 'extends: "template:<name>"';
        note(usageLine, "Usage");
        output.outro("");
        return;
      }

      if (!jsonMode) output.intro(" Atomize — Templates & Mixins");
      else logProgress?.("Listing catalog...");

      if (jsonMode) {
        const { items, overrides, lineage } = await library.getCatalogAll();
        output.printJson(buildJsonItems(items, overrides, lineage));
        return;
      }

      const [{ items: templates, overrides: templateShadows, lineage: templateLineage }, { items: mixins, overrides: mixinShadows, lineage: mixinLineage }] =
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
      const templateLineageMap = new Map(templateLineage.map(({ item, originItem }) => [item.name, originItem]));
      const mixinLineageMap = new Map(mixinLineage.map(({ item, originItem }) => [item.name, originItem]));

      if (templates.length > 0) {
        output.print(chalk.bold("\n  Templates"));
        output.blankLine();
        for (const item of templates) {
          printCatalogItem(item, output, templateOverrideMap.get(item.name), templateLineageMap.get(item.name));
        }
      }

      if (mixins.length > 0) {
        output.print(chalk.bold("\n  Mixins"));
        output.blankLine();
        for (const item of mixins) {
          printCatalogItem(item, output, mixinOverrideMap.get(item.name), mixinLineageMap.get(item.name));
        }
      }

      note(
        'Templates:  extends: "template:<name>"\nMixins:     mixins: ["mixin:<name>"]',
        "Usage",
      );
      output.outro("");
    } catch (error) {
      if (!(error instanceof ExitError)) {
        const msg = sanitizeTty(getErrorMessage(error));
        if (jsonMode) writeManagedOutput("stderr", `Error: ${msg}`);
        else output.cancel(msg);
      }
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildJsonItems(
  items: TemplateCatalogItem[],
  overrides: CatalogOverride[],
  lineage: CatalogLineage[],
): CatalogJsonItem[] {
  const overrideMap = new Map(overrides.map(({ active, overridden }) => [active.ref, overridden]));
  const lineageMap = new Map(lineage.map(({ item, originItem }) => [item.ref, originItem]));

  const sorted = [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "template" ? -1 : 1;
    return a.ref.localeCompare(b.ref);
  });

  return sorted.map((item): CatalogJsonItem => {
    const overriddenItem = overrideMap.get(item.ref);
    const originItem = lineageMap.get(item.ref);
    return {
      name: item.name,
      displayName: item.displayName,
      description: item.description,
      ref: item.ref,
      scope: item.scope,
      kind: item.kind,
      path: item.path,
      ...(overriddenItem !== undefined ? {
        overrides: {
          name: overriddenItem.name,
          ref: overriddenItem.ref,
          scope: overriddenItem.scope,
          path: overriddenItem.path,
        },
      } : {}),
      ...(originItem !== undefined ? {
        origin: {
          ref: originItem.ref,
          scope: originItem.scope,
        },
      } : {}),
    };
  });
}

function printCatalogItem(
  item: TemplateCatalogItem,
  output: ReturnType<typeof createCommandOutput>,
  overriddenItem?: TemplateCatalogItem,
  originItem?: TemplateCatalogItem,
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
  if (originItem && originItem.ref !== overriddenItem?.ref) {
    output.print(chalk.blue(`    ↖ based on: ${formatScope(originItem.scope)} ${sanitizeTty(originItem.ref)}`));
  }
  output.blankLine();
}
