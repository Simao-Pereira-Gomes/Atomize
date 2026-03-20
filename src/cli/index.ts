#!/usr/bin/env node
import chalk from "chalk";
import { Command } from "commander";
import { name, version } from "../../package.json";
import { authCommand } from "./commands/auth/auth.command";
import { generateCommand } from "./commands/generate.command";
import { templateCommand } from "./commands/template/template.command";
import { validateCommand } from "./commands/validate.command";
import { loadEnvFile } from "./env-loader";
import { runUpdateNotifier } from "./update-notifier";

await runUpdateNotifier({ name, version });

const program = new Command();

program
	.name("atomize")
	.description("Automatically generate tasks from user stories")
	.version(version)
	.option(
		"--env-file <path>",
		"load environment variables from file (shell env takes precedence)",
	);

program.hook("preAction", () => {
	const { envFile } = program.opts();
	if (envFile) {
		try {
			loadEnvFile(envFile);
		} catch (err) {
			console.error(chalk.red(`Error: ${(err as Error).message}`));
			process.exit(1);
		}
	}
});

const banner = `
${chalk.cyan("    ___  __                  _         ")}
${chalk.cyan("   /   |/ /_____  ____ ___  (_)___  ___")}
${chalk.cyan("  / /| / __/ __ \\/ __ \\__ \\/ /  / / _ \\")}
${chalk.cyan(" / ___ / /_/ /_/ / / / / / / / /_/ /  __/")}
${chalk.cyan("/_/  |_\\__/\\____/_/ /_/ /_/_/\\__,_/\\___/")}

${chalk.gray("Break down stories, build up velocity.")}
`;

program.addHelpText("beforeAll", banner);
program.addCommand(authCommand);
program.addCommand(validateCommand);
program.addCommand(generateCommand);
program.addCommand(templateCommand);
if (process.argv.length === 2) {
	program.help();
}

program.parse();
