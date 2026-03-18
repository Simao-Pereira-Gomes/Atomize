import { Command } from "commander";
import { authAddCommand } from "./auth-add.command";
import { authListCommand } from "./auth-list.command";
import { authRemoveCommand } from "./auth-remove.command";
import { authRotateCommand } from "./auth-rotate.command";
import { authTestCommand } from "./auth-test.command";
import { authUseCommand } from "./auth-use.command";

export const authCommand = new Command("auth")
  .description("Manage named connection profiles")
  .addCommand(authAddCommand)
  .addCommand(authListCommand)
  .addCommand(authRemoveCommand)
  .addCommand(authRotateCommand)
  .addCommand(authTestCommand)
  .addCommand(authUseCommand);
