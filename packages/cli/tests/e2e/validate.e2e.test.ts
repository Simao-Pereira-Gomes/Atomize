import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { E2EWorkspace } from "./harness";

/** Covers Template Verification (#317, #318): Offline Validation through `atomize validate`. */
type Issue = { path: string; message: string; code?: string };
type ValidateJson = { valid: boolean; errors: Issue[]; warnings: Issue[]; mode: string; requirements: { needsOnlineVerification: boolean } };

let ws: E2EWorkspace;
beforeEach(async () => { ws = await E2EWorkspace.create(); });
afterEach(async () => { await ws.dispose(); });

const validate = (source: string, ...flags: string[]) => ws.runJson<ValidateJson>(["validate", source, "--output", "json", ...flags]);

describe("atomize validate (Offline Validation)", () => {
  test("passes a valid Template", async () => {
    const { json, exitCode } = await validate(ws.file("features.atomize.yaml"));
    expect(exitCode).toBe(0);
    expect(json).toMatchObject({ valid: true, errors: [], mode: "lenient" });
  });

  test("fails an invalid Template with the codes the VS Code quick fixes rely on", async () => {
    const { json, exitCode } = await validate(ws.file("invalid.atomize.yaml"));
    expect(exitCode).toBe(1);
    expect(json.valid).toBe(false);
    expect(json.errors.map((error) => error.path)).toEqual(["tasks.0.title", "tasks.0.estimationPercent"]);
  });

  test("validates a Catalog ref as its Resolved Template", async () => {
    const { json, exitCode } = await validate("template:proj-child");
    expect(exitCode).toBe(0);
    expect(json.valid).toBe(true);
  });

  test("reports over-allocation as a non-blocking warning, also in strict mode", async () => {
    const lenient = await validate(ws.file("over-auto.atomize.yaml"));
    const strict = await validate(ws.file("over-auto.atomize.yaml"), "--strict");

    expect(lenient.json.valid).toBe(true);
    expect(lenient.json.warnings.map((warning) => warning.path)).toEqual(["tasks"]);
    expect(strict.json).toMatchObject({ valid: true, mode: "strict" });
  });

  test("says what it could not check without a connection: custom fields and the saved query", async () => {
    const { json, exitCode } = await validate(ws.file("customfields.atomize.yaml"));

    expect(exitCode).toBe(0);
    expect(json.requirements.needsOnlineVerification).toBe(true);
    const paths = json.warnings.map((warning) => warning.path);
    expect(paths).toContain("tasks[*].customFields");
    expect(paths).toContain("filter.savedQuery");
  });

  test("strict mode fails on custom fields that could not be verified", async () => {
    const { json, exitCode } = await validate(ws.file("customfields.atomize.yaml"), "--strict");
    expect(exitCode).toBe(1);
    expect(json.errors.map((error) => error.code)).toContain("STRICT_MODE_WARNING");
  });
});
