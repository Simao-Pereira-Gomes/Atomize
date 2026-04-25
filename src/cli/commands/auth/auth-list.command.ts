import { readConnectionsFile } from "@config/connections.config";
import chalk from "chalk";
import { Command } from "commander";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { sanitizeTty } from "@/cli/utilities/prompt-utilities";

export const authListCommand = new Command("list")
  .alias("ls")
  .description("List all saved connection profiles")
  .action(async () => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));
    output.intro(" Atomize — Connection Profiles");

    const file = await readConnectionsFile();

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
  });
