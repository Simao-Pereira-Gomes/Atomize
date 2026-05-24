import { confirm, multiselect, select, text } from "@clack/prompts";
import type { SavedQueryInfo } from "@platforms/interfaces/platform.interface";
import type { TemplateCatalogItem } from "@services/template/template-catalog";
import type {
  EstimationConfig,
  FilterCriteria,
  Metadata,
  ValidationConfig,
} from "@templates/schema";
import chalk from "chalk";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import {
  assertNotCancelled,
  Filters,
  selectOrAutocomplete,
  Validators,
} from "../../utilities/prompt-utilities";

const output = createCommandOutput(resolveCommandOutputPolicy({}));

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
type DateFilterChoice =
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

const DATE_FILTER_OPTIONS: { label: string; value: DateFilterChoice }[] = [
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

/** Derive which advanced filter groups have values in an existing filter. */
function deriveActiveGroups(filter: FilterCriteria): AdvancedFilterGroup[] {
  const groups: AdvancedFilterGroup[] = [];
  if (
    filter.team ||
    (filter.areaPaths && filter.areaPaths.length > 0) ||
    (filter.areaPathsUnder && filter.areaPathsUnder.length > 0) ||
    (filter.iterations && filter.iterations.length > 0) ||
    (filter.iterationsUnder && filter.iterationsUnder.length > 0)
  ) {
    groups.push("scope");
  }
  if (
    (filter.statesExclude && filter.statesExclude.length > 0) ||
    (filter.statesWereEver && filter.statesWereEver.length > 0)
  ) {
    groups.push("stateHistory");
  }
  if ((filter.assignedTo && filter.assignedTo.length > 0) || filter.priority) {
    groups.push("assignment");
  }
  if (filter.changedAfter || filter.createdAfter) {
    groups.push("dates");
  }
  return groups;
}

/** Derive the AreaFilterMode from an existing filter's areaPaths / areaPathsUnder. */
function deriveAreaPathMode(exact: string[], under: string[]): AreaFilterMode {
  if (exact.length === 0 && under.length === 0) return "none";
  if (under.length > 0 && exact.length === 0) return "under";
  if (exact.length === 1 && exact[0] === "@TeamAreas") return "@TeamAreas";
  if (exact.includes("@TeamAreas")) return "mixed";
  return "exact";
}

/** Derive the IterationFilterMode from an existing filter's iterations / iterationsUnder. */
function deriveIterationMode(exact: string[], under: string[]): IterationFilterMode {
  if (exact.length === 0 && under.length === 0) return "none";
  if (under.length > 0 && exact.length === 0) return "under";
  if (exact.length === 1) {
    if (exact[0] === "@CurrentIteration") return "@CurrentIteration";
    if (exact[0] === "@CurrentIteration + 1") return "@CurrentIteration+1";
    if (exact[0] === "@CurrentIteration - 1") return "@CurrentIteration-1";
  }
  if (exact.some((p) => p.startsWith("@CurrentIteration"))) return "mixed";
  return "exact";
}

/**
 * Configure filter criteria with support for custom query and custom fields.
 * When `defaults` is supplied the wizard pre-fills every prompt with the
 * existing template's filter values so only changed fields need new input.
 */
export async function configureFilter(ctx: FilterWizardContext, defaults?: FilterCriteria): Promise<FilterCriteria> {
  const filterOptions = [
    { label: "Build a filter  — choose types, states, tags, etc.", value: "structured" },
    ...(ctx.savedQueries.length > 0
      ? [{ label: "Use a saved query  — pick from your Azure DevOps queries", value: "savedQuery" }]
      : []),
  ];

  const defaultFilterMode = defaults?.savedQuery ? "savedQuery" : "structured";
  const filterMode = assertNotCancelled(
    await select({
      message: "How do you want to select work items?",
      options: filterOptions,
      initialValue: defaultFilterMode,
    }),
  ) as "structured" | "savedQuery";

  if (filterMode === "savedQuery") {
    return promptSavedQuery(ctx.savedQueries);
  }

  const filter: FilterCriteria = {};

  const workItemTypes = await promptWorkItemTypes(ctx, defaults?.workItemTypes);
  if (workItemTypes.length > 0) filter.workItemTypes = workItemTypes;

  const states = await promptStates(ctx, workItemTypes, defaults?.states);
  if (states.length > 0) filter.states = states;

  const tags = await promptTags(defaults?.tags);
  if (tags) filter.tags = tags;
  const excludeDefault = defaults !== undefined ? (defaults.excludeIfHasTasks ?? false) : undefined;
  if (await promptExcludeIfHasTasks(excludeDefault)) filter.excludeIfHasTasks = true;

  const activeGroups = defaults ? deriveActiveGroups(defaults) : [];
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
      initialValues: activeGroups,
      required: false,
    }),
  ) as AdvancedFilterGroup[];

  // Process groups in a fixed order regardless of tick order
  for (const group of ADVANCED_GROUP_ORDER.filter((g) =>
    selectedGroups.includes(g),
  )) {
    switch (group) {
      case "scope": {
        const team = await promptTeam(ctx, defaults?.team);
        if (team) filter.team = team;

        const { exact: areaPaths, under: areaPathsUnder } =
          await promptAreaPaths(ctx, {
            exact: defaults?.areaPaths,
            under: defaults?.areaPathsUnder,
          });
        if (areaPaths.length > 0) filter.areaPaths = areaPaths;
        if (areaPathsUnder.length > 0) filter.areaPathsUnder = areaPathsUnder;

        const { exact: iterations, under: iterationsUnder } =
          await promptIterations(ctx, {
            exact: defaults?.iterations,
            under: defaults?.iterationsUnder,
          });
        if (iterations.length > 0) filter.iterations = iterations;
        if (iterationsUnder.length > 0)
          filter.iterationsUnder = iterationsUnder;
        break;
      }
      case "stateHistory": {
        const statesExclude = await promptStatesExclude(ctx, workItemTypes, defaults?.statesExclude);
        if (statesExclude.length > 0) filter.statesExclude = statesExclude;

        const statesWereEver = await promptStatesWereEver(ctx, workItemTypes, defaults?.statesWereEver);
        if (statesWereEver.length > 0) filter.statesWereEver = statesWereEver;
        break;
      }
      case "assignment": {
        const assignedTo = await promptAssignedTo(defaults?.assignedTo);
        if (assignedTo.length > 0) filter.assignedTo = assignedTo;

        const priority = await promptPriority(defaults?.priority);
        if (priority) filter.priority = priority;
        break;
      }
      case "dates": {
        const changedAfter = await promptDateFilter(
          "Filter by last modified date:",
          "Changed after (date or @Today offset):",
          defaults?.changedAfter,
        );
        if (changedAfter) filter.changedAfter = changedAfter;

        const createdAfter = await promptDateFilter(
          "Filter by creation date:",
          "Created after (date or @Today offset):",
          defaults?.createdAfter,
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

async function promptWorkItemTypes(ctx: FilterWizardContext, defaults?: string[]): Promise<string[]> {
  const defaultType = ctx.workItemTypes.includes("User Story") ? "User Story" : undefined;
  const sorted = [
    ...(defaultType ? [defaultType] : []),
    ...ctx.workItemTypes.filter((t) => t !== defaultType).sort((a, b) => a.localeCompare(b)),
  ];
  const initialValues =
    defaults && defaults.length > 0
      ? defaults.filter((t) => ctx.workItemTypes.includes(t))
      : defaultType
        ? [defaultType]
        : [];
  const selected = assertNotCancelled(
    await multiselect({
      message: "Select work item types:",
      options: sorted.map((t) => ({ label: t, value: t })),
      initialValues,
      required: false,
    }),
  );
  return selected as string[];
}

async function promptStates(ctx: FilterWizardContext, selectedTypes?: string[], defaults?: string[]): Promise<string[]> {
  if (!selectedTypes || selectedTypes.length === 0) return [];

  const allStates = await Promise.all(selectedTypes.map((t) => ctx.getStatesForType(t)));
  const stateSet = [...new Set(allStates.flat())];
  if (stateSet.length === 0) return [];

  // If defaults exist, offer to keep them without re-entering the selection loop.
  if (defaults && defaults.length > 0) {
    const valid = defaults.filter((s) => stateSet.includes(s));
    if (valid.length > 0) {
      output.print(chalk.gray(`  Current states: ${valid.join(", ")}`));
      const keep = assertNotCancelled(
        await confirm({ message: "Keep current states?", initialValue: true }),
      );
      if (keep) return valid;
    }
  }

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

async function promptTags(defaults?: FilterCriteria["tags"]): Promise<FilterCriteria["tags"]> {
  const hasTags = !!(defaults?.include?.length || defaults?.exclude?.length);
  const useTags = assertNotCancelled(
    await confirm({ message: "Filter by tags?", initialValue: hasTags }),
  );
  if (!useTags) return undefined;

  const includeRaw = assertNotCancelled(
    await text({
      message: "Tags to include (comma-separated):",
      placeholder: "e.g. backend, api",
      initialValue: defaults?.include?.join(", ") ?? "",
    }),
  );
  const excludeRaw = assertNotCancelled(
    await text({
      message: "Tags to exclude (comma-separated):",
      placeholder: "e.g. wip, blocked",
      initialValue: defaults?.exclude?.join(", ") ?? "",
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

async function promptExcludeIfHasTasks(defaults?: boolean): Promise<boolean> {
  return assertNotCancelled(
    await confirm({
      message: "Exclude work items that already have tasks?",
      initialValue: defaults ?? true,
    }),
  );
}

async function promptTeam(ctx: FilterWizardContext, defaults?: string): Promise<string | undefined> {
  if (defaults) {
    output.print(chalk.gray(`  Current team: ${defaults}`));
  }
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

/** Shared pick-from-list loop for area paths and iteration paths. */
async function pickPathsFromList(
  paths: string[],
  firstMessage: string,
  moreMessage: string,
  confirmMessage: string,
): Promise<string[]> {
  const initialCount = paths.length;
  const selected: string[] = [];
  let addMore = true;
  while (addMore) {
    const remaining = paths.filter((p) => !selected.includes(p));
    if (remaining.length === 0) break;
    const pick = await selectOrAutocomplete({
      message: selected.length === 0 ? firstMessage : moreMessage,
      options: remaining.map((p) => ({ label: p, value: p })),
      placeholder: "Type to filter...",
      thresholdCount: initialCount,
    });
    selected.push(pick);
    if (remaining.length > 1) {
      addMore = assertNotCancelled(
        await confirm({ message: confirmMessage, initialValue: false }),
      );
    } else {
      addMore = false;
    }
  }
  return selected;
}

async function promptAreaPaths(ctx: FilterWizardContext, defaults?: {
  exact?: string[];
  under?: string[];
}): Promise<{
  exact: string[];
  under: string[];
}> {
  const defaultExact = defaults?.exact ?? [];
  const defaultUnder = defaults?.under ?? [];
  const initialMode = deriveAreaPathMode(defaultExact, defaultUnder);

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
      initialValue: initialMode,
    }),
  );

  if (mode === "none") return { exact: [], under: [] };
  if (mode === "@TeamAreas") return { exact: ["@TeamAreas"], under: [] };

  // Derive pre-selected paths from defaults (excluding the @TeamAreas sentinel)
  const preSelected = (
    mode === "under"
      ? defaultUnder
      : defaultExact.filter((p) => p !== "@TeamAreas")
  ).filter((p) => ctx.areaPaths.includes(p));

  let selected: string[];
  if (preSelected.length > 0) {
    output.print(chalk.gray(`  Current paths: ${preSelected.join(", ")}`));
    const keep = assertNotCancelled(
      await confirm({ message: "Keep current area paths?", initialValue: true }),
    );
    selected = keep
      ? preSelected
      : await pickPathsFromList(ctx.areaPaths, "Select area path:", "Add another area path (or press Esc to finish):", "Add another area path?");
  } else {
    selected = await pickPathsFromList(ctx.areaPaths, "Select area path:", "Add another area path (or press Esc to finish):", "Add another area path?");
  }

  if (mode === "under") return { exact: [], under: selected };
  if (mode === "mixed") return { exact: ["@TeamAreas", ...selected], under: [] };
  return { exact: selected, under: [] };
}

async function promptIterations(ctx: FilterWizardContext, defaults?: {
  exact?: string[];
  under?: string[];
}): Promise<{
  exact: string[];
  under: string[];
}> {
  const defaultExact = defaults?.exact ?? [];
  const defaultUnder = defaults?.under ?? [];
  const initialMode = deriveIterationMode(defaultExact, defaultUnder);

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
      initialValue: initialMode,
    }),
  );

  if (mode === "none") return { exact: [], under: [] };
  if (mode === "@CurrentIteration") return { exact: ["@CurrentIteration"], under: [] };
  if (mode === "@CurrentIteration+1") return { exact: ["@CurrentIteration + 1"], under: [] };
  if (mode === "@CurrentIteration-1") return { exact: ["@CurrentIteration - 1"], under: [] };

  // Derive pre-selected paths (excluding @CurrentIteration sentinels)
  const preSelected = (
    mode === "under"
      ? defaultUnder
      : defaultExact.filter((p) => !p.startsWith("@CurrentIteration"))
  ).filter((p) => ctx.iterationPaths.includes(p));

  let selected: string[];
  if (preSelected.length > 0) {
    output.print(chalk.gray(`  Current iterations: ${preSelected.join(", ")}`));
    const keep = assertNotCancelled(
      await confirm({ message: "Keep current iteration paths?", initialValue: true }),
    );
    selected = keep
      ? preSelected
      : await pickPathsFromList(ctx.iterationPaths, "Select iteration path:", "Add another iteration path (or press Esc to finish):", "Add another iteration path?");
  } else {
    selected = await pickPathsFromList(ctx.iterationPaths, "Select iteration path:", "Add another iteration path (or press Esc to finish):", "Add another iteration path?");
  }

  if (mode === "under") return { exact: [], under: selected };
  if (mode === "mixed") return { exact: ["@CurrentIteration", ...selected], under: [] };
  return { exact: selected, under: [] };
}

async function promptStatesExclude(ctx: FilterWizardContext, selectedTypes?: string[], defaults?: string[]): Promise<string[]> {
  const use = assertNotCancelled(
    await confirm({ message: "Exclude specific states?", initialValue: false }),
  );
  if (!use) return [];
  return pickStates(ctx, selectedTypes, "Select state to exclude:", "Add another state to exclude (or press Esc to finish):", defaults);
}

async function promptStatesWereEver(ctx: FilterWizardContext, selectedTypes?: string[], defaults?: string[]): Promise<string[]> {
  const use = assertNotCancelled(
    await confirm({ message: "Filter by states the item was ever in?", initialValue: false }),
  );
  if (!use) return [];
  return pickStates(ctx, selectedTypes, "Select state:", "Add another state (or press Esc to finish):", defaults);
}

/** Shared autocomplete loop for state-picking prompts. */
async function pickStates(
  ctx: FilterWizardContext,
  selectedTypes: string[] | undefined,
  firstMessage: string,
  moreMessage: string,
  defaults?: string[],
): Promise<string[]> {
  if (!selectedTypes || selectedTypes.length === 0) return [];

  const allStates = await Promise.all(selectedTypes.map((t) => ctx.getStatesForType(t)));
  const stateSet = [...new Set(allStates.flat())];
  if (stateSet.length === 0) return [];

  // If defaults exist, offer to keep them without re-entering the selection loop.
  if (defaults && defaults.length > 0) {
    const valid = defaults.filter((s) => stateSet.includes(s));
    if (valid.length > 0) {
      output.print(chalk.gray(`  Current: ${valid.join(", ")}`));
      const keep = assertNotCancelled(
        await confirm({ message: "Keep current values?", initialValue: true }),
      );
      if (keep) return valid;
    }
  }

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

async function promptAssignedTo(defaults?: string[]): Promise<string[]> {
  const use = assertNotCancelled(
    await confirm({ message: "Filter by assigned-to?", initialValue: !!(defaults && defaults.length > 0) }),
  );
  if (!use) return [];

  return Filters.commaSeparated(
    assertNotCancelled(
      await text({
        message: "Assigned to (comma-separated email addresses or @Me):",
        placeholder: "e.g. alice@example.com, @Me",
        initialValue: defaults?.join(", ") ?? "",
      }),
    ),
  );
}

async function promptPriority(defaults?: FilterCriteria["priority"]): Promise<FilterCriteria["priority"]> {
  const use = assertNotCancelled(
    await confirm({
      message: "Filter by priority range?",
      initialValue: !!defaults,
    }),
  );
  if (!use) return undefined;

  const minRaw = assertNotCancelled(
    await text({
      message: "Minimum priority (1-5):",
      initialValue: String(defaults?.min ?? 1),
      placeholder: "e.g. 1",
      validate: Validators.numericRange("Priority", 1, 5),
    }),
  );
  const maxRaw = assertNotCancelled(
    await text({
      message: "Maximum priority (1-5):",
      initialValue: String(defaults?.max ?? 3),
      placeholder: "e.g. 3",
      validate: Validators.numericRange("Priority", 1, 5),
    }),
  );

  return { min: Number(minRaw), max: Number(maxRaw) };
}

async function promptDateFilter(
  selectMessage: string,
  customMessage: string,
  defaults?: string,
): Promise<string | undefined> {
  let initialValue: DateFilterChoice = "none";
  if (defaults) {
    const knownOption = DATE_FILTER_OPTIONS.find((o) => o.value === defaults);
    initialValue = knownOption ? knownOption.value : "custom";
  }

  const choice = assertNotCancelled(
    await select<DateFilterChoice>({
      message: selectMessage,
      options: DATE_FILTER_OPTIONS,
      initialValue,
    }),
  );

  if (choice === "none") return undefined;

  if (choice === "custom") {
    const customDefault =
      defaults && !DATE_FILTER_OPTIONS.find((o) => o.value === defaults) ? defaults : "";
    return assertNotCancelled(
      await text({
        message: customMessage,
        placeholder: "e.g. 2026-01-01 or @Today-60",
        initialValue: customDefault,
        validate: (input): string | undefined => {
          if (!input || input.trim() === "") return "Date is required";
          return undefined;
        },
      }),
    );
  }

  return choice;
}

/**
 * Configure estimation settings.
 * When `defaults` is supplied each prompt is pre-filled with the existing values.
 */
export async function configureEstimation(defaults?: Partial<EstimationConfig>): Promise<
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
      initialValue: defaults?.rounding ?? "none",
    }),
  );

  const minimumTaskPointsRaw = assertNotCancelled(
    await text({
      message: "Minimum task points (0 for no minimum):",
      initialValue: String(defaults?.minimumTaskPoints ?? 0),
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
 * Configure validation rules.
 * When `defaults` is supplied the prompts are pre-filled with the existing values.
 */
export async function configureValidation(defaults?: ValidationConfig): Promise<
  ValidationConfig | undefined
> {
  const validation: ValidationConfig = {};

  // Derive the initial type selection from defaults.
  let initialValidationType: "exact" | "range" | "none" = "exact";
  if (defaults) {
    if (defaults.totalEstimationMustBe !== undefined) {
      initialValidationType = "exact";
    } else if (defaults.totalEstimationRange !== undefined) {
      initialValidationType = "range";
    } else {
      initialValidationType = "none";
    }
  }

  const validationType = assertNotCancelled(
    await select({
      message: "Estimation validation type:",
      options: [
        { label: "Must equal 100%", value: "exact" },
        { label: "Range (e.g., 95-105%)", value: "range" },
        { label: "No validation", value: "none" },
      ],
      initialValue: initialValidationType,
    }),
  );

  if (validationType === "exact") {
    validation.totalEstimationMustBe = 100;
  } else if (validationType === "range") {
    const minRaw = assertNotCancelled(
      await text({
        message: "Minimum total estimation %:",
        initialValue: String(defaults?.totalEstimationRange?.min ?? 95),
        placeholder: "e.g. 95",
      }),
    );
    const maxRaw = assertNotCancelled(
      await text({
        message: "Maximum total estimation %:",
        initialValue: String(defaults?.totalEstimationRange?.max ?? 105),
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
      initialValue: !!(defaults?.minTasks || defaults?.maxTasks),
    }),
  );

  if (taskLimits) {
    const minTasksRaw = assertNotCancelled(
      await text({
        message: "Minimum number of tasks:",
        initialValue: String(defaults?.minTasks ?? 3),
        validate: Validators.nonNegative("Minimum tasks"),
        placeholder: "e.g. 3",
      }),
    );
    const maxTasksRaw = assertNotCancelled(
      await text({
        message: "Maximum number of tasks:",
        initialValue: String(defaults?.maxTasks ?? 10),
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
 * Configure metadata.
 * When `defaults` is supplied each prompt is pre-filled with the existing values.
 */
export async function configureMetadata(defaults?: Metadata): Promise<Metadata | undefined> {
  const metadata: Metadata = {};

  const category = assertNotCancelled(
    await text({
      message: "Category:",
      placeholder: "e.g. Backend Development",
      initialValue: defaults?.category ?? "",
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
      ...(defaults?.difficulty && { initialValue: defaults.difficulty }),
    }),
  );

  const recommendedForRaw = assertNotCancelled(
    await text({
      message: "Recommended for (comma-separated):",
      placeholder: "e.g. senior developers, backend teams",
      initialValue: defaults?.recommendedFor?.join(", ") ?? "",
    }),
  );
  const recommendedFor = Filters.commaSeparated(recommendedForRaw);

  const estimationGuidelines = assertNotCancelled(
    await text({
      message: "Estimation guidelines:",
      placeholder: "e.g. Use story points based on complexity",
      initialValue: defaults?.estimationGuidelines ?? "",
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
      initialValue: defaults?.name,
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
      initialValue: defaults?.description || "",
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
      initialValue: defaults?.author || "Atomize",
    }),
  );

  const tagsRaw = assertNotCancelled(
    await text({
      message: "Tags (comma-separated, optional):",
      placeholder: "e.g. backend, api, development",
      initialValue: defaults?.tags ? defaults.tags.join(", ") : "",
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

export interface TemplateCompositionResult {
  /** Logical ref (e.g. "template:feature"). */
  extendsRef: string | undefined;
  /** Logical mixin refs (e.g. "mixin:security"). */
  mixins: string[];
}

/**
 * Let the user choose a parent template and mixins.
 * The user can skip this step entirely.
 */
export async function configureTemplateComposition(input: {
  templates: TemplateCatalogItem[];
  mixins: TemplateCatalogItem[];
}): Promise<TemplateCompositionResult> {
  const output = createCommandOutput(resolveCommandOutputPolicy({}));
  output.print(chalk.bold("\nTemplate Inheritance & Mixins (optional):"));
  output.print(
    chalk.gray(
      "  Extending a template lets you inherit its filter, tasks, and settings.\n" +
        "  Mixins add reusable task groups. Fields you configure later override inherited values.\n",
    ),
  );

  const useTemplate =
    input.templates.length > 0
      ? assertNotCancelled(
          await confirm({
            message: "Extend an existing template?",
            initialValue: false,
          }),
        )
      : false;

  const extendsRef = useTemplate
    ? await promptTemplateRef(input.templates)
    : undefined;

  const useMixins =
    input.mixins.length > 0
      ? assertNotCancelled(
          await confirm({
            message: "Add mixins?",
            initialValue: false,
          }),
        )
      : false;

  const mixins = useMixins ? await promptMixinRefs(input.mixins) : [];
  return { extendsRef, mixins };
}

async function promptTemplateRef(templates: TemplateCatalogItem[]): Promise<string> {
  const discovered = templates.map((item) => ({
    label: formatCatalogChoice(item),
    value: item.ref,
    hint: item.description,
  }));

  const chosen = await selectOrAutocomplete({
    message: "Template:",
    options: discovered,
    placeholder: "Type to filter templates...",
  });
  return chosen;
}

export async function promptMixinRefs(
  mixins: TemplateCatalogItem[],
): Promise<string[]> {
  const selected: string[] = [];

  if (mixins.length === 0) {
    return [];
  }

  if (mixins.length < 4) {
    const picked = assertNotCancelled(
      await multiselect<string>({
        message: "Select mixins:",
        options: [
          ...mixins.map((item) => ({
            label: formatCatalogChoice(item),
            value: item.ref,
            hint: item.description,
          })),
        ],
        required: false,
      }),
    );

    return picked;
  }

  let addMore = true;
  while (addMore) {
    const remaining = mixins.filter((item) => !selected.includes(item.ref));
    if (remaining.length === 0) break;

    const picked = await selectOrAutocomplete({
      message: selected.length === 0 ? "Select mixin:" : "Add another mixin:",
      options: [
        ...remaining.map((item) => ({
          label: formatCatalogChoice(item),
          value: item.ref,
          hint: item.description,
        })),
      ],
      placeholder: "Type to filter mixins...",
      thresholdCount: mixins.length,
    });

    selected.push(picked);
    addMore = assertNotCancelled(
      await confirm({ message: "Add another mixin?", initialValue: false }),
    );
  }

  return selected;
}

function formatCatalogChoice(item: TemplateCatalogItem): string {
  return `${item.displayName} (${item.scope})`;
}
