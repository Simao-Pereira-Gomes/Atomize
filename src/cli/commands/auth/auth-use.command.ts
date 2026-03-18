import { cancel, intro, outro, select } from "@clack/prompts";
import { readConnectionsFile, setDefaultProfile } from "@config/connections.config";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";

export const authUseCommand = new Command("use")
  .description("Set a profile as the default")
  .argument("[name]", "Profile name")
  .action(async (nameArg: string | undefined) => {
    intro(" Atomize — Set Default Profile");

    const file = await readConnectionsFile();
    if (file.profiles.length === 0) {
      outro("No profiles found. Run: atomize auth add");
      return;
    }

    let name: string;
    if (nameArg) {
      if (!file.profiles.find((p) => p.name === nameArg)) {
        cancel(`Profile "${nameArg}" not found. Run: atomize auth list`);
        process.exit(ExitCode.Failure);
      }
      name = nameArg;
    } else {
      name = assertNotCancelled(
        await select({
          message: "Select default profile:",
          options: file.profiles.map((p) => ({
            label: p.name === file.defaultProfile ? `${p.name} (current default)` : p.name,
            value: p.name,
          })),
          initialValue: file.defaultProfile ?? undefined,
        })
      ) as string;
    }

    try {
      await setDefaultProfile(name);
      outro(`"${name}" is now the default profile.`);
    } catch (error) {
      cancel(error instanceof Error ? error.message : String(error));
      process.exit(ExitCode.Failure);
    }
  });
