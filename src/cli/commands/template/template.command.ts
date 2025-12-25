import { Command } from "commander";
import { templateCreateCommand } from "./template-create.command";
import { templateListCommand } from "./template-list.command";

export const templateCommand = new Command("template")
  .alias("tpl")
  .description("Template management commands")
  .addCommand(templateCreateCommand)
  .addCommand(templateListCommand);
