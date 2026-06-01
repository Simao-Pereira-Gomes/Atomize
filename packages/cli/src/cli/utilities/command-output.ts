import {
  cancel as clackCancel,
  intro as clackIntro,
  outro as clackOutro,
  log,
} from "@clack/prompts";
import type { LogLevel } from "@config/logger";
import { writeManagedOutput } from "@/cli/utilities/terminal-output";

/**
 * Shared command-output policy.
 *
 * Mental model:
 * - custom logger: diagnostics
 * - clack: interaction/status
 * - console: result rendering
 */
export interface CommandOutputPolicy {
  quiet: boolean;
  verbose: boolean;
  logLevel: LogLevel | undefined;
  showStandardOutput: boolean;
  showVerboseOutput: boolean;
  showClackStatus: boolean;
}

export function resolveCommandOutputPolicy(options: {
  quiet?: boolean;
  verbose?: boolean;
}): CommandOutputPolicy {
  const quiet = options.quiet === true;
  const verbose = options.verbose === true;

  return {
    quiet,
    verbose,
    logLevel: quiet ? "error" : verbose ? "debug" : undefined,
    showStandardOutput: !quiet,
    showVerboseOutput: verbose && !quiet,
    showClackStatus: !quiet,
  };
}

export function createCommandPrinter(policy: CommandOutputPolicy): (msg: string) => void {
  return (msg: string) => {
    if (policy.showStandardOutput) {
      console.log(msg);
    }
  };
}

export interface CommandOutput {
  policy: CommandOutputPolicy;
  print(msg: string): void;
  printAlways(msg: string): void;
  write(msg: string): void;
  writeAlways(msg: string): void;
  blankLine(): void;
  printVerbose(msg: string): void;
  printJson(value: unknown): void;
  printError(msg: string): void;
  intro(msg: string): void;
  outro(msg: string): void;
  cancel(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  success(msg: string): void;
}

export function createCommandOutput(policy: CommandOutputPolicy): CommandOutput {
  return {
    policy,
    print: createCommandPrinter(policy),
    printAlways: (msg: string): void => {
      console.log(msg);
    },
    write: (msg: string): void => {
      if (policy.showStandardOutput) {
        process.stdout.write(msg);
      }
    },
    writeAlways: (msg: string): void => {
      process.stdout.write(msg);
    },
    blankLine: (): void => {
      if (policy.showStandardOutput) {
        console.log("");
      }
    },
    printVerbose: (msg: string): void => {
      if (policy.showVerboseOutput) {
        console.log(msg);
      }
    },
    printJson: (value: unknown): void => {
      console.log(JSON.stringify(value, null, 2));
    },
    printError: (msg: string): void => {
      writeManagedOutput("stderr", msg);
    },
    intro: (msg: string): void => {
      if (policy.showClackStatus) {
        clackIntro(msg);
      }
    },
    outro: (msg: string): void => {
      if (policy.showClackStatus) {
        clackOutro(msg);
      }
    },
    cancel: (msg: string): void => {
      clackCancel(msg);
    },
    info: (msg: string): void => {
      if (policy.showClackStatus) {
        log.info(msg);
      }
    },
    warn: (msg: string): void => {
      if (policy.showClackStatus) {
        log.warn(msg);
      }
    },
    success: (msg: string): void => {
      if (policy.showClackStatus) {
        log.success(msg);
      }
    },
  };
}
