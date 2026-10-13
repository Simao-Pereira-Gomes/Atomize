import { readFileSync } from "node:fs";
import GithubSlugger from "github-slugger";
import { describe, expect, it } from "vitest";
import schema from "../schema/atomize-template.schema.json";
import { buildSchemaTrees, type SchemaNode } from "../src/tree";

const guide = readFileSync(
	new URL("../../../docs/Template-Reference.md", import.meta.url),
	"utf8",
);
const slugger = new GithubSlugger();
const anchors = new Set<string>();
let fence: string | undefined;
for (const line of guide.split("\n")) {
	const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
	if (marker) {
		if (!fence) fence = marker[1];
		else if (
			marker[1][0] === fence[0] &&
			marker[1].length >= fence.length
		) fence = undefined;
		continue;
	}
	if (fence) continue;
	const heading = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
	if (heading) anchors.add(slugger.slug(heading[1].replace(/[`*_]/g, "")));
}

function flatten(nodes: SchemaNode[]): SchemaNode[] {
	return nodes.flatMap((node) => [
		node,
		...flatten(node.children),
		...flatten(node.alternatives),
	]);
}

describe("Template Reference guide contracts", () => {
	it("every generated guide anchor names an existing heading outside code blocks", () => {
		const documented: string[] = [];
		function visit(value: unknown) {
			if (!value || typeof value !== "object") return;
			for (const [key, child] of Object.entries(value)) {
				if (key === "x-atomize-guide") {
					expect(typeof child).toBe("string");
					expect(anchors.has(child as string), `Missing heading: ${child}`).toBe(true);
					documented.push(child as string);
				} else visit(child);
			}
		}
		visit(schema);
		expect(documented.length).toBeGreaterThan(0);
	});

	it("guide anchors survive generation and tree building for Templates and shared Mixin fields", () => {
		const trees = buildSchemaTrees(schema);
		const template = flatten(trees.template);
		for (const [path, anchor] of [
			["extends", "inheritance-extends"],
			["mixins", "mixins-mixins"],
			["filter.savedQuery", "savedquery"],
			["filter.changedAfter", "date-filters"],
			["filter.areaPathsUnder", "area-paths-exact-vs-descendants"],
			["filter.iterationsUnder", "iterations-exact-vs-descendants"],
			["tasks[].condition", "conditional-tasks"],
			["tasks[].estimationPercentCondition", "conditional-estimation"],
			["tasks[].assignTo", "assignment-patterns"],
			["tasks[].customFields", "task-custom-fields"],
			["tasks[].repeat", "repeated-tasks"],
			["tasks[].dependsOn", "task-dependencies"],
			["estimation.normalize", "estimation"],
			["validation.taskEstimationRange", "validation"],
			["metadata.notes", "metadata"],
		]) {
			expect(template.find((node) => node.path === path)?.guideAnchor, path).toBe(anchor);
		}
		const mixin = flatten(trees.mixin);
		for (const path of ["tasks[].condition", "tasks[].assignTo", "tasks[].repeat"]) {
			expect(mixin.find((node) => node.path === path)?.guideAnchor, path).toBe(
				template.find((node) => node.path === path)?.guideAnchor,
			);
		}
	});
});
