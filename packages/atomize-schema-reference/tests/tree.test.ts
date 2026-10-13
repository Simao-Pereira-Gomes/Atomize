import { describe, expect, it } from "vitest";
import schema from "../schema/atomize-template.schema.json";
import { buildSchemaTrees, type JsonSchema } from "../src/tree";

function document(field: JsonSchema = { type: "string" }): JsonSchema {
	return {
		$defs: { label: { type: "string", description: "A reusable label" } },
		anyOf: [
			{
				type: "object",
				properties: {
					name: field,
					extends: { type: "string" },
					tasks: {
						type: "array",
						items: {
							type: "object",
							properties: { title: { $ref: "#/$defs/label" } },
							required: ["title"],
						},
					},
				},
				required: ["name", "tasks"],
			},
			{
				type: "object",
				properties: {
					name: field,
					extends: { type: "string" },
					tasks: { type: "array" },
				},
				required: ["extends"],
			},
			{ type: "object", properties: { name: field }, required: ["name"] },
		],
	};
}

describe("Schema Tree Builder", () => {
	it("merges Template branches, retaining standalone task requirements and a separate Mixin", () => {
		const trees = buildSchemaTrees(document());
		expect(trees.template.map((node) => [node.name, node.requirement])).toEqual(
			[
				["name", "unless-extends"],
				["extends", "optional"],
				["tasks", "unless-extends"],
			],
		);
		expect(trees.mixin.map((node) => [node.name, node.requirement])).toEqual([
			["name", "required"],
		]);
		const title = trees.template[2].children[0].children[0];
		expect(title).toMatchObject({
			path: "tasks[].title",
			permalink: "template.tasks[].title",
			requirement: "required",
			type: "string",
			description: "A reusable label",
		});
	});

	it("extracts defaults (including false), allowed values, constraints and deprecation", () => {
		const field = {
			type: ["string", "null"],
			default: false,
			enum: ["a", null],
			minLength: 1,
			maxLength: 8,
			pattern: "^a",
			deprecated: true,
			description: "Label",
		};
		expect(buildSchemaTrees(document(field)).template[0]).toMatchObject({
			type: "string | null",
			default: false,
			values: ["a", null],
			deprecated: true,
			description: "Label",
			constraints: { minLength: 1, maxLength: 8, pattern: "^a" },
		});
		expect(
			buildSchemaTrees(
				document({ type: "number", minimum: 0, maximum: 100, multipleOf: 5 }),
			).template[0].constraints,
		).toEqual({ minimum: 0, maximum: 100, multipleOf: 5 });
		expect(
			buildSchemaTrees(document({ const: "fixed" })).template[0].values,
		).toEqual(["fixed"]);
	});

	it("works without documentation extensions", () => {
		const node = buildSchemaTrees(document()).template[0];
		expect(node.rules).toEqual([]);
		expect(node.examples).toEqual([]);
		expect(node.guideAnchor).toBeUndefined();
		expect(Object.hasOwn(node, "default")).toBe(false);
	});

	it("preserves metadata when supplied", () => {
		expect(
			buildSchemaTrees(
				document({
					type: "string",
					"x-atomize-rules": ["Unique"],
					"x-atomize-guide": "tasks",
					examples: ["Review"],
				}),
			).template[0],
		).toMatchObject({
			rules: ["Unique"],
			guideAnchor: "tasks",
			examples: ["Review"],
		});
	});

	it("attaches whole-file rules at their exact field path and keeps field annotations", () => {
		const trees = buildSchemaTrees(
			document({ type: "string", "x-atomize-rules": ["Field rule"] }),
			[
				{
					tab: "template",
					path: "name",
					rules: ["Whole-file rule", "Field rule"],
				},
				{ tab: "template", path: "tasks[].title", rules: ["Nested rule"] },
				{ tab: "mixin", path: "name", rules: ["Mixin rule"] },
			],
		);
		expect(trees.template[0].rules).toEqual(["Field rule", "Whole-file rule"]);
		expect(trees.template[2].children[0].children[0].rules).toEqual([
			"Nested rule",
		]);
		expect(trees.mixin[0].rules).toEqual(["Field rule", "Mixin rule"]);
	});

	it("does not attach a whole-file rule to an unrelated field or ancestor", () => {
		const trees = buildSchemaTrees(document(), [
			{
				tab: "template",
				path: "tasks[].removedField",
				rules: ["Missing field rule"],
			},
		]);
		expect(trees.template[2].rules).toEqual([]);
		expect(trees.template[2].children[0].rules).toEqual([]);
	});

	it("preserves union alternatives and dictionary value schemas", () => {
		const field: JsonSchema = {
			anyOf: [
				{
					type: "object",
					properties: { field: { type: "string" } },
					required: ["field"],
				},
				{
					type: "object",
					properties: { customField: { type: "string" } },
					required: ["customField"],
				},
			],
		};
		const node = buildSchemaTrees(document(field)).template[0];
		expect(
			node.alternatives.map((variant) => variant.children[0].name),
		).toEqual(["field", "customField"]);
		expect(node.alternatives[0].children[0].requirement).toBe("required");
		const dictionary = buildSchemaTrees(
			document({ type: "object", additionalProperties: { type: "number" } }),
		).template[0];
		expect(dictionary.children[0]).toMatchObject({
			name: "[key]",
			type: "number",
		});
	});

	it("resolves escaped JSON pointers and keeps reference sibling descriptions", () => {
		const input = document({
			$ref: "#/$defs/a~1b~0c",
			description: "Local description",
		});
		input.$defs = {
			...(input.$defs as object),
			"a/b~c": { type: "integer", minimum: 2 },
		};
		expect(buildSchemaTrees(input).template[0]).toMatchObject({
			type: "integer",
			description: "Local description",
			constraints: { minimum: 2 },
		});
	});

	it("terminates recursive references", () => {
		const input = document({ $ref: "#/$defs/recursive" });
		input.$defs = {
			...(input.$defs as object),
			recursive: {
				type: "object",
				properties: { child: { $ref: "#/$defs/recursive" } },
			},
		};
		const node = buildSchemaTrees(input).template[0];
		expect(node.children[0].children[0].recursive).toBe(true);
	});

	it("produces the expected authoring contract from the real generated schema", () => {
		const trees = buildSchemaTrees(schema);
		expect(
			trees.template
				.filter((node) => node.requirement === "unless-extends")
				.map((node) => node.name),
		).toEqual(["name", "filter", "tasks"]);
		expect(trees.mixin.map((node) => node.name)).toEqual([
			"name",
			"description",
			"tasks",
			"origin",
		]);
		const tasks = trees.template.find((node) => node.name === "tasks");
		expect(
			tasks?.children[0].children.find((node) => node.name === "repeat"),
		).toMatchObject({ type: "integer", constraints: { minimum: 1 } });
		expect(
			tasks?.children[0].children.find((node) => node.name === "condition")
				?.alternatives.length,
		).toBeGreaterThan(0);
	});
});
