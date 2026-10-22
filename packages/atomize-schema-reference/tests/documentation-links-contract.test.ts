import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import GithubSlugger from "github-slugger";
import { describe, expect, it } from "vitest";
import schema from "../schema/atomize-template.schema.json";
import { normalizeDocumentPath, parsePermalink } from "../src/permalinks";
import { buildSchemaTrees } from "../src/tree";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const guide = readFileSync(join(root, "docs/Template-Reference.md"), "utf8");
const trees = buildSchemaTrees(schema);
const ignored = new Set(["node_modules", "target", "dist", "build"]);

function markdownFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		if (entry.name.startsWith(".") || ignored.has(entry.name)) return [];
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return markdownFiles(path);
		return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
	});
}

function headings(markdown: string): Set<string> {
	const anchors = new Set<string>();
	const slugger = new GithubSlugger();
	let fence: string | undefined;
	for (const line of markdown.split("\n")) {
		const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (marker) {
			if (!fence) fence = marker[1];
			else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
			continue;
		}
		if (fence) continue;
		const heading = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
		if (heading) anchors.add(slugger.slug(heading[1].replace(/[`*_]/g, "")));
	}
	return anchors;
}

describe("Documentation reference contracts", () => {
	it("keeps field tables in the Schema Reference and behaviour in the guide", () => {
		expect(guide).not.toMatch(/^\|\s*(?:Field|Property|ADO field type)\s*\|/m);
		const anchors = headings(guide);
		for (const heading of ["composition", "variable-interpolation", "assignment-patterns", "conditional-tasks", "estimation", "complete-example"]) {
			expect(anchors.has(heading), heading).toBe(true);
		}
	});

	it("every public Schema Reference permalink in repository docs targets an exact schema field", () => {
		let links = 0;
		for (const file of markdownFiles(root)) {
			const text = readFileSync(file, "utf8");
			for (const match of text.matchAll(/https:\/\/atomize-docs\.pages\.dev\/schema#([^\s)<>"`]+)/g)) {
				const permalink = parsePermalink(match[1]);
				const label = `${relative(root, file)}: ${match[0]}`;
				expect(permalink, label).toBeDefined();
				if (!permalink) continue;
				expect(normalizeDocumentPath(trees, permalink.path, permalink.tab), label)
					.toBe(`${permalink.tab}.${permalink.path}`);
				links++;
			}
		}
		expect(links).toBeGreaterThan(0);
	});

	it("no repository doc links to a removed Template Reference heading", () => {
		const anchors = headings(guide);
		for (const file of markdownFiles(root)) {
			const text = readFileSync(file, "utf8");
			const pattern = file === join(root, "docs/Template-Reference.md")
				? /\]\((?:[^\s)]*Template-Reference\.md)?#([^\s)]+)\)/g
				: /\]\([^\s)]*Template-Reference\.md#([^\s)]+)\)/g;
			for (const match of text.matchAll(pattern)) {
				expect(anchors.has(decodeURIComponent(match[1])), `${relative(root, file)}: ${match[0]}`).toBe(true);
			}
		}
	});
});
