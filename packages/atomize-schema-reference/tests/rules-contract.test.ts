import { describe, expect, it } from "vitest";
import schema from "../schema/atomize-template.schema.json";
import { wholeFileRules } from "../src/rules";
import { buildSchemaTrees, type SchemaNode, type SchemaTab } from "../src/tree";

const trees = buildSchemaTrees(schema);
function flatten(nodes: SchemaNode[]): SchemaNode[] {
	return nodes.flatMap((node) => [
		node,
		...flatten(node.children),
		...flatten(node.alternatives),
	]);
}
const nodes = {
	template: flatten(trees.template),
	mixin: flatten(trees.mixin),
};
const at = (tab: SchemaTab, path: string) =>
	nodes[tab].filter((node) => node.path === path);

describe("Runtime rule contracts", () => {
	it("every whole-file rule points at an existing field and is attached there", () => {
		for (const rule of wholeFileRules) {
			const targets = at(rule.tab, rule.path);
			expect(
				targets.length,
				`${rule.tab}.${rule.path} must exist`,
			).toBeGreaterThan(0);
			for (const target of targets)
				expect(target.rules).toEqual(expect.arrayContaining([...rule.rules]));
		}
	});

	it("field rules survive generation for every documented refinement", () => {
		for (const path of [
			"filter.changedAfter",
			"filter.createdAfter",
			"filter.savedQuery",
			"tasks[].id",
			"tasks[].dependsOn",
			"tasks[].repeat",
			"tasks[].customFields",
			"tasks[].condition",
			"tasks[].condition.operator",
			"tasks[].estimationPercentCondition[].condition.operator",
			"estimation.conversion",
			"estimation.conversion.table",
			"estimation.conversion.multipliers",
			"estimation.defaultParentEstimation",
			"estimation.minimumTaskPoints",
			"validation.maxRepeat",
			"validation.requiredTasks",
		]) {
			expect(
				at("template", path).some((node) => node.rules.length > 0),
				path,
			).toBe(true);
		}
	});

	it("shared task rules appear for Mixins without adding Template-only whole-file rules", () => {
		expect(at("mixin", "tasks")[0].rules).toEqual([]);
		for (const path of [
			"tasks[].id",
			"tasks[].repeat",
			"tasks[].dependsOn",
			"tasks[].customFields",
		]) {
			expect(at("mixin", path)[0].rules.length, path).toBeGreaterThan(0);
		}
		expect(
			at("mixin", "tasks[].repeat")[0].rules.some((rule) =>
				rule.includes("Mixin defers"),
			),
		).toBe(true);
	});

	it("distinguishes standard multi-value condition operators from custom-field operators", () => {
		const operators = at("template", "tasks[].condition.operator");
		expect(
			operators.some((node) =>
				node.rules.some((rule) => rule.includes("tags")),
			),
		).toBe(true);
		expect(operators.some((node) => node.rules.length === 0)).toBe(true);
	});
});
