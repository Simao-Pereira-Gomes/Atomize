import { describe, expect, it } from "vitest";
import schema from "../schema/atomize-template.schema.json";
import {
	buildPermalink,
	normalizeDocumentPath,
	parsePermalink,
} from "../src/permalinks";
import { buildSchemaTrees, type SchemaNode } from "../src/tree";

const properties = {
	name: { type: "string" },
	extends: { type: "string" },
	estimation: { type: "object", properties: { strategy: { type: "string" } } },
	tasks: {
		type: "array",
		items: {
			type: "object",
			properties: {
				id: { type: "string" },
				condition: {
					anyOf: [
						{ type: "object", properties: { field: { type: "string" } } },
						{ type: "object", properties: { customField: { type: "string" } } },
					],
				},
				customFields: {
					type: "object",
					additionalProperties: { type: "string" },
				},
				estimationPercentCondition: {
					type: "array",
					items: {
						type: "object",
						properties: { percent: { type: "number" } },
					},
				},
			},
		},
	},
};
const trees = buildSchemaTrees({
	anyOf: [
		{ properties, required: ["name", "tasks"] },
		{ properties, required: ["extends"] },
		{
			properties: { name: properties.name, tasks: properties.tasks },
			required: ["name", "tasks"],
		},
	],
});

describe("Permalinks", () => {
	it("round-trips Template and Mixin paths, including nested array items", () => {
		for (const tab of ["template", "mixin"] as const) {
			for (const path of [
				"name",
				"tasks[]",
				"tasks[].condition",
				"tasks[].estimationPercentCondition[].percent",
				"metadata.*",
			]) {
				const link = buildPermalink(tab, path);
				expect(parsePermalink(link)).toEqual({ tab, path });
				expect(parsePermalink(`#${link}`)).toEqual({ tab, path });
				expect(parsePermalink(`#${encodeURIComponent(link)}`)).toEqual({
					tab,
					path,
				});
			}
		}
	});

	it("rejects malformed fragments and invalid paths", () => {
		for (const fragment of [
			"",
			"#",
			"template",
			"templateX",
			"#template.",
			"other.name",
			"Template.name",
			"template..name",
			"template.tasks[2].id",
			"template.tasks[-1].id",
			"template.tasks[1.5].id",
			"template.tasks[",
			"template.name.",
			"template.a b",
			"template.a#b",
			"template.%ZZ",
			"##template.name",
			"https://example.com/schema#template.name",
		]) {
			expect(parsePermalink(fragment)).toBeUndefined();
		}
		expect(() => buildPermalink("template", "tasks[2].id")).toThrow();
	});

	it("normalizes concrete indices at every array level", () => {
		expect(normalizeDocumentPath(trees, "tasks[2].condition")).toBe(
			"template.tasks[].condition",
		);
		expect(
			normalizeDocumentPath(
				trees,
				"tasks[12].estimationPercentCondition[0].percent",
			),
		).toBe("template.tasks[].estimationPercentCondition[].percent");
		expect(normalizeDocumentPath(trees, "tasks[].id")).toBe(
			"template.tasks[].id",
		);
	});

	it("defaults shared task fields to Template and respects an explicit Mixin tab", () => {
		expect(normalizeDocumentPath(trees, "tasks[0].id")).toBe(
			"template.tasks[].id",
		);
		expect(normalizeDocumentPath(trees, "tasks[0].id", "mixin")).toBe(
			"mixin.tasks[].id",
		);
		expect(
			normalizeDocumentPath(trees, "estimation.strategy", "mixin"),
		).toBeUndefined();
	});

	it("falls back to the nearest ancestor, including array items", () => {
		expect(
			normalizeDocumentPath(trees, "tasks[2].condition.deletedField"),
		).toBe("template.tasks[].condition");
		expect(
			normalizeDocumentPath(trees, "tasks[2].deletedField.deeplyNested"),
		).toBe("template.tasks[]");
		expect(normalizeDocumentPath(trees, "name[0]")).toBe("template.name");
		expect(normalizeDocumentPath(trees, "missing.field")).toBeUndefined();
		expect(normalizeDocumentPath(trees, "tasks[-1].id")).toBeUndefined();
	});

	it("normalizes dictionary entries to their schema value field", () => {
		expect(
			normalizeDocumentPath(trees, "tasks[1].customFields.ClientTier"),
		).toBe("template.tasks[].customFields.*");
	});

	it("resolves fields within a union alternative", () => {
		expect(normalizeDocumentPath(trees, "tasks[1].condition.customField")).toBe(
			"template.tasks[].condition.customField",
		);
	});

	it("round-trips and resolves every field in the generated schema", () => {
		const trees = buildSchemaTrees(schema);
		function verify(nodes: SchemaNode[], tab: "template" | "mixin") {
			for (const node of nodes) {
				expect(parsePermalink(node.permalink)).toEqual({
					tab,
					path: node.path,
				});
				expect(normalizeDocumentPath(trees, node.path, tab)).toBe(
					node.permalink,
				);
				verify(node.children, tab);
				verify(node.alternatives, tab);
			}
		}
		verify(trees.template, "template");
		verify(trees.mixin, "mixin");
	});
});
