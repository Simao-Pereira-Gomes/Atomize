import { cancel, intro, outro } from "@clack/prompts";
import { PresetManager } from "@services/template/preset-manager";
import chalk from "chalk";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";

export const templateListCommand = new Command("presets")
  .alias("ls")
  .description("List available built-in template presets")
  .action(async () => {
    intro(" Atomize — Built-in Template Presets");
    try {
      const presetManager = new PresetManager();
      const presets = await presetManager.listPresets();

      if (presets.length === 0) {
        outro("No presets found. Create a template with: atomize template create --scratch");
        return;
      }

      console.log("");
      presets.forEach((preset) => {
        console.log(chalk.cyan(`  ${preset.name}`));
        console.log(chalk.gray(`    ${preset.displayName}`));
        console.log(chalk.gray(`    ${preset.description}`));
        console.log("");
      });

      outro(chalk.gray(`Use with: atomize template create --preset <name>`));
    } catch (error) {
      cancel(error instanceof Error ? error.message : String(error));
      process.exit(ExitCode.Failure);
    }
  });
