import { cancel, confirm, intro, log, outro, spinner } from "@clack/prompts";
import { keychainAvailable } from "@config/keychain.service";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";
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
  .option(
    "--insecure-storage",
    "Allow storing the token in an insecure local file fallback when the OS keychain is unavailable",
    false,
  )
  .action(async (nameArg: string | undefined, options: { insecureStorage?: boolean }) => {
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

    const keychainOk = await keychainAvailable();
    let allowKeyfileStorage = options.insecureStorage ?? false;

    if (!keychainOk && !allowKeyfileStorage) {
      const insecureMsg =
        "System keychain is unavailable. The token would be stored in an insecure local file fallback — " +
        "anyone who can read ~/.atomize/ can recover it.";
      log.warn(insecureMsg);
      allowKeyfileStorage = assertNotCancelled(
        await confirm({
          message: "Continue with the insecure local file fallback?",
          initialValue: false,
        }),
      );
      if (!allowKeyfileStorage) {
        cancel("Aborted — token not rotated.");
        process.exit(ExitCode.Failure);
      }
    }

    const rotationSpinner = spinner();
    rotationSpinner.start("Rotating token...");

    try {
      const { useKeychain } = await rotateToken(profile, newPat, { allowKeyfileStorage });
      rotationSpinner.stop(
        `Token rotated (stored in ${useKeychain ? "OS keychain" : "insecure local file fallback"})`,
      );
      outro(`Profile "${name}" updated.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      rotationSpinner.stop(`Failed to rotate token: ${msg}`);
      process.exit(ExitCode.Failure);
    }
  });
