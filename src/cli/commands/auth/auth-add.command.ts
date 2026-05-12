import { readFileSync } from "node:fs";
import { confirm } from "@clack/prompts";
import type { Config } from "@config/config";
import { keychainAvailable } from "@config/keychain.service";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  createManagedSpinner,
  isInteractiveTerminal,
} from "@/cli/utilities/prompt-utilities";
import { writeManagedOutput } from "@/cli/utilities/terminal-output";
import { getErrorMessage } from "@/utils/errors";
import {
  checkProfileNameAvailable,
  promptProfileName,
  promptRemainingInputs,
  promptSetAsDefault,
  validateOrganizationUrl,
  validateProfileName,
} from "./helpers/auth-add.helper";
import { saveAuthProfileWorkflow } from "./helpers/auth-profile-workflow";

interface AddOptions {
  orgUrl?: string;
  project?: string;
  team?: string;
  default?: boolean;
  insecureStorage?: boolean;
  patStdin?: boolean;
}

function writeCliError(message: string): void {
  writeManagedOutput("stderr", `Error: ${message}`);
}

function readPatFromStdin(): string | undefined {
  try {
    return readFileSync("/dev/stdin", "utf-8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function resolvePat(options: AddOptions, envPat: string | undefined): string | undefined {
  if (options.patStdin) return readPatFromStdin();
  return envPat;
}

function hasAllFlags(options: AddOptions, pat: string | undefined): boolean {
  return !!(options.orgUrl && options.project && options.team && pat);
}

function isNonInteractive(options: AddOptions, pat: string | undefined): boolean {
  return !isInteractiveTerminal() || hasAllFlags(options, pat);
}

export function makeAuthAddCommand(config: Config): Command {
  return new Command("add")
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
    const output = createCommandOutput(resolveCommandOutputPolicy({}));
    const resolvedPat = resolvePat(options, config.pat);
    const ci = isNonInteractive(options, resolvedPat);
    try {
      if (ci && !resolvedPat) {
        writeCliError(
          "PAT is required. Use --pat-stdin to pipe from stdin (recommended in CI), or set the ATOMIZE_PAT environment variable.",
        );
        throw new ExitError(ExitCode.Failure);
      }

      // Validate and check availability before showing any UI when name is already known
      if (ci || nameArg) {
        if (!nameArg) {
          writeCliError(
            "Profile name is required.\nUsage: echo <token> | atomize auth add <name> --pat-stdin --org-url <url> --project <name> --team <name>",
          );
          throw new ExitError(ExitCode.Failure);
        }
        const nameError = validateProfileName(nameArg);
        if (nameError) {
          if (ci) writeCliError(nameError);
          else output.cancel(nameError);
          throw new ExitError(ExitCode.Failure);
        }
        const dupError = await checkProfileNameAvailable(nameArg);
        if (dupError) {
          if (ci) writeCliError(dupError);
          else output.cancel(dupError);
          throw new ExitError(ExitCode.Failure);
        }
      }

      if (!ci) output.intro(" Atomize — Add Connection Profile");

      let resolvedName: string;
      if (ci || nameArg) {
        resolvedName = nameArg as string;
      } else {
        resolvedName = await promptProfileName();
        const dupError = await checkProfileNameAvailable(resolvedName);
        if (dupError) {
          output.cancel(dupError);
          throw new ExitError(ExitCode.Failure);
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

      if (ci && inputs.platform === "azure-devops") {
        const organizationUrlError = validateOrganizationUrl(inputs.organizationUrl);
        if (organizationUrlError) {
          writeCliError(organizationUrlError);
          throw new ExitError(ExitCode.Failure);
        }
      }

      const keychainOk = await keychainAvailable();
      let allowKeyfileStorage = options.insecureStorage ?? false;

      if (!keychainOk && !allowKeyfileStorage) {
        const insecureMsg =
          "System keychain is unavailable. The token would be stored in an insecure local file fallback — " +
          "anyone who can read ~/.atomize/ can recover it.";
        if (ci) {
          writeCliError(
            `${insecureMsg}\nRe-run with --insecure-storage to accept the insecure local file fallback.`,
          );
          throw new ExitError(ExitCode.Failure);
        } else {
          output.warn(insecureMsg);
          allowKeyfileStorage = assertNotCancelled(
            await confirm({
              message: "Continue with the insecure local file fallback?",
              initialValue: false,
            }),
          );
          if (!allowKeyfileStorage) {
            output.cancel("Aborted — token not saved.");
            throw new ExitError(ExitCode.Failure);
          }
        }
      }

      const savingSpinner = ci ? null : createManagedSpinner();
      savingSpinner?.start("Saving profile...");

      try {
        const result = await saveAuthProfileWorkflow(inputs, {
          allowKeyfileStorage,
          forceDefault: options.default ?? false,
          shouldSetDefault: ci ? undefined : promptSetAsDefault,
        });
        savingSpinner?.stop(
          `Profile "${inputs.name}" saved (token stored in ${result.useKeychain ? "OS keychain" : "local file — recoverable by anyone with read access to ~/.atomize/"})`,
        );

        if (result.defaultApplied) {
          if (ci)
            output.print(`Profile "${inputs.name}" saved and set as default.`);
          else output.outro(`Profile "${inputs.name}" saved and set as default.`);
        } else {
          if (ci) output.print(`Profile "${inputs.name}" saved.`);
          else output.outro(`Profile "${inputs.name}" saved.`);
        }
      } catch (error) {
        savingSpinner?.stop("Failed to save profile");
        if (ci) writeCliError(getErrorMessage(error));
        else output.cancel(getErrorMessage(error));
        throw new ExitError(ExitCode.Failure);
      }
    } catch (error) {
      if (!(error instanceof ExitError)) {
        if (ci) writeCliError(getErrorMessage(error));
        else output.cancel(getErrorMessage(error));
      }
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });
}
