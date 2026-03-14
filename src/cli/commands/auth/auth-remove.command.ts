import { cancel, intro, outro, spinner } from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";
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

    const s = spinner();
    s.start(`Removing "${name}"...`);

    try {
      const { wasDefault } = await deleteProfile(name, profile);
      s.stop(`Profile "${name}" removed`);

      if (wasDefault) {
        console.log(
          chalk.yellow(`  Warning: "${name}" was the default profile. Use "atomize auth use" to set a new default.`),
        );
      }

      outro("Done.");
    } catch (error) {
      s.stop("Failed");
      cancel(error instanceof Error ? error.message : String(error));
      process.exit(ExitCode.Failure);
    }
  });
