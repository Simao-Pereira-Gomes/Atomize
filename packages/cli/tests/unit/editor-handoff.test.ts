import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import {
  handOffToEditor,
  resolveEditorCommand,
} from "@/cli/utilities/editor-handoff";

const templatePath = "/tmp/example.atomize.yaml";

describe("resolveEditorCommand", () => {
  test.each([
    ["code", "code", ["--reuse-window", templatePath]],
    ["vscode", "code", ["--reuse-window", templatePath]],
    ["cursor", "cursor", ["--reuse-window", templatePath]],
    ["zed", "zed", [templatePath]],
  ])("maps %s to its supported argv", (identifier, commandName, args) => {
    const command = resolveEditorCommand({
      path: templatePath,
      env: { ATOMIZE_EDITOR: identifier },
      commandExists: (name) => name === commandName,
    });

    expect(command).toEqual({ command: commandName, args });
  });

  test("normalizes supported ATOMIZE_EDITOR identifiers and owns argv construction", () => {
    const command = resolveEditorCommand({
      path: templatePath,
      env: { ATOMIZE_EDITOR: " CODE " },
      commandExists: (name) => name === "code",
    });

    expect(command).toEqual({
      command: "code",
      args: ["--reuse-window", templatePath],
    });
  });

  test("warns for unsupported ATOMIZE_EDITOR values and falls back to VS Code when available", () => {
    const command = resolveEditorCommand({
      path: templatePath,
      env: { ATOMIZE_EDITOR: "vim -p" },
      commandExists: (name) => name === "code",
    });

    expect(command).toEqual({
      command: "code",
      args: ["--reuse-window", templatePath],
      warning:
        'Unsupported ATOMIZE_EDITOR "vim -p"; falling back to VS Code.',
    });
  });

  test("warns for unavailable selected editor and falls back to VS Code when available", () => {
    const command = resolveEditorCommand({
      path: templatePath,
      env: { ATOMIZE_EDITOR: "zed" },
      commandExists: (name) => name === "code",
    });

    expect(command).toEqual({
      command: "code",
      args: ["--reuse-window", templatePath],
      warning:
        'ATOMIZE_EDITOR "zed" uses zed, but that CLI is unavailable; falling back to VS Code.',
    });
  });

  test("ignores VISUAL and EDITOR command strings", () => {
    const command = resolveEditorCommand({
      path: templatePath,
      env: {
        VISUAL: "cursor --wait",
        EDITOR: "zed --wait",
      },
      commandExists: (name) => name === "code",
    });

    expect(command).toEqual({
      command: "code",
      args: ["--reuse-window", templatePath],
    });
  });

  test("returns no editor when nothing configured and VS Code is unavailable", () => {
    const command = resolveEditorCommand({
      path: templatePath,
      env: {},
      commandExists: () => false,
    });

    expect(command).toBeUndefined();
  });
});

describe("handOffToEditor", () => {
  let logSpy: ReturnType<typeof spyOn<typeof console, "log">>;
  let errorSpy: ReturnType<typeof spyOn<typeof process.stderr, "write">>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("--open launches a supported editor without prompting", async () => {
    const spawn = mock(() => ({ unref: mock() }));
    const confirmOpen = mock(async () => {
      throw new Error("should not prompt");
    });

    await handOffToEditor({
      path: templatePath,
      requestedOpen: true,
      interactive: true,
      output: createCommandOutput(resolveCommandOutputPolicy({ quiet: true })),
      env: { ATOMIZE_EDITOR: "cursor" },
      commandExists: (name) => name === "cursor",
      spawn,
      confirmOpen,
    });

    expect(confirmOpen).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith("cursor", ["--reuse-window", templatePath], {
      detached: true,
      stdio: "ignore",
    });
  });

  test("interactive mode prompts with a yes default only when an editor is available", async () => {
    const confirmOpen = mock(async () => false);

    await handOffToEditor({
      path: templatePath,
      requestedOpen: false,
      interactive: true,
      output: createCommandOutput(resolveCommandOutputPolicy({})),
      env: {},
      commandExists: (name) => name === "code",
      spawn: mock(() => ({ unref: mock() })),
      confirmOpen,
    });

    expect(confirmOpen).toHaveBeenCalledWith({
      message: "Open in editor?",
      initialValue: true,
    });

    confirmOpen.mockClear();

    await handOffToEditor({
      path: templatePath,
      requestedOpen: false,
      interactive: true,
      output: createCommandOutput(resolveCommandOutputPolicy({})),
      env: {},
      commandExists: () => false,
      spawn: mock(() => ({ unref: mock() })),
      confirmOpen,
    });

    expect(confirmOpen).toHaveBeenCalledWith({
      message: "Open in editor?",
      initialValue: false,
    });
  });

  test("non-interactive mode does not open unless requested", async () => {
    const spawn = mock(() => ({ unref: mock() }));

    await handOffToEditor({
      path: templatePath,
      requestedOpen: false,
      interactive: false,
      output: createCommandOutput(resolveCommandOutputPolicy({})),
      env: {},
      commandExists: (name) => name === "code",
      spawn,
      confirmOpen: mock(async () => true),
    });

    expect(spawn).not.toHaveBeenCalled();
  });

  test("prints manual hint when no editor is available", async () => {
    await handOffToEditor({
      path: templatePath,
      requestedOpen: true,
      interactive: false,
      output: createCommandOutput(resolveCommandOutputPolicy({ quiet: true })),
      env: {},
      commandExists: () => false,
      spawn: mock(() => ({ unref: mock() })),
      confirmOpen: mock(async () => true),
    });

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain(`Saved file: ${templatePath}`);
    expect(output).toContain(`Open manually: code --reuse-window "${templatePath}"`);
  });

  test("warns and prints manual hint for unsupported ATOMIZE_EDITOR when VS Code is unavailable", async () => {
    await handOffToEditor({
      path: templatePath,
      requestedOpen: true,
      interactive: false,
      output: createCommandOutput(resolveCommandOutputPolicy({ quiet: true })),
      env: { ATOMIZE_EDITOR: "vim -p" },
      commandExists: () => false,
      spawn: mock(() => ({ unref: mock() })),
      confirmOpen: mock(async () => true),
    });

    const output = logSpy.mock.calls.flat().join("\n");
    const warnings = errorSpy.mock.calls.flat().join("");
    expect(warnings).toContain('Warning: Unsupported ATOMIZE_EDITOR "vim -p".');
    expect(output).toContain(`Open manually: code --reuse-window "${templatePath}"`);
  });

  test("warns but does not throw when editor launch fails", async () => {
    await expect(
      handOffToEditor({
        path: templatePath,
        requestedOpen: true,
        interactive: false,
        output: createCommandOutput(resolveCommandOutputPolicy({})),
        env: { ATOMIZE_EDITOR: "code" },
        commandExists: (name) => name === "code",
        spawn: mock(() => {
          throw new Error("spawn failed");
        }),
        confirmOpen: mock(async () => true),
      }),
    ).resolves.toBeUndefined();

    const warnings = errorSpy.mock.calls.flat().join("");
    expect(warnings).toContain("Warning: Could not open editor: spawn failed");
  });
});
