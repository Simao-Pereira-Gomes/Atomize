import { describe, expect, it } from "vitest";
import schema from "../schema/atomize-template.schema.json";
import { searchSchemaTree } from "../src/search";
import { buildSchemaTrees, type SchemaNode } from "../src/tree";

function field(
	name: string,
	children: SchemaNode[] = [],
	description = "",
): SchemaNode {
	return {
		name,
		path: name,
		permalink: `template.${name}`,
		type: "object",
		requirement: "optional",
		constraints: {},
		description,
		deprecated: false,
		rules: [],
		examples: [],
		children,
		alternatives: [],
		recursive: false,
	};
}

describe("Tree Search", () => {
	const tree = [
		field("estimation", [
			field("strategy"),
			field("conversion", [], "Translate the Story Estimate"),
		]),
		field("name"),
	];

	it("finds nested names case-insensitively and keeps ancestors", () => {
		const result = searchSchemaTree(tree, " STRATEGY ");
		expect(result.map((node) => node.name)).toEqual(["estimation"]);
		expect(result[0].children.map((node) => node.name)).toEqual(["strategy"]);
	});
	it("matches descriptions", () => {
		expect(
			searchSchemaTree(tree, "story estimate")[0].children.map(
				(node) => node.name,
			),
		).toEqual(["conversion"]);
	});
	it("returns the original full tree for an empty query", () => {
		expect(searchSchemaTree(tree, "  ")).toBe(tree);
	});
	it("returns no results for an unknown field without modifying the input", () => {
		expect(searchSchemaTree(tree, "unknown-field")).toEqual([]);
		expect(tree[0].children).toHaveLength(2);
	});
	it("finds nested fields within union alternatives and arrays", () => {
		const union = field("condition");
		union.alternatives = [
			field("Alternative 1", [field("customField")]),
			field("Alternative 2", [field("operator")]),
		];
		const result = searchSchemaTree(
			[field("tasks", [field("[]", [union])])],
			"customField",
		);
		const condition = result[0].children[0].children[0];
		expect(condition.name).toBe("condition");
		expect(condition.alternatives).toHaveLength(1);
		expect(condition.alternatives[0].children[0].name).toBe("customField");
	});
	it("finds strategy and conversion in the real schema", () => {
		const trees = buildSchemaTrees(schema);
		for (const query of ["strategy", "conversion"]) {
			const result = searchSchemaTree(trees.template, query);
			expect(result.some((node) => node.name === "estimation")).toBe(true);
			expect(
				result
					.find((node) => node.name === "estimation")
					?.children.some((node) => node.name === query),
			).toBe(true);
		}
	});
});
