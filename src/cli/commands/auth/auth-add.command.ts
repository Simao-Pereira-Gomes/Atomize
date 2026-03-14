import { cancel, intro, outro, spinner } from "@clack/prompts";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  applyDefault,
  persistProfile,
  promptProfileInputs,
  promptSetAsDefault,
  resolveDefaultBehaviour,
  validateProfileName,
} from "./helpers/auth-add.helper";

interface AddOptions {
  orgUrl?: string;
  project?: string;
  team?: string;
  pat?: string;
  default?: boolean;
}

function isNonInteractive(options: AddOptions): boolean {
  return !!(options.orgUrl && options.project && options.team && options.pat);
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
  .option("--pat <token>", "Personal Access Token")
  .option("--default", "Set as default profile", false)
  .action(async (nameArg: string | undefined, options: AddOptions) => {
    const ci = isNonInteractive(options);

    if (!ci) intro(" Atomize — Add Connection Profile");

    if (nameArg) {
      const nameError = validateProfileName(nameArg);
      if (nameError) {
        if (ci) console.error(`Error: ${nameError}`);
        else cancel(nameError);
        process.exit(ExitCode.Failure);
      }
    } else if (ci) {
      console.error("Error: Profile name is required (pass it as an argument)");
      process.exit(ExitCode.Failure);
    }
    const inputs = ci
      ? {
          name: nameArg as string,
          platform: "azure-devops" as const,
          organizationUrl: options.orgUrl as string,
          project: options.project as string,
          team: options.team as string,
          pat: options.pat as string,
        }
      : await promptProfileInputs(nameArg);

    const savingSpinner = ci ? null : spinner();
    savingSpinner?.start("Saving profile...");

    try {
      const { useKeychain } = await persistProfile(inputs);
      savingSpinner?.stop(
        `Profile "${inputs.name}" saved (token stored in ${useKeychain ? "OS keychain" : "encrypted file"})`,
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
