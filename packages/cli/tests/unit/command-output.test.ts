import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  createCommandOutput,
  createCommandPrinter,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";

describe("resolveCommandOutputPolicy", () => {
  test("defaults to standard output with environment-driven logging", () => {
    expect(resolveCommandOutputPolicy({})).toEqual({
      quiet: false,
      verbose: false,
      logLevel: undefined,
      showStandardOutput: true,
      showVerboseOutput: false,
      showClackStatus: true,
    });
  });

  test("enables verbose output and debug logging in verbose mode", () => {
    expect(resolveCommandOutputPolicy({ verbose: true })).toEqual({
      quiet: false,
      verbose: true,
      logLevel: "debug",
      showStandardOutput: true,
      showVerboseOutput: true,
      showClackStatus: true,
    });
  });

  test("suppresses non-essential output and lowers logging in quiet mode", () => {
    expect(resolveCommandOutputPolicy({ quiet: true })).toEqual({
      quiet: true,
      verbose: false,
      logLevel: "error",
      showStandardOutput: false,
      showVerboseOutput: false,
      showClackStatus: false,
    });
  });
});

describe("createCommandPrinter", () => {
  let logSpy: ReturnType<typeof spyOn<typeof console, "log">>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("prints in standard mode", () => {
    const print = createCommandPrinter(resolveCommandOutputPolicy({}));
    print("hello");
    expect(logSpy).toHaveBeenCalledWith("hello");
  });

  test("suppresses standard output in quiet mode", () => {
    const print = createCommandPrinter(resolveCommandOutputPolicy({ quiet: true }));
    print("hello");
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe("createCommandOutput", () => {
  let logSpy: ReturnType<typeof spyOn<typeof console, "log">>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("prints blank lines in standard mode", () => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));
    output.blankLine();
    expect(logSpy).toHaveBeenCalledWith("");
  });

  test("suppresses blank lines in quiet mode", () => {
    const output = createCommandOutput(resolveCommandOutputPolicy({ quiet: true }));
    output.blankLine();
    expect(logSpy).not.toHaveBeenCalled();
  });

  test("prints JSON payloads regardless of quiet mode", () => {
    const output = createCommandOutput(resolveCommandOutputPolicy({ quiet: true }));
    output.printJson({ ok: true });
    expect(logSpy).toHaveBeenCalledWith('{\n  "ok": true\n}');
  });
});
