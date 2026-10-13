/** The JSON Schema subset consumed by the reference; extension keywords are optional. */
export interface JsonSchema {
	[keyword: string]: unknown;
	$ref?: string;
	type?: string | string[];
	properties?: Record<string, JsonSchema | undefined>;
	required?: string[];
	items?: JsonSchema;
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	additionalProperties?: boolean | JsonSchema;
}

export type SchemaTab = "template" | "mixin";
export interface SchemaNode {
	name: string;
	path: string;
	permalink: string;
	type: string;
	requirement: "required" | "optional" | "unless-extends";
	default?: unknown;
	values?: unknown[];
	constraints: Record<string, unknown>;
	description: string;
	deprecated: boolean;
	rules: string[];
	guideAnchor?: string;
	examples: unknown[];
	children: SchemaNode[];
	alternatives: SchemaNode[];
	recursive: boolean;
}
export interface SchemaTrees {
	template: SchemaNode[];
	mixin: SchemaNode[];
}

const constraintKeys = [
	"minimum",
	"maximum",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"multipleOf",
	"minLength",
	"maxLength",
	"pattern",
	"format",
	"minItems",
	"maxItems",
	"uniqueItems",
	"minProperties",
	"maxProperties",
	"additionalProperties",
];

/** Build both authoring trees from the generator's standalone/extending/Mixin union. */
export function buildSchemaTrees(schema: JsonSchema): SchemaTrees {
	function resolve(input: JsonSchema): JsonSchema {
		let result = input;
		const seen = new Set<string>();
		while (result.$ref) {
			const ref = result.$ref;
			if (!ref.startsWith("#/"))
				throw new Error(`Unsupported schema reference: ${ref}`);
			if (seen.has(ref)) break;
			seen.add(ref);
			let target: unknown = schema;
			for (const part of ref.slice(2).split("/")) {
				const key = decodeURIComponent(part)
					.replaceAll("~1", "/")
					.replaceAll("~0", "~");
				target =
					target && typeof target === "object"
						? (target as Record<string, unknown>)[key]
						: undefined;
			}
			if (!target || typeof target !== "object")
				throw new Error(`Missing schema reference: ${ref}`);
			const { $ref: _ref, ...siblings } = result;
			result = { ...(target as JsonSchema), ...siblings };
		}
		return result;
	}

	function fields(
		input: JsonSchema,
		tab: SchemaTab,
		parent = "",
		ancestry = new Set<JsonSchema>(),
	): SchemaNode[] {
		const object = resolve(input);
		return Object.entries(object.properties ?? {})
			.filter((entry): entry is [string, JsonSchema] => entry[1] !== undefined)
			.map(([name, field]) =>
				node(
					field,
					name,
					parent ? `${parent}.${name}` : name,
					tab,
					object.required?.includes(name) ? "required" : "optional",
					ancestry,
				),
			);
	}

	function node(
		input: JsonSchema,
		name: string,
		path: string,
		tab: SchemaTab,
		requirement: SchemaNode["requirement"],
		ancestry: Set<JsonSchema>,
	): SchemaNode {
		const value = resolve(input);
		const recursive = ancestry.has(input);
		const next = new Set(ancestry).add(input);
		const alternatives = value.anyOf ?? value.oneOf ?? [];
		const types =
			value.type ??
			(value.properties
				? "object"
				: value.items
					? "array"
					: alternatives.length
						? alternatives.flatMap((part) => resolve(part).type ?? "any")
						: "any");
		const constraints = Object.fromEntries(
			constraintKeys
				.filter(
					(key) =>
						key in value &&
						(key !== "additionalProperties" || typeof value[key] === "boolean"),
				)
				.map((key) => [key, value[key]]),
		);
		const children = recursive ? [] : fields(value, tab, path, next);
		if (!recursive && value.items)
			children.push(
				node(value.items, "[]", `${path}[]`, tab, "optional", next),
			);
		if (!recursive && typeof value.additionalProperties === "object") {
			children.push(
				node(
					value.additionalProperties,
					"[key]",
					`${path}.*`,
					tab,
					"optional",
					next,
				),
			);
		}
		return {
			name,
			path,
			permalink: `${tab}.${path}`,
			type: Array.isArray(types) ? [...new Set(types)].join(" | ") : types,
			requirement,
			...(Object.hasOwn(value, "default") ? { default: value.default } : {}),
			values: Array.isArray(value.enum)
				? value.enum
				: Object.hasOwn(value, "const")
					? [value.const]
					: undefined,
			constraints,
			description:
				typeof value.description === "string" ? value.description : "",
			deprecated: value.deprecated === true,
			rules: Array.isArray(value["x-atomize-rules"])
				? value["x-atomize-rules"].filter(
						(rule): rule is string => typeof rule === "string",
					)
				: [],
			guideAnchor:
				typeof value["x-atomize-guide"] === "string"
					? value["x-atomize-guide"]
					: undefined,
			examples: Array.isArray(value.examples) ? value.examples : [],
			children,
			recursive,
			alternatives: recursive
				? []
				: alternatives.map((part, index) =>
						node(
							part,
							`Alternative ${index + 1}`,
							path,
							tab,
							requirement,
							next,
						),
					),
		};
	}

	const branches = schema.anyOf?.map(resolve) ?? [];
	const standalone = branches.find(
		(branch) =>
			branch.properties?.extends && !branch.required?.includes("extends"),
	);
	const extending = branches.find((branch) =>
		branch.required?.includes("extends"),
	);
	const mixin = branches.find((branch) => !branch.properties?.extends);
	if (!standalone || !extending || !mixin)
		throw new Error(
			"Expected standalone Template, extending Template and Mixin branches",
		);
	const template = fields(
		{
			...standalone,
			properties: { ...extending.properties, ...standalone.properties },
		},
		"template",
	);
	for (const field of template) {
		if (
			field.requirement === "required" &&
			!extending.required?.includes(field.name)
		)
			field.requirement = "unless-extends";
	}
	return { template, mixin: fields(mixin, "mixin") };
}
