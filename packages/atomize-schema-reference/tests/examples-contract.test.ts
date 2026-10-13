import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import schema from "../schema/atomize-template.schema.json";
import { buildSchemaTrees, type SchemaNode } from "../src/tree";

// Validate each field in the original document so internal $refs retain their scope.
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema, "atomize");
const fields: { pointer: string; examples: unknown[] }[] = [];
function visit(value: unknown, pointer = "") {
	if (!value || typeof value !== "object") return;
	if (!Array.isArray(value) && Object.hasOwn(value, "examples")) {
		const examples = (value as { examples: unknown }).examples;
		expect(Array.isArray(examples), `${pointer}/examples must be an array`).toBe(true);
		fields.push({ pointer, examples: examples as unknown[] });
	}
	for (const [key, child] of Object.entries(value)) {
		if (["properties", "patternProperties", "$defs", "dependentSchemas"].includes(key)) {
			// Field names such as metadata.examples are not schema keywords.
			for (const [name, field] of Object.entries(child as Record<string, unknown>)) {
				visit(field, `${pointer}/${key}/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`);
			}
		} else if (["anyOf", "oneOf", "allOf", "prefixItems"].includes(key)) {
			for (const [index, field] of (child as unknown[]).entries()) {
				visit(field, `${pointer}/${key}/${index}`);
			}
		} else if (["items", "additionalProperties", "unevaluatedProperties", "contains", "not", "if", "then", "else", "propertyNames"].includes(key)) {
			visit(child, `${pointer}/${key}`);
		}
	}
}
visit(schema);

function flatten(nodes: SchemaNode[]): SchemaNode[] {
	return nodes.flatMap((node) => [
		node,
		...flatten(node.children),
		...flatten(node.alternatives),
	]);
}

describe("Field example contracts", () => {
	it.each(fields)("examples validate against their own schema at $pointer", ({ pointer, examples }) => {
		const validate = ajv.compile({ $ref: `atomize#${pointer}` });
		for (const [index, example] of examples.entries()) {
			expect(
				validate(example),
				`${pointer}/examples/${index}: ${ajv.errorsText(validate.errors)}`,
			).toBe(true);
		}
	});

	it("the selected examples survive generation and appear on the Template and Mixin trees", () => {
		const trees = buildSchemaTrees(schema);
		const paths = [
			"tasks[].condition",
			"tasks[].assignTo",
			"tasks[].estimationPercentCondition",
			"tasks[].customFields",
		];
		for (const tab of ["template", "mixin"] as const) {
			const nodes = flatten(trees[tab]);
			for (const path of tab === "template" ? [...paths, "filter.savedQuery", "estimation.conversion"] : paths) {
				expect(nodes.find((node) => node.path === path)?.examples.length, `${tab}.${path}`).toBeGreaterThan(0);
			}
		}
		expect(fields.length).toBeGreaterThan(0);
	});
});
