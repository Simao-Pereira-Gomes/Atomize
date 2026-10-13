import { z } from "zod";
import { distributeEstimationPercentages, taskEstimationRangeViolations } from "./estimation-normalizer.js";
import {
  buildAdjacencyList,
  detectCycles,
  formatCyclePath,
  orderTaskDefinitions,
} from "./graph.js";

/**
 * Accepts an ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDThh:mm:ss[.sss][Z|±hh:mm])
 * or an approved WIQL date macro (@Today, @StartOfDay, @StartOfMonth,
 * @StartOfWeek, @StartOfYear) with an optional integer offset (+N / -N).
 */
const DATE_OR_MACRO_RE =
  /^(@Today|@StartOfDay|@StartOfMonth|@StartOfWeek|@StartOfYear)(\s*[+-]\s*\d+)?$|^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/i;

const DateOrMacroSchema = z
  .string()
  .refine((v) => DATE_OR_MACRO_RE.test(v), {
    message:
      "Must be an ISO 8601 date (YYYY-MM-DD) or an approved date macro " +
      "(@Today, @StartOfDay, @StartOfMonth, @StartOfWeek, @StartOfYear) " +
      "with an optional numeric offset (e.g. @Today-7).",
  })
  .meta({ "x-atomize-rules": [
    "Use an ISO 8601 date (YYYY-MM-DD, optionally with a time) or @Today, @StartOfDay, @StartOfMonth, @StartOfWeek or @StartOfYear with an optional integer offset such as @Today-7.",
  ] });

/** Matches ADO reference names like "Custom.ClientTier" or "System.Tags". */
const REFERENCE_NAME_RE = /^[A-Za-z][A-Za-z0-9_.]*\.[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Structured condition operators for task and estimation conditions.
 */
export const ConditionOperatorSchema = z
  .enum([
    "equals",
    "not-equals",
    "contains",
    "not-contains",
    "gt",
    "lt",
    "gte",
    "lte",
  ])
  .describe(
    "Comparison operator. equals/not-equals: exact match. contains/not-contains: substring or array membership. gt/lt/gte/lte: numeric comparison.",
  );

export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

const ConditionValueSchema = z
  .union([z.string(), z.number(), z.boolean()])
  .describe("Value to compare against. Can be a string, number, or boolean.");

/**
 * Structured task condition — evaluated against the parent story at generate time.
 *
 * Simple clause:   { field: "tags", operator: "contains", value: "backend" }
 * Custom field:    { customField: "Custom.ClientTier", operator: "equals", value: "Enterprise" }
 * AND compound:    { all: [ ...clauses ] }
 * OR  compound:    { any: [ ...clauses ] }
 */
export type Condition =
  | { field: string; operator: ConditionOperator; value: string | number | boolean }
  | { customField: string; operator: ConditionOperator; value: string | number | boolean }
  | { all: Condition[] }
  | { any: Condition[] };

const MULTI_VALUE_STANDARD_FIELDS = new Set(["tags"]);
const MULTI_VALUE_FIELD_OPERATORS = new Set<ConditionOperator>(["contains", "not-contains"]);

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({
      field: z
        .string()
        .min(1)
        .describe(
          "Standard work item field name to evaluate (e.g. 'tags', 'priority', 'state', 'title').",
        ),
      operator: ConditionOperatorSchema.meta({ "x-atomize-rules": [
        "When field is tags, only contains and not-contains are supported because tags is multi-value.",
      ] }),
      value: ConditionValueSchema,
    }).strict().superRefine((data, ctx) => {
      if (MULTI_VALUE_STANDARD_FIELDS.has(data.field) && !MULTI_VALUE_FIELD_OPERATORS.has(data.operator)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["operator"],
          message: `Field "${data.field}" is multi-value; only "contains"/"not-contains" are supported (got "${data.operator}").`,
        });
      }
    }),
    z.object({
      customField: z
        .string()
        .regex(
          REFERENCE_NAME_RE,
          'Custom field reference must be in "Namespace.FieldName" format (e.g. "Custom.ClientTier").',
        )
        .describe(
          "Azure DevOps custom field reference in 'Namespace.FieldName' format (e.g. 'Custom.ClientTier').",
        ),
      operator: ConditionOperatorSchema,
      value: ConditionValueSchema,
    }).strict(),
    z.object({
      all: z
        .array(ConditionSchema)
        .min(1, "all requires at least one clause")
        .describe("Sub-conditions that must all match (logical AND)."),
    }).strict(),
    z.object({
      any: z
        .array(ConditionSchema)
        .min(1, "any requires at least one clause")
        .describe("Sub-conditions where at least one must match (logical OR)."),
    }).strict(),
  ]),
).meta({ "x-atomize-guide": "conditional-tasks" });


export const SavedQuerySchema = z
  .object({
    id: z
      .uuid()
      .describe("Azure DevOps saved query GUID.")
      .optional().meta({ "x-atomize-guide": "savedquery" }),
    path: z
      .string()
      .min(1)
      .describe(
        "Path to the saved query in Azure DevOps (e.g. 'My Queries/Sprint Stories').",
      )
      .optional().meta({ "x-atomize-guide": "savedquery" }),
  })
  .strict()
  .refine((d) => !!(d.id ?? d.path), {
    message: "savedQuery requires either id or path",
  })
  .refine((d) => !(d.id && d.path), {
    message: "savedQuery accepts id or path, not both",
  })
  .meta({ "x-atomize-guide": "savedquery", "x-atomize-rules": [
    "Set exactly one of id or path.",
    "Only flat (Work Items) saved queries are supported; tree and one-hop queries are rejected at runtime.",
    "State filters, tags, area or iteration paths, assignedTo, date filters or priority alongside savedQuery produce a validation warning and are ignored; the query controls the returned Stories. workItemTypes is allowed because it declares the query's Work Item types rather than filtering them.",
  ] });

export const FilterCriteriaSchema = z.object({
  team: z
    .string()
    .describe(
      "Azure DevOps team name. Overrides the team from the selected Connection Profile for this Template, including team-scoped query macros.",
    )
    .optional().meta({ "x-atomize-guide": "filter" }),
  workItemTypes: z
    .array(z.string())
    .describe(
      "Work item types to include (e.g. ['User Story', 'Bug']). With savedQuery, declares which types the query returns: it doesn't filter, but tells Atomize which fields to look up and validate.",
    )
    .optional().meta({ "x-atomize-guide": "filter" }),
  states: z
    .array(z.string())
    .describe("Story states to target (e.g. ['Active', 'New']).")
    .optional().meta({ "x-atomize-guide": "filter" }),
  statesExclude: z
    .array(z.string())
    .describe("Story states to exclude from selection.")
    .optional().meta({ "x-atomize-guide": "filter" }),
  statesWereEver: z
    .array(z.string())
    .describe("Include stories that were ever in any of these states.")
    .optional().meta({ "x-atomize-guide": "filter" }),
  tags: z
    .object({
      include: z
        .array(z.string())
        .describe("Include stories that have at least one of these tags.")
        .optional(),
      exclude: z
        .array(z.string())
        .describe("Exclude stories that have any of these tags.")
        .optional(),
    })
    .strict()
    .describe("Tag-based filter — include or exclude stories by tag.")
    .optional().meta({ "x-atomize-guide": "filter" }),
  areaPaths: z
    .array(z.union([z.string(), z.literal("@TeamAreas")]))
    .describe(
      "Area paths to match exactly, without descendants. Use '@TeamAreas' to match all areas owned by the configured team. Matching follows the platform's query semantics.",
    )
    .optional().meta({ "x-atomize-guide": "area-paths-exact-vs-descendants" }),
  areaPathsUnder: z
    .array(z.string())
    .describe("Include stories in these area paths and all sub-paths.")
    .optional().meta({ "x-atomize-guide": "area-paths-exact-vs-descendants" }),
  iterations: z
    .array(z.union([z.string(), z.literal("@CurrentIteration")]))
    .describe(
      "Iteration paths to match exactly, without descendants. Use '@CurrentIteration' for the configured team's current sprint.",
    )
    .optional().meta({ "x-atomize-guide": "iterations-exact-vs-descendants" }),
  iterationsUnder: z
    .array(z.string())
    .describe("Include stories in these iterations and all sub-iterations.")
    .optional().meta({ "x-atomize-guide": "iterations-exact-vs-descendants" }),
  assignedTo: z
    .array(z.union([z.email(), z.literal("@Me")]))
    .describe(
      "Assignee filter. Accepts email addresses or '@Me' for the authenticated user.",
    )
    .optional().meta({ "x-atomize-guide": "special-values" }),
  changedAfter: DateOrMacroSchema.describe(
    "Include Stories changed on or after this date (inclusive). ISO 8601 date or date macro (e.g. '@Today-7').",
  ).optional().meta({ "x-atomize-guide": "date-filters" }),
  createdAfter: DateOrMacroSchema.describe(
    "Include Stories created on or after this date (inclusive). ISO 8601 date or date macro.",
  ).optional().meta({ "x-atomize-guide": "date-filters" }),
  priority: z
    .object({
      min: z.number().describe("Minimum priority value (inclusive); on Azure DevOps, 1 is the highest priority.").optional(),
      max: z.number().describe("Maximum priority value (inclusive).").optional(),
    })
    .strict()
    .describe("Priority range filter for story selection.")
    .optional().meta({ "x-atomize-guide": "filter" }),
  excludeIfHasTasks: z
    .boolean()
    .describe("If true, skips stories that already have child tasks.")
    .optional().meta({ "x-atomize-guide": "filter" }),
  savedQuery: SavedQuerySchema.describe(
    "Reference an existing Azure DevOps saved query to select stories.",
  ).optional().meta({
    "x-atomize-guide": "savedquery",
    examples: [
      { path: "Shared Queries/Teams/Backend Team/Sprint Active Stories" },
      { id: "a1b2c3d4-0000-4000-8000-000000000000" },
    ],
  }),
}).strict();

export const EstimationPercentConditionSchema = z.object({
  condition: ConditionSchema.describe(
    "Condition evaluated against the parent story. Applied when this condition matches.",
  ).meta({ "x-atomize-guide": "conditional-estimation" }),
  percent: z
    .number()
    .min(0)
    .max(100)
    .describe("Estimation percentage used when this condition matches (0–100).").meta({ "x-atomize-guide": "conditional-estimation" }),
}).strict();

export const DEFAULT_MAX_REPEAT = 20;

export const TaskDefinitionSchema = z.object({
  id: z
    .string()
    .describe(
      "Unique identifier for this task within the template. Referenced by 'dependsOn'.",
    )
    .meta({ "x-atomize-rules": ["Non-empty task IDs must be unique within the file."] })
    .optional().meta({ "x-atomize-guide": "task-dependencies" }),
  title: z
    .string()
    .min(1, "Task title is required")
    .describe("Task title — shown as the Work Item title on the platform. Supports Story variable interpolation.").meta({ "x-atomize-guide": "variable-interpolation" }),
  description: z
    .string()
    .describe("Task description. Supports Story variable interpolation.")
    .optional().meta({ "x-atomize-guide": "variable-interpolation" }),
  estimationPercent: z
    .number()
    .min(0, "Estimation percentage cannot be negative")
    .max(100, "Estimation percentage for a single task cannot exceed 100%")
    .describe(
      "Percentage of the parent story's estimate assigned to this task (0–100). Requires estimation.strategy = 'percentage'.",
    )
    .optional().meta({ "x-atomize-guide": "estimation" }),
  estimationPercentCondition: z
    .array(EstimationPercentConditionSchema)
    .describe(
      "Conditional estimation rules evaluated in order. The first matching condition's percent is used.",
    )
    .optional().meta({
      "x-atomize-guide": "conditional-estimation",
      examples: [[
        { condition: { field: "tags", operator: "contains", value: "critical" }, percent: 60 },
        { condition: { field: "estimation", operator: "gte", value: 13 }, percent: 55 },
      ]],
    }),
  estimationFixed: z
    .number()
    .min(0, "Fixed estimation cannot be negative")
    .describe(
      "Fixed Task Estimate in the Task's unit, independent of the Story Estimate. Written as supplied; percentage rounding and the minimum do not apply.",
    )
    .optional().meta({ "x-atomize-guide": "estimation" }),
  estimationFormula: z
    .string()
    .describe(
      "Deprecated: formulas were never evaluated and give the task a Task Estimate of 0. Use estimationPercent or estimationFixed.",
    )
    .meta({ deprecated: true, "x-atomize-rules": [
      "Using this deprecated field produces a non-blocking warning, even in strict mode.",
    ] })
    .optional().meta({ "x-atomize-guide": "estimation" }),
  tags: z
    .array(z.string())
    .describe("Tags applied to the generated task.")
    .optional().meta({ "x-atomize-guide": "tasks" }),
  condition: ConditionSchema.describe(
    "Condition evaluated against the parent story. If it does not match, this task is skipped.",
  ).meta({ "x-atomize-rules": [
    "Offline Validation of a Template warns when this condition references custom fields; Online Validation is needed to verify that those fields exist on the platform.",
  ] }).optional().meta({
    "x-atomize-guide": "conditional-tasks",
    examples: [
      { field: "tags", operator: "contains", value: "security" },
      { customField: "Custom.ClientTier", operator: "equals", value: "Enterprise" },
      { all: [
        { field: "tags", operator: "contains", value: "database" },
        { any: [
          { field: "estimation", operator: "gt", value: 5 },
          { field: "priority", operator: "equals", value: 1 },
        ] },
      ] },
    ],
  }),
  dependsOn: z
    .array(z.string())
    .describe(
      "IDs of tasks this task depends on. Atomize creates predecessor dependency links between these tasks.",
    )
    .meta({ "x-atomize-rules": [
      "In a Resolved Template, dependencies must reference existing task IDs and must not form a cycle, including a dependency on the task itself.",
      "A task with repeat set cannot have a non-empty dependsOn, and another task cannot depend on it, even when repeat is 1.",
      "A task with dependencies should have its own id; validation reports a warning when it does not.",
    ] })
    .optional().meta({ "x-atomize-guide": "task-dependencies" }),
  repeat: z
    .number()
    .int("Repeat count must be a whole number")
    .min(1, "Repeat count must be at least 1")
    .describe(
      "Number of identical Tasks to generate from this definition (default 1). Each copy's title gets its position, e.g. 'Review (2)'. Cannot be combined with dependsOn.",
    )
    .meta({ "x-atomize-rules": [
      "When repeat is set, dependsOn must be absent or empty and other tasks cannot depend on this task, even when repeat is 1.",
      `In a Resolved Template, repeat must not exceed validation.maxRepeat (${DEFAULT_MAX_REPEAT} by default). A Mixin defers this cap to the composing Template.`,
    ] })
    .optional().meta({ "x-atomize-guide": "repeated-tasks" }),
  assignTo: z
    .string()
    .describe("Email address or alias to assign this task to.")
    .optional().meta({
      "x-atomize-guide": "assignment-patterns",
      examples: ["@ParentAssignee", "@Me", "@Unassigned", "lead@company.com"],
    }),
  priority: z
    .number()
    .describe("Priority value for the generated task.")
    .optional().meta({ "x-atomize-guide": "tasks" }),
  activity: z
    .string()
    .describe(
      "Azure DevOps activity type for this task (e.g. 'Development', 'Testing', 'Design').",
    )
    .optional().meta({ "x-atomize-guide": "tasks" }),
  acceptanceCriteria: z
    .array(z.string())
    .describe(
      "Deprecated: acceptance criteria are never written to the generated task. Move the text to description yourself; no removal quick fix is offered so the text is not lost.",
    )
    .meta({ deprecated: true, "x-atomize-rules": [
      "Using this deprecated field produces a non-blocking warning, even in strict mode.",
    ] })
    .optional().meta({ "x-atomize-guide": "tasks" }),
  acceptanceCriteriaAsChecklist: z
    .boolean()
    .describe(
      "Deprecated: acceptance criteria are never written to the generated task, so this setting has no effect. Remove it.",
    )
    .meta({ deprecated: true, "x-atomize-rules": [
      "Using this deprecated field produces a non-blocking warning, even in strict mode.",
    ] })
    .optional().meta({ "x-atomize-guide": "tasks" }),
  customFields: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .describe(
      "Azure DevOps custom fields to set on the task. Keys must be in 'Namespace.FieldName' format (e.g. 'Custom.ClientTier').",
    )
    .optional()
    .superRefine((fields, ctx) => {
      if (!fields) return undefined;
      for (const key of Object.keys(fields)) {
        if (!REFERENCE_NAME_RE.test(key)) {
          ctx.addIssue({
            code: "custom",
            message: `Invalid field reference name "${key}". Expected format: "Namespace.FieldName" (e.g. "Custom.ClientTier").`,
            params: { code: "INVALID_CUSTOM_FIELD_REFERENCE" },
          });
        }
      }
      return undefined;
    })
    .meta({ "x-atomize-rules": [
      "Every key must be a platform field reference in Namespace.FieldName format, such as Custom.ClientTier.",
      "Azure DevOps single-line and multi-line text fields accept strings; only multi-line fields accept newlines. Boolean fields require booleans; decimal fields require numbers; integer fields require whole numbers.",
      "Date/time fields accept ISO 8601 strings or supported macros such as @Today. Identity fields accept strings such as email addresses or @Me when supported by Azure DevOps.",
      "Picklist values must match an allowed value and its string or integer type.",
      "Offline Validation checks shape only. Online Validation verifies field existence, read-only status, types and allowed values; generation verifies them against live platform metadata before creating Work Items.",
    ] }).meta({
      "x-atomize-guide": "task-custom-fields",
      examples: [{
        "Custom.ClientTier": "Enterprise",
        "Custom.IsBillable": true,
        "Custom.TierRank": 3,
        "Custom.ReleaseVersion": "{{ story.customFields['Custom.ReleaseVersion'] }}",
        "Custom.ReleaseDate": "@Today",
      }],
    }),
}).strict();

const NUMBER_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

export const EstimationConversionSchema = z
  .object({
    factor: z
      .number()
      .positive()
      .describe("Multiplier from the Story's unit to the Task's unit, e.g. 4 when 1 point = 4 hours.")
      .optional().meta({ "x-atomize-guide": "estimation" }),
    table: z
      .record(z.string(), z.number().nonnegative())
      .refine((table) => Object.keys(table).length > 0, "conversion.table must have at least one entry")
      .meta({ "x-atomize-rules": ["The conversion table must contain at least one entry."] })
      .describe(
        "Story Estimate value to non-negative Task-unit amount, matched exactly, e.g. { XS: 1, S: 2, M: 4, L: 5 } or { 1: 2, 2: 4, 3: 8 } for scales that aren't linear. A value missing from the table is unresolvable unless enabled multipliers match it; ifParentHasNoEstimation decides what happens next.",
      )
      .optional().meta({ "x-atomize-guide": "estimation" }),
    multipliers: z
      .boolean()
      .describe(
        "Also accept a number followed by a table key, with optional whitespace: '0.3XL' or '0.3 XL' = 0.3 × XL. Defaults to false. Exact keys win; otherwise the longest matching suffix key wins. Forms such as 'XL*0.3' or '0,3XL' are unresolvable. Requires a table with at least one non-numeric key.",
      )
      .meta({ "x-atomize-rules": [
        "When multipliers is true, conversion.table must be set and at least one table key must be non-numeric.",
      ] })
      .optional().meta({ "x-atomize-guide": "estimation" }),
  })
  .strict()
  .refine((conversion) => (conversion.factor === undefined) !== (conversion.table === undefined), {
    message: "conversion must set exactly one of factor or table",
  })
  .refine((conversion) => !conversion.multipliers || conversion.table !== undefined, {
    message: "conversion.multipliers requires conversion.table",
    path: ["multipliers"],
  })
  .refine(
    (conversion) =>
      !conversion.multipliers || !conversion.table || !Object.keys(conversion.table).every((key) => NUMBER_PATTERN.test(key)),
    {
      message: "conversion.multipliers cannot be used when every table key is numeric: '25' would be ambiguous between the key 25 and 2 × 5",
      path: ["multipliers"],
    },
  )
  .describe(
    "Translates the Story Estimate into the Task's unit before it is split across tasks. Set exactly one of factor or table; omit for one-to-one.",
  )
  .meta({
    "x-atomize-guide": "estimation",
    "x-atomize-rules": ["Set exactly one of factor or table.", "Rounding and minimumTaskEstimate apply after conversion and percentage distribution."],
    examples: [
      { factor: 4 },
      { table: { "1": 2, "2": 4, "3": 8, "5": 16 } },
      { table: { S: 2, M: 4, L: 5, XL: 13 }, multipliers: true },
    ],
  });

/**
 * Looks a Story Estimate up in a conversion table. An exact key always wins; with
 * multipliers enabled, "<number><key>" (optional whitespace between) is number × table[key],
 * preferring the longest matching key.
 */
export function lookupTableEstimate(
  value: string | number,
  table: Record<string, number>,
  multipliers = false,
): number | undefined {
  const text = String(value).trim();
  if (Object.hasOwn(table, text)) return table[text];
  if (!multipliers) return undefined;

  const candidates = Object.keys(table)
    .filter((key) => key !== "" && text.endsWith(key))
    .sort((a, b) => b.length - a.length);
  for (const key of candidates) {
    const prefix = text.slice(0, text.length - key.length).trim();
    if (NUMBER_PATTERN.test(prefix)) return Number(prefix) * (table[key] as number);
  }
  return undefined;
}

/** Whether a Story Estimate value can be translated by the given conversion (or one-to-one when absent). */
export function isConvertibleStoryEstimate(
  value: string | number,
  conversion: z.infer<typeof EstimationConversionSchema> | undefined,
): boolean {
  if (conversion?.table) return lookupTableEstimate(value, conversion.table, conversion.multipliers) !== undefined;
  return typeof value === "number" || (value.trim() !== "" && Number.isFinite(Number(value)));
}

export const EstimationConfigSchema = z.object({
  strategy: z
    .enum(["percentage"])
    .optional()
    .default("percentage")
    .describe(
      "Estimation strategy. 'percentage' distributes the parent story's estimate across tasks proportionally.",
    ).meta({ "x-atomize-guide": "estimation" }),
  source: z
    .string()
    .min(1)
    .describe(
      "Story field that supplies the Story Estimate, as a platform field reference name (e.g. 'Custom.TShirtSize'). Replaces the platform's default fields with no fallback: a blank override is unresolvable. Azure DevOps defaults to StoryPoints, then Effort, Size and OriginalEstimate.",
    )
    .optional().meta({ "x-atomize-guide": "estimation" }),
  conversion: EstimationConversionSchema.optional().meta({ "x-atomize-guide": "estimation" }),
  targetFields: z
    .array(z.string().min(1))
    .min(1, "targetFields must name at least one field")
    .describe(
      "Task fields that receive the Task Estimate, as platform field reference names. Azure DevOps defaults to Microsoft.VSTS.Scheduling.RemainingWork and Microsoft.VSTS.Scheduling.OriginalEstimate, with Microsoft.VSTS.Scheduling.CompletedWork initialised to 0. Overrides replace all default writes, including CompletedWork initialisation; values are written exactly as calculated.",
    )
    .optional().meta({ "x-atomize-guide": "estimation" }),
  normalize: z
    .enum(["auto", "always", "never"])
    .describe(
      "What to do when the generated tasks' percentages don't add up to 100%. 'auto' (default) scales totals below 100% up and leaves totals above 100% as written unless you choose otherwise at generate time; 'always' scales to 100% in both directions; 'never' uses the percentages exactly as written, so a skipped task's share stays unallocated.",
    )
    .optional().meta({ "x-atomize-guide": "estimation" }),
  rounding: z
    .enum(["nearest", "up", "down", "none"])
    .optional()
    .default("none")
    .describe(
      "Rounding mode for percentage-based Task Estimates. Defaults to none, keeping decimal values. nearest rounds to the nearest half unit (0.5), up to the next half unit, and down to the previous half unit. Applied after conversion and distribution, before the minimum.",
    ).meta({ "x-atomize-guide": "estimation" }),
  minimumTaskEstimate: z
    .number()
    .describe("Minimum percentage-based Task Estimate after rounding, in the Task's unit (hours on Azure DevOps). Defaults to 0. Takes precedence over deprecated minimumTaskPoints when both are set; fixed estimates bypass it.")
    .optional().meta({ "x-atomize-guide": "estimation" }),
  minimumTaskPoints: z
    .number()
    .describe("Deprecated: use minimumTaskEstimate. Still honoured when minimumTaskEstimate is absent.")
    .meta({ deprecated: true, "x-atomize-rules": [
      "minimumTaskEstimate takes precedence when both minimum fields are set. Using this deprecated field produces a non-blocking warning, even in strict mode.",
    ] })
    .optional().meta({ "x-atomize-guide": "estimation" }),
  ifParentHasNoEstimation: z
    .enum(["skip", "warn", "use-default"])
    .describe(
      "Behaviour when the Story Estimate is missing or cannot be converted. 'warn' (default) creates the tasks with blank estimates (never 0) and reports a warning, 'skip' creates no tasks for the Story and reports why, 'use-default' uses defaultParentEstimation instead. Without a defaultParentEstimation, use-default behaves like warn.",
    )
    .optional().meta({ "x-atomize-guide": "estimation" }),
  defaultParentEstimation: z
    .union([z.number(), z.string().min(1)])
    .describe(
      "Story Estimate used when the real one is missing or cannot be converted and ifParentHasNoEstimation is 'use-default', in the Story's unit (e.g. 'M' or 5). Goes through the same conversion as a real Story Estimate.",
    )
    .meta({ "x-atomize-rules": [
      "When ifParentHasNoEstimation is use-default and this value is set, it must be convertible: numeric without a table, or a matching conversion.table key (including enabled multipliers).",
    ] })
    .optional().meta({ "x-atomize-guide": "estimation" }),
}).strict().superRefine((config, ctx) => {
  if (config.ifParentHasNoEstimation !== "use-default" || config.defaultParentEstimation === undefined) return;
  if (isConvertibleStoryEstimate(config.defaultParentEstimation, config.conversion)) return;
  ctx.addIssue({
    code: "custom",
    path: ["defaultParentEstimation"],
    message: config.conversion?.table
      ? `defaultParentEstimation "${config.defaultParentEstimation}" is not a key of conversion.table${config.conversion.multipliers ? " or a multiple of one" : ""}`
      : `defaultParentEstimation "${config.defaultParentEstimation}" is not numeric and no conversion.table is set`,
  });
});

export const ValidationModeSchema = z
  .enum(["strict", "lenient"])
  .describe("'strict' treats blocking validation warnings as errors; 'lenient' (default) allows warnings. Non-blocking advisories remain warnings in both modes.");

export const ValidationConfigSchema = z.object({
  mode: ValidationModeSchema.describe(
    "'strict' treats blocking validation warnings as errors; 'lenient' (default) allows warnings. Non-blocking advisories remain warnings in both modes.",
  ).optional().meta({ "x-atomize-guide": "validation" }),
  totalEstimationMustBe: z
    .number()
    .describe(
      "Required total estimation percentage, counting each repeated copy. Validation checks that it is reachable between the lower and upper allocation bounds, including conditions and percentage overrides. It may exceed 100 when Tasks span roles.",
    )
    .optional().meta({ "x-atomize-guide": "validation", "x-atomize-rules": ["Choose one total constraint. If both are supplied, totalEstimationMustBe takes precedence and totalEstimationRange is ignored."] }),
  totalEstimationRange: z
    .object({
      min: z
        .number()
        .describe("Minimum allowed total estimation percentage (inclusive)."),
      max: z
        .number()
        .describe("Maximum allowed total estimation percentage (inclusive)."),
    })
    .strict()
    .describe(
      "Allowed total estimation percentage range, counting each repeated copy. Must overlap the lower and upper reachable allocation bounds, including conditions and percentage overrides. Bounds may exceed 100 when Tasks span roles.",
    )
    .optional().meta({ "x-atomize-guide": "validation", "x-atomize-rules": ["Choose one total constraint. If both are supplied, totalEstimationMustBe takes precedence and totalEstimationRange is ignored."] }),
  minTasks: z
    .number()
    .describe("Minimum generated Task count the Template must define, counting each repeated copy.")
    .optional().meta({ "x-atomize-guide": "validation" }),
  maxTasks: z
    .number()
    .describe("Maximum generated Task count the Template may define, counting each repeated copy.")
    .optional().meta({ "x-atomize-guide": "validation" }),
  maxRepeat: z
    .number()
    .int("Maximum repeat count must be a whole number")
    .min(1, "Maximum repeat count must be at least 1")
    .describe(
      "Highest 'repeat' any task in this template may use (default 20). Raise it for a template that genuinely needs more copies.",
    )
    .meta({ "x-atomize-rules": [
      "This cap applies to every task definition in the Resolved Template, including tasks contributed by Mixins.",
    ] })
    .optional().meta({ "x-atomize-guide": "repeated-tasks" }),
  taskEstimationRange: z
    .object({
      min: z
        .number()
        .min(0)
        .max(100)
        .describe("Minimum allowed estimation percentage for a single task."),
      max: z
        .number()
        .min(0)
        .max(100)
        .describe("Maximum allowed estimation percentage for a single task."),
    })
    .strict()
    .superRefine((range, ctx) => {
      if (range.min > range.max) ctx.addIssue({
        code: "custom",
        path: ["max"],
        message: "taskEstimationRange.max must be greater than or equal to min.",
        params: { code: "INVALID_TASK_ESTIMATION_RANGE" },
      });
    })
    .describe("Inclusive bounds for each final task percentage after normalization, including percentage rounding. Fixed estimates are excluded.")
    .meta({ "x-atomize-rules": [
      "min must be less than or equal to max.",
      "Checked after normalization and its percentage rounding, per repeated copy. With normalize: never, supplied percentages are used unchanged. Fixed estimates are excluded. Story-dependent conditions and percentage overrides are checked during preview and generation, once the active allocation is known. Task Estimate rounding in hours or points does not change this percentage constraint.",
    ] })
    .optional().meta({ "x-atomize-guide": "validation" }),
  requiredTasks: z
    .array(
      z.object({
        title: z
          .string()
          .describe(
            "Required task title. Matched case-insensitively against task titles.",
          ),
        id: z
          .string()
          .describe(
            "Optional required task ID, matched case-insensitively. A matching title also satisfies the requirement when this ID is absent or does not match.",
          )
          .optional(),
      }).strict(),
    )
    .describe(
      "Tasks that must be present in the template, matched by title or id.",
    )
    .meta({ "x-atomize-rules": [
      "Each required entry must match an existing task by its supplied id or its title. Both comparisons are case-insensitive; a title match is accepted even if the supplied id does not match.",
    ] })
    .optional().meta({ "x-atomize-guide": "validation" }),
}).strict();

export const MetadataSchema = z.object({
  category: z
    .string()
    .describe(
      "Template category for discovery and grouping (e.g. 'Frontend', 'Backend', 'Infrastructure').",
    )
    .optional().meta({ "x-atomize-guide": "metadata" }),
  difficulty: z
    .enum(["beginner", "intermediate", "advanced"])
    .describe(
      "Deprecated: nothing in Atomize reads it. Describe the work in description instead.",
    )
    .meta({ deprecated: true, "x-atomize-rules": ["Using this deprecated field produces a non-blocking warning, even in strict mode."] })
    .optional().meta({ "x-atomize-guide": "metadata" }),
  recommendedFor: z
    .array(z.string())
    .describe(
      "Deprecated: nothing in Atomize reads it. filter.workItemTypes already declares which Work Item types the template targets.",
    )
    .meta({ deprecated: true, "x-atomize-rules": ["Using this deprecated field produces a non-blocking warning, even in strict mode."] })
    .optional().meta({ "x-atomize-guide": "metadata" }),
  estimationGuidelines: z
    .string()
    .describe(
      "Human-readable guidance on how to estimate stories before using this template.",
    )
    .optional().meta({ "x-atomize-guide": "metadata" }),
  notes: z
    .string()
    .describe("Free-form context for the template's authors and maintainers.")
    .optional().meta({ "x-atomize-guide": "metadata" }),
  examples: z
    .array(z.string())
    .describe(
      "Deprecated: nothing in Atomize reads it. Describe when to use the template in description instead.",
    )
    .meta({ deprecated: true, "x-atomize-rules": ["Using this deprecated field produces a non-blocking warning, even in strict mode."] })
    .optional().meta({ "x-atomize-guide": "metadata" }),
  changelog: z
    .array(
      z.object({
        version: z
          .string()
          .describe("Template version this changelog entry describes."),
        date: z
          .string()
          .describe("Date of the change in YYYY-MM-DD format."),
        changes: z
          .string()
          .describe("Summary of what changed in this version."),
      }).strict(),
    )
    .describe(
      "Deprecated: nothing in Atomize reads it. Keep the template's history in version control.",
    )
    .meta({ deprecated: true, "x-atomize-rules": ["Using this deprecated field produces a non-blocking warning, even in strict mode."] })
    .optional().meta({ "x-atomize-guide": "metadata" }),
}).strict();

/**
 * Format versions this release can read, oldest first. A file without formatVersion is format 1.0.
 * Add a version here only together with the migration that reads the previous one.
 */
export const TEMPLATE_FORMAT_VERSIONS = ["1.0"] as const;
export const CURRENT_TEMPLATE_FORMAT_VERSION = "1.0" satisfies (typeof TEMPLATE_FORMAT_VERSIONS)[number];

const FormatVersionSchema = z
  .enum(TEMPLATE_FORMAT_VERSIONS, {
    error: (issue) =>
      `Unsupported formatVersion ${JSON.stringify(issue.input)}. This release of Atomize reads ${TEMPLATE_FORMAT_VERSIONS.map((v) => `"${v}"`).join(", ")}. formatVersion is the file format; use version for the template's own revision.`,
  })
  .describe(
    `Which edition of the Atomize schema this file follows. Currently "${CURRENT_TEMPLATE_FORMAT_VERSION}"; omit it to mean "1.0". Not the template's own revision: that's version.`,
  )
  .meta({ "x-atomize-rules": [
    `Must be a format this release of Atomize can read: ${TEMPLATE_FORMAT_VERSIONS.map((v) => `"${v}"`).join(", ")}. Write it as a quoted string; an unquoted 1.0 is read as a number.`,
  ] });

const RevisionSchema = z
  .string()
  .min(1)
  .describe("The author's own revision of this file, e.g. '1.2' or '2026-10'. Free text: Atomize shows it but never interprets it. A child Template does not inherit its parent's Revision.");

const TaskTemplateBaseSchema = z.object({
    formatVersion: FormatVersionSchema.optional(),
    version: RevisionSchema.optional(),
    name: z
      .string()
      .min(1, "Template name is required")
      .describe("Unique display name for this template."),
    description: z
      .string()
      .describe("What this template is for and when to use it.")
      .optional(),
    author: z
      .string()
      .describe("Author or team that owns this template.")
      .optional(),
    tags: z
      .array(z.string())
      .describe("Tags for template discovery in the catalog.")
      .optional(),
    created: z
      .string()
      .describe(
        "Deprecated: nothing in Atomize reads or maintains it. Version control records when the file was created.",
      )
      .meta({ deprecated: true, "x-atomize-rules": ["Using this deprecated field produces a non-blocking warning, even in strict mode."] })
      .optional(),
    lastModified: z
      .string()
      .describe(
        "Deprecated: nothing in Atomize reads or maintains it, so it goes stale. Version control records changes.",
      )
      .meta({ deprecated: true, "x-atomize-rules": ["Using this deprecated field produces a non-blocking warning, even in strict mode."] })
      .optional(),

    filter: FilterCriteriaSchema.describe(
      "Criteria used to select which stories this template applies to.",
    ).meta({ "x-atomize-guide": "filter" }),
    tasks: z
      .array(TaskDefinitionSchema)
      .min(1, "At least one task is required")
      .describe("Task definitions that will be generated from this template.").meta({ "x-atomize-guide": "tasks" }),

    taskType: z
      .string()
      .min(1)
      .describe(
        "Work Item type generated Tasks are created as, in the platform's own vocabulary (e.g. 'Task', 'Sub-task'). Defaults to Task on Azure DevOps. Online Validation checks custom fields and targetFields against this type.",
      )
      .optional().meta({ "x-atomize-guide": "estimation" }),
    estimation: EstimationConfigSchema.describe(
      "Global estimation configuration for all tasks in this template.",
    ).optional().meta({ "x-atomize-guide": "estimation" }),
    validation: ValidationConfigSchema.describe(
      "Validation rules applied when this template is used.",
    ).optional().meta({ "x-atomize-guide": "validation" }),
    metadata: MetadataSchema.describe(
      "Additional metadata for template discovery and documentation.",
    ).optional().meta({ "x-atomize-guide": "metadata" }),

    extends: z
      .string()
      .describe(
        "Catalog Template name or file path of a parent Template to inherit from. Resolved by the Template Library.",
      )
      .optional().meta({ "x-atomize-guide": "inheritance-extends" }),
    mixins: z
      .array(z.string())
      .describe(
        "Catalog Mixin names or file paths to compose into this Template. Resolved by the Template Library.",
      )
      .optional().meta({ "x-atomize-guide": "mixins-mixins" }),
    origin: z
      .string()
      .describe(
        "Catalog ref (template:<name> or mixin:<name>) this template was derived from. Informational only — does not affect ref resolution.",
      )
      .optional(),
  }).strict();

export const ExtendingTaskTemplateSchema = TaskTemplateBaseSchema
  .partial({
    name: true,
    filter: true,
    tasks: true,
  })
  .extend({
    extends: z
      .string()
      .min(1)
      .describe(
        "Catalog Template name or file path of a parent Template to inherit from. Inherited fields such as name, filter, and tasks may be omitted.",
      ).meta({ "x-atomize-guide": "inheritance-extends" }),
  });

/**
 * A task's own reachable percent range, ignoring whether the task itself is conditional.
 * `estimationPercentCondition` means the task's percent varies by which of its rules matches
 * at generate time — the base `estimationPercent` and every rule's `percent` are each a
 * possible outcome, so the reachable range spans their min and max.
 */
function ownPercentRange(task: TaskTemplate["tasks"][number]): [min: number, max: number] {
  const candidates = [task.estimationPercent ?? 0, ...(task.estimationPercentCondition?.map((rule) => rule.percent) ?? [])];
  return [Math.min(...candidates), Math.max(...candidates)];
}

/** How many Tasks a definition generates: its `repeat` count, or one when unset. */
export function copyCount(task: Pick<TaskTemplate["tasks"][number], "repeat">): number {
  return task.repeat ?? 1;
}

/** How many Tasks the definitions generate when every one is active, counting each repeated copy. */
export function generatedTaskCount(tasks: ReadonlyArray<Pick<TaskTemplate["tasks"][number], "repeat">>): number {
  return tasks.reduce((sum, task) => sum + copyCount(task), 0);
}

export const TaskTemplateSchema = TaskTemplateBaseSchema
  .superRefine((data, ctx) => {
    const { tasks, validation: v } = data;
    let totalPercent = 0;
    let maxTotalPercent = 0;
    for (const task of tasks) {
      const [ownMin, ownMax] = ownPercentRange(task);
      const copies = copyCount(task);
      totalPercent += task.condition ? 0 : ownMin * copies;
      maxTotalPercent += ownMax * copies;
    }
    const taskIds = new Set(tasks.map((t) => t.id).filter(Boolean));

    validateUniqueTaskIds(tasks, ctx);
    validateEstimationConstraints(v, totalPercent, maxTotalPercent, tasks.some((t) => copyCount(t) > 1), ctx);
    validateTaskEstimationRange(data, ctx);

    validateTaskConstraints(v, tasks, ctx);
    validateRequiredTasks(v, tasks, ctx);

    const availableIds = Array.from(taskIds);
    const taskIndexById = new Map<string, number>();
    tasks.forEach((t, i) => {
      if (t.id) taskIndexById.set(t.id, i);
    });

    validateRepeatedTasks(tasks, ctx, v?.maxRepeat ?? DEFAULT_MAX_REPEAT);

    tasks.forEach((task, index) => {
      task.dependsOn?.forEach((depId) => {
        if (!taskIds.has(depId)) {
          const suggestion =
            availableIds.length > 0
              ? ` Available task IDs: ${availableIds.map((id) => `"${id}"`).join(", ")}`
              : "";
          ctx.addIssue({
            code: "custom",
            path: ["tasks", index, "dependsOn"],
            message: `Task depends on non-existent task ID: "${depId}".${suggestion}`,
            params: { code: "INVALID_DEPENDENCY" },
          });
        }
      });
    });
    reportCircularDependencies(tasks, taskIndexById, ctx);
  });

/**
 * A repeated task has several copies, so a dependency link to or from it has no single
 * Work Item to attach to; repeat and dependsOn are therefore mutually exclusive.
 */
function validateRepeatedTasks(
  tasks: TaskTemplate["tasks"],
  ctx: z.RefinementCtx,
  maxRepeat?: number,
) {
  const repeatedIds = new Set(
    tasks.filter((t) => t.repeat !== undefined && t.id).map((t) => t.id as string),
  );

  tasks.forEach((task, index) => {
    if (maxRepeat !== undefined && task.repeat !== undefined && task.repeat > maxRepeat) {
      ctx.addIssue({
        code: "custom",
        path: ["tasks", index, "repeat"],
        message: `Task repeats ${task.repeat} times, but the maximum is ${maxRepeat}. Lower repeat or raise validation.maxRepeat.`,
        params: { code: "REPEAT_EXCEEDS_MAX", maxRepeat },
      });
    }

    if (task.repeat !== undefined && task.dependsOn?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["tasks", index, "dependsOn"],
        message: "A repeated task cannot have dependsOn. Remove repeat or dependsOn from this task.",
        params: { code: "REPEAT_WITH_DEPENDENCY" },
      });
    }

    task.dependsOn?.forEach((depId) => {
      if (repeatedIds.has(depId)) {
        ctx.addIssue({
          code: "custom",
          path: ["tasks", index, "dependsOn"],
          message: `Task depends on "${depId}", which is repeated. A task cannot depend on a repeated task.`,
          params: { code: "DEPENDS_ON_REPEATED_TASK", taskId: depId },
        });
      }
    });
  });
}

function validateTaskEstimationRange(
  template: TaskTemplate,
  ctx: z.RefinementCtx,
) {
  const { tasks, validation, estimation } = template;
  const range = validation?.taskEstimationRange;
  if (!range || range.min > range.max) return;
  if (tasks.some(task => task.condition || task.estimationPercentCondition?.length)) return;
  if (tasks.some(task => copyCount(task) > (validation?.maxRepeat ?? DEFAULT_MAX_REPEAT))) return;
  const ordered = orderTaskDefinitions(tasks.map((task, sourceIndex) => ({ ...task, sourceIndex })));
  if (!ordered) return; // The dependency refinement reports cycles separately.
  const copies = ordered.flatMap(task => Array.from({ length: copyCount(task) }, () => ({ ...task })));
  distributeEstimationPercentages(copies, estimation?.normalize);
  const { min, max } = range;
  const reported = new Set<number>();
  for (const { index, percent, message } of taskEstimationRangeViolations(copies, range)) {
    const sourceIndex = copies[index]?.sourceIndex;
    if (sourceIndex === undefined) continue;
    if (reported.has(sourceIndex)) continue;
    reported.add(sourceIndex);
    ctx.addIssue({
      code: "custom",
      path: ["tasks", sourceIndex, "estimationPercent"],
      message,
      params: { code: "TASK_ESTIMATION_OUT_OF_RANGE", percent, min, max },
    });
  }
}

function validateTaskConstraints(
  v: TaskTemplate["validation"] | undefined,
  tasks: TaskTemplate["tasks"],
  ctx: z.RefinementCtx,
) {
  const count = generatedTaskCount(tasks);
  const hasRepeats = tasks.some((task) => copyCount(task) > 1);
  const counted = hasRepeats ? " (counting each repeated copy)" : "";
  if (v?.minTasks !== undefined && count < v.minTasks) {
    const needed = v.minTasks - count;
    ctx.addIssue({
      code: "custom",
      path: ["tasks"],
      message: `Template has ${count} task(s)${counted}, but minimum is ${v.minTasks}. Add ${needed} more task(s).`,
      params: { code: "TOO_FEW_TASKS", count, limit: v.minTasks, hasRepeats },
    });
  }
  if (v?.maxTasks !== undefined && count > v.maxTasks) {
    const excess = count - v.maxTasks;
    ctx.addIssue({
      code: "custom",
      path: ["tasks"],
      message: `Template has ${count} task(s)${counted}, but maximum is ${v.maxTasks}. Remove ${excess} task(s) or increase maxTasks.`,
      params: { code: "TOO_MANY_TASKS", count, limit: v.maxTasks, hasRepeats },
    });
  }
}

function validateUniqueTaskIds(
  tasks: z.infer<typeof TaskDefinitionSchema>[],
  ctx: z.RefinementCtx,
) {
  const firstIndexById = new Map<string, number>();

  tasks.forEach((task, index) => {
    if (!task.id) return;

    const firstIndex = firstIndexById.get(task.id);
    if (firstIndex === undefined) {
      firstIndexById.set(task.id, index);
      return;
    }

    ctx.addIssue({
      code: "custom",
      path: ["tasks", index, "id"],
      message: `Duplicate task id "${task.id}". Task IDs must be unique; first defined at tasks[${firstIndex}].`,
      params: { code: "DUPLICATE_TASK_ID", duplicateId: task.id, firstIndex },
    });
  });
}

function validateEstimationConstraints(
  v: TaskTemplate["validation"] | undefined,
  totalPercent: number,
  maxTotalPercent: number,
  hasRepeats: boolean,
  ctx: z.RefinementCtx,
) {
  if (v?.totalEstimationMustBe !== undefined) {
    if (v.totalEstimationMustBe < totalPercent || v.totalEstimationMustBe > maxTotalPercent) {
      ctx.addIssue({
        code: "custom",
        path: ["tasks"],
        message: `Total estimation is ${totalPercent}%, but must be ${v.totalEstimationMustBe}%.`,
        params: { code: "INVALID_TOTAL_ESTIMATION", hasRepeats },
      });
    }
  } else if (v?.totalEstimationRange) {
    const { min, max } = v.totalEstimationRange;
    if (maxTotalPercent < min || totalPercent > max) {
      ctx.addIssue({
        code: "custom",
        path: ["tasks"],
        message: `Total estimation is ${totalPercent}%, but must be between ${min}% and ${max}%.`,
        params: { code: "INVALID_ESTIMATION_RANGE", hasRepeats },
      });
    }
  }
}

function validateRequiredTasks(
  v: TaskTemplate["validation"] | undefined,
  tasks: TaskTemplate["tasks"],
  ctx: z.RefinementCtx,
) {
  if (!v?.requiredTasks || v.requiredTasks.length === 0) return;

  const taskTitles = new Set(tasks.map((t) => t.title.toLowerCase()));
  const taskIds = new Set(
    tasks.map((t) => t.id?.toLowerCase()).filter(Boolean),
  );

  for (const required of v.requiredTasks) {
    const matchById = required.id && taskIds.has(required.id.toLowerCase());
    const matchByTitle = taskTitles.has(required.title.toLowerCase());

    if (!matchById && !matchByTitle) {
      const identifier = required.id ? `id "${required.id}" or title` : "title";
      ctx.addIssue({
        code: "custom",
        path: ["tasks"],
        message: `Required task with ${identifier} "${required.title}" is missing.`,
        params: { code: "MISSING_REQUIRED_TASK" },
      });
    }
  }
}

/**
 * Detects circular dependencies in task graph and reports them as validation issues.
 */
function reportCircularDependencies(
  tasks: z.infer<typeof TaskDefinitionSchema>[],
  taskIndexById: Map<string, number>,
  ctx: z.RefinementCtx,
) {
  const adjacencyList = buildAdjacencyList(tasks);
  const { cycles } = detectCycles(adjacencyList);

  for (const cyclePath of cycles) {
    const firstTaskId = cyclePath[0];
    const taskIndex = firstTaskId ? (taskIndexById.get(firstTaskId) ?? 0) : 0;

    ctx.addIssue({
      code: "custom",
      path: ["tasks", taskIndex, "dependsOn"],
      message: `Circular dependency detected: ${formatCyclePath(cyclePath)}`,
      params: { code: "CIRCULAR_DEPENDENCY", cycle: cyclePath },
    });
  }
}

/**
 * Schema for mixin files — partial templates that contribute only tasks.
 * Mixins don't require a filter since they're composed into a full template.
 */
export const MixinTemplateSchema = z
  .object({
    formatVersion: FormatVersionSchema.optional(),
    version: RevisionSchema.optional(),
    name: z
      .string()
      .min(1, "Mixin name is required")
      .describe("Unique display name for this mixin.").meta({ "x-atomize-guide": "mixins-mixins" }),
    description: z
      .string()
      .describe("What tasks this mixin contributes and when to include it.")
      .optional().meta({ "x-atomize-guide": "mixins-mixins" }),
    tasks: z
      .array(TaskDefinitionSchema)
      .min(1, "At least one task is required")
      .describe("Task definitions contributed by this mixin.").meta({ "x-atomize-guide": "mixins-mixins" }),
    origin: z
      .string()
      .describe(
        "Catalog ref (template:<name> or mixin:<name>) this mixin was derived from. Informational only — does not affect ref resolution.",
      )
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    validateUniqueTaskIds(data.tasks, ctx);
    // The repeat cap belongs to the composing Template, so a Mixin only checks dependencies.
    validateRepeatedTasks(data.tasks, ctx);
  });

export const CURRENT_ITERATION = "@CurrentIteration" as const;
export const TEAM_AREAS = "@TeamAreas" as const;
export const TODAY = "@Today" as const;
export const START_OF_DAY = "@StartOfDay" as const;
export const START_OF_WEEK = "@StartOfWeek" as const;
export const START_OF_MONTH = "@StartOfMonth" as const;
export const START_OF_YEAR = "@StartOfYear" as const;
export const ME = "@Me" as const;

export type MixinTemplate = z.infer<typeof MixinTemplateSchema>;
export type FilterCriteria = z.infer<typeof FilterCriteriaSchema>;
export type SavedQuery = z.infer<typeof SavedQuerySchema>;
export type TaskDefinition = z.infer<typeof TaskDefinitionSchema>;
export type EstimationPercentCondition = z.infer<
  typeof EstimationPercentConditionSchema
>;
export type EstimationConfig = z.infer<typeof EstimationConfigSchema>;
export type EstimationConversion = z.infer<typeof EstimationConversionSchema>;
export type ValidationMode = z.infer<typeof ValidationModeSchema>;
export type ValidationConfig = z.infer<typeof ValidationConfigSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;

/**
 * A template that uses `extends` and/or `mixins` and has not yet been resolved.
 * `filter` and `tasks` are inherited from the parent and therefore optional here.
 * Always resolve through `TemplateLoader` or `TemplateResolver` before validating.
 */
export type PartialTaskTemplate = Omit<TaskTemplate, "filter" | "tasks"> & {
  filter?: FilterCriteria;
  tasks?: TaskDefinition[];
};
