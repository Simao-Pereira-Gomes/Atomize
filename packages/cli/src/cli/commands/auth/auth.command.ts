import type { Config } from "@config/config";
import { Command } from "commander";
import { makeAuthAddCommand } from "./auth-add.command";
import { makeAuthListCommand } from "./auth-list.command";
import { makeAuthRemoveCommand } from "./auth-remove.command";
import { makeAuthRotateCommand } from "./auth-rotate.command";
import { makeAuthTestCommand } from "./auth-test.command";
import { makeAuthUseCommand } from "./auth-use.command";

export function makeAuthCommand(config: Config): Command {
  return new Command("auth")
    .description("Manage named connection profiles")
    .addCommand(makeAuthAddCommand(config))
    .addCommand(makeAuthListCommand())
    .addCommand(makeAuthRemoveCommand())
    .addCommand(makeAuthRotateCommand())
    .addCommand(makeAuthTestCommand())
    .addCommand(makeAuthUseCommand());
}
