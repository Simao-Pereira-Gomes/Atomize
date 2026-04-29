import { TemplateLoader } from "@templates/loader";
import { TemplateValidator } from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import { stringify as stringifyYaml } from "yaml";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode } from "@/cli/utilities/exit-codes";
import { sanitizeTty } from "@/cli/utilities/prompt-utilities";
import { resolveTemplateRefToPath } from "@/cli/utilities/template-ref";
import { TemplateCompositionError, TemplateLoadError } from "@/utils/errors";

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
      const templatePath = await resolveTemplateRefToPath(templateArg);
      const loader = new TemplateLoader();
      const { template, meta } = await loader.loadWithMeta(templatePath);

      if (!options.quiet) {
        if (meta.isComposed) {
          output.print(chalk.bold("Inheritance chain:"));
          output.print(chalk.gray(`  source  : ${templatePath}`));
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
        const validator = new TemplateValidator();
        const result = validator.validate(template);

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

        if (!result.valid) process.exit(ExitCode.Failure);
      }

      if (!options.quiet) {
        output.outro("Resolved successfully");
      }
    } catch (error) {
      if (error instanceof TemplateCompositionError) {
        output.cancel(`Composition failed: ${error.message}`);
      } else if (error instanceof TemplateLoadError) {
        output.cancel(`Load failed: ${error.message}`);
      } else {
        output.cancel(error instanceof Error ? error.message : String(error));
      }
      process.exit(ExitCode.Failure);
    }
  });

