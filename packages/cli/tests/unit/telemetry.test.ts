import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CopilotAuthenticationError } from "@sppg2001/atomize-ai";
import type { AtomizationReport } from "@sppg2001/atomize-core/core/atomizer";
import { ProjectGroundingError } from "@sppg2001/atomize-core/services/template/project-grounding";
import { ReferenceDocumentError } from "@sppg2001/atomize-core/services/template/reference-documents";
import * as coreErrors from "@sppg2001/atomize-core/utils/errors";
import {
	categorizeError,
	createTelemetryClient,
	readConsent,
	setConsent,
	type TelemetryClient,
} from "@sppg2001/atomize-telemetry";
import { buildGenerateTelemetryEvent } from "@/cli/commands/generate.command";
import { makeTelemetryCommand } from "@/cli/commands/telemetry.command";
import { exitWith, setTelemetryClientForTesting } from "@/cli/telemetry/telemetry";
import { maybeShowTelemetryHint, resetTelemetryHintForTesting } from "@/cli/telemetry/telemetry-hint";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";

let home: string;
let consentPath: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "atomize-cli-telemetry-"));
	consentPath = join(home, ".atomize", "telemetry.json");
	resetTelemetryHintForTesting();
});
afterEach(() => {
	setTelemetryClientForTesting(undefined);
	rmSync(home, { recursive: true, force: true });
});

function makeClient(fetchImpl: typeof fetch, env: Record<string, string> = {}): TelemetryClient {
	return createTelemetryClient({ surface: "cli", atomizeVersion: "5.3.0", projectKey: "phc_test", consentPath, env, fetch: fetchImpl });
}

describe("every core error class has a telemetry category", () => {
	const classes: Array<[string, Error]> = [
		["AuthError", new coreErrors.AuthError("x")],
		["ConfigurationError", new coreErrors.ConfigurationError("x")],
		["PlatformError", new coreErrors.PlatformError("x", "azure-devops")],
		["TemplateLoadError", new coreErrors.TemplateLoadError("x", "f")],
		["TemplateValidationError", new coreErrors.TemplateValidationError("x", [])],
		["TemplateCompositionError", new coreErrors.TemplateCompositionError("x")],
		["TemplateCreationError", new coreErrors.TemplateCreationError("x")],
		["CircularDependencyError", new coreErrors.CircularDependencyError("x", [])],
		["LLMGenerationError", new coreErrors.LLMGenerationError("x", "", [])],
		["GenerationTimeoutError", new coreErrors.GenerationTimeoutError(1000)],
		["ProjectGroundingError", new ProjectGroundingError("NOT_FOUND" as never, "x")],
		["ReferenceDocumentError", new ReferenceDocumentError("REFERENCE_UNAVAILABLE" as never, "x")],
		["CopilotAuthenticationError", new CopilotAuthenticationError()],
	];

	test.each(classes)("%s", (_name, error) => {
		const result = categorizeError(error);
		expect(result.outcome).toBe("failure");
		if (result.outcome === "failure") expect(result.errorCategory).not.toBe("unknown");
	});

	test("CancellationError is the cancelled outcome", () => {
		expect(categorizeError(new coreErrors.CancellationError("x"))).toEqual({ outcome: "cancelled" });
	});
});

const outcomeOf = (event: object): unknown => (event as { outcome: unknown }).outcome;

describe("buildGenerateTelemetryEvent", () => {
	const report = {
		dryRun: false,
		storiesProcessed: 4,
		storiesFailed: 1,
		tasksCalculated: 12,
		tasksCreated: 9,
	} as AtomizationReport;

	test("reports counts, mode and output as enums, booleans and numbers", () => {
		expect(
			buildGenerateTelemetryEvent({
				options: { execute: true, json: true, continueOnError: true },
				facts: { report },
				exitCode: ExitCode.Failure,
				durationMs: 250,
			}),
		).toEqual({
			event: "command_finished",
			action: "generate",
			outcome: "failure",
			durationMs: 250,
			mode: "execute",
			output: "json",
			continueOnError: true,
			storyCount: 4,
			taskCount: 9,
			failedStoryCount: 1,
		});
	});

	test("a dry run counts the Tasks it calculated", () => {
		const event = buildGenerateTelemetryEvent({
			options: {},
			facts: { report: { ...report, dryRun: true } },
			exitCode: 0,
			durationMs: 1,
		});
		expect(event).toMatchObject({ mode: "dry-run", outcome: "success", taskCount: 12 });
	});

	test("a thrown core error carries its category, never its message", () => {
		const event = buildGenerateTelemetryEvent({
			options: {},
			facts: {},
			exitCode: ExitCode.AuthFailure,
			error: new coreErrors.AuthError("pat=SECRET"),
			durationMs: 1,
		});
		expect(event).toMatchObject({ outcome: "failure", errorCategory: "auth" });
		expect(JSON.stringify(event)).not.toContain("SECRET");
	});

	test("a declined live confirmation and a stopped run are cancelled; a timeout is a failure", () => {
		const base = { options: {}, exitCode: 0, durationMs: 1 };
		expect(outcomeOf(buildGenerateTelemetryEvent({ ...base, facts: {}, error: new ExitError(ExitCode.Success) }))).toBe("cancelled");
		expect(
			outcomeOf(buildGenerateTelemetryEvent({ ...base, facts: { report: { ...report, stopped: { reason: "cancelled" } } as AtomizationReport } })),
		).toBe("cancelled");
		expect(
			buildGenerateTelemetryEvent({ ...base, facts: { report: { ...report, stopped: { reason: "timedOut" } } as AtomizationReport } }),
		).toMatchObject({ outcome: "failure", errorCategory: "timeout" });
	});
});

describe("exitWith", () => {
	let exit: ReturnType<typeof spyOn>;
	beforeEach(() => {
		exit = spyOn(process, "exit").mockImplementation((() => undefined) as never);
	});
	afterEach(() => exit.mockRestore());

	const event = { event: "session_started" } as const;

	test.each([
		["disabled", (): void => undefined],
		["enabled and answering", (): void => {
			setConsent(true, { path: consentPath });
		}],
		["enabled and failing", (): void => {
			setConsent(true, { path: consentPath });
		}],
	] as const)("exits with the same code when telemetry is %s", async (name, prepare) => {
		prepare();
		const failing = name === "enabled and failing";
		setTelemetryClientForTesting(
			makeClient((failing ? () => Promise.reject(new Error("down")) : async () => new Response("{}")) as unknown as typeof fetch),
		);
		await exitWith(ExitCode.Failure, { hint: false });
		expect(exit).toHaveBeenCalledWith(ExitCode.Failure);
	});

	test("never waits longer than 300 ms when PostHog hangs", async () => {
		setConsent(true, { path: consentPath });
		const client = makeClient((() => new Promise(() => {})) as unknown as typeof fetch);
		client.track(event as never);
		setTelemetryClientForTesting(client);
		const started = Date.now();
		await exitWith(ExitCode.Success, { hint: false });
		expect(Date.now() - started).toBeLessThan(600);
		expect(exit).toHaveBeenCalledWith(ExitCode.Success);
	});
});

describe("hint", () => {
	function run(overrides: Parameters<typeof maybeShowTelemetryHint>[0] = {}): { shown: boolean; show: ReturnType<typeof mock> } {
		const show = mock(() => {});
		const shown = maybeShowTelemetryHint({ isInteractive: () => true, env: {}, show, consentPath, ...overrides });
		return { shown, show };
	}

	test("is shown once, then recorded as nudged.cli", () => {
		expect(run().shown).toBe(true);
		expect(readConsent(consentPath).nudged.cli).toBe(true);
		resetTelemetryHintForTesting();
		expect(run().shown).toBe(false);
	});

	test("is not shown twice in one process", () => {
		expect(run().shown).toBe(true);
		rmSync(consentPath);
		expect(run().shown).toBe(false);
	});

	test("never in a non-TTY or CI session", () => {
		expect(run({ isInteractive: () => false }).shown).toBe(false);
		expect(existsSync(consentPath)).toBe(false);
	});

	test.each([{ ATOMIZE_TELEMETRY: "0" }, { DO_NOT_TRACK: "1" }])("never under env override %o", (env) => {
		expect(run({ env }).shown).toBe(false);
	});

	test("never once the user has decided", () => {
		setConsent(false, { path: consentPath });
		expect(run().shown).toBe(false);
	});
});

describe("atomize telemetry", () => {
	async function invoke(args: string[], env: Record<string, string> = {}) {
		const lines: string[] = [];
		const flush = mock(async () => {});
		const command = makeTelemetryCommand({ print: (line) => lines.push(line), env, flush, consentPath });
		command.exitOverride();
		await command.parseAsync(["node", "telemetry", ...args]);
		return { out: lines.join("\n"), flush };
	}

	test("enable states its scope, writes the choice, and creates the ID", async () => {
		const { out } = await invoke(["enable"]);
		expect(out).toContain("CLI, Studio and VS Code extension");
		const state = readConsent(consentPath);
		expect(state.enabled).toBe(true);
		expect(state.anonymousId).toBeDefined();
	});

	test("enable sends telemetry_enabled { source: command } when the client can send", async () => {
		const fetchMock = mock(async () => new Response("{}"));
		const client = makeClient(fetchMock as unknown as typeof fetch);
		setTelemetryClientForTesting(client);
		const command = makeTelemetryCommand({ print: () => {}, env: {}, flush: () => client.flush(300), consentPath });
		await command.parseAsync(["node", "telemetry", "enable"]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toMatchObject({ event: "telemetry_enabled", properties: { source: "command" } });
	});

	test("disable sends nothing, keeps the ID, and prints it with how to request deletion", async () => {
		const fetchMock = mock(async () => new Response("{}"));
		setTelemetryClientForTesting(makeClient(fetchMock as unknown as typeof fetch));
		await invoke(["enable"]);
		const id = readConsent(consentPath).anonymousId as string;
		fetchMock.mockClear();
		const { out } = await invoke(["disable"]);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(readConsent(consentPath)).toMatchObject({ enabled: false, anonymousId: id });
		expect(out).toContain(id);
		expect(out).toContain("atomize telemetry delete");
	});

	test("status reports an env override alongside the saved choice, what is collected, and the ID", async () => {
		await invoke(["enable"]);
		const id = readConsent(consentPath).anonymousId as string;
		const { out } = await invoke(["status"], { DO_NOT_TRACK: "1" });
		expect(out).toContain("Disabled");
		expect(out).toContain("DO_NOT_TRACK");
		expect(out).toContain("your saved choice: enabled");
		expect(out).toContain("Collected when enabled");
		expect(out).toContain("Never collected");
		expect(out).toContain(id);
	});

	test("status when undecided says nothing is sent", async () => {
		const { out } = await invoke(["status"]);
		expect(out).toContain("not decided");
		expect(out).toContain("none yet");
	});

	test("delete sends a deletion request then disables, even if already disabled", async () => {
		await invoke(["enable"]);
		const id = readConsent(consentPath).anonymousId as string;
		await invoke(["disable"]);
		const fetchMock = mock(async () => new Response("{}"));
		const client = makeClient(fetchMock as unknown as typeof fetch);
		setTelemetryClientForTesting(client);
		const command = makeTelemetryCommand({ print: () => {}, env: {}, flush: () => client.flush(300), consentPath });
		await command.parseAsync(["node", "telemetry", "delete"]);
		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toMatchObject({ event: "telemetry_deletion_requested", distinct_id: id });
		expect(readConsent(consentPath)).toMatchObject({ enabled: false, anonymousId: id });
	});

	test("delete with no Anonymous ID sends nothing", async () => {
		const fetchMock = mock(async () => new Response("{}"));
		setTelemetryClientForTesting(makeClient(fetchMock as unknown as typeof fetch));
		const { out } = await invoke(["delete"]);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(out).toContain("Nothing to delete");
		expect(existsSync(consentPath)).toBe(false);
	});

	test("the consent file is written owner-only", async () => {
		await invoke(["enable"]);
		expect(readFileSync(consentPath, "utf8")).toContain('"version": 1');
	});
});
