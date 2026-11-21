import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { categorizeError, telemetryEventSchema } from "../src/index";

type JsonSchema = {
	type?: string | string[];
	enum?: unknown[];
	const?: unknown;
	pattern?: string;
	format?: string;
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	allOf?: JsonSchema[];
	additionalProperties?: boolean | JsonSchema;
};

/** Every place the schema accepts a string that is not pinned to an enum, const, pattern or format. */
function freeFormStrings(schema: JsonSchema, at = "$"): string[] {
	const found: string[] = [];
	const types = [schema.type].flat();
	if (types.includes("string") && !schema.enum && schema.const === undefined && !schema.pattern && !schema.format) {
		found.push(at);
	}
	if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
		found.push(...freeFormStrings(schema.additionalProperties, `${at}.*`));
	}
	if (schema.additionalProperties === true) found.push(`${at}.*`);
	for (const [key, child] of Object.entries(schema.properties ?? {})) found.push(...freeFormStrings(child, `${at}.${key}`));
	if (schema.items) found.push(...freeFormStrings(schema.items, `${at}[]`));
	for (const branch of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])]) {
		found.push(...freeFormStrings(branch, at));
	}
	return found;
}

describe("payload shape", () => {
	test("no event or prop accepts a free-form string", () => {
		const json = z.toJSONSchema(telemetryEventSchema, { io: "input" }) as JsonSchema;
		expect(freeFormStrings(json)).toEqual([]);
	});

	test("the walker catches a free-form string", () => {
		const json = z.toJSONSchema(z.object({ templateName: z.string() })) as JsonSchema;
		expect(freeFormStrings(json)).toEqual(["$.templateName"]);
	});

	test("rejects an event carrying an unknown string prop or a bad version string", () => {
		const base = {
			event: "session_started",
			surface: "cli",
			atomizeVersion: "5.3.0",
			runtimeVersion: "node-22.0.0",
			os: "linux",
			anonymousId: "3b241101-e2bb-4255-8caf-4136c566a962",
			timestamp: "2026-11-21T10:00:00.000Z",
		};
		expect(telemetryEventSchema.safeParse(base).success).toBe(true);
		expect(telemetryEventSchema.safeParse({ ...base, atomizeVersion: "see https://example.com/some/path" }).success).toBe(false);
		expect(telemetryEventSchema.safeParse({ ...base, anonymousId: "alice@example.com" }).success).toBe(false);
	});
});

describe("categorizeError", () => {
	const named = (name: string) => Object.assign(new Error("secret message"), { name });

	test.each([
		["AuthError", "auth"],
		["ConfigurationError", "config"],
		["PlatformError", "platform"],
		["TemplateLoadError", "template"],
		["TemplateValidationError", "template"],
		["TemplateCompositionError", "template"],
		["TemplateCreationError", "template"],
		["CircularDependencyError", "template"],
		["CopilotAuthenticationError", "ai"],
		["LLMGenerationError", "ai"],
		["ProjectGroundingError", "ai"],
		["ReferenceDocumentError", "reference-docs"],
		["GenerationTimeoutError", "timeout"],
		["SomethingElse", "unknown"],
	] as const)("%s maps to %s", (name, errorCategory) => {
		expect(categorizeError(named(name))).toEqual({ outcome: "failure", errorCategory });
	});

	test("CancellationError is the cancelled outcome, not a category", () => {
		expect(categorizeError(named("CancellationError"))).toEqual({ outcome: "cancelled" });
	});

	test("non-errors are unknown failures", () => {
		expect(categorizeError("boom")).toEqual({ outcome: "failure", errorCategory: "unknown" });
		expect(categorizeError(undefined)).toEqual({ outcome: "failure", errorCategory: "unknown" });
	});
});
