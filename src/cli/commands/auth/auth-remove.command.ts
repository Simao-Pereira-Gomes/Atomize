import { select } from "@clack/prompts";
import { readConnectionsFile, setDefaultProfile } from "@config/connections.config";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  createManagedSpinner,
} from "@/cli/utilities/prompt-utilities";
import {
  confirmRemoval,
  deleteProfile,
  hasProfiles,
  loadProfileOrFail,
  promptProfileToRemove,
} from "./helpers/auth-remove.helper";

export const authRemoveCommand = new Command("remove")
  .alias("rm")
  .description("Remove a connection profile")
  .argument("[name]", "Profile name to remove")
  .action(async (nameArg: string | undefined) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));
    output.intro(" Atomize — Remove Connection Profile");

    if (!(await hasProfiles())) {
      output.outro("No profiles to remove.");
      return;
    }

    const name = await promptProfileToRemove(nameArg);

    const profile = await loadProfileOrFail(name);
    if (!profile) {
      output.cancel(`Profile "${name}" not found.`);
      process.exit(ExitCode.Failure);
    }

    if (!(await confirmRemoval(name))) {
      output.outro("Cancelled.");
      return;
    }

    const operationSpinner = createManagedSpinner();
    operationSpinner.start(`Deleting profile and token for "${name}"...`);

    try {
      const { wasDefault } = await deleteProfile(name, profile);
      operationSpinner.stop(`Profile "${name}" removed`);

      if (wasDefault) {
        const remaining = await readConnectionsFile();
        const samePlatform = remaining.profiles.filter((p) => p.platform === profile.platform);
        if (samePlatform.length === 1 && samePlatform[0]) {
          await setDefaultProfile(samePlatform[0].name);
          output.print(chalk.green(`  "${samePlatform[0].name}" is now the default profile.`));
        } else if (samePlatform.length > 1) {
          output.blankLine();
          output.print(chalk.yellow(`  "${name}" was the default profile. Please select a new default:`));
          const newDefault = assertNotCancelled(
            await select({
              message: "Choose a new default profile:",
              options: samePlatform.map((p) => ({ label: p.name, value: p.name })),
            }),
          ) as string;
          await setDefaultProfile(newDefault);
          output.print(chalk.green(`  "${newDefault}" is now the default profile.`));
        }
      }

      output.outro("Done.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      operationSpinner.stop(`Failed to remove profile: ${msg}`);
      process.exit(ExitCode.Failure);
    }
  });
