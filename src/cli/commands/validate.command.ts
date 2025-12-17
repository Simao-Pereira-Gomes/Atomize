import { Command } from "commander";
import { TemplateLoader } from "@templates/loader";
import { TemplateValidator } from "@templates/validator";
import { logger } from "@config/logger";
import chalk from "chalk";

type ValidateOptions = { verbose?: boolean };

export const validateCommand = new Command("validate")
  .description("Validate a template file")
  .argument("<template>", "Path to template file (YAML)")
  .option("-v, --verbose", "Show detailed validation information", false)
  .action(async (templatePath: string, options: ValidateOptions) => {
    console.log(chalk.blue("Atomize Template Validator\n"));
    try {
      const template = await loadTemplate(templatePath);
      if (options.verbose) printTemplateDetails(template);
      const result = validateTemplate(template);
      printValidationResult(template, result);
      if (!result.valid) process.exit(1);
    } catch (error) {
      handleFatal(error, options.verbose);
      process.exit(1);
    }
  });

async function loadTemplate(templatePath: string) {
  logger.info(`Loading template: ${templatePath}`);
  const loader = new TemplateLoader();
  const template = await loader.load(templatePath);
  logger.info(`Template loaded: ${template.name}`);
  return template;
}

function validateTemplate(template: unknown) {
  logger.info("Validating template...");
  const validator = new TemplateValidator();
  return validator.validate(template);
}

function printTemplateDetails(template: any) {
  console.log(chalk.gray(`Description: ${template.description || "N/A"}`));
  console.log(chalk.gray(`Version: ${template.version}`));
  console.log(chalk.gray(`Tasks: ${template.tasks.length}\n`));
}

function printValidationResult(template: any, result: any) {
  console.log("");

  if (result.valid) {
    printValidSummary(template, result.warnings);
    return;
  }

  printInvalidSummary(result.errors, result.warnings);
}

function printValidSummary(template: any, warnings: any[]) {
  console.log(chalk.green("Template is valid!\n"));

  const summary = getTemplateSummary(template);

  console.log(chalk.bold("Summary:"));
  console.log(`  Name: ${chalk.cyan(summary.name)}`);
  console.log(`  Tasks: ${chalk.cyan(summary.tasks)}`);
  console.log(`  Total Estimation: ${chalk.cyan(summary.totalEstimation)}`);

  printWarnings(warnings);

  console.log("\n" + chalk.green("Ready to use with atomize generate"));
}

function printInvalidSummary(errors: any[], warnings: any[]) {
  console.log(chalk.red("Template validation failed\n"));

  console.log(chalk.red.bold("Errors:"));
  errors.forEach((err) => {
    console.log(chalk.red(`  • ${err.path}: ${err.message}`));
  });

  printWarnings(warnings, true);

  console.log("\n" + chalk.gray("Fix the errors above and try again."));
}

function printWarnings(warnings: any[], boldTitle = false) {
  if (!warnings?.length) return;

  console.log("");
  console.log(
    boldTitle ? chalk.yellow.bold("Warnings:") : chalk.yellow("Warnings:")
  );

  warnings.forEach((warn) => {
    console.log(chalk.yellow(`  • ${warn.path}: ${warn.message}`));
  });
}

function getTemplateSummary(template: any) {
  const totalPercent = template.tasks
    .filter((t: any) => !t.condition)
    .reduce((sum: number, task: any) => sum + (task.estimationPercent ?? 0), 0);

  return {
    name: template.name,
    tasks: template.tasks.length,
    totalEstimation: `${totalPercent}%`,
  };
}

function handleFatal(error: unknown, verbose?: boolean) {
  console.log("");
  logger.error(chalk.red("Validation failed"));

  const message = error instanceof Error ? error.message : String(error);
  console.log(chalk.red(message));

  if (verbose && error instanceof Error?.constructor && (error as any).stack) {
    console.log("");
    console.log(chalk.gray((error as any).stack));
  }
}
