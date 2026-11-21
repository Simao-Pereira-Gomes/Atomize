import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { commandFinishedSchema, ERROR_CATEGORIES, OUTCOMES, SURFACES, TELEMETRY_ACTIONS, telemetryEventSchema } from "@sppg2001/atomize-telemetry";
import { TELEMETRY_CONTACT_EMAIL, TELEMETRY_DOCS_URL } from "@sppg2001/atomize-telemetry/docs";
import { z } from "zod";

const root = resolve(import.meta.dir, "../../../..");
const page = readFileSync(resolve(import.meta.dir, "../content/docs/telemetry.md"), "utf8");

/** Rows of every Markdown table whose header's first cell is `title`, as cell arrays. */
function table(title: string): string[][] {
	const lines = page.replace(/<!--.*?-->/g, "").split("\n");
	const rows: string[][] = [];
	let found = false;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] as string;
		if (!line.startsWith("|") || cells(line)[0] !== title) continue;
		found = true;
		for (const row of lines.slice(index + 2)) {
			if (!row.startsWith("|")) break;
			rows.push(cells(row));
		}
	}
	if (!found) throw new Error(`The telemetry page has no table headed "${title}".`);
	return rows;
}
const cells = (line: string) => line.slice(1, line.lastIndexOf("|")).split("|").map((cell) => cell.trim());
const ticks = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1] as string);

type Json = { properties?: Record<string, Json>; enum?: string[]; const?: string; type?: string; anyOf?: Json[]; oneOf?: Json[] };
/** Every concrete event shape in a schema, however its unions are nested. */
const variants = (schema: z.ZodType): Json[] => {
	const leaves: Json[] = [];
	const visit = (node: Json): void => {
		const branches = node.oneOf ?? node.anyOf;
		if (branches) for (const branch of branches) visit(branch);
		else leaves.push(node);
	};
	visit(z.toJSONSchema(schema, { io: "input" }) as Json);
	return leaves;
};
const ENVELOPE = ["surface", "atomizeVersion", "runtimeVersion", "os", "anonymousId", "timestamp"];
const COMMON = [...ENVELOPE, "event", "action", "outcome", "errorCategory", "durationMs"];

/** How a prop is written on the page: its enum values, `boolean`, or `count`. */
function describe_(prop: Json): string[] {
	if (prop.enum) return prop.enum;
	return [prop.type === "boolean" ? "boolean" : prop.type === "integer" ? "count" : (prop.type ?? "?")];
}

/** `prop (a, b); other (boolean)` cells, parsed into prop -> values. */
function parseProps(cell: string): Map<string, string[]> {
	const props = new Map<string, string[]>();
	if (/^none$/i.test(cell.trim())) return props;
	for (const item of cell.split(";")) {
		const [name, ...values] = ticks(item);
		if (!name) continue;
		const kind = /\((boolean|count)\)/.exec(item)?.[1];
		props.set(name, kind ? [kind] : values);
	}
	return props;
}

describe("the telemetry page matches the event schema", () => {
	test("every action is documented, and only those", () => {
		const documented = table("Action").map((row) => ticks(row[0] ?? "")[0]);
		expect(documented.sort()).toEqual([...TELEMETRY_ACTIONS].sort());
	});

	test("every action lists exactly its props, with their allowed values", () => {
		const rows = new Map(table("Action").map((row) => [ticks(row[0] ?? "")[0] as string, parseProps(row[2] ?? "")]));
		for (const variant of variants(commandFinishedSchema)) {
			const action = variant.properties?.action?.const as string;
			const expected = new Map(
				Object.entries(variant.properties ?? {})
					.filter(([name]) => !COMMON.includes(name))
					.map(([name, prop]) => [name, describe_(prop)] as const),
			);
			const documented = rows.get(action);
			expect(documented, `${action} is on the page`).toBeDefined();
			expect([...(documented ?? new Map()).keys()].sort(), `${action} props`).toEqual([...expected.keys()].sort());
			for (const [name, values] of expected) expect([...(documented?.get(name) ?? [])].sort(), `${action}.${name}`).toEqual([...values].sort());
		}
	});

	test("every event type is documented, with its extra props", () => {
		const documented = new Map(table("Event").map((row) => [ticks(row[0] ?? "")[0] as string, parseProps(row[2] ?? "")]));
		const all = variants(telemetryEventSchema);
		const events = new Set(all.map((variant) => variant.properties?.event?.const as string));
		expect([...documented.keys()].sort()).toEqual([...events].sort());
		for (const variant of all) {
			const event = variant.properties?.event?.const as string;
			if (event === "command_finished") continue; // its props are the action table's
			const extra = Object.entries(variant.properties ?? {}).filter(([name]) => !COMMON.includes(name));
			expect([...(documented.get(event) ?? new Map()).keys()].sort(), `${event} props`).toEqual(extra.map(([name]) => name).sort());
			for (const [name, prop] of extra) expect([...(documented.get(event)?.get(name) ?? [])].sort()).toEqual([...describe_(prop)].sort());
		}
	});

	test("the fields on every event are the envelope", () => {
		expect(table("Field").slice(0, ENVELOPE.length).map((row) => ticks(row[0] ?? "")[0])).toEqual(ENVELOPE);
		const rows = new Map(table("Field").map((row) => [ticks(row[0] ?? "")[0] as string, row[1] ?? ""]));
		expect(ticks(rows.get("surface") ?? "").sort()).toEqual([...SURFACES].sort());
		expect(ticks(rows.get("os") ?? "").sort()).toEqual(["darwin", "linux", "other", "win32"]);
	});

	test("the ending of a command_finished is documented: outcomes and error categories", () => {
		const rows = new Map(table("Field").map((row) => [ticks(row[0] ?? "")[0] as string, row[1] ?? ""]));
		expect(ticks(rows.get("outcome") ?? "").sort()).toEqual([...OUTCOMES].sort());
		expect(ticks(rows.get("errorCategory") ?? "").sort()).toEqual([...ERROR_CATEGORIES].sort());
		for (const field of ["action", "durationMs"]) expect(rows.has(field)).toBe(true);
	});

	test("the drift guard fails when the page is missing an action", () => {
		const without = page.replace(/^\| `template\.migrate` .*\n/m, "");
		expect(without).not.toBe(page);
		const documented = without.split("\n").filter((line) => /^\| `[a-zA-Z.]+` \|/.test(line)).map((line) => ticks(line)[0]);
		expect(documented).not.toContain("template.migrate");
	});
});

describe("every Learn more points at the published page", () => {
	const site = /site:\s*"([^"]+)"/.exec(readFileSync(resolve(import.meta.dir, "../../astro.config.mjs"), "utf8"))?.[1];

	test("the shared URL is the site's telemetry page", () => {
		expect(TELEMETRY_DOCS_URL).toBe(`${site}/telemetry/`);
		expect(statSync(resolve(import.meta.dir, "../content/docs/telemetry.md")).isFile()).toBe(true);
	});

	test("the page's deletion email is the shared contact address", () => {
		expect(page).toContain(`[${TELEMETRY_CONTACT_EMAIL}](mailto:${TELEMETRY_CONTACT_EMAIL})`);
		expect(page).not.toMatch(/to be added before release/);
	});

	test("the page is in the sidebar", () => {
		expect(readFileSync(resolve(import.meta.dir, "../../astro.config.mjs"), "utf8")).toContain('slug: "telemetry"');
	});

	test("no surface hard-codes its own copy of the URL; each takes it from the telemetry package", () => {
		const sources = [
			"packages/cli/src",
			"packages/vscode-extension/src",
			"packages/atomize-studio/src",
			"packages/atomize-sidecar/src",
			"packages/atomize-telemetry/src",
		].flatMap((dir) => walk(join(root, dir)));
		const copies = sources.filter((file) => /atomize-docs\.pages\.dev\/telemetry/.test(readFileSync(file, "utf8")));
		expect(copies.map((file) => file.slice(root.length + 1))).toEqual(["packages/atomize-telemetry/src/docs.ts"]);
	});

	test.each([
		["packages/cli/src/cli/telemetry/telemetry-hint.ts"],
		["packages/cli/src/cli/commands/telemetry.command.ts"],
		["packages/vscode-extension/src/telemetry/extension-telemetry.ts"],
		["packages/atomize-studio/src/components/UsageDataSettings.tsx"],
	])("%s links to it through the shared constant", (file) => {
		expect(readFileSync(join(root, file), "utf8")).toMatch(/TELEMETRY_DOCS_URL/);
	});
});

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path);
		return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
	});
}
