import { intro, outro } from "@clack/prompts";
import { readConnectionsFile } from "@config/connections.config";
import chalk from "chalk";
import { Command } from "commander";
import { sanitizeTty } from "@/cli/utilities/prompt-utilities";

export const authListCommand = new Command("list")
  .alias("ls")
  .description("List all saved connection profiles")
  .action(async () => {
    intro(" Atomize — Connection Profiles");

    const file = await readConnectionsFile();

    if (file.profiles.length === 0) {
      outro("No profiles found. Run: atomize auth add");
      return;
    }

    console.log("");
    const defaultMark = (name: string) => name === file.defaultProfile ? chalk.green(" (default)") : "";

    for (const profile of file.profiles) {
      const name = sanitizeTty(profile.name);
      const tokenDisplay = chalk.gray("[stored]");
      console.log(`  ${chalk.cyan(name)}${defaultMark(profile.name)}`);
      console.log(`    Platform: ${sanitizeTty(profile.platform)}`);
      console.log(`    URL:      ${sanitizeTty(profile.organizationUrl)}`);
      console.log(`    Project:  ${sanitizeTty(profile.project)}`);
      console.log(`    Team:     ${sanitizeTty(profile.team)}`);
      console.log(`    Token:    ${tokenDisplay}`);
      console.log(`    Created:  ${sanitizeTty(profile.createdAt).slice(0, 16).replace("T", " ")}`);
      console.log(`    Updated:  ${sanitizeTty(profile.updatedAt).slice(0, 16).replace("T", " ")}`);
      console.log("");
    }

    const count = file.profiles.length;
    outro(`${count} ${count === 1 ? "profile" : "profiles"} listed`);
  });
