import { confirm, multiselect, select, text } from "@clack/prompts";
import type { SavedQueryInfo } from "@platforms/interfaces/platform.interface";
import type {
  EstimationConfig,
  FilterCriteria,
  Metadata,
  ValidationConfig,
} from "@templates/schema";
import {
  assertNotCancelled,
  Filters,
  selectOrAutocomplete,
  Validators,
} from "../../utilities/prompt-utilities";

/**
 * Live ADO data required by the filter wizard.  All fields are populated from
 * the connected Azure DevOps adapter before the wizard starts.
 */
export interface FilterWizardContext {
  workItemTypes: string[];
  getStatesForType: (type: string) => Promise<string[]>;
  areaPaths: string[];
  iterationPaths: string[];
  teams: string[];
  savedQueries: SavedQueryInfo[];
}

type AdvancedFilterGroup =
  | "scope"
  | "stateHistory"
  | "assignment"
  | "dates";
const ADVANCED_GROUP_ORDER: AdvancedFilterGroup[] = [
  "scope",
  "stateHistory",
  "assignment",
  "dates",
];

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
export async function configureFilter(ctx: FilterWizardContext): Promise<FilterCriteria> {
  const filterOptions = [
    { label: "Build a filter  — choose types, states, tags, etc.", value: "structured" },
    ...(ctx.savedQueries.length > 0
      ? [{ label: "Use a saved query  — pick from your Azure DevOps queries", value: "savedQuery" }]
      : []),
  ];

  const filterMode = assertNotCancelled(
    await select({
      message: "How do you want to select work items?",
      options: filterOptions,
      initialValue: "structured",
    }),
  ) as "structured" | "savedQuery";

  if (filterMode === "savedQuery") {
    return promptSavedQuery(ctx.savedQueries);
  }

  const filter: FilterCriteria = {};

  const workItemTypes = await promptWorkItemTypes(ctx);
  if (workItemTypes.length > 0) filter.workItemTypes = workItemTypes;

  const states = await promptStates(ctx, workItemTypes);
  if (states.length > 0) filter.states = states;

  const tags = await promptTags();
  if (tags) filter.tags = tags;

  if (await promptExcludeIfHasTasks()) filter.excludeIfHasTasks = true;

  const selectedGroups = assertNotCancelled(
    await multiselect<AdvancedFilterGroup>({
      message: "Advanced filters (press Enter to skip):",
      options: [
        { label: "Scope  — team, area paths, iterations", value: "scope" },
        {
          label: "State history  — exclude states, were ever in",
          value: "stateHistory",
        },
        { label: "Assignment  — assigned-to, priority", value: "assignment" },
        { label: "Dates  — changed after, created after", value: "dates" },
      ],
      required: false,
    }),
  ) as AdvancedFilterGroup[];

  // Process groups in a fixed order regardless of tick order
  for (const group of ADVANCED_GROUP_ORDER.filter((g) =>
    selectedGroups.includes(g),
  )) {
    switch (group) {
      case "scope": {
        const team = await promptTeam(ctx);
        if (team) filter.team = team;

        const { exact: areaPaths, under: areaPathsUnder } =
          await promptAreaPaths(ctx);
        if (areaPaths.length > 0) filter.areaPaths = areaPaths;
        if (areaPathsUnder.length > 0) filter.areaPathsUnder = areaPathsUnder;

        const { exact: iterations, under: iterationsUnder } =
          await promptIterations(ctx);
        if (iterations.length > 0) filter.iterations = iterations;
        if (iterationsUnder.length > 0)
          filter.iterationsUnder = iterationsUnder;
        break;
      }
      case "stateHistory": {
        const statesExclude = await promptStatesExclude(ctx, workItemTypes);
        if (statesExclude.length > 0) filter.statesExclude = statesExclude;

        const statesWereEver = await promptStatesWereEver(ctx, workItemTypes);
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
    }
  }

  return filter;
}

async function promptSavedQuery(queries: SavedQueryInfo[]): Promise<FilterCriteria> {
  // queries is guaranteed non-empty — the option is hidden in configureFilter when the list is empty
  const sorted = [...queries].sort((a, b) => {
    if (a.isPublic !== b.isPublic) return a.isPublic ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  const selectedId = await selectOrAutocomplete({
    message: "Select saved query:",
    options: sorted.map((q) => ({
      label: q.path,
      hint: q.id,
      value: q.id,
    })),
    placeholder: "Type to filter by path or name...",
  });

  const excludeIfHasTasks = assertNotCancelled(
    await confirm({
      message: "Exclude work items that already have tasks?",
      initialValue: true,
    }),
  );

  return {
    savedQuery: { id: selectedId.trim() },
    ...(excludeIfHasTasks && { excludeIfHasTasks: true }),
  };
}

async function promptWorkItemTypes(ctx: FilterWizardContext): Promise<string[]> {
  const defaultType = ctx.workItemTypes.includes("User Story") ? "User Story" : undefined;
  const sorted = [
    ...(defaultType ? [defaultType] : []),
    ...ctx.workItemTypes.filter((t) => t !== defaultType).sort((a, b) => a.localeCompare(b)),
  ];
  const selected = assertNotCancelled(
    await multiselect({
      message: "Select work item types:",
      options: sorted.map((t) => ({ label: t, value: t })),
      initialValues: defaultType ? [defaultType] : [],
      required: false,
    }),
  );
  return selected as string[];
}

async function promptStates(ctx: FilterWizardContext, selectedTypes?: string[]): Promise<string[]> {
  if (!selectedTypes || selectedTypes.length === 0) return [];

  const allStates = await Promise.all(selectedTypes.map((t) => ctx.getStatesForType(t)));
  const stateSet = [...new Set(allStates.flat())];
  if (stateSet.length === 0) return [];

  const initialCount = stateSet.length;
  const selected: string[] = [];
  let addMore = true;
  while (addMore) {
    const remaining = stateSet.filter((s) => !selected.includes(s));
    if (remaining.length === 0) break;
    const pick = await selectOrAutocomplete({
      message: selected.length === 0 ? "Select state:" : "Add another state (or press Esc to finish):",
      options: remaining.map((s) => ({ label: s, value: s })),
      placeholder: "Type to filter...",
      thresholdCount: initialCount,
    });
    selected.push(pick);
    if (remaining.length > 1) {
      addMore = assertNotCancelled(
        await confirm({ message: "Add another state?", initialValue: false }),
      );
    } else {
      addMore = false;
    }
  }
  return selected;
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

async function promptTeam(ctx: FilterWizardContext): Promise<string | undefined> {
  const options = [
    { label: "No team filter", value: "" },
    ...ctx.teams.map((t) => ({ label: t, value: t })),
  ];
  const pick = await selectOrAutocomplete({
    message: "Override team for this template? (affects @CurrentIteration and @TeamAreas) — select or press Esc to skip:",
    options,
    placeholder: "Type to filter teams...",
  });
  return pick || undefined;
}

async function promptAreaPaths(ctx: FilterWizardContext): Promise<{
  exact: string[];
  under: string[];
}> {
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

  // "exact" / "under" / "mixed" — pick from live area paths
  const initialAreaCount = ctx.areaPaths.length;
  const selected: string[] = [];
  let addMore = true;
  while (addMore) {
    const remaining = ctx.areaPaths.filter((p) => !selected.includes(p));
    if (remaining.length === 0) break;
    const pick = await selectOrAutocomplete({
      message: selected.length === 0 ? "Select area path:" : "Add another area path (or press Esc to finish):",
      options: remaining.map((p) => ({ label: p, value: p })),
      placeholder: "Type to filter...",
      thresholdCount: initialAreaCount,
    });
    selected.push(pick);
    if (remaining.length > 1) {
      addMore = assertNotCancelled(
        await confirm({ message: "Add another area path?", initialValue: false }),
      );
    } else {
      addMore = false;
    }
  }

  if (mode === "under") return { exact: [], under: selected };
  if (mode === "mixed") return { exact: ["@TeamAreas", ...selected], under: [] };
  return { exact: selected, under: [] };
}

async function promptIterations(ctx: FilterWizardContext): Promise<{
  exact: string[];
  under: string[];
}> {
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

  // "exact" / "under" / "mixed" — pick from live iteration paths
  const initialIterCount = ctx.iterationPaths.length;
  const selected: string[] = [];
  let addMore = true;
  while (addMore) {
    const remaining = ctx.iterationPaths.filter((p) => !selected.includes(p));
    if (remaining.length === 0) break;
    const pick = await selectOrAutocomplete({
      message: selected.length === 0 ? "Select iteration path:" : "Add another iteration path (or press Esc to finish):",
      options: remaining.map((p) => ({ label: p, value: p })),
      placeholder: "Type to filter...",
      thresholdCount: initialIterCount,
    });
    selected.push(pick);
    if (remaining.length > 1) {
      addMore = assertNotCancelled(
        await confirm({ message: "Add another iteration path?", initialValue: false }),
      );
    } else {
      addMore = false;
    }
  }

  if (mode === "under") return { exact: [], under: selected };
  if (mode === "mixed") return { exact: ["@CurrentIteration", ...selected], under: [] };
  return { exact: selected, under: [] };
}

async function promptStatesExclude(ctx: FilterWizardContext, selectedTypes?: string[]): Promise<string[]> {
  const use = assertNotCancelled(
    await confirm({ message: "Exclude specific states?", initialValue: false }),
  );
  if (!use) return [];
  return pickStates(ctx, selectedTypes, "Select state to exclude:", "Add another state to exclude (or press Esc to finish):");
}

async function promptStatesWereEver(ctx: FilterWizardContext, selectedTypes?: string[]): Promise<string[]> {
  const use = assertNotCancelled(
    await confirm({ message: "Filter by states the item was ever in?", initialValue: false }),
  );
  if (!use) return [];
  return pickStates(ctx, selectedTypes, "Select state:", "Add another state (or press Esc to finish):");
}

/** Shared autocomplete loop for state-picking prompts. */
async function pickStates(
  ctx: FilterWizardContext,
  selectedTypes: string[] | undefined,
  firstMessage: string,
  moreMessage: string,
): Promise<string[]> {
  if (!selectedTypes || selectedTypes.length === 0) return [];

  const allStates = await Promise.all(selectedTypes.map((t) => ctx.getStatesForType(t)));
  const stateSet = [...new Set(allStates.flat())];
  if (stateSet.length === 0) return [];

  const initialCount = stateSet.length;
  const selected: string[] = [];
  let addMore = true;
  while (addMore) {
    const remaining = stateSet.filter((s) => !selected.includes(s));
    if (remaining.length === 0) break;
    const pick = await selectOrAutocomplete({
      message: selected.length === 0 ? firstMessage : moreMessage,
      options: remaining.map((s) => ({ label: s, value: s })),
      placeholder: "Type to filter...",
      thresholdCount: initialCount,
    });
    selected.push(pick);
    if (remaining.length > 1) {
      addMore = assertNotCancelled(
        await confirm({ message: "Add another state?", initialValue: false }),
      );
    } else {
      addMore = false;
    }
  }
  return selected;
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
    await confirm({
      message: "Filter by priority range?",
      initialValue: false,
    }),
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
        validate: (input): string | undefined => {
          if (!input || input.trim() === "") return undefined;
          const n = Number(input);
          if (Number.isNaN(n)) return "Must be a valid number";
          if (n < Number(minRaw))
            return `Maximum must be ≥ minimum (${minRaw}%)`;
          return undefined;
        },
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
