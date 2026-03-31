import { confirm, log, select, text } from "@clack/prompts";
import type { ADoFieldSchema } from "@platforms/interfaces/field-schema.interface";
import { assertNotCancelled, selectOrAutocomplete } from "@/cli/utilities/prompt-utilities";

/**
 * Fields Atomize already manages natively — excluded from the custom field picker
 * to avoid conflicts with built-in template behaviour.
 */
const NATIVELY_MANAGED_FIELDS = new Set([
  // Core identity / structure (always set by ADO or Atomize on creation)
  "System.Title",
  "System.State",
  "System.WorkItemType",
  "System.TeamProject",
  "System.AreaPath",
  "System.IterationPath",
  "System.AssignedTo",
  "System.Tags",
  "System.Description",
  // Audit fields (set by ADO, read-only in practice)
  "System.Id",
  "System.Rev",
  "System.CreatedBy",
  "System.CreatedDate",
  "System.ChangedBy",
  "System.ChangedDate",
  "System.AuthorizedAs",
  "System.AuthorizedDate",
  "System.Watermark",
  // Fields set automatically by Atomize
  "Microsoft.VSTS.Scheduling.RemainingWork",
  "Microsoft.VSTS.Scheduling.OriginalEstimate",
  "Microsoft.VSTS.Scheduling.CompletedWork",
  "Microsoft.VSTS.Common.Priority",
  "Microsoft.VSTS.Common.Activity",
]);

/**
 * Wizard step for adding custom fields to a task definition.
 *
 * @param workItemType  The WIT these fields belong to (used only for display).
 * @param fieldSchemas  Live schema from ADO, or undefined when running offline.
 */
export async function configureCustomFields(
  fieldSchemas: ADoFieldSchema[] | undefined,
  storyFieldSchemas: ADoFieldSchema[] | undefined,
): Promise<Record<string, string | number | boolean>> {
  const result: Record<string, string | number | boolean> = {};

  if (!fieldSchemas) return result;

  const addFields = assertNotCancelled(
    await confirm({
      message: "Add custom fields to this task?",
      initialValue: false,
    }),
  );

  if (!addFields) return result;

  for (;;) {
    const field = await pickFieldOnline(fieldSchemas);

    if (!field) break;

    const value = await promptFieldValue(field, storyFieldSchemas);
    if (value === null) {
      const tryAgain = assertNotCancelled(
        await confirm({ message: "Skip this field and add another?", initialValue: true }),
      );
      if (!tryAgain) break;
      continue;
    }

    result[field.referenceName] = value;

    const more = assertNotCancelled(
      await confirm({ message: "Add another custom field?", initialValue: false }),
    );
    if (!more) break;
  }

  return result;
}

/** Returns true when at least one field in `fieldSchemas` can be picked (not read-only, not natively managed). */
export function hasPickableFields(fieldSchemas: ADoFieldSchema[]): boolean {
  return fieldSchemas.some(
    (f) => !f.isReadOnly && !NATIVELY_MANAGED_FIELDS.has(f.referenceName),
  );
}

export async function pickFieldOnline(
  fieldSchemas: ADoFieldSchema[],
): Promise<ADoFieldSchema | null> {
  const available = fieldSchemas.filter(
    (f) => !f.isReadOnly && !NATIVELY_MANAGED_FIELDS.has(f.referenceName),
  );

  if (available.length === 0) {
    return null;
  }

  const sorted = [
    ...available.filter((f) => f.isCustom).sort((a, b) => a.name.localeCompare(b.name)),
    ...available.filter((f) => !f.isCustom).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  const selected = await selectOrAutocomplete({
    message: "Select a field:",
    options: sorted.map((f) => ({
      label: f.name,
      hint: `${f.referenceName} · ${buildTypeHint(f)}`,
      value: f.referenceName,
    })),
    placeholder: "Type to filter by name or reference name...",
  });

  return sorted.find((f) => f.referenceName === selected) ?? null;
}

/**
 * Returns the entered value, or null if the user wants to skip this field.
 */
async function promptFieldValue(
  field: ADoFieldSchema,
  storyFieldSchemas: ADoFieldSchema[] | undefined,
): Promise<string | number | boolean | null> {
  const canInterpolate = shouldOfferStoryValueInterpolation(
    field.referenceName,
    storyFieldSchemas,
  );

  if (canInterpolate) {
    const useInterpolation = assertNotCancelled(
      await confirm({
        message: `Use parent story's value for "${field.name}"? ({{ story.customFields['${field.referenceName}'] }})`,
        initialValue: false,
      }),
    );
    if (useInterpolation) {
      return `{{ story.customFields['${field.referenceName}'] }}`;
    }
  }

  if (field.allowedValues && field.allowedValues.length > 0) {
    return promptPicklistValue(field);
  }

  return promptTypedValue(field);
}

export function shouldOfferStoryValueInterpolation(
  referenceName: string,
  storyFieldSchemas: ADoFieldSchema[] | undefined,
): boolean {
  return storyFieldSchemas?.some((f) => f.referenceName === referenceName) ?? false;
}

export async function promptPicklistValue(field: ADoFieldSchema): Promise<string | number | null> {
  const choice = assertNotCancelled(
    await select({
      message: `Select value for "${field.name}":`,
      options: buildPicklistOptions(field),
    }),
  );

  return coercePicklistValue(field, choice);
}

export function buildPicklistOptions(
  field: ADoFieldSchema,
): Array<{ label: string; value: string }> {
  return (field.allowedValues ?? []).map((value) => ({ label: value, value }));
}

export function coercePicklistValue(
  field: Pick<ADoFieldSchema, "type">,
  choice: string,
): string | number {
  return field.type === "integer" || field.type === "decimal" ? Number(choice) : choice;
}

export async function promptTypedValue(
  field: ADoFieldSchema,
): Promise<string | number | boolean | null> {
  switch (field.type) {
    case "boolean":
      return promptBoolean(field);

    case "integer":
      return promptInteger(field);

    case "decimal":
      return promptDecimal(field);

    case "datetime":
      return promptDatetime(field);

    case "identity":
      return promptIdentity(field);

    default:
      return promptString(field);
  }
}

async function promptBoolean(field: ADoFieldSchema): Promise<boolean | null> {
  const choice = assertNotCancelled(
    await select({
      message: `Value for "${field.name}":`,
      options: [
        { label: "true", value: "true" },
        { label: "false", value: "false" },
      ],
    }),
  );
  return choice === "true";
}

async function promptInteger(field: ADoFieldSchema): Promise<number | null> {
  const raw = assertNotCancelled(
    await text({
      message: `Value for "${field.name}" (integer):`,
      placeholder: "e.g. 42",
      validate: (input): string | undefined => {
        if (!input || input.trim() === "") return `"${field.name}" is required`;
        const n = Number(input.trim());
        if (!Number.isFinite(n)) return "Must be a valid integer";
        if (!Number.isInteger(n)) return "Must be a whole number (no decimals)";
        return undefined;
      },
    }),
  );
  return Number(raw);
}

async function promptDecimal(field: ADoFieldSchema): Promise<number | null> {
  const raw = assertNotCancelled(
    await text({
      message: `Value for "${field.name}" (decimal):`,
      placeholder: "e.g. 3.14",
      validate: (input): string | undefined => {
        if (!input || input.trim() === "") return `"${field.name}" is required`;
        if (!Number.isFinite(Number(input.trim()))) return "Must be a valid number";
        return undefined;
      },
    }),
  );
  const n = Number(raw);
  if (Number.isInteger(n)) {
    log.info(`Stored as decimal — ADO will treat ${n} as ${n}.0`);
  }
  return n;
}

async function promptDatetime(field: ADoFieldSchema): Promise<string | null> {
  const raw = assertNotCancelled(
    await text({
      message: `Value for "${field.name}" (ISO 8601 date or @Today macro):`,
      placeholder: "e.g. 2026-04-01 or @Today+7",
      validate: (input): string | undefined => {
        if (!input || input.trim() === "") return `"${field.name}" is required`;
        const DATE_OR_MACRO_RE =
          /^(@Today|@StartOfDay|@StartOfMonth|@StartOfWeek|@StartOfYear)(\s*[+-]\s*\d+)?$|^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/i;
        if (!DATE_OR_MACRO_RE.test(input.trim())) {
          return "Must be an ISO 8601 date (YYYY-MM-DD) or @Today macro (e.g. @Today+7)";
        }
        return undefined;
      },
    }),
  );
  return raw.trim();
}

async function promptIdentity(field: ADoFieldSchema): Promise<string | null> {
  const raw = assertNotCancelled(
    await text({
      message: `Value for "${field.name}" (email or @Me):`,
      placeholder: "e.g. user@company.com or @Me",
      validate: (input): string | undefined => {
        if (!input || input.trim() === "") return `"${field.name}" is required`;
        if (input.trim() === "@Me") return undefined;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())) {
          return 'Must be a valid email address or "@Me"';
        }
        return undefined;
      },
    }),
  );
  return raw.trim();
}

async function promptString(field: ADoFieldSchema): Promise<string | null> {
  const multilineNote = field.isMultiline ? " (multi-line — displayed as plain text in ADO)" : "";
  const raw = assertNotCancelled(
    await text({
      message: `Value for "${field.name}"${multilineNote}:`,
      validate: (input): string | undefined => {
        if (!input || input.trim() === "") return `"${field.name}" is required`;
        return undefined;
      },
    }),
  );
  return raw;
}

function buildTypeHint(f: ADoFieldSchema): string {
  if (f.allowedValues && f.allowedValues.length > 0) {
    return `picklist (${f.allowedValues.slice(0, 3).join(", ")}${f.allowedValues.length > 3 ? "…" : ""})`;
  }
  if (f.isMultiline) return `${f.type} · multi-line`;
  return f.type;
}
