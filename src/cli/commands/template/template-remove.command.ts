import { rm } from "node:fs/promises";
import { confirm } from "@clack/prompts";
import {
  TemplateCatalog,
  type TemplateCatalogKind,
} from "@services/template/template-catalog";
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

type RemoveOptions = {
  type?: TemplateCatalogKind;
  force?: boolean;
};

const TEMPLATE_TYPES: TemplateCatalogKind[] = ["template", "mixin"];

export const templateRemoveCommand = new Command("remove")
  .aliases(["rm"])
  .description("Remove a user-installed template or mixin from ~/.atomize/templates")
  .argument("<name>", "Template ref (template:<name> or mixin:<name>) or bare name")
  .option("--type <type>", "Restrict to a specific type: template or mixin")
  .option("-f, --force", "Skip confirmation prompt", false)
  .action(async (nameArg: string, options: RemoveOptions) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));

    try {
      output.intro(" Atomize — Remove Template");

      const { kind, name } = await resolveNameArg(nameArg, options.type);
      const catalog = new TemplateCatalog();
      const item = await catalog.findItem(kind, name);

      if (!item) {
        output.cancel(`${kind} "${name}" not found. Run: atomize template list`);
        process.exit(ExitCode.Failure);
      }

      if (item.scope !== "user") {
        output.cancel(
          `Cannot remove "${name}" — it is a ${item.scope} ${kind} and is not user-installed.`,
        );
        process.exit(ExitCode.Failure);
      }

      if (!options.force) {
        if (!isInteractiveTerminal()) {
          output.cancel(`Pass -f / --force to confirm removal of ${kind} "${name}" in non-interactive mode.`);
          process.exit(ExitCode.Failure);
        }
        output.print(chalk.gray(`  ref:  ${sanitizeTty(item.ref)}`));
        output.print(chalk.gray(`  path: ${sanitizeTty(item.path)}\n`));
        const confirmed = assertNotCancelled(
          await confirm({
            message: `Remove ${kind} "${name}"?`,
            initialValue: false,
          }),
        );
        if (!confirmed) {
          output.outro("Cancelled.");
          process.exit(ExitCode.Success);
        }
      }

      await rm(item.path);
      output.print(chalk.green(`Removed ${kind}: ${sanitizeTty(name)}`));
      output.outro("Done.");
    } catch (error) {
      if (error instanceof CancellationError) {
        output.outro("Cancelled.");
        process.exit(ExitCode.Success);
      }
      output.cancel(getErrorMessage(error));
      process.exit(ExitCode.Failure);
    }
  });

async function resolveNameArg(
  arg: string,
  typeOverride: string | undefined,
): Promise<{ kind: TemplateCatalogKind; name: string }> {
  if (arg.startsWith("template:") || arg.startsWith("mixin:")) {
    const colonIdx = arg.indexOf(":");
    const kind = arg.slice(0, colonIdx) as TemplateCatalogKind;
    const name = arg.slice(colonIdx + 1);
    return { kind, name };
  }

  if (typeOverride) {
    if (!TEMPLATE_TYPES.includes(typeOverride as TemplateCatalogKind)) {
      throw new Error(`Invalid type "${typeOverride}". Expected: ${TEMPLATE_TYPES.join(", ")}.`);
    }
    return { kind: typeOverride as TemplateCatalogKind, name: arg };
  }

  const catalog = new TemplateCatalog();
  const [asTemplate, asMixin] = await Promise.all([
    catalog.findItem("template", arg).catch(() => undefined),
    catalog.findItem("mixin", arg).catch(() => undefined),
  ]);

  if (asTemplate && asMixin) {
    throw new Error(
      `"${arg}" exists as both a template and a mixin. Use template:${arg} or mixin:${arg} to be explicit.`,
    );
  }
  if (asTemplate) return { kind: "template", name: arg };
  if (asMixin) return { kind: "mixin", name: arg };

  throw new Error(`"${arg}" not found as a template or mixin. Run: atomize template list`);
}
