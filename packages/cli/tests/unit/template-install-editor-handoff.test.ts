import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { Command } from "commander";

const mockHandOffToEditor = mock(async () => {});
const mockInstall = mock(async () => ({
  name: "installed-template",
  ref: "template:installed-template",
  scope: "user",
  path: "/tmp/installed-template.atomize.yaml",
}));
const mockPreviewInstall = mock(async () => ({
  exists: false,
  source: {
    kind: "template",
    name: "installed-template",
    install: mockInstall,
  },
}));

type HandoffCall = {
  path: string;
  requestedOpen: boolean;
  interactive: boolean;
};

mock.module("@sppg2001/atomize-core/templates/template-library", () => ({
  TemplateLibrary: class {
    parseInstallScope(value: string) {
      return value;
    }

    parseCatalogKind(value: string) {
      return value;
    }

    previewInstall = mockPreviewInstall;
  },
}));

mock.module("@clack/prompts", () => ({
  confirm: mock(async () => true),
  isTTY: mock(() => true),
  isCI: mock(() => false),
  isCancel: mock(() => false),
  cancel: mock(),
  intro: mock(),
  outro: mock(),
  log: {
    info: mock(),
    warn: mock(),
    success: mock(),
  },
}));

import { templateCreateCommand } from "@/cli/commands/template/template-create.command";
import {
  makeTemplateInstallCommand,
  templateInstallCommand,
} from "@/cli/commands/template/template-install.command";

function makeProgram(command: Command): Command {
  return new Command().exitOverride().addCommand(command);
}

describe("template editor handoff command wiring", () => {
  let logSpy: ReturnType<typeof spyOn<typeof console, "log">>;

  beforeEach(() => {
    mockHandOffToEditor.mockClear();
    mockInstall.mockClear();
    mockPreviewInstall.mockClear();
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("template install --open hands off the installed catalog copy after success", async () => {
    const program = makeProgram(
      makeTemplateInstallCommand({ handOffToEditor: mockHandOffToEditor }),
    );

    await program.parseAsync(["node", "atomize-test", "install", "source.yaml", "--open"]);

    expect(mockHandOffToEditor).toHaveBeenCalledTimes(1);
    const handoffCalls = mockHandOffToEditor.mock.calls as unknown as [[HandoffCall]];
    const handoffOptions = handoffCalls[0][0];
    expect(handoffOptions).toMatchObject({
      path: "/tmp/installed-template.atomize.yaml",
      requestedOpen: true,
      interactive: true,
    });
  });

  test("template create exposes --open", () => {
    expect(templateCreateCommand.options.some((option) => option.long === "--open")).toBe(true);
  });

  test("template install exposes --open", () => {
    expect(templateInstallCommand.options.some((option) => option.long === "--open")).toBe(true);
  });
});
