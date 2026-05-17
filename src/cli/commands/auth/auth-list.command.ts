import { readConnectionsFile } from "@config/connections.config";
import type { ConnectionProfile } from "@config/connections.interface";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import { sanitizeTty } from "@/cli/utilities/prompt-utilities";
import { writeManagedOutput } from "@/cli/utilities/terminal-output";
import { getErrorMessage } from "@/utils/errors";

type AzureDevOpsProfileJson = {
  name: string;
  platform: "azure-devops";
  isDefault: boolean;
  organizationUrl: string;
  project: string;
  team: string;
};

type GitHubModelsProfileJson = {
  name: string;
  platform: "github-models";
  isDefault: boolean;
  model: string;
};

export type ProfileJson = AzureDevOpsProfileJson | GitHubModelsProfileJson;

export function serializeProfileForJson(
  profile: ConnectionProfile,
  defaultProfiles: Partial<Record<ConnectionProfile["platform"], string>>,
): ProfileJson {
  const isDefault = defaultProfiles[profile.platform] === profile.name;

  if (profile.platform === "azure-devops") {
    return {
      name: profile.name,
      platform: "azure-devops",
      isDefault,
      organizationUrl: profile.organizationUrl,
      project: profile.project,
      team: profile.team,
    };
  }

  return {
    name: profile.name,
    platform: "github-models",
    isDefault,
    model: profile.model ?? "gpt-4o-mini",
  };
}

export function makeAuthListCommand(): Command {
  return new Command("list")
    .alias("ls")
    .description("List all saved connection profiles")
    .option("--json", "Print results as JSON to stdout; progress is written to stderr", false)
    .action(async (options: { json: boolean }) => {
      const output = createCommandOutput(resolveCommandOutputPolicy({}));
      const jsonMode = options.json;

      if (!jsonMode) output.intro(" Atomize — Connection Profiles");

      try {
        const file = await readConnectionsFile();

        if (jsonMode) {
          const profiles = file.profiles.map((p) =>
            serializeProfileForJson(p, file.defaultProfiles),
          );
          output.printJson(profiles);
          return;
        }

        if (file.profiles.length === 0) {
          output.outro("No profiles found. Run: atomize auth add");
          return;
        }

        output.blankLine();
        const defaultMark = (profile: { name: string; platform: string }) =>
          file.defaultProfiles[profile.platform as keyof typeof file.defaultProfiles] === profile.name
            ? chalk.green(" (default)")
            : "";

        for (const profile of file.profiles) {
          const name = sanitizeTty(profile.name);
          const tokenDisplay = chalk.gray("[stored]");
          output.print(`  ${chalk.cyan(name)}${defaultMark(profile)}`);
          output.print(`    Platform: ${sanitizeTty(profile.platform)}`);
          if (profile.platform === "azure-devops") {
            output.print(`    URL:      ${sanitizeTty(profile.organizationUrl)}`);
            output.print(`    Project:  ${sanitizeTty(profile.project)}`);
            output.print(`    Team:     ${sanitizeTty(profile.team)}`);
          } else {
            output.print(`    Model:    ${sanitizeTty(profile.model ?? "gpt-4o-mini (default)")}`);
          }
          output.print(`    Token:    ${tokenDisplay}`);
          output.print(`    Created:  ${sanitizeTty(profile.createdAt).slice(0, 16).replace("T", " ")}`);
          output.print(`    Updated:  ${sanitizeTty(profile.updatedAt).slice(0, 16).replace("T", " ")}`);
          output.blankLine();
        }

        const count = file.profiles.length;
        output.outro(`${count} ${count === 1 ? "profile" : "profiles"} listed`);
      } catch (error) {
        if (!(error instanceof ExitError)) {
          const msg = sanitizeTty(getErrorMessage(error));
          if (jsonMode) writeManagedOutput("stderr", `Error: ${msg}`);
          else output.cancel(msg);
        }
        process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
      }
    });
}
