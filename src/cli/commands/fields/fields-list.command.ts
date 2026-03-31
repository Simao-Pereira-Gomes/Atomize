import { cancel, intro, outro } from "@clack/prompts";
import { AzureDevOpsAdapter } from "@platforms/adapters/azure-devops/azure-devops.adapter";
import type { ADoFieldSchema } from "@platforms/interfaces/field-schema.interface";
import chalk from "chalk";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";
import { createManagedSpinner, sanitizeTty } from "@/cli/utilities/prompt-utilities";

export const fieldsListCommand = new Command("list")
  .alias("ls")
  .description("List work item fields available in the ADO project")
  .option("--type <WorkItemType>", "Scope results to a specific work item type (e.g. Task, Bug)")
  .option("--custom-only", "Show only custom fields (reference name starts with Custom.)", false)
  .option("--profile <name>", "Named connection profile to use (uses default if omitted)")
  .option("--json", "Print results as JSON to stdout; progress is written to stderr", false)
  .action(async (options: {
    type?: string;
    customOnly: boolean;
    profile?: string;
    json: boolean;
  }) => {
    const jsonMode = options.json;
    const logProgress = jsonMode
      ? (msg: string) => process.stderr.write(`${msg}\n`)
      : undefined;

    if (!jsonMode) intro(" Atomize — Field Browser");

    const s = createManagedSpinner();
    if (!jsonMode) s.start("Resolving configuration...");
    else logProgress?.("Resolving configuration...");

    try {
      const { resolveAzureConfig } = await import("@config/profile-resolver");
      const azureConfig = await resolveAzureConfig(options.profile);
      const adapter = new AzureDevOpsAdapter(azureConfig);

      if (!jsonMode) s.message("Connecting...");
      else logProgress?.("Connecting...");
      await adapter.authenticate();

      const typeLabel = options.type ? `for type "${options.type}"` : "for all types";
      if (!jsonMode) s.message(`Fetching fields ${typeLabel}...`);
      else logProgress?.(`Fetching fields ${typeLabel}...`);

      let fields = await adapter.getFieldSchemas(options.type);
      fields = filterFieldsForList(fields, options.customOnly);

      const countLabel = `${fields.length} ${fields.length === 1 ? "field" : "fields"}`;
      if (!jsonMode) s.stop(`Found ${countLabel}`);
      else logProgress?.(`Found ${countLabel}`);

      if (jsonMode) {
        console.log(JSON.stringify(fields, null, 2));
        return;
      }

      if (fields.length === 0) {
        outro(options.customOnly
          ? "No custom fields found in this project."
          : options.type
            ? `No fields found for work item type "${options.type}".`
            : "No fields found in this project.");
        return;
      }

      printFieldsTable(fields);
      outro(`${countLabel} listed`);
    } catch (error) {
      const msg = error instanceof Error ? sanitizeTty(error.message) : String(error);
      if (jsonMode) {
        process.stderr.write(`Error: ${msg}\n`);
      } else {
        s.stop("Failed");
        cancel(msg);
      }
      process.exit(ExitCode.Failure);
    }
  });

function printFieldsTable(fields: ADoFieldSchema[]): void {
  const refWidth = Math.min(Math.max(...fields.map((f) => f.referenceName.length), 14), 50);
  const nameWidth = Math.min(Math.max(...fields.map((f) => f.name.length), 12), 40);
  const typeWidth = 10;

  const header = [
    "REFERENCE NAME".padEnd(refWidth),
    "DISPLAY NAME".padEnd(nameWidth),
    "TYPE".padEnd(typeWidth),
    "PICKLIST VALUES",
  ].join("  ");
  const divider = [
    "-".repeat(refWidth),
    "-".repeat(nameWidth),
    "-".repeat(typeWidth),
    "---------------",
  ].join("  ");

  console.log("");
  console.log(chalk.gray(`  ${header}`));
  console.log(chalk.gray(`  ${divider}`));

  for (const f of fields) {
    const ref = sanitizeTty(f.referenceName).padEnd(refWidth).slice(0, refWidth);
    const name = sanitizeTty(f.name).padEnd(nameWidth).slice(0, nameWidth);
    const typeLabel = buildTypeLabel(f).padEnd(typeWidth);
    const picklist = f.allowedValues
      ? f.allowedValues.join(", ")
      : f.isPicklist
        ? chalk.dim("[use --type <WorkItemType> to see values]")
        : chalk.dim("—");

    let refColored = chalk.cyan(ref);
    if (f.isReadOnly) refColored = chalk.dim(ref);

    const flags: string[] = [];
    if (f.isReadOnly) flags.push(chalk.dim("[read-only]"));
    if (f.isMultiline) flags.push(chalk.yellow("[multi-line]"));
    const flagStr = flags.length > 0 ? ` ${flags.join(" ")}` : "";

    console.log(`  ${refColored}  ${name}  ${chalk.blue(typeLabel)}  ${picklist}${flagStr}`);
  }

  console.log("");
}

export function filterFieldsForList(
  fields: ADoFieldSchema[],
  customOnly: boolean,
): ADoFieldSchema[] {
  return customOnly ? fields.filter((field) => field.isCustom) : fields;
}

export function buildTypeLabel(f: ADoFieldSchema): string {
  if (f.isPicklist || f.allowedValues) {
    return f.type === "integer" ? "picklist-int" : f.type === "decimal" ? "picklist-dec" : "picklist-str";
  }
  return f.type;
}
