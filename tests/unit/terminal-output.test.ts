import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  createManagedSpinner,
  resetTerminalOutputForTests,
  writeManagedOutput,
} from "@/cli/utilities/terminal-output";
import { logger } from "@/config/logger";

describe("terminal output coordination", () => {
  const originalLogLevel = logger.level;
  let stdoutWriteSpy: ReturnType<typeof spyOn<typeof process.stdout, "write">>;
  let stderrWriteSpy: ReturnType<typeof spyOn<typeof process.stderr, "write">>;

  beforeEach(() => {
    resetTerminalOutputForTests();
    logger.level = "info";
    stdoutWriteSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrWriteSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    logger.level = originalLogLevel;
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    resetTerminalOutputForTests();
  });

  test("buffers direct output while a managed spinner is active", () => {
    const baseSpinner = {
      start: mock<(message: string) => void>(),
      message: mock<(message: string) => void>(),
      stop: mock<(message: string) => void>(),
    };
    const managedSpinner = createManagedSpinner(() => baseSpinner);

    managedSpinner.start("Connecting...");
    writeManagedOutput("stdout", "Testing connection to Azure DevOps...");

    expect(baseSpinner.start).toHaveBeenCalledWith("Connecting...");
    expect(stdoutWriteSpy).not.toHaveBeenCalled();

    managedSpinner.stop("Connection successful");

    expect(baseSpinner.stop).toHaveBeenCalledWith("Connection successful");
    expect(stdoutWriteSpy).toHaveBeenCalledWith(
      "Testing connection to Azure DevOps...\n",
    );
  });

  test("keeps logs buffered until the last managed spinner stops", () => {
    const makeBaseSpinner = () => ({
      start: mock<(message: string) => void>(),
      message: mock<(message: string) => void>(),
      stop: mock<(message: string) => void>(),
    });

    const firstSpinner = createManagedSpinner(makeBaseSpinner);
    const secondSpinner = createManagedSpinner(makeBaseSpinner);

    firstSpinner.start("Resolving configuration...");
    secondSpinner.start("Connecting...");
    logger.info("Testing connection to Azure DevOps...");

    expect(stdoutWriteSpy).not.toHaveBeenCalled();

    secondSpinner.stop("Still working");
    expect(stdoutWriteSpy).not.toHaveBeenCalled();

    firstSpinner.stop("Done");
    expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
    expect(String(stdoutWriteSpy.mock.calls[0]?.[0])).toContain(
      "Testing connection to Azure DevOps...",
    );
  });

  test("routes logger output through the managed buffer while a spinner is active", () => {
    const baseSpinner = {
      start: mock<(message: string) => void>(),
      message: mock<(message: string) => void>(),
      stop: mock<(message: string) => void>(),
    };
    const managedSpinner = createManagedSpinner(() => baseSpinner);

    managedSpinner.start("Connecting...");
    logger.info("Testing connection to Azure DevOps...");
    logger.warn("Potential retry");

    expect(stdoutWriteSpy).not.toHaveBeenCalled();
    expect(stderrWriteSpy).not.toHaveBeenCalled();

    managedSpinner.stop("Connection successful");

    const flushedOutput = [
      ...stdoutWriteSpy.mock.calls.map((call) => String(call[0])),
      ...stderrWriteSpy.mock.calls.map((call) => String(call[0])),
    ];

    expect(flushedOutput.length).toBe(2);
    expect(flushedOutput.some((line) => line.includes("Testing connection to Azure DevOps..."))).toBe(true);
    expect(flushedOutput.some((line) => line.includes("Potential retry"))).toBe(true);
  });
});
