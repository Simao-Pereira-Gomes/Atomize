import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ExtendingTaskTemplateSchema,
  MixinTemplateSchema,
  TaskTemplateSchema,
} from "@sppg2001/atomize-core/templates/schema";
import { z } from "zod";

const outDir = join(import.meta.dir, "../../atomize-schema-reference/schema");
const outFile = join(outDir, "atomize-template.schema.json");

const combined = z.union([
  TaskTemplateSchema,
  ExtendingTaskTemplateSchema,
  MixinTemplateSchema,
]);
const { anyOf, $schema, ...rest } = z.toJSONSchema(combined);

// z.toJSONSchema() marks fields with Zod defaults as `required` because JSON Schema's
// `default` keyword is informational only. Walk every object node and remove fields
// that carry a `default` from the `required` list, so the editor doesn't squiggle
// on fields that the runtime fills in automatically.
function dropDefaultedFromRequired(node: unknown): void {
  if (typeof node !== "object" || node === null) return;
  if (Array.isArray(node)) {
    for (const item of node) dropDefaultedFromRequired(item);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.type === "object" && Array.isArray(obj.required) && typeof obj.properties === "object" && obj.properties !== null) {
    const props = obj.properties as Record<string, unknown>;
    obj.required = (obj.required as string[]).filter(
      (key) => {
        const prop = props[key];
        return !(typeof prop === "object" && prop !== null && "default" in prop);
      }
    );
    if ((obj.required as string[]).length === 0) delete obj.required;
  }
  for (const value of Object.values(obj)) dropDefaultedFromRequired(value);
}

// z.record(z.string(), …) emits `propertyNames: { type: "string" }`. In JSON that's always true,
// but YAML editors validate a key like the `1:` in a conversion table as the number 1 and report
// "Expected string", while Atomize itself reads every key as a string. Drop the redundant
// constraint; propertyNames that carry a pattern or other rules are kept.
function dropStringPropertyNames(node: unknown): void {
  if (typeof node !== "object" || node === null) return;
  if (Array.isArray(node)) {
    for (const item of node) dropStringPropertyNames(item);
    return;
  }
  const obj = node as Record<string, unknown>;
  const names = obj.propertyNames as Record<string, unknown> | undefined;
  if (names && Object.keys(names).length === 1 && names.type === "string") delete obj.propertyNames;
  for (const value of Object.values(obj)) dropStringPropertyNames(value);
}

const output = {
  $schema: $schema ?? "https://json-schema.org/draft/2020-12/schema",
  $comment:
    "Auto-generated from src/templates/schema.ts. Do not edit manually. " +
    "Cross-field constraints (cycle detection, unique task IDs, estimation totals) are enforced at runtime only.",
  "x-generated-from": "src/templates/schema.ts",
  ...rest,
  ...(anyOf ? { anyOf } : {}),
};

dropDefaultedFromRequired(output);
dropStringPropertyNames(output);

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
console.log("✓ Generated packages/atomize-schema-reference/schema/atomize-template.schema.json");
