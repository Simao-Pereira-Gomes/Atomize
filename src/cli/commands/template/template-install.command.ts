import { existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { confirm } from "@clack/prompts";
import {
  TemplateCatalog,
  type TemplateCatalogKind,
} from "@services/template/template-catalog";
import { MixinTemplateSchema, TaskTemplateSchema } from "@templates/schema";
import { loadYamlFile } from "@templates/template-file";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  isInteractiveTerminal,
  sanitizeTty,
} from "@/cli/utilities/prompt-utilities";
import { CancellationError, getErrorMessage } from "@/utils/errors";

type InstallOptions = {
  type?: TemplateCatalogKind;
  overwrite?: boolean;
};

const TEMPLATE_TYPES: TemplateCatalogKind[] = ["template", "mixin"];

export const templateInstallCommand = new Command("install")
  .description("Install a template or mixin into ~/.atomize/templates")
  .argument("<file>", "Path to a YAML template file")
  .option("--type <type>", "Template type: template or mixin (auto-detected if omitted)")
  .option("--overwrite", "Overwrite if a template with the same name already exists", false)
  .action(async (filePath: string, options: InstallOptions) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));

    try {
      const kind = options.type
        ? parseTemplateType(options.type)
        : await detectKind(filePath);

      output.intro(` Atomize — Install ${kind}`);
      if (!options.type) {
        output.print(chalk.gray(`  Detected type: ${kind}\n`));
      }

      const catalog = new TemplateCatalog();

      const ext = extname(resolve(filePath));
      const name = basename(resolve(filePath), ext);
      const targetPath = catalog.getUserTemplatePath(kind, name);

      if (existsSync(targetPath) && !options.overwrite) {
        if (!isInteractiveTerminal()) {
          output.cancel(`${kind} "${name}" already exists. Re-run with --overwrite to replace it.`);
          process.exit(ExitCode.Failure);
        }
        const confirmed = assertNotCancelled(
          await confirm({
            message: `${kind} "${name}" already exists. Overwrite?`,
            initialValue: false,
          }),
        );
        if (!confirmed) {
          output.outro("Cancelled.");
          process.exit(ExitCode.Success);
        }
      }

      const item = await catalog.installFromFile(filePath, kind);
      output.print(chalk.green(`Installed ${kind}: ${sanitizeTty(item.name)}`));
      output.print(chalk.gray(`  ref:  ${sanitizeTty(item.ref)}`));
      output.print(chalk.gray(`  path: ${sanitizeTty(item.path)}`));
      output.outro("Installed successfully");
    } catch (error) {
      if (error instanceof CancellationError) {
        output.outro("Cancelled.");
        process.exit(ExitCode.Success);
      }
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

async function detectKind(filePath: string): Promise<TemplateCatalogKind> {
  const raw = await loadYamlFile(filePath);

  if (TaskTemplateSchema.safeParse(raw).success) return "template";
  if (MixinTemplateSchema.safeParse(raw).success) return "mixin";

  const issues = TaskTemplateSchema.safeParse(raw).error?.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  throw new Error(`Could not detect template type. Pass --type explicitly.\n  ${issues}`);
}
