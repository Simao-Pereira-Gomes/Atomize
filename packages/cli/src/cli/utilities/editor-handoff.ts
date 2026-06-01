import { spawn as spawnChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { confirm } from "@clack/prompts";
import type { CommandOutput } from "@/cli/utilities/command-output";
import { assertNotCancelled, sanitizeTty } from "@/cli/utilities/prompt-utilities";

type EditorIdentifier = "code" | "cursor" | "zed";

type EditorCommand = {
  command: string;
  args: string[];
};

export type ResolvedEditorCommand = EditorCommand & {
  warning?: string;
};

type EditorResolution = {
  command?: EditorCommand;
  warning?: string;
};

type ResolveEditorCommandOptions = {
  path: string;
  env?: NodeJS.ProcessEnv;
  commandExists?: (command: string) => boolean;
};

type SpawnedProcess = {
  unref(): void;
  once?(event: "error", listener: (error: Error) => void): unknown;
};

type SpawnEditor = (
  command: string,
  args: string[],
  options: { detached: true; stdio: "ignore" },
) => SpawnedProcess;

type ConfirmOpen = (options: {
  message: string;
  initialValue: boolean;
}) => Promise<boolean | symbol>;

export type EditorHandoffOptions = {
  path: string;
  requestedOpen: boolean;
  interactive: boolean;
  output: CommandOutput;
  env?: NodeJS.ProcessEnv;
  commandExists?: (command: string) => boolean;
  spawn?: SpawnEditor;
  confirmOpen?: ConfirmOpen;
};

const EDITOR_COMMANDS: Record<EditorIdentifier, EditorCommand> = {
  code: { command: "code", args: ["--reuse-window"] },
  cursor: { command: "cursor", args: ["--reuse-window"] },
  zed: { command: "zed", args: [] },
};

const EDITOR_ALIASES: Record<string, EditorIdentifier> = {
  code: "code",
  vscode: "code",
  cursor: "cursor",
  zed: "zed",
};

function defaultCommandExists(command: string): boolean {
  const pathValue = process.env.PATH;
  if (!pathValue) return false;

  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  return pathValue.split(delimiter).some((dir) =>
    extensions.some((extension) => {
      try {
        accessSync(join(dir, `${command}${extension}`), constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }),
  );
}

function defaultSpawn(
  command: string,
  args: string[],
  options: { detached: true; stdio: "ignore" },
): SpawnedProcess {
  return spawnChildProcess(command, args, options);
}

function defaultConfirmOpen(options: {
  message: string;
  initialValue: boolean;
}): Promise<boolean | symbol> {
  return confirm(options);
}

function editorCommandFor(identifier: EditorIdentifier, path: string): EditorCommand {
  const editor = EDITOR_COMMANDS[identifier];
  return {
    command: editor.command,
    args: [...editor.args, path],
  };
}

function formatManualHint(path: string): string {
  return `Open manually: code --reuse-window "${sanitizeTty(path).replaceAll('"', '\\"')}"`;
}

function writeWarning(output: CommandOutput, message: string): void {
  output.printError(`Warning: ${sanitizeTty(message)}`);
}

export function resolveEditorCommand(
  options: ResolveEditorCommandOptions,
): ResolvedEditorCommand | undefined {
  const resolution = resolveEditor(options);
  return resolution.command
    ? { ...resolution.command, warning: resolution.warning }
    : undefined;
}

function resolveEditor(options: ResolveEditorCommandOptions): EditorResolution {
  const env = options.env ?? process.env;
  const commandExists = options.commandExists ?? defaultCommandExists;
  const configured = env.ATOMIZE_EDITOR?.trim();

  if (configured && configured.length > 0) {
    const identifier = EDITOR_ALIASES[configured.toLowerCase()];
    if (identifier) {
      const selected = editorCommandFor(identifier, options.path);
      if (commandExists(selected.command)) {
        return { command: selected };
      }

      const fallback = editorCommandFor("code", options.path);
      if (identifier !== "code" && commandExists(fallback.command)) {
        return {
          command: fallback,
          warning: `ATOMIZE_EDITOR "${configured}" uses ${selected.command}, but that CLI is unavailable; falling back to VS Code.`,
        };
      }

      return {
        warning: `ATOMIZE_EDITOR "${configured}" uses ${selected.command}, but that CLI is unavailable.`,
      };
    }

    const fallback = editorCommandFor("code", options.path);
    if (commandExists(fallback.command)) {
      return {
        command: fallback,
        warning: `Unsupported ATOMIZE_EDITOR "${configured}"; falling back to VS Code.`,
      };
    }

    return {
      warning: `Unsupported ATOMIZE_EDITOR "${configured}".`,
    };
  }

  const fallback = editorCommandFor("code", options.path);
  return commandExists(fallback.command) ? { command: fallback } : {};
}

export function canResolveEditorCommand(
  options: ResolveEditorCommandOptions,
): boolean {
  return resolveEditorCommand(options) !== undefined;
}

export async function handOffToEditor(
  options: EditorHandoffOptions,
): Promise<void> {
  const resolution = resolveEditor(options);
  const command = resolution.command;
  const shouldAttempt = options.requestedOpen
    ? true
    : options.interactive
      ? assertNotCancelled(
          await (options.confirmOpen ?? defaultConfirmOpen)({
            message: "Open in editor?",
            initialValue: command !== undefined,
          }),
        )
      : false;

  if (!shouldAttempt) return;

  if (resolution.warning) {
    writeWarning(options.output, resolution.warning);
  }

  if (!command) {
    options.output.printAlways(`Saved file: ${sanitizeTty(options.path)}`);
    options.output.printAlways(formatManualHint(options.path));
    return;
  }

  options.output.print(`Opening in editor: ${sanitizeTty(options.path)}`);

  try {
    const child = (options.spawn ?? defaultSpawn)(command.command, command.args, {
      detached: true,
      stdio: "ignore",
    });
    child.once?.("error", (error) => {
      writeWarning(options.output, `Could not open editor: ${error.message}`);
    });
    child.unref();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeWarning(options.output, `Could not open editor: ${message}`);
  }
}
