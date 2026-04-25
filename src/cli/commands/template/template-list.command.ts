import { PresetManager } from "@services/template/preset-manager";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode } from "@/cli/utilities/exit-codes";

export const templateListCommand = new Command("presets")
  .alias("ls")
  .description("List available built-in template presets")
  .action(async () => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));
    output.intro(" Atomize — Built-in Template Presets");
    try {
      const presetManager = new PresetManager();
      const presets = await presetManager.listPresets();

      if (presets.length === 0) {
        output.outro("No presets found. Create a template with: atomize template create --scratch");
        return;
      }

      output.blankLine();
      presets.forEach((preset) => {
        output.print(chalk.cyan(`  ${preset.name}`));
        output.print(chalk.gray(`    ${preset.displayName}`));
        output.print(chalk.gray(`    ${preset.description}`));
        output.blankLine();
      });

      output.outro(chalk.gray(`Use with: atomize template create --preset <name>`));
    } catch (error) {
      output.cancel(error instanceof Error ? error.message : String(error));
      process.exit(ExitCode.Failure);
    }
  });
