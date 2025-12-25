import { Command } from "commander";
import chalk from "chalk";
import { PresetManager } from "@services/template/preset-manager";

export const templateListCommand = new Command("list")
  .alias("ls")
  .description("List available template presets")
  .action(async () => {
    try {
      console.log(chalk.blue.bold("\n Available Template Presets\n"));

      const presetManager = new PresetManager();
      const presets = await presetManager.listPresets();

      if (presets.length === 0) {
        console.log(chalk.yellow("No presets found."));
        console.log("");
        return;
      }

      presets.forEach((preset) => {
        console.log(chalk.cyan(`${preset.name}`));
        console.log(chalk.gray(`  ${preset.displayName}`));
        console.log(chalk.gray(`  ${preset.description}`));
        console.log("");
      });

      console.log(
        chalk.gray(`Use with: atomize template create --preset <name>`)
      );
      console.log("");
    } catch (error) {
      console.log(
        chalk.red(
          `\nError: ${error instanceof Error ? error.message : String(error)}\n`
        )
      );
      process.exit(1);
    }
  });
