import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { logger, resetLoggerForTests } from "@/config/logger";

describe("logger", () => {
  const originalAtomizeDebug = process.env.ATOMIZE_DEBUG;
  const originalLogLevel = process.env.LOG_LEVEL;
  let stdoutWriteSpy: ReturnType<typeof spyOn<typeof process.stdout, "write">>;
  let stderrWriteSpy: ReturnType<typeof spyOn<typeof process.stderr, "write">>;

  beforeEach(() => {
    resetLoggerForTests();
    delete process.env.ATOMIZE_DEBUG;
    delete process.env.LOG_LEVEL;
    stdoutWriteSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrWriteSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    resetLoggerForTests();

    if (originalAtomizeDebug === undefined) {
      delete process.env.ATOMIZE_DEBUG;
    } else {
      process.env.ATOMIZE_DEBUG = originalAtomizeDebug;
    }

    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }

    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  test("defaults to warn level", () => {
    expect(logger.level).toBe("warn");
  });

  test("uses LOG_LEVEL when provided", () => {
    process.env.LOG_LEVEL = "info";
    expect(logger.level).toBe("info");
  });

  test("uses debug level when ATOMIZE_DEBUG is enabled", () => {
    process.env.ATOMIZE_DEBUG = "1";
    expect(logger.level).toBe("debug");
  });

  test("explicit logger overrides win over environment settings", () => {
    process.env.ATOMIZE_DEBUG = "1";
    logger.level = "error";
    expect(logger.level).toBe("error");
  });

  test("redacts sensitive metadata keys recursively", () => {
    logger.level = "info";
    logger.info("Auth payload", {
      token: "abc123",
      nested: {
        apiKey: "secret-key",
        authorization: "Bearer top-secret",
      },
      password: "hunter2",
      safe: "visible",
    });

    const output = stdoutWriteSpy.mock.calls.flat().join(" ");

    expect(output).toContain("Auth payload");
    expect(output).toContain('"token":"[REDACTED]"');
    expect(output).toContain('"apiKey":"[REDACTED]"');
    expect(output).toContain('"authorization":"[REDACTED]"');
    expect(output).toContain('"password":"[REDACTED]"');
    expect(output).toContain('"safe":"visible"');
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("secret-key");
    expect(output).not.toContain("top-secret");
    expect(output).not.toContain("hunter2");
  });

  test("logs errors with a minimal serialized error payload", () => {
    logger.level = "error";
    logger.error("Operation failed", new Error("boom"));

    const output = stderrWriteSpy.mock.calls.flat().join(" ");

    expect(output).toContain("Operation failed");
    expect(output).toContain('"name":"Error"');
    expect(output).toContain('"message":"boom"');
  });
});
