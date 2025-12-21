import { Command } from "commander";
import { validateCommand } from "./commands/validate.command";
import { generateCommand } from "./commands/generate.command";
import chalk from "chalk";

const program = new Command();

program
  .name("atomize")
  .description("Automatically generate tasks from user stories")
  .version("0.1.0");

const banner = `
${chalk.cyan("    ___  __                  _         ")}
${chalk.cyan("   /   |/ /_____  ____ ___  (_)___  ___")}
${chalk.cyan("  / /| / __/ __ \\/ __ \\__ \\/ /  / / _ \\")}
${chalk.cyan(" / ___ / /_/ /_/ / / / / / / / /_/ /  __/")}
${chalk.cyan("/_/  |_\\__/\\____/_/ /_/ /_/_/\\__,_/\\___/")}

${chalk.gray("Break down stories, build up velocity.")}
`;

program.addHelpText("beforeAll", banner);
program.addCommand(validateCommand);
program.addCommand(generateCommand);
if (process.argv.length === 2) {
  console.log(banner);
  program.help();
}

program.parse();
