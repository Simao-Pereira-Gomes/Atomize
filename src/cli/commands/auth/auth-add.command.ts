import { readFileSync } from "node:fs";
import { cancel, confirm, intro, log, outro, spinner } from "@clack/prompts";
import { keychainAvailable } from "@config/keychain.service";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  isInteractiveTerminal,
} from "@/cli/utilities/prompt-utilities";
import {
  applyDefault,
  checkProfileNameAvailable,
  persistProfile,
  promptProfileName,
  promptRemainingInputs,
  promptSetAsDefault,
  resolveDefaultBehaviour,
  validateOrganizationUrl,
  validateProfileName,
} from "./helpers/auth-add.helper";

interface AddOptions {
  orgUrl?: string;
  project?: string;
  team?: string;
  default?: boolean;
  insecureStorage?: boolean;
  patStdin?: boolean;
}

function readPatFromStdin(): string | undefined {
  try {
    return readFileSync("/dev/stdin", "utf-8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function resolvePat(options: AddOptions): string | undefined {
  if (options.patStdin) return readPatFromStdin();
  return process.env.ATOMIZE_PAT;
}

function hasAllFlags(options: AddOptions, pat: string | undefined): boolean {
  return !!(options.orgUrl && options.project && options.team && pat);
}

function isNonInteractive(options: AddOptions, pat: string | undefined): boolean {
  return !isInteractiveTerminal() || hasAllFlags(options, pat);
}

export const authAddCommand = new Command("add")
  .description("Add a new connection profile")
  .argument("[name]", "Profile name")
  .option(
    "--org-url <url>",
    "Organization URL (e.g. https://dev.azure.com/myorg)",
  )
  .option("--project <name>", "Project name")
  .option("--team <name>", "Team name")
  .option("--default", "Set as default profile", false)
  .option(
    "--insecure-storage",
    "Allow storing the token in an insecure local file fallback when the OS keychain is unavailable",
    false,
  )
  .option(
    "--pat-stdin",
    "Read the Personal Access Token from stdin instead of ATOMIZE_PAT (safer in CI — avoids env var exposure in logs)",
    false,
  )
  .action(async (nameArg: string | undefined, options: AddOptions) => {
    const resolvedPat = resolvePat(options);
    const ci = isNonInteractive(options, resolvedPat);

    if (ci && !resolvedPat) {
      console.error(
        "Error: PAT is required. Use --pat-stdin to pipe from stdin (recommended in CI), or set the ATOMIZE_PAT environment variable.",
      );
      process.exit(ExitCode.Failure);
    }

    // Validate and check availability before showing any UI when name is already known
    if (ci || nameArg) {
      if (!nameArg) {
        console.error(
          "Error: Profile name is required.\nUsage: echo <token> | atomize auth add <name> --pat-stdin --org-url <url> --project <name> --team <name>",
        );
        process.exit(ExitCode.Failure);
      }
      const nameError = validateProfileName(nameArg);
      if (nameError) {
        if (ci) console.error(`Error: ${nameError}`);
        else cancel(nameError);
        process.exit(ExitCode.Failure);
      }
      const dupError = await checkProfileNameAvailable(nameArg);
      if (dupError) {
        if (ci) console.error(`Error: ${dupError}`);
        else cancel(dupError);
        process.exit(ExitCode.Failure);
      }
    }

    if (!ci) intro(" Atomize — Add Connection Profile");

    let resolvedName: string;
    if (ci || nameArg) {
      resolvedName = nameArg as string;
    } else {
      resolvedName = await promptProfileName();
      const dupError = await checkProfileNameAvailable(resolvedName);
      if (dupError) {
        cancel(dupError);
        process.exit(ExitCode.Failure);
      }
    }

    const inputs = ci
      ? {
          name: resolvedName,
          platform: "azure-devops" as const,
          organizationUrl: options.orgUrl as string,
          project: options.project as string,
          team: options.team as string,
          pat: resolvedPat as string,
        }
      : await promptRemainingInputs(resolvedName, {
          organizationUrl: options.orgUrl,
          project: options.project,
          team: options.team,
        });

    if (ci) {
      const organizationUrlError = validateOrganizationUrl(inputs.organizationUrl);
      if (organizationUrlError) {
        console.error(`Error: ${organizationUrlError}`);
        process.exit(ExitCode.Failure);
      }
    }

    const keychainOk = await keychainAvailable();
    let allowKeyfileStorage = options.insecureStorage ?? false;

    if (!keychainOk && !allowKeyfileStorage) {
      const insecureMsg =
        "System keychain is unavailable. The token would be stored in an insecure local file fallback — " +
        "anyone who can read ~/.atomize/ can recover it.";
      if (ci) {
        console.error(
          `Error: ${insecureMsg}\nRe-run with --insecure-storage to accept the insecure local file fallback.`,
        );
        process.exit(ExitCode.Failure);
      } else {
        log.warn(insecureMsg);
        allowKeyfileStorage = assertNotCancelled(
          await confirm({
            message: "Continue with the insecure local file fallback?",
            initialValue: false,
          }),
        );
        if (!allowKeyfileStorage) {
          cancel("Aborted — token not saved.");
          process.exit(ExitCode.Failure);
        }
      }
    }

    const savingSpinner = ci ? null : spinner();
    savingSpinner?.start("Saving profile...");

    try {
      const { useKeychain } = await persistProfile(inputs, { allowKeyfileStorage });
      savingSpinner?.stop(
        `Profile "${inputs.name}" saved (token stored in ${useKeychain ? "OS keychain" : "local file — recoverable by anyone with read access to ~/.atomize/"})`,
      );

      const defaultBehaviour = await resolveDefaultBehaviour(
        options.default ?? false,
      );

      if (defaultBehaviour === "set-default") {
        await applyDefault(inputs.name);
        if (ci)
          console.log(`Profile "${inputs.name}" saved and set as default.`);
        else outro(`Profile "${inputs.name}" saved and set as default.`);
      } else if (!ci) {
        const makeDefault = await promptSetAsDefault(inputs.name);
        if (makeDefault) {
          await applyDefault(inputs.name);
          outro(`Profile "${inputs.name}" saved and set as default.`);
        } else {
          outro(`Profile "${inputs.name}" saved.`);
        }
      } else {
        console.log(`Profile "${inputs.name}" saved.`);
      }
    } catch (error) {
      savingSpinner?.stop("Failed to save profile");
      if (ci)
        console.error(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      else cancel(error instanceof Error ? error.message : String(error));
      process.exit(ExitCode.Failure);
    }
  });
