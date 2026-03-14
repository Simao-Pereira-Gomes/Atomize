import { intro, outro } from "@clack/prompts";
import { readConnectionsFile } from "@config/connections.config";
import chalk from "chalk";
import { Command } from "commander";

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
      const tokenDisplay = profile.token.strategy === "keychain" ? chalk.gray("[keychain]") : chalk.gray("[file fallback]");
      console.log(`  ${chalk.cyan(profile.name)}${defaultMark(profile.name)}`);
      console.log(`    Platform: ${profile.platform}`);
      console.log(`    URL:      ${profile.organizationUrl}`);
      console.log(`    Project:  ${profile.project}`);
      console.log(`    Team:     ${profile.team}`);
      console.log(`    Token:    ${tokenDisplay}`);
      console.log(`    Created:  ${new Date(profile.createdAt).toLocaleString()}`);
      console.log("");
    }

    outro(`${file.profiles.length} profile(s) listed`);
  });
