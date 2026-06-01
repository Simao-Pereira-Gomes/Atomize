import { confirm } from "@clack/prompts";
import type { TemplateCatalogKind } from "@services/template/template-catalog";
import type {
  TemplateInstallScope,
} from "@services/template/template-install-source";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { handOffToEditor } from "@/cli/utilities/editor-handoff";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  formatScope,
  isInteractiveTerminal,
  sanitizeTty,
} from "@/cli/utilities/prompt-utilities";
import { fetchTemplateContent } from "@/cli/utilities/template-fetch";
import { TemplateLibrary } from "@/templates/template-library";
import { CancellationError, getErrorMessage } from "@/utils/errors";

type InstallOptions = {
  type?: TemplateCatalogKind;
  overwrite?: boolean;
  scope?: TemplateInstallScope;
  open?: boolean;
  quiet?: boolean;
};

type TemplateInstallCommandDependencies = {
  handOffToEditor: typeof handOffToEditor;
};

export function makeTemplateInstallCommand(
  dependencies: TemplateInstallCommandDependencies = { handOffToEditor },
): Command {
  return new Command("install")
  .description("Install a template or mixin from a local file or HTTPS URL")
  .argument("<source>", "Path to a YAML template file or an HTTPS URL")
  .option("--type <type>", "Template type: template or mixin (auto-detected if omitted)")
  .option("--overwrite", "Overwrite if a template with the same name already exists", false)
  .option("--scope <scope>", 'Installation scope: user (displayed as "personal") or project (displayed as "your project") [default: user]')
  .option("--open", "Open the installed Atomize YAML file in a supported editor", false)
  .option("-q, --quiet", "Suppress non-essential output", false)
  .action(async (source: string, options: InstallOptions) => {
    const output = createCommandOutput(
      resolveCommandOutputPolicy({ quiet: options.quiet, verbose: false }),
    );

    try {
      const library = new TemplateLibrary();
      const scope = library.parseInstallScope(options.scope ?? "user");
      const preview = await library.previewInstall({
        source,
        kind: options.type ? library.parseCatalogKind(options.type) : undefined,
        scope,
        fetchContent: fetchTemplateContent,
        onFetch: (url) => output.print(chalk.gray(`  Fetching ${sanitizeTty(url)}\n`)),
        onRawUrl: (url) => output.print(chalk.gray(`  Using raw URL: ${sanitizeTty(url)}\n`)),
      });
      const resolvedSource = preview.source;

      output.intro(` Atomize — Install ${resolvedSource.kind}`);
      if (!options.type) {
        output.print(chalk.gray(`  Detected type: ${resolvedSource.kind}\n`));
      }

      let overwrite = options.overwrite === true;
      if (preview.exists && !overwrite) {
        if (!isInteractiveTerminal()) {
          output.cancel(`${resolvedSource.kind} "${resolvedSource.name}" already exists. Re-run with --overwrite to replace it.`);
          throw new ExitError(ExitCode.Failure);
        }
        const confirmed = assertNotCancelled(
          await confirm({
            message: `${resolvedSource.kind} "${resolvedSource.name}" already exists. Overwrite?`,
            initialValue: false,
          }),
        );
        if (!confirmed) {
          output.outro("Cancelled.");
          process.exit(ExitCode.Success);
        }
        overwrite = true;
      }

      const item = await resolvedSource.install({ overwrite });
      output.print(chalk.green(`Installed ${resolvedSource.kind}: ${sanitizeTty(item.name)}`));
      output.print(chalk.gray(`  ref:   ${sanitizeTty(item.ref)}`));
      output.print(chalk.gray(`  scope: ${formatScope(item.scope)}`));
      output.print(chalk.gray(`  path:  ${sanitizeTty(item.path)}`));
      if (resolvedSource.fromLabel) output.print(chalk.gray(`  from:  ${sanitizeTty(resolvedSource.fromLabel)}`));
      await dependencies.handOffToEditor({
        path: item.path,
        requestedOpen: options.open === true,
        interactive: isInteractiveTerminal(),
        output,
      });
      output.outro("Installed successfully");
    } catch (error) {
      if (error instanceof CancellationError) {
        output.outro("Cancelled.");
        process.exit(ExitCode.Success);
      }
      if (!(error instanceof ExitError)) output.cancel(getErrorMessage(error));
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });
}

export const templateInstallCommand = makeTemplateInstallCommand();
