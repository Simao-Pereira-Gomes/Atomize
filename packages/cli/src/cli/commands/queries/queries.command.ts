import { Command } from "commander";
import { queriesListCommand } from "./queries-list.command";

export const queriesCommand = new Command("queries")
  .description("Browse Azure DevOps saved queries")
  .addCommand(queriesListCommand);
