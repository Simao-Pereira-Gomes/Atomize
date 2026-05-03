import { select } from "@clack/prompts";
import { readConnectionsFile, setDefaultProfile } from "@config/connections.config";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode } from "@/cli/utilities/exit-codes";
import { assertNotCancelled, sanitizeTty } from "@/cli/utilities/prompt-utilities";
import { getErrorMessage } from "@/utils/errors";

export const authUseCommand = new Command("use")
  .description("Set a profile as the default")
  .argument("[name]", "Profile name")
  .action(async (nameArg: string | undefined) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));
    output.intro(" Atomize — Set Default Profile");

    const file = await readConnectionsFile();
    if (file.profiles.length === 0) {
      output.outro("No profiles found. Run: atomize auth add");
      return;
    }

    let name: string;
    if (nameArg) {
      if (!file.profiles.find((p) => p.name === nameArg)) {
        output.cancel(`Profile "${nameArg}" not found. Run: atomize auth list`);
        process.exit(ExitCode.Failure);
      }
      name = nameArg;
    } else {
      name = assertNotCancelled(
        await select({
          message: "Select default profile:",
          options: file.profiles.map((p) => ({
            label: file.defaultProfiles[p.platform] === p.name
              ? `${sanitizeTty(p.name)} (current default)`
              : sanitizeTty(p.name),
            value: p.name,
          })),
        })
      ) as string;
    }

    try {
      await setDefaultProfile(name);
      output.outro(`"${sanitizeTty(name)}" is now the default profile.`);
    } catch (error) {
      output.cancel(getErrorMessage(error));
      process.exit(ExitCode.Failure);
    }
  });
