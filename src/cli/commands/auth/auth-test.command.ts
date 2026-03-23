import { cancel, intro, outro } from "@clack/prompts";
import { readConnectionsFile } from "@config/connections.config";
import chalk from "chalk";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";
import { createManagedSpinner } from "@/cli/utilities/prompt-utilities";
import {
  buildPlatform,
  promptProfileToTest,
  testPlatformConnection,
} from "./helpers/auth-test.helper";

export const authTestCommand = new Command("test")
  .description("Test connectivity for a profile")
  .argument("[name]", "Profile name (uses default if omitted)")
  .action(async (nameArg: string | undefined) => {
    intro(" Atomize — Test Connection");

    const file = await readConnectionsFile();
    if (file.profiles.length === 0) {
      outro("No profiles found. Run: atomize auth add");
      return;
    }

    if (nameArg && !file.profiles.find((p) => p.name === nameArg)) {
      cancel(`Profile "${nameArg}" not found. Run: atomize auth list`);
      process.exit(ExitCode.Failure);
    }

    const profileName = await promptProfileToTest(nameArg);

    const s = createManagedSpinner();
    s.start("Resolving configuration...");

    try {
      const platform = await buildPlatform(profileName);
      s.message("Connecting...");

      const result = await testPlatformConnection(platform);

      if (result.ok) {
        s.stop(chalk.green(result.label));
        outro("Profile is working correctly.");
      } else {
        s.stop(chalk.red("Connection failed"));
        cancel(result.reason);
        process.exit(ExitCode.Failure);
      }
    } catch (error) {
      s.stop("Test failed");
      cancel(error instanceof Error ? error.message : String(error));
      process.exit(ExitCode.Failure);
    }
  });
