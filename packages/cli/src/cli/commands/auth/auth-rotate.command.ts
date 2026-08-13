import { confirm } from "@clack/prompts";
import { keychainAvailable } from "@config/keychain.service";
import { getErrorMessage } from "@sppg2001/atomize-core/utils/errors";
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
import {
  hasProfiles,
  loadProfileOrFail,
  promptNewPat,
  promptProfileToRotate,
  rotateToken,
  validateNewPat,
} from "./helpers/auth-rotate.helper";
import { readPatFromStdin } from "./helpers/auth-stdin";

interface RotateOptions {
  insecureStorage?: boolean;
  patStdin?: boolean;
}

export function makeAuthRotateCommand(): Command {
  return new Command("rotate")
  .description("Replace the access token for a connection profile")
  .argument("[name]", "Profile name")
  .option(
    "--insecure-storage",
    "Allow storing the token in an insecure local file fallback when the OS keychain is unavailable",
    false,
  )
  .option(
    "--pat-stdin",
    "Read the new Personal Access Token from stdin instead of prompting interactively",
    false,
  )
  .action(async (nameArg: string | undefined, options: RotateOptions) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));
    const usePatStdin = options.patStdin ?? false;
    let stdinPat: string | undefined;
    try {
      if (usePatStdin && !nameArg) {
        writeManagedOutput(
          "stderr",
          "Error: Profile name is required.\nUsage: echo <token> | atomize auth rotate <name> --pat-stdin",
        );
        throw new ExitError(ExitCode.Failure);
      }

      if (!usePatStdin) {
        output.intro(" Atomize — Rotate Token");
      }

      const profilesExist = await hasProfiles();
      if (!profilesExist && usePatStdin) {
        writeManagedOutput("stderr", "Error: No profiles found. Run: atomize auth add");
        throw new ExitError(ExitCode.Failure);
      }

      if (!profilesExist) {
        output.outro("No profiles found. Run: atomize auth add");
        return;
      }

      const name = usePatStdin ? (nameArg as string) : await promptProfileToRotate(nameArg);

      const profile = await loadProfileOrFail(name);
      if (!profile && usePatStdin) {
        writeManagedOutput("stderr", `Error: Profile "${name}" not found.`);
        throw new ExitError(ExitCode.Failure);
      }

      if (!profile) {
        output.cancel(`Profile "${name}" not found.`);
        throw new ExitError(ExitCode.Failure);
      }

      if (usePatStdin) {
        stdinPat = readPatFromStdin();
        const patError = validateNewPat(stdinPat);
        if (patError) {
          writeManagedOutput(
            "stderr",
            `Error: ${patError}. Pipe it via stdin when using --pat-stdin.`,
          );
          throw new ExitError(ExitCode.Failure);
        }
      }

      const newPat = usePatStdin ? (stdinPat as string) : await promptNewPat();

      const keychainOk = await keychainAvailable();
      let allowKeyfileStorage = options.insecureStorage ?? false;

      const needsStorageConsent = !keychainOk && !allowKeyfileStorage;
      const insecureStorageMessage =
        "System keychain is unavailable. The token would be stored in an insecure local file fallback — " +
        "anyone who can read ~/.atomize/ can recover it.";

      if (needsStorageConsent && usePatStdin) {
        writeManagedOutput(
          "stderr",
          `Error: ${insecureStorageMessage}\nRe-run with --insecure-storage to accept the insecure local file fallback.`,
        );
        throw new ExitError(ExitCode.Failure);
      }

      if (needsStorageConsent) {
        output.warn(insecureStorageMessage);
        allowKeyfileStorage = assertNotCancelled(
          await confirm({
            message: "Continue with the insecure local file fallback?",
            initialValue: false,
          }),
        );
        if (!allowKeyfileStorage) {
          output.cancel("Aborted — token not rotated.");
          throw new ExitError(ExitCode.Failure);
        }
      }

      const rotationSpinner = usePatStdin ? null : createManagedSpinner();
      rotationSpinner?.start("Rotating token...");

      try {
        const { useKeychain } = await rotateToken(profile, newPat, { allowKeyfileStorage });
        rotationSpinner?.stop(
          `Token rotated (stored in ${useKeychain ? "OS keychain" : "insecure local file fallback"})`,
        );
        if (usePatStdin) output.print(`Profile "${name}" updated.`);
        else output.outro(`Profile "${name}" updated.`);
      } catch (error) {
        rotationSpinner?.stop(`Failed to rotate token: ${getErrorMessage(error)}`);
        if (usePatStdin) writeManagedOutput("stderr", `Error: ${getErrorMessage(error)}`);
        throw new ExitError(ExitCode.Failure);
      }
    } catch (error) {
      if (!(error instanceof ExitError)) {
        if (usePatStdin) writeManagedOutput("stderr", `Error: ${getErrorMessage(error)}`);
        else output.cancel(getErrorMessage(error));
      }
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });
}
