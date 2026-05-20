import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  ExtendingTaskTemplateSchema,
  MixinTemplateSchema,
  TaskTemplateSchema,
} from "../src/templates/schema.js";

const outDir = join(import.meta.dir, "../../vscode-extension/schemas");
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
  if (obj["type"] === "object" && Array.isArray(obj["required"]) && typeof obj["properties"] === "object" && obj["properties"] !== null) {
    const props = obj["properties"] as Record<string, unknown>;
    obj["required"] = (obj["required"] as string[]).filter(
      (key) => {
        const prop = props[key];
        return !(typeof prop === "object" && prop !== null && "default" in prop);
      }
    );
    if ((obj["required"] as string[]).length === 0) delete obj["required"];
  }
  for (const value of Object.values(obj)) dropDefaultedFromRequired(value);
}

const output = {
  $schema: $schema ?? "https://json-schema.org/draft/2020-12/schema",
  $comment:
    "Auto-generated from src/templates/schema.ts — do not edit manually. " +
    "Cross-field constraints (cycle detection, unique task IDs, estimation totals) are enforced at runtime only.",
  "x-generated-from": "src/templates/schema.ts",
  ...rest,
  ...(anyOf ? { anyOf } : {}),
};

dropDefaultedFromRequired(output);

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
console.log("✓ Generated packages/vscode-extension/schemas/atomize-template.schema.json");
