import { cancel, intro, outro, spinner } from "@clack/prompts";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  hasProfiles,
  loadProfileOrFail,
  promptNewPat,
  promptProfileToRotate,
  rotateToken,
} from "./helpers/auth-rotate.helper";

export const authRotateCommand = new Command("rotate")
  .description("Replace the access token for a connection profile")
  .argument("[name]", "Profile name (uses default if omitted)")
  .action(async (nameArg: string | undefined) => {
    intro(" Atomize — Rotate Token");

    if (!(await hasProfiles())) {
      outro("No profiles found. Run: atomize auth add");
      return;
    }

    const name = await promptProfileToRotate(nameArg);

    const profile = await loadProfileOrFail(name);
    if (!profile) {
      cancel(`Profile "${name}" not found.`);
      process.exit(ExitCode.Failure);
    }

    const newPat = await promptNewPat();

    const rotationSpinner = spinner();
    rotationSpinner.start("Rotating token...");

    try {
      const { useKeychain } = await rotateToken(profile, newPat);
      rotationSpinner.stop(
        `Token rotated (stored in ${useKeychain ? "OS keychain" : "encrypted file"})`,
      );
      outro(`Profile "${name}" updated.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      rotationSpinner.stop(`Failed to rotate token: ${msg}`);
      process.exit(ExitCode.Failure);
    }
  });
