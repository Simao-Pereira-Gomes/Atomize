import { select } from "@clack/prompts";
import { readConnectionsFile, setDefaultProfile } from "@config/connections.config";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  createManagedSpinner,
} from "@/cli/utilities/prompt-utilities";
import { writeManagedOutput } from "@/cli/utilities/terminal-output";
import { getErrorMessage } from "@/utils/errors";
import {
  confirmRemoval,
  deleteProfile,
  hasProfiles,
  loadProfileOrFail,
  promptProfileToRemove,
} from "./helpers/auth-remove.helper";

interface RemoveOptions {
  confirm?: boolean;
  newDefault?: string;
}

function writeCliError(message: string): void {
  writeManagedOutput("stderr", `Error: ${message}`);
}

export function makeAuthRemoveCommand(): Command {
  return new Command("remove")
  .alias("rm")
  .description("Remove a connection profile")
  .argument("[name]", "Profile name to remove")
  .option("--confirm", "Confirm removal without prompting", false)
  .option("--new-default <name>", "Set a replacement default profile after removal")
  .action(async (nameArg: string | undefined, options: RemoveOptions) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));
    const confirmed = options.confirm ?? false;
    try {
      if (options.newDefault && !confirmed) {
        writeCliError("--new-default requires --confirm.");
        throw new ExitError(ExitCode.Failure);
      }

      if (confirmed && !nameArg) {
        writeCliError("Profile name is required when using --confirm.");
        throw new ExitError(ExitCode.Failure);
      }

      if (!confirmed) output.intro(" Atomize — Remove Connection Profile");

      if (!(await hasProfiles())) {
        if (confirmed) {
          writeCliError("No profiles to remove.");
          throw new ExitError(ExitCode.Failure);
        }
        output.outro("No profiles to remove.");
        return;
      }

      const name = confirmed ? (nameArg as string) : await promptProfileToRemove(nameArg);

      const profile = await loadProfileOrFail(name);
      if (!profile) {
        if (confirmed) writeCliError(`Profile "${name}" not found.`);
        else output.cancel(`Profile "${name}" not found.`);
        throw new ExitError(ExitCode.Failure);
      }

      if (options.newDefault) {
        const file = await readConnectionsFile();
        const replacement = file.profiles.find((p) => p.name === options.newDefault);
        if (!replacement) {
          writeCliError(`New default profile "${options.newDefault}" not found.`);
          throw new ExitError(ExitCode.Failure);
        }
        if (replacement.name === name) {
          writeCliError("New default profile must be different from the removed profile.");
          throw new ExitError(ExitCode.Failure);
        }
        if (replacement.platform !== profile.platform) {
          writeCliError("New default profile must use the same platform as the removed profile.");
          throw new ExitError(ExitCode.Failure);
        }
      }

      if (!confirmed && !(await confirmRemoval(name))) {
        output.outro("Cancelled.");
        return;
      }

      const operationSpinner = confirmed ? null : createManagedSpinner();
      operationSpinner?.start(`Deleting profile and token for "${name}"...`);

      try {
        const { wasDefault } = await deleteProfile(name, profile);
        operationSpinner?.stop(`Profile "${name}" removed`);

        if (wasDefault && options.newDefault) {
          await setDefaultProfile(options.newDefault);
          if (confirmed) {
            output.print(`Profile "${name}" removed. "${options.newDefault}" is now the default profile.`);
          } else {
            output.print(chalk.green(`  "${options.newDefault}" is now the default profile.`));
          }
        } else if (wasDefault && !confirmed) {
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

        if (confirmed && !(wasDefault && options.newDefault)) output.print(`Profile "${name}" removed.`);
        else if (!confirmed) output.outro("Done.");
      } catch (error) {
        operationSpinner?.stop(`Failed to remove profile: ${getErrorMessage(error)}`);
        if (confirmed) writeCliError(getErrorMessage(error));
        throw new ExitError(ExitCode.Failure);
      }
    } catch (error) {
      if (!(error instanceof ExitError)) {
        if (confirmed) writeCliError(getErrorMessage(error));
        else output.cancel(getErrorMessage(error));
      }
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });
}
