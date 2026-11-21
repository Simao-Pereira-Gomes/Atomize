import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConsent, setConsent } from "@sppg2001/atomize-telemetry";
import { handleLine, type RpcResponse, type SidecarServices } from "./protocol";
import { createSidecarTelemetry } from "./telemetry";

let dir: string;
let consentPath: string;
let fetchMock: ReturnType<typeof mock>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atomize-sidecar-telemetry-"));
  consentPath = join(dir, "telemetry.json");
  fetchMock = mock(async () => new Response("{}"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function serve(env: Record<string, string | undefined> = {}) {
  const telemetry = createSidecarTelemetry({
    atomizeVersion: "1.2.3",
    consentPath,
    env,
    fetch: fetchMock as unknown as typeof fetch,
    projectKey: "phc_test",
  });
  const services = { telemetry, activeRequests: new Map() } as unknown as SidecarServices;
  let id = 0;
  const call = async (method: string, params?: unknown): Promise<RpcResponse> => {
    const response = await handleLine(JSON.stringify({ jsonrpc: "2.0", id: ++id, method, ...(params === undefined ? {} : { params }) }), services);
    return response as RpcResponse;
  };
  return { call, telemetry };
}

const event = { event: "command_finished", action: "validate", outcome: "success", durationMs: 10, mode: "online", valid: true, issueCount: 0 };
const sent = () => fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string));

describe("telemetry.report", () => {
  it("sends nothing while undecided", async () => {
    const { call, telemetry } = serve();
    expect((await call("telemetry.report", { event })).result).toEqual({ reported: true });
    await telemetry.flush(50);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing while disabled", async () => {
    setConsent(true, { path: consentPath });
    setConsent(false, { path: consentPath });
    const { call, telemetry } = serve();
    await call("telemetry.report", { event });
    await telemetry.flush(50);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ DO_NOT_TRACK: "1" }, { ATOMIZE_TELEMETRY: "off" }])("sends nothing under %o", async (env) => {
    setConsent(true, { path: consentPath });
    const { call, telemetry } = serve(env);
    await call("telemetry.report", { event });
    await telemetry.flush(50);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one studio event once enabled, with the envelope filled in by the sidecar", async () => {
    setConsent(true, { path: consentPath });
    const { call, telemetry } = serve();
    await call("telemetry.report", { event });
    await telemetry.flush(50);
    expect(sent()).toHaveLength(1);
    expect(sent()[0].properties).toMatchObject({ surface: "studio", atomizeVersion: "1.2.3", action: "validate", valid: true });
  });

  it("stops at the next event when the CLI disables telemetry meanwhile", async () => {
    setConsent(true, { path: consentPath });
    const { call, telemetry } = serve();
    await call("telemetry.report", { event });
    await telemetry.flush(50);
    setConsent(false, { path: consentPath });
    await call("telemetry.report", { event });
    await telemetry.flush(50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a free-form prop", { ...event, templateName: "Payroll" }],
    ["a free-form value", { ...event, mode: "acme" }],
    ["an envelope field", { ...event, surface: "cli" }],
    ["an unknown action", { ...event, action: "nope" }],
    ["a non-object event", "validate"],
  ])("rejects %s as INVALID_PARAMS", async (_name, bad) => {
    const { call } = serve();
    const response = await call("telemetry.report", { event: bad });
    expect(response.error?.code).toBe("INVALID_PARAMS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing and extra params", async () => {
    const { call } = serve();
    expect((await call("telemetry.report", {})).error?.code).toBe("INVALID_PARAMS");
    expect((await call("telemetry.report", { event, extra: 1 })).error?.code).toBe("INVALID_PARAMS");
  });
});

describe("telemetry.status", () => {
  it("is undecided with no ID before any choice", async () => {
    const { call } = serve();
    expect((await call("telemetry.status")).result).toEqual({ state: "undecided", override: null, anonymousId: null, nudged: false });
  });

  it("reflects a change another process wrote, and an env override", async () => {
    const { call } = serve({ DO_NOT_TRACK: "1" });
    expect((await call("telemetry.status")).result).toMatchObject({ state: "undecided", override: "DO_NOT_TRACK" });
    const { anonymousId } = setConsent(true, { path: consentPath });
    expect((await call("telemetry.status")).result).toEqual({ state: "enabled", override: "DO_NOT_TRACK", anonymousId, nudged: false });
    setConsent(false, { path: consentPath });
    expect((await call("telemetry.status")).result).toMatchObject({ state: "disabled", anonymousId });
  });

  it("rejects params", async () => {
    const { call } = serve();
    expect((await call("telemetry.status", { x: 1 })).error?.code).toBe("INVALID_PARAMS");
  });
});

describe("telemetry.setConsent", () => {
  it("enable writes the shared decision, creates the ID, and sends telemetry_enabled from studio", async () => {
    const { call, telemetry } = serve();
    const response = await call("telemetry.setConsent", { decision: "enable" });
    await telemetry.flush(50);
    expect(response.result).toMatchObject({ state: "enabled", anonymousId: expect.any(String) });
    expect(readConsent(consentPath).enabled).toBe(true);
    expect(sent().map((e) => e.event)).toEqual(["telemetry_enabled"]);
    expect(sent()[0].properties.source).toBe("studio");
  });

  it("disable sends nothing and keeps the ID", async () => {
    const { anonymousId } = setConsent(true, { path: consentPath });
    const { call, telemetry } = serve();
    const response = await call("telemetry.setConsent", { decision: "disable" });
    await telemetry.flush(50);
    expect(response.result).toMatchObject({ state: "disabled", anonymousId });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dismissNudge records nudged.studio without deciding", async () => {
    const { call } = serve();
    expect((await call("telemetry.setConsent", { decision: "dismissNudge" })).result).toMatchObject({ state: "undecided", nudged: true });
    expect(readConsent(consentPath).nudged.studio).toBe(true);
  });

  it("keeps other fields written by other surfaces", async () => {
    writeFileSync(consentPath, JSON.stringify({ version: 1, nudged: { vscode: true }, future: 1 }));
    const { call } = serve();
    await call("telemetry.setConsent", { decision: "dismissNudge" });
    const file = JSON.parse(readFileSync(consentPath, "utf8"));
    expect(file).toMatchObject({ nudged: { vscode: true, studio: true }, future: 1 });
  });

  it.each([{ decision: "maybe" }, {}, { decision: "enable", extra: true }])("rejects %o", async (params) => {
    const { call } = serve();
    expect((await call("telemetry.setConsent", params)).error?.code).toBe("INVALID_PARAMS");
  });
});

describe("telemetry.requestDeletion", () => {
  it("is sent even when disabled or overridden, then disables", async () => {
    const { anonymousId } = setConsent(true, { path: consentPath });
    setConsent(false, { path: consentPath });
    const { call, telemetry } = serve({ DO_NOT_TRACK: "1" });
    const response = await call("telemetry.requestDeletion");
    await telemetry.flush(50);
    expect(response.result).toEqual({ sent: true, anonymousId });
    expect(sent()[0]).toMatchObject({ event: "telemetry_deletion_requested", distinct_id: anonymousId });
    expect(readConsent(consentPath).enabled).toBe(false);
  });

  it("with no Anonymous ID sends nothing", async () => {
    const { call } = serve();
    expect((await call("telemetry.requestDeletion")).result).toEqual({ sent: false, anonymousId: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("shutdown notice", () => {
  it("is recognised only as the $/shutdown notification", async () => {
    const { isShutdownNotification } = await import("./protocol");
    expect(isShutdownNotification('{"jsonrpc":"2.0","method":"$/shutdown"}')).toBe(true);
    expect(isShutdownNotification('{"jsonrpc":"2.0","id":1,"method":"catalog.list"}')).toBe(false);
    expect(isShutdownNotification("not json")).toBe(false);
  });
});
