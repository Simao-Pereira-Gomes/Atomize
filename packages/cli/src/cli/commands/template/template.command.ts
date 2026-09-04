import { Command } from "commander";
import { templateCreateCommand } from "./template-create.command";
import { templateInstallCommand } from "./template-install.command";
import { templateListCommand } from "./template-list.command";
import { templateMetadataCommand } from "./template-metadata.command";
import { templateMigrateCommand } from "./template-migrate.command";
import { templateRemoveCommand } from "./template-remove.command";
import { templateResolveCommand } from "./template-resolve.command";

export const templateCommand = new Command("template")
	.alias("tpl")
	.description("Template management commands")
	.addCommand(templateCreateCommand)
	.addCommand(templateInstallCommand)
	.addCommand(templateListCommand)
	.addCommand(templateMigrateCommand)
	.addCommand(templateMetadataCommand)
	.addCommand(templateRemoveCommand)
	.addCommand(templateResolveCommand);
