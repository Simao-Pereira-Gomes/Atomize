import { log } from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { stringify as stringifyYaml } from "yaml";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import { sanitizeTty } from "@/cli/utilities/prompt-utilities";
import { TemplateLibrary } from "@/templates/template-library";
import { getErrorMessage, TemplateCompositionError, TemplateLoadError } from "@/utils/errors";

type ResolveOptions = {
  validate?: boolean;
  quiet?: boolean;
};

export const templateResolveCommand = new Command("resolve")
  .description(
    "Resolve template inheritance and print the fully composed result.\n" +
      "Useful for debugging extends/mixins chains before running generate.",
  )
  .argument("<template>", "Template ref (template:<name>) or path to a YAML file")
  .option("--validate", "Also run schema validation on the resolved template", false)
  .option("-q, --quiet", "Print only the resolved YAML, no decorative output", false)
  .action(async (templateArg: string, options: ResolveOptions) => {
    const output = createCommandOutput(
      resolveCommandOutputPolicy({ quiet: options.quiet, verbose: false }),
    );

    if (!options.quiet) {
      output.intro(" Atomize — Template Resolver");
    }

    try {
      const library = new TemplateLibrary();
      const { template, meta, source } = await library.loadSource(
        templateArg,
        {
          onNotice: (message) => {
            if (!options.quiet) log.warn(message);
          },
        },
      );
      const sourceLabel = source.path ?? source.url ?? source.input;

      if (!options.quiet) {
        if (meta.isComposed) {
          output.print(chalk.bold("Inheritance chain:"));
          output.print(chalk.gray(`  source  : ${sourceLabel}`));
          if (meta.extendsRef) {
            const display = meta.resolvedExtendsPath ?? meta.extendsRef;
            output.print(chalk.gray(`  extends : ${display}`));
          }
          for (const mp of meta.resolvedMixinPaths) {
            output.print(chalk.gray(`  mixin   : ${mp}`));
          }
          output.blankLine();
        } else {
          output.print(chalk.gray("  No inheritance (plain template).\n"));
        }

        output.print(chalk.bold("Resolved template:"));
        output.print(chalk.gray("─".repeat(50)));
      }

      const yaml = stringifyYaml(template, { lineWidth: 120 });
      process.stdout.write(yaml);

      if (!options.quiet) {
        output.print(chalk.gray("─".repeat(50)));
        output.print(
          chalk.gray(
            `  ${template.tasks.length} task(s)  ·  ` +
              `${template.tasks.reduce((s, t) => s + (t.estimationPercent ?? 0), 0)}% total estimation`,
          ),
        );
      }

      if (options.validate) {
        output.blankLine();
        const result = library.validateTemplate(template);

        if (result.valid) {
          output.print(chalk.green("  Validation passed ✓"));
        } else {
          output.print(chalk.red("  Validation failed:"));
          for (const err of result.errors) {
            output.print(
              chalk.red(`    • ${sanitizeTty(err.path)}: ${sanitizeTty(err.message)}`),
            );
          }
        }

        if (result.warnings.length > 0) {
          output.print(chalk.yellow("  Warnings:"));
          for (const warn of result.warnings) {
            output.print(chalk.yellow(`    • ${warn.path}: ${warn.message}`));
          }
        }

        if (!result.valid) throw new ExitError(ExitCode.Failure);
      }

      if (!options.quiet) {
        output.outro("Resolved successfully");
      }
    } catch (error) {
      if (!(error instanceof ExitError)) {
        if (error instanceof TemplateCompositionError) {
          output.cancel(`Composition failed: ${error.message}`);
        } else if (error instanceof TemplateLoadError) {
          output.cancel(`Load failed: ${error.message}`);
        } else {
          output.cancel(getErrorMessage(error));
        }
      }
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });
