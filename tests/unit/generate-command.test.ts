/**
 * Tests for generate command helper logic.
 *
 * Covers the following automatable scenarios:
 *   - Missing flags in --no-interactive: getMissingAzureEnvVars() detects absent env vars
 *   - Progress spinner / concurrency: clampConcurrency() ensures values stay in safe bounds
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getMissingAzureEnvVars } from "@config/azure-devops.config";
import { clampConcurrency } from "@utils/math";

describe("getMissingAzureEnvVars", () => {
  let savedOrg: string | undefined;
  let savedProject: string | undefined;
  let savedPat: string | undefined;

  beforeEach(() => {
    savedOrg = process.env.AZURE_DEVOPS_ORG_URL;
    savedProject = process.env.AZURE_DEVOPS_PROJECT;
    savedPat = process.env.AZURE_DEVOPS_PAT;

    delete process.env.AZURE_DEVOPS_ORG_URL;
    delete process.env.AZURE_DEVOPS_PROJECT;
    delete process.env.AZURE_DEVOPS_PAT;
  });

  afterEach(() => {
    if (savedOrg !== undefined) process.env.AZURE_DEVOPS_ORG_URL = savedOrg;
    else delete process.env.AZURE_DEVOPS_ORG_URL;

    if (savedProject !== undefined)
      process.env.AZURE_DEVOPS_PROJECT = savedProject;
    else delete process.env.AZURE_DEVOPS_PROJECT;

    if (savedPat !== undefined) process.env.AZURE_DEVOPS_PAT = savedPat;
    else delete process.env.AZURE_DEVOPS_PAT;
  });

  test("returns an empty array when all required env vars are present", () => {
    process.env.AZURE_DEVOPS_ORG_URL = "https://dev.azure.com/myorg";
    process.env.AZURE_DEVOPS_PROJECT = "MyProject";
    process.env.AZURE_DEVOPS_PAT = "my-pat-token";

    expect(getMissingAzureEnvVars()).toEqual([]);
  });

  test("returns all three variable names when none are set", () => {
    const missing = getMissingAzureEnvVars();
    expect(missing).toContain("AZURE_DEVOPS_ORG_URL");
    expect(missing).toContain("AZURE_DEVOPS_PROJECT");
    expect(missing).toContain("AZURE_DEVOPS_PAT");
    expect(missing).toHaveLength(3);
  });

  test("returns only AZURE_DEVOPS_PAT when ORG_URL and PROJECT are set", () => {
    process.env.AZURE_DEVOPS_ORG_URL = "https://dev.azure.com/myorg";
    process.env.AZURE_DEVOPS_PROJECT = "MyProject";

    expect(getMissingAzureEnvVars()).toEqual(["AZURE_DEVOPS_PAT"]);
  });

  test("returns only AZURE_DEVOPS_ORG_URL when PROJECT and PAT are set", () => {
    process.env.AZURE_DEVOPS_PROJECT = "MyProject";
    process.env.AZURE_DEVOPS_PAT = "my-pat-token";

    expect(getMissingAzureEnvVars()).toEqual(["AZURE_DEVOPS_ORG_URL"]);
  });

  test("returns only AZURE_DEVOPS_PROJECT when ORG_URL and PAT are set", () => {
    process.env.AZURE_DEVOPS_ORG_URL = "https://dev.azure.com/myorg";
    process.env.AZURE_DEVOPS_PAT = "my-pat-token";

    expect(getMissingAzureEnvVars()).toEqual(["AZURE_DEVOPS_PROJECT"]);
  });

  test("preserves declaration order in the returned array", () => {
    const missing = getMissingAzureEnvVars();
    const expectedOrder = [
      "AZURE_DEVOPS_ORG_URL",
      "AZURE_DEVOPS_PROJECT",
      "AZURE_DEVOPS_PAT",
    ];
    expect(missing).toEqual(expectedOrder);
  });
});

describe("clampConcurrency", () => {
  test("returns the value unchanged when it is within range", () => {
    expect(clampConcurrency(5, 1, 10, 3)).toBe(5);
  });

  test("returns the default when value is below the minimum", () => {
    expect(clampConcurrency(0, 1, 10, 3)).toBe(3);
  });

  test("returns the default when value is above the maximum", () => {
    expect(clampConcurrency(11, 1, 10, 3)).toBe(3);
  });

  test("accepts the minimum boundary value as valid", () => {
    expect(clampConcurrency(1, 1, 10, 3)).toBe(1);
  });

  test("accepts the maximum boundary value as valid", () => {
    expect(clampConcurrency(10, 1, 10, 3)).toBe(10);
  });

  test("uses the supplied default, not a hardcoded fallback", () => {
    expect(clampConcurrency(0, 1, 5, 99)).toBe(99);
  });

  test("works correctly for the task-concurrency range (1–20, default 5)", () => {
    expect(clampConcurrency(20, 1, 20, 5)).toBe(20);
    expect(clampConcurrency(21, 1, 20, 5)).toBe(5);
    expect(clampConcurrency(1, 1, 20, 5)).toBe(1);
  });

  test("works correctly for the story-concurrency range (1–10, default 3)", () => {
    expect(clampConcurrency(10, 1, 10, 3)).toBe(10);
    expect(clampConcurrency(11, 1, 10, 3)).toBe(3);
    expect(clampConcurrency(0, 1, 10, 3)).toBe(3);
  });
});
