import { rm } from "node:fs/promises";
import { confirm } from "@clack/prompts";
import type { TemplateCatalogKind } from "@services/template/template-catalog";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  isInteractiveTerminal,
  sanitizeTty,
} from "@/cli/utilities/prompt-utilities";
import { TemplateLibrary } from "@/templates/template-library";
import { CancellationError, getErrorMessage } from "@/utils/errors";

type RemoveOptions = {
  type?: TemplateCatalogKind;
  force?: boolean;
};

const library = new TemplateLibrary();

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
      const item = await library.findCatalogItem(kind, name);

      if (!item) {
        output.cancel(`${kind} "${name}" not found. Run: atomize template list`);
        throw new ExitError(ExitCode.Failure);
      }

      if (item.scope !== "user") {
        output.cancel(
          `Cannot remove "${name}" — it is a ${item.scope} ${kind} and is not user-installed.`,
        );
        throw new ExitError(ExitCode.Failure);
      }

      if (!options.force) {
        if (!isInteractiveTerminal()) {
          output.cancel(`Pass -f / --force to confirm removal of ${kind} "${name}" in non-interactive mode.`);
          throw new ExitError(ExitCode.Failure);
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
      if (!(error instanceof ExitError)) output.cancel(getErrorMessage(error));
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
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
    return { kind: library.parseCatalogKind(typeOverride), name: arg };
  }

  const [asTemplate, asMixin] = await Promise.all([
    library.findCatalogItem("template", arg).catch(() => undefined),
    library.findCatalogItem("mixin", arg).catch(() => undefined),
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
