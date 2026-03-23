import { cancel, intro, outro, select } from "@clack/prompts";
import { readConnectionsFile, setDefaultProfile } from "@config/connections.config";
import chalk from "chalk";
import { Command } from "commander";
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
    intro(" Atomize — Remove Connection Profile");

    if (!(await hasProfiles())) {
      outro("No profiles to remove.");
      return;
    }

    const name = await promptProfileToRemove(nameArg);

    const profile = await loadProfileOrFail(name);
    if (!profile) {
      cancel(`Profile "${name}" not found.`);
      process.exit(ExitCode.Failure);
    }

    if (!(await confirmRemoval(name))) {
      outro("Cancelled.");
      return;
    }

    const operationSpinner = createManagedSpinner();
    operationSpinner.start(`Deleting profile and token for "${name}"...`);

    try {
      const { wasDefault } = await deleteProfile(name, profile);
      operationSpinner.stop(`Profile "${name}" removed`);

      if (wasDefault) {
        const remaining = await readConnectionsFile();
        const [onlyProfile] = remaining.profiles;
        if (remaining.profiles.length === 1 && onlyProfile) {
          await setDefaultProfile(onlyProfile.name);
          console.log(chalk.green(`  "${onlyProfile.name}" is now the default profile.`));
        } else if (remaining.profiles.length > 1) {
          console.log(chalk.yellow(`\n  "${name}" was the default profile. Please select a new default:`));
          const newDefault = assertNotCancelled(
            await select({
              message: "Choose a new default profile:",
              options: remaining.profiles.map((p) => ({ label: p.name, value: p.name })),
            }),
          ) as string;
          await setDefaultProfile(newDefault);
          console.log(chalk.green(`  "${newDefault}" is now the default profile.`));
        }
      }

      outro("Done.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      operationSpinner.stop(`Failed to remove profile: ${msg}`);
      process.exit(ExitCode.Failure);
    }
  });
