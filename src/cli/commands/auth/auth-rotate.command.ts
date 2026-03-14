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
  .description("Replace the PAT for a connection profile")
  .argument("[name]", "Profile name")
  .action(async (nameArg: string | undefined) => {
    intro(" Atomize — Rotate PAT");

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
      rotationSpinner.stop("Failed to rotate token");
      cancel(error instanceof Error ? error.message : String(error));
      process.exit(ExitCode.Failure);
    }
  });
