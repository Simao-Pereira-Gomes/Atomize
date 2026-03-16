import { confirm, multiselect, select, text } from "@clack/prompts";
import type {
  EstimationConfig,
  FilterCriteria,
  Metadata,
  ValidationConfig,
} from "@templates/schema";
import type { CustomFieldFilter } from "@/platforms";
import {
  assertNotCancelled,
  Filters,
  Validators,
} from "../../utilities/prompt-utilities";

type AdvancedFilterGroup = "scope" | "stateHistory" | "assignment" | "dates" | "custom";
const ADVANCED_GROUP_ORDER: AdvancedFilterGroup[] = ["scope", "stateHistory", "assignment", "dates", "custom"];

type AreaFilterMode = "none" | "@TeamAreas" | "exact" | "under" | "mixed";
type IterationFilterMode =
  | "none"
  | "@CurrentIteration"
  | "@CurrentIteration+1"
  | "@CurrentIteration-1"
  | "exact"
  | "under"
  | "mixed";
type DateFilterPreset =
  | "none"
  | "@Today"
  | "@Today-7"
  | "@Today-14"
  | "@Today-30"
  | "@StartOfDay"
  | "@StartOfWeek"
  | "@StartOfMonth"
  | "@StartOfYear"
  | "custom";

const DATE_FILTER_OPTIONS: { label: string; value: DateFilterPreset }[] = [
  { label: "No filter", value: "none" as const },
  { label: "Today  (@Today)", value: "@Today" as const },
  { label: "Last 7 days  (@Today-7)", value: "@Today-7" as const },
  { label: "Last 14 days  (@Today-14)", value: "@Today-14" as const },
  { label: "Last 30 days  (@Today-30)", value: "@Today-30" as const },
  { label: "Start of day  (@StartOfDay)", value: "@StartOfDay" as const },
  { label: "Start of week  (@StartOfWeek)", value: "@StartOfWeek" as const },
  { label: "Start of month  (@StartOfMonth)", value: "@StartOfMonth" as const },
  { label: "Start of year  (@StartOfYear)", value: "@StartOfYear" as const },
  { label: "Custom", value: "custom" as const },
];

/**
 * Configure filter criteria with support for custom query and custom fields
 */
export async function configureFilter(): Promise<FilterCriteria> {
  const filter: FilterCriteria = {};

  const workItemTypes = await promptWorkItemTypes();
  if (workItemTypes.length > 0) filter.workItemTypes = workItemTypes;

  const states = await promptStates();
  if (states.length > 0) filter.states = states;

  const tags = await promptTags();
  if (tags) filter.tags = tags;

  if (await promptExcludeIfHasTasks()) filter.excludeIfHasTasks = true;

  const selectedGroups = assertNotCancelled(
    await multiselect<AdvancedFilterGroup>({
      message: "Advanced filters (press Enter to skip):",
      options: [
        { label: "Scope  — team, area paths, iterations", value: "scope" },
        { label: "State history  — exclude states, were ever in", value: "stateHistory" },
        { label: "Assignment  — assigned-to, priority", value: "assignment" },
        { label: "Dates  — changed after, created after", value: "dates" },
        { label: "Custom  — field filters, custom query", value: "custom" },
      ],
      required: false,
    }),
  ) as AdvancedFilterGroup[];

  // Process groups in a fixed order regardless of tick order
  for (const group of ADVANCED_GROUP_ORDER.filter((g) => selectedGroups.includes(g))) {
    switch (group) {
      case "scope": {
        const team = await promptTeam();
        if (team) filter.team = team;

        const { exact: areaPaths, under: areaPathsUnder } = await promptAreaPaths();
        if (areaPaths.length > 0) filter.areaPaths = areaPaths;
        if (areaPathsUnder.length > 0) filter.areaPathsUnder = areaPathsUnder;

        const { exact: iterations, under: iterationsUnder } = await promptIterations();
        if (iterations.length > 0) filter.iterations = iterations;
        if (iterationsUnder.length > 0) filter.iterationsUnder = iterationsUnder;
        break;
      }
      case "stateHistory": {
        const statesExclude = await promptStatesExclude();
        if (statesExclude.length > 0) filter.statesExclude = statesExclude;

        const statesWereEver = await promptStatesWereEver();
        if (statesWereEver.length > 0) filter.statesWereEver = statesWereEver;
        break;
      }
      case "assignment": {
        const assignedTo = await promptAssignedTo();
        if (assignedTo.length > 0) filter.assignedTo = assignedTo;

        const priority = await promptPriority();
        if (priority) filter.priority = priority;
        break;
      }
      case "dates": {
        const changedAfter = await promptDateFilter(
          "Filter by last modified date:",
          "Changed after (date or @Today offset):",
        );
        if (changedAfter) filter.changedAfter = changedAfter;

        const createdAfter = await promptDateFilter(
          "Filter by creation date:",
          "Created after (date or @Today offset):",
        );
        if (createdAfter) filter.createdAfter = createdAfter;
        break;
      }
      case "custom": {
        // Custom fields and query have their own inner gates since users
        // may want one but not the other
        const useCustomFields = assertNotCancelled(
          await confirm({ message: "Add custom field filters?", initialValue: false }),
        );
        if (useCustomFields) filter.customFields = await configureCustomFields();

        const customQuery = await promptCustomQuery();
        if (customQuery) filter.customQuery = customQuery;
        break;
      }
    }
  }

  return filter;
}

async function promptWorkItemTypes(): Promise<string[]> {
  const selected = assertNotCancelled(
    await multiselect({
      message: "Select work item types:",
      options: [
        { label: "User Story", value: "User Story" },
        { label: "Bug", value: "Bug" },
        { label: "Task", value: "Task" },
        { label: "Epic", value: "Epic" },
        { label: "Feature", value: "Feature" },
        { label: "Issue", value: "Issue" },
        { label: "+ Add custom type", value: "__custom__" },
      ],
      initialValues: ["User Story"],
      required: false,
    }),
  );

  let custom: string[] = [];
  if (selected.includes("__custom__")) {
    const raw = assertNotCancelled(
      await text({
        message: "Enter custom work item types (comma-separated):",
        placeholder: "e.g. Requirement, Test Case",
      }),
    );
    custom = Filters.commaSeparated(raw);
  }

  return [...selected.filter((t) => t !== "__custom__"), ...custom];
}

async function promptStates(): Promise<string[]> {
  const selected = assertNotCancelled(
    await multiselect({
      message: "Select states:",
      options: [
        { label: "New", value: "New" },
        { label: "Active", value: "Active" },
        { label: "Removed", value: "Removed" },
        { label: "Resolved", value: "Resolved" },
        { label: "Closed", value: "Closed" },
        { label: "+ Add custom state", value: "__custom__" },
      ],
      initialValues: ["New", "Active"],
      required: false,
    }),
  );

  let custom: string[] = [];
  if (selected.includes("__custom__")) {
    const raw = assertNotCancelled(
      await text({
        message: "Enter custom states (comma-separated):",
        placeholder: "e.g. In Review, On Hold",
      }),
    );
    custom = Filters.commaSeparated(raw);
  }

  return [...selected.filter((s) => s !== "__custom__"), ...custom];
}

async function promptTags(): Promise<FilterCriteria["tags"]> {
  const useTags = assertNotCancelled(
    await confirm({ message: "Filter by tags?", initialValue: false }),
  );
  if (!useTags) return undefined;

  const includeRaw = assertNotCancelled(
    await text({
      message: "Tags to include (comma-separated):",
      placeholder: "e.g. backend, api",
    }),
  );
  const excludeRaw = assertNotCancelled(
    await text({
      message: "Tags to exclude (comma-separated):",
      placeholder: "e.g. wip, blocked",
    }),
  );

  const include = Filters.commaSeparated(includeRaw);
  const exclude = Filters.commaSeparated(excludeRaw);

  if (include.length === 0 && exclude.length === 0) return undefined;

  return {
    ...(include.length > 0 && { include }),
    ...(exclude.length > 0 && { exclude }),
  };
}

async function promptExcludeIfHasTasks(): Promise<boolean> {
  return assertNotCancelled(
    await confirm({
      message: "Exclude work items that already have tasks?",
      initialValue: true,
    }),
  );
}

async function promptTeam(): Promise<string | undefined> {
  const override = assertNotCancelled(
    await confirm({
      message: "Override team for this template? (affects @CurrentIteration and @TeamAreas)",
      initialValue: false,
    }),
  );
  if (!override) return undefined;

  const team = assertNotCancelled(
    await text({
      message: "Team name:",
      placeholder: "e.g. MyProject Team",
      validate(input): string | undefined {
        if (!input?.trim()) return "Team name is required";
        return undefined;
      },
    }),
  );
  return team.trim();
}

async function promptAreaPaths(): Promise<{ exact: string[]; under: string[] }> {
  const mode = assertNotCancelled(
    await select<AreaFilterMode>({
      message: "Area path filter:",
      options: [
        { label: "No area path filter", value: "none" as const },
        { label: "@TeamAreas  (all areas for this team)", value: "@TeamAreas" as const },
        { label: "Exact paths  (IN)", value: "exact" as const },
        { label: "Path and descendants  (UNDER)", value: "under" as const },
        { label: "@TeamAreas + exact paths", value: "mixed" as const },
      ],
      initialValue: "none" as const,
    }),
  );

  if (mode === "none") return { exact: [], under: [] };
  if (mode === "@TeamAreas") return { exact: ["@TeamAreas"], under: [] };

  const raw = assertNotCancelled(
    await text({
      message: "Area paths (comma-separated):",
      placeholder: "e.g. MyProject\\\\Backend, MyProject\\\\API",
      validate: (input): string | undefined => {
        if (!input || input.trim() === "") return "At least one area path is required";
        return undefined;
      },
    }),
  );
  const paths = Filters.commaSeparated(raw);

  if (mode === "under") return { exact: [], under: paths };
  if (mode === "mixed") return { exact: ["@TeamAreas", ...paths], under: [] };
  return { exact: paths, under: [] };
}

async function promptIterations(): Promise<{ exact: string[]; under: string[] }> {
  const mode = assertNotCancelled(
    await select<IterationFilterMode>({
      message: "Iteration filter:",
      options: [
        { label: "No iteration filter", value: "none" as const },
        { label: "@CurrentIteration       (active sprint)", value: "@CurrentIteration" as const },
        { label: "@CurrentIteration + 1  (next sprint)", value: "@CurrentIteration+1" as const },
        { label: "@CurrentIteration - 1  (previous sprint)", value: "@CurrentIteration-1" as const },
        { label: "Exact iteration paths  (IN)", value: "exact" as const },
        { label: "Iteration and children  (UNDER)", value: "under" as const },
        { label: "@CurrentIteration + exact paths", value: "mixed" as const },
      ],
      initialValue: "none" as const,
    }),
  );

  if (mode === "none") return { exact: [], under: [] };
  if (mode === "@CurrentIteration") return { exact: ["@CurrentIteration"], under: [] };
  if (mode === "@CurrentIteration+1") return { exact: ["@CurrentIteration + 1"], under: [] };
  if (mode === "@CurrentIteration-1") return { exact: ["@CurrentIteration - 1"], under: [] };

  const raw = assertNotCancelled(
    await text({
      message: "Iteration paths (comma-separated):",
      placeholder: "e.g. MyProject\\\\Sprint 1, MyProject\\\\Sprint 2",
      validate: (input): string | undefined => {
        if (!input || input.trim() === "") return "At least one iteration path is required";
        return undefined;
      },
    }),
  );
  const paths = Filters.commaSeparated(raw);

  if (mode === "under") return { exact: [], under: paths };
  if (mode === "mixed") return { exact: ["@CurrentIteration", ...paths], under: [] };
  return { exact: paths, under: [] };
}

async function promptStatesExclude(): Promise<string[]> {
  const use = assertNotCancelled(
    await confirm({ message: "Exclude specific states?", initialValue: false }),
  );
  if (!use) return [];

  const selected = assertNotCancelled(
    await multiselect({
      message: "States to exclude:",
      options: [
        { label: "New", value: "New" },
        { label: "Active", value: "Active" },
        { label: "Resolved", value: "Resolved" },
        { label: "Closed", value: "Closed" },
        { label: "Removed", value: "Removed" },
        { label: "+ Add custom state", value: "__custom__" },
      ],
      required: true,
    }),
  );

  let custom: string[] = [];
  if (selected.includes("__custom__")) {
    const raw = assertNotCancelled(
      await text({
        message: "Custom states to exclude (comma-separated):",
        placeholder: "e.g. On Hold, Cancelled",
      }),
    );
    custom = Filters.commaSeparated(raw);
  }

  return [...selected.filter((s) => s !== "__custom__"), ...custom];
}

async function promptStatesWereEver(): Promise<string[]> {
  const use = assertNotCancelled(
    await confirm({ message: "Filter by states the item was ever in?", initialValue: false }),
  );
  if (!use) return [];

  const selected = assertNotCancelled(
    await multiselect({
      message: "States the item was ever in:",
      options: [
        { label: "New", value: "New" },
        { label: "Active", value: "Active" },
        { label: "Resolved", value: "Resolved" },
        { label: "Closed", value: "Closed" },
        { label: "Removed", value: "Removed" },
        { label: "+ Add custom state", value: "__custom__" },
      ],
      required: true,
    }),
  );

  let custom: string[] = [];
  if (selected.includes("__custom__")) {
    const raw = assertNotCancelled(
      await text({
        message: "Custom states (comma-separated):",
        placeholder: "e.g. In Review, On Hold",
      }),
    );
    custom = Filters.commaSeparated(raw);
  }

  return [...selected.filter((s) => s !== "__custom__"), ...custom];
}

async function promptAssignedTo(): Promise<string[]> {
  const use = assertNotCancelled(
    await confirm({ message: "Filter by assigned-to?", initialValue: false }),
  );
  if (!use) return [];

  return Filters.commaSeparated(
    assertNotCancelled(
      await text({
        message: "Assigned to (comma-separated email addresses or @Me):",
        placeholder: "e.g. alice@example.com, @Me",
      }),
    ),
  );
}

async function promptPriority(): Promise<FilterCriteria["priority"]> {
  const use = assertNotCancelled(
    await confirm({ message: "Filter by priority range?", initialValue: false }),
  );
  if (!use) return undefined;

  const minRaw = assertNotCancelled(
    await text({
      message: "Minimum priority (1-5):",
      defaultValue: "1",
      placeholder: "e.g. 1",
      validate: Validators.numericRange("Priority", 1, 5),
    }),
  );
  const maxRaw = assertNotCancelled(
    await text({
      message: "Maximum priority (1-5):",
      defaultValue: "3",
      placeholder: "e.g. 3",
      validate: Validators.numericRange("Priority", 1, 5),
    }),
  );

  return { min: Number(minRaw), max: Number(maxRaw) };
}

async function promptDateFilter(
  selectMessage: string,
  customMessage: string,
): Promise<string | undefined> {
  const preset = assertNotCancelled(
    await select<DateFilterPreset>({
      message: selectMessage,
      options: DATE_FILTER_OPTIONS,
      initialValue: "none" as const,
    }),
  );

  if (preset === "none") return undefined;

  if (preset === "custom") {
    return assertNotCancelled(
      await text({
        message: customMessage,
        placeholder: "e.g. 2026-01-01 or @Today-60",
        validate: (input): string | undefined => {
          if (!input || input.trim() === "") return "Date is required";
          return undefined;
        },
      }),
    );
  }

  return preset;
}

async function promptCustomQuery(): Promise<string | undefined> {
  const use = assertNotCancelled(
    await confirm({
      message: "Use a custom query string? (overrides other filters)",
      initialValue: false,
    }),
  );
  if (!use) return undefined;

  return assertNotCancelled(
    await text({
      message: "Enter custom query (e.g., WIQL for Azure DevOps):",
      validate: (input): string | undefined => {
        if (!input || input.trim() === "") return "Custom query cannot be empty";
        return undefined;
      },
    }),
  );
}

/**
 * Configure custom field filters
 */
async function configureCustomFields(): Promise<CustomFieldFilter[]> {
  const customFields: CustomFieldFilter[] = [];
  let addMore = true;

  console.log("\nCustom Fields Configuration:");

  while (addMore) {
    const fieldName = assertNotCancelled(
      await text({
        message: "Field name:",
        placeholder: "e.g. Custom.TeamPriority, System.Tags",
        validate: (input): string | undefined => {
          if (!input || input.trim() === "") {
            return "Field name is required";
          }
          return undefined;
        },
      }),
    );

    const operator = assertNotCancelled(
      await select({
        message: "Operator:",
        options: [
          { label: "Equals", value: "equals" },
          { label: "Not Equals", value: "notEquals" },
          { label: "Contains", value: "contains" },
          { label: "Greater Than", value: "greaterThan" },
          { label: "Less Than", value: "lessThan" },
        ],
      }),
    );

    const valueStr = assertNotCancelled(
      await text({
        message: "Value:",
        validate: (input): string | undefined => {
          if (!input || input.trim() === "") {
            return "Value is required";
          }
          return undefined;
        },
      }),
    );

    let parsedValue: string | number | boolean = valueStr;
    if (!Number.isNaN(Number(valueStr))) {
      parsedValue = Number(valueStr);
    } else if (valueStr.toLowerCase() === "true") {
      parsedValue = true;
    } else if (valueStr.toLowerCase() === "false") {
      parsedValue = false;
    }

    customFields.push({
      field: fieldName,
      operator: operator as CustomFieldFilter["operator"],
      value: parsedValue,
    });

    addMore = assertNotCancelled(
      await confirm({
        message: "Add another custom field filter?",
        initialValue: false,
      }),
    );
  }

  return customFields;
}

/**
 * Configure estimation settings
 */
export async function configureEstimation(): Promise<
  EstimationConfig | undefined
> {
  const rounding = assertNotCancelled(
    await select({
      message: "Rounding strategy:",
      options: [
        { label: "Nearest integer", value: "nearest" },
        { label: "Round up", value: "up" },
        { label: "Round down", value: "down" },
        { label: "No rounding", value: "none" },
      ],
      initialValue: "none",
    }),
  );

  const minimumTaskPointsRaw = assertNotCancelled(
    await text({
      message: "Minimum task points (0 for no minimum):",
      defaultValue: "0",
      validate: (input): string | undefined => {
        const n = Number(input);
        if (Number.isNaN(n)) return "Must be a valid number";
        if (n < 0) return "Cannot be negative";
        return undefined;
      },
    }),
  );

  return {
    strategy: "percentage",
    rounding: rounding as EstimationConfig["rounding"],
    minimumTaskPoints: Number(minimumTaskPointsRaw) || undefined,
  };
}

/**
 * Configure validation rules
 */
export async function configureValidation(): Promise<
  ValidationConfig | undefined
> {
  const validation: ValidationConfig = {};

  const validationType = assertNotCancelled(
    await select({
      message: "Estimation validation type:",
      options: [
        { label: "Must equal 100%", value: "exact" },
        { label: "Range (e.g., 95-105%)", value: "range" },
        { label: "No validation", value: "none" },
      ],
      initialValue: "exact",
    }),
  );

  if (validationType === "exact") {
    validation.totalEstimationMustBe = 100;
  } else if (validationType === "range") {
    const minRaw = assertNotCancelled(
      await text({
        message: "Minimum total estimation %:",
        defaultValue: "95",
        placeholder: "e.g. 95",
      }),
    );
    const maxRaw = assertNotCancelled(
      await text({
        message: "Maximum total estimation %:",
        defaultValue: "105",
        placeholder: "e.g. 105",
      }),
    );
    validation.totalEstimationRange = {
      min: Number(minRaw),
      max: Number(maxRaw),
    };
  }

  const taskLimits = assertNotCancelled(
    await confirm({
      message: "Set task count limits?",
      initialValue: false,
    }),
  );

  if (taskLimits) {
    const minTasksRaw = assertNotCancelled(
      await text({
        message: "Minimum number of tasks:",
        defaultValue: "3",
        validate: Validators.nonNegative("Minimum tasks"),
        placeholder: "e.g. 3",
      }),
    );
    const maxTasksRaw = assertNotCancelled(
      await text({
        message: "Maximum number of tasks:",
        defaultValue: "10",
        placeholder: "e.g. 10",
        validate: Validators.greaterThan("Maximum tasks", Number(minTasksRaw)),
      }),
    );

    validation.minTasks = Number(minTasksRaw);
    validation.maxTasks = Number(maxTasksRaw);
  }

  return Object.keys(validation).length > 0 ? validation : undefined;
}

/**
 * Configure metadata
 */
export async function configureMetadata(): Promise<Metadata | undefined> {
  const metadata: Metadata = {};

  const category = assertNotCancelled(
    await text({
      message: "Category:",
      placeholder: "e.g. Backend Development",
    }),
  );

  const difficulty = assertNotCancelled(
    await select({
      message: "Difficulty level:",
      options: [
        { label: "Beginner", value: "beginner" },
        { label: "Intermediate", value: "intermediate" },
        { label: "Advanced", value: "advanced" },
      ],
    }),
  );

  const recommendedForRaw = assertNotCancelled(
    await text({
      message: "Recommended for (comma-separated):",
      placeholder: "e.g. senior developers, backend teams",
    }),
  );
  const recommendedFor = Filters.commaSeparated(recommendedForRaw);

  const estimationGuidelines = assertNotCancelled(
    await text({
      message: "Estimation guidelines:",
      placeholder: "e.g. Use story points based on complexity",
    }),
  );

  if (category) metadata.category = category;
  if (difficulty) metadata.difficulty = difficulty as Metadata["difficulty"];
  if (recommendedFor.length > 0) metadata.recommendedFor = recommendedFor;
  if (estimationGuidelines)
    metadata.estimationGuidelines = estimationGuidelines;

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

interface BasicInfoResult {
  name: string;
  description?: string;
  author?: string;
  tags?: string[];
}

/**
 * Configure basic template information
 */
export async function configureBasicInfo(
  defaults?: Partial<BasicInfoResult>,
): Promise<BasicInfoResult> {
  const name = assertNotCancelled(
    await text({
      message: "Template name:",
      defaultValue: defaults?.name,
      validate: (input): string | undefined => {
        if (!input || input.trim() === "") {
          return "Template name is required";
        }
        if (input.length > 200) {
          return "Template name must be 200 characters or less";
        }
        return undefined;
      },
    }),
  );

  const description = assertNotCancelled(
    await text({
      message: "Description (optional):",
      placeholder: "e.g. Generate tasks for backend API development",
      defaultValue: defaults?.description || "",
      validate: (input): string | undefined => {
        if (input && input.length > 500) {
          return "Description must be 500 characters or less";
        }
        return undefined;
      },
    }),
  );

  const author = assertNotCancelled(
    await text({
      message: "Author:",
      placeholder: "e.g. John Doe",
      defaultValue: defaults?.author || "Atomize",
    }),
  );

  const tagsRaw = assertNotCancelled(
    await text({
      message: "Tags (comma-separated, optional):",
      placeholder: "e.g. backend, api, development",
      defaultValue: defaults?.tags ? defaults.tags.join(", ") : "",
    }),
  );
  const tags = Filters.commaSeparated(tagsRaw);

  return {
    name,
    description: description || undefined,
    author: author || undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}
