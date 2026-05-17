import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { MixinTemplateSchema, TaskTemplateSchema } from "../src/templates/schema.js";

const outDir = join(import.meta.dir, "../packages/vscode-extension/schemas");
const outFile = join(outDir, "atomize-template.schema.json");

const combined = z.union([TaskTemplateSchema, MixinTemplateSchema]);
const { anyOf, $schema, ...rest } = z.toJSONSchema(combined);

// z.union() produces anyOf; rename to oneOf — a YAML file is exactly one template type
const output = {
  $schema: $schema ?? "https://json-schema.org/draft/2020-12/schema",
  $comment:
    "Auto-generated from src/templates/schema.ts — do not edit manually. " +
    "Cross-field constraints (cycle detection, unique task IDs, estimation totals) are enforced at runtime only.",
  "x-generated-from": "src/templates/schema.ts",
  ...rest,
  ...(anyOf ? { oneOf: anyOf } : {}),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
console.log("✓ Generated packages/vscode-extension/schemas/atomize-template.schema.json");
