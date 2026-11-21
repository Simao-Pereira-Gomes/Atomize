import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const workflows = resolve(import.meta.dir, "../.github/workflows");
const publishFiles = readdirSync(workflows).filter((name) => /^publish-.*\.yml$/.test(name));

/** `on.push.paths` and the release-notes `--paths` must be the same set (docs/agents/release-notes.md rule 6). */
describe("publish workflows keep their path lists in sync", () => {
	test("there are publish workflows to check", () => {
		expect(publishFiles.length).toBeGreaterThanOrEqual(3);
	});

	test.each(publishFiles)("%s: on.push.paths equals --paths", (name) => {
		const text = readFileSync(resolve(workflows, name), "utf8");
		const workflow = parse(text) as { on: { push: { paths: string[] } } };
		// A workflow also triggers on its own file; only package paths belong in the release-notes closure.
		const triggers = workflow.on.push.paths.filter((path) => path.startsWith("packages/")).map((path) => path.replace(/\/\*\*$/, "")).sort();
		const passed = [...text.matchAll(/--paths\s+(packages\/[^\s\\]+)/g)].flatMap((match) => (match[1] as string).split(",")).sort();
		expect(passed).toEqual(triggers);
	});

	test.each(publishFiles)("%s: includes atomize-telemetry when its surface bundles it", (name) => {
		const text = readFileSync(resolve(workflows, name), "utf8");
		expect(text).toContain("packages/atomize-telemetry");
	});
});
