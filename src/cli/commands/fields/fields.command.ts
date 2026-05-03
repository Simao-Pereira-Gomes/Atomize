import { Command } from "commander";
import { fieldsListCommand } from "./fields-list.command";

export const fieldsCommand = new Command("fields")
  .description("Browse Azure DevOps work item fields")
  .addCommand(fieldsListCommand);
