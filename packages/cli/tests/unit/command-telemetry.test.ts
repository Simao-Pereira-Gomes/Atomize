import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CancellationError, ConfigurationError } from "@sppg2001/atomize-core/utils/errors";
import type { TelemetryClient, TelemetryEventInput } from "@sppg2001/atomize-telemetry";
import { previewCommand } from "@/cli/commands/preview.command";
import { makeTelemetryCommand } from "@/cli/commands/telemetry.command";
import { templateResolveCommand } from "@/cli/commands/template/template-resolve.command";
import { validateCommand } from "@/cli/commands/validate.command";
import { setTelemetryClientForTesting } from "@/cli/telemetry/telemetry";
import { tracked } from "@/cli/telemetry/tracked";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";

const fixtures = resolve(import.meta.dir, "../fixtures/templates");

let events: TelemetryEventInput[];
let exit: ReturnType<typeof spyOn>;
let stdout: ReturnType<typeof spyOn>;

beforeEach(() => {
	events = [];
	const client: TelemetryClient = {
		track: (event) => void events.push(event),
		requestDeletion: () => false,
		flush: async () => {},
	};
	setTelemetryClientForTesting(client);
	exit = spyOn(process, "exit").mockImplementation((() => undefined) as never);
	stdout = spyOn(process.stdout, "write").mockImplementation((() => true) as never);
});
afterEach(() => {
	exit.mockRestore();
	stdout.mockRestore();
	setTelemetryClientForTesting(undefined);
});

const finished = () => events.filter((event) => event.event === "command_finished") as Array<Record<string, unknown>>;

describe("tracked", () => {
	const run = (handler: () => Promise<void>) => tracked("auth.list", {}, async () => handler())();

	test("a normal return is one success and does not exit", async () => {
		await run(async () => {});
		expect(finished()).toHaveLength(1);
		expect(finished()[0]).toMatchObject({ action: "auth.list", outcome: "success" });
		expect(exit).not.toHaveBeenCalled();
	});

	test("an ExitError keeps its code and reports a failure", async () => {
		await run(async () => {
			throw new ExitError(ExitCode.NoMatch);
		});
		expect(finished()[0]).toMatchObject({ outcome: "failure" });
		expect(exit).toHaveBeenCalledWith(ExitCode.NoMatch);
	});

	test("ExitError(0), a declined confirmation or Ctrl+C, is cancelled and exits 0", async () => {
		await run(async () => {
			throw new ExitError(ExitCode.Success);
		});
		expect(finished()[0]).toMatchObject({ outcome: "cancelled" });
		expect(exit).toHaveBeenCalledWith(0);
	});

	test("a CancellationError is cancelled", async () => {
		await run(async () => {
			throw new CancellationError("stop");
		});
		expect(finished()[0]).toMatchObject({ outcome: "cancelled" });
		expect(exit).toHaveBeenCalledWith(0);
	});

	test("any other error is a failure exiting 1 with its category and never its message", async () => {
		await run(async () => {
			throw new ConfigurationError("token=SECRET");
		});
		expect(finished()[0]).toMatchObject({ outcome: "failure", errorCategory: "config" });
		expect(JSON.stringify(events)).not.toContain("SECRET");
		expect(exit).toHaveBeenCalledWith(ExitCode.Failure);
	});

	test("a command can end non-zero and still have succeeded", async () => {
		await tracked("validate", { mode: "offline", valid: false, issueCount: 0 }, async (r) => {
			r.set({ valid: false, issueCount: 2 });
			r.exitWith(ExitCode.Failure);
		})();
		expect(finished()[0]).toMatchObject({ outcome: "success", valid: false, issueCount: 2 });
		expect(exit).toHaveBeenCalledWith(ExitCode.Failure);
	});
});

describe("commands report exactly one command_finished", () => {
	test("validate: a valid Template", async () => {
		await validateCommand.parseAsync(["node", "validate", join(fixtures, "valid-template.yaml"), "--quiet"]);
		expect(finished()).toHaveLength(1);
		expect(finished()[0]).toMatchObject({ action: "validate", outcome: "success", mode: "offline", valid: true });
		expect(exit).not.toHaveBeenCalled();
	});

	test("validate: an invalid Template is a success with valid: false, still exiting 1", async () => {
		await validateCommand.parseAsync(["node", "validate", join(fixtures, "invalid-estimation.yaml"), "--quiet"]);
		expect(finished()).toHaveLength(1);
		const [event] = finished();
		expect(event).toMatchObject({ action: "validate", outcome: "success", valid: false });
		expect(event?.issueCount as number).toBeGreaterThan(0);
		expect(exit).toHaveBeenCalledWith(ExitCode.Failure);
	});

	test("validate: a Template that cannot be read is a failure", async () => {
		await validateCommand.parseAsync(["node", "validate", join(fixtures, "does-not-exist.yaml"), "--output", "json"]);
		expect(finished()).toHaveLength(1);
		expect(finished()[0]).toMatchObject({ action: "validate", outcome: "failure" });
		expect(exit).toHaveBeenCalledWith(ExitCode.Failure);
	});

	test("preview --inspect", async () => {
		await previewCommand.parseAsync(["node", "preview", join(fixtures, "valid-template.yaml"), "--inspect"]);
		expect(finished()).toHaveLength(1);
		expect(finished()[0]).toMatchObject({ action: "preview", outcome: "success", variant: "inspect" });
	});

	test("preview with conflicting flags fails with exit 1", async () => {
		const stderr = spyOn(process.stderr, "write").mockImplementation((() => true) as never);
		await previewCommand.parseAsync(["node", "preview", "x.yaml", "--inspect", "--mock-story", "{}"]);
		stderr.mockRestore();
		expect(finished()[0]).toMatchObject({ action: "preview", outcome: "failure" });
		expect(exit).toHaveBeenCalledWith(ExitCode.Failure);
	});

	test("template resolve", async () => {
		await templateResolveCommand.parseAsync(["node", "resolve", join(fixtures, "valid-template.yaml"), "--quiet"]);
		expect(finished()).toHaveLength(1);
		expect(finished()[0]).toMatchObject({ action: "template.resolve", outcome: "success" });
	});

	test("telemetry status", async () => {
		const home = mkdtempSync(join(tmpdir(), "atomize-status-"));
		try {
			const command = makeTelemetryCommand({ print: () => {}, env: {}, consentPath: join(home, "telemetry.json") });
			await command.parseAsync(["node", "telemetry", "status"]);
			expect(finished()).toHaveLength(1);
			expect(finished()[0]).toMatchObject({ action: "telemetry.status", outcome: "success" });
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

const commandsDir = resolve(import.meta.dir, "../../src/cli/commands");
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
	});
}

describe("coverage guards", () => {
	test("every CLI action in the Telemetry Action table is reported by a command", () => {
		const source = sourceFiles(commandsDir).map((file) => readFileSync(file, "utf8")).join("\n");
		const cliActions = [
			"preview", "validate", "template.create", "template.improve", "catalog.list", "catalog.install",
			"catalog.remove", "template.resolve", "template.migrate", "template.metadata", "auth.add", "auth.remove",
			"auth.rotate", "auth.test", "auth.use", "auth.list", "fields.list", "queries.list", "telemetry.status",
		];
		for (const action of cliActions) expect(source).toContain(`tracked("${action}"`);
		expect(source).toContain('action: "generate"');
	});

	test("no process.exit remains outside exitWith", () => {
		const srcDir = resolve(import.meta.dir, "../../src");
		const offenders = sourceFiles(srcDir)
			.filter((file) => !file.endsWith(join("telemetry", "telemetry.ts")))
			.flatMap((file) =>
				readFileSync(file, "utf8")
					.split("\n")
					.map((line, index) => ({ file, line: line.trim(), number: index + 1 }))
					.filter(({ line }) => /process\.exit\(/.test(line) && !line.startsWith("*") && !line.startsWith("//")),
			);
		expect(offenders).toEqual([]);
	});
});

