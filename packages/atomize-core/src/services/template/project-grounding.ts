import { requireProjectMetadataReader, requireSavedQueryReader } from "../../platforms/capabilities";
import type { ADoFieldSchema } from "../../platforms/interfaces/field-schema.interface";
import type { IPlatformAdapter } from "../../platforms/interfaces/platform.interface";
import { AuthError, getErrorMessage } from "../../utils/errors";
import { buildEstimationGrounding } from "./estimation-grounding";

/**
 * Project Grounding (see CONTEXT.md): curated metadata about a Connection Profile's project that
 * keeps an AI draft to names and values that really exist there. Never carries a credential.
 */
export interface ProjectGrounding {
  workItemTypes: string[];
  statesByWorkItemType: Record<string, string[]>;
  areaPaths: string[];
  iterationPaths: string[];
  teams: string[];
  savedQueries: { id: string; path: string }[];
  taskFields: ADoFieldSchema[];
  fieldsByWorkItemType: Record<string, ADoFieldSchema[]>;
  estimation: ReturnType<typeof buildEstimationGrounding>;
}

export type ProjectGroundingErrorCode = "GROUNDING_AUTH_FAILED" | "GROUNDING_TOKEN_EXPIRED" | "GROUNDING_FETCH_FAILED";

export class ProjectGroundingError extends Error {
  constructor(readonly code: ProjectGroundingErrorCode, message: string) {
    super(message);
    this.name = "ProjectGroundingError";
  }
}

/** Reads Project Grounding from an authenticated adapter, throwing a ProjectGroundingError on any failure. */
export async function fetchProjectGrounding(adapter: IPlatformAdapter): Promise<ProjectGrounding> {
  try {
    const metadataReader = requireProjectMetadataReader(adapter);
    const queryReader = requireSavedQueryReader(adapter);
    const workItemTypes = await metadataReader.getWorkItemTypes();
    const estimationDefaults = adapter.getEstimationDefaults();
    const [states, areaPaths, iterationPaths, teams, savedQueries, taskFields, fieldsByWorkItemType] = await Promise.all([
      Promise.all(workItemTypes.map(async (type) => [type, await metadataReader.getStatesForWorkItemType(type)] as const)),
      metadataReader.getAreaPaths(),
      metadataReader.getIterationPaths(),
      metadataReader.getTeams(),
      queryReader.listSavedQueries(),
      metadataReader.getFieldSchemas(estimationDefaults.taskWorkItemType),
      Promise.all(workItemTypes.map(async (type) => [type, await metadataReader.getFieldSchemas(type)] as const)),
    ]);
    const fields = Object.fromEntries(fieldsByWorkItemType);
    return {
      workItemTypes,
      statesByWorkItemType: Object.fromEntries(states),
      areaPaths,
      iterationPaths,
      teams,
      savedQueries: savedQueries.map(({ id, path }) => ({ id, path })),
      taskFields,
      fieldsByWorkItemType: fields,
      estimation: buildEstimationGrounding(estimationDefaults, fields),
    };
  } catch (error) {
    throw toProjectGroundingError(error);
  }
}

/** Classifies any failure while connecting for, or reading, Project Grounding. */
export function toProjectGroundingError(error: unknown): ProjectGroundingError {
  if (error instanceof ProjectGroundingError) return error;
  const message = getErrorMessage(error);
  if (error instanceof AuthError || /authentication failed|access denied/i.test(message)) {
    return /token.*expired|personal access token.*expired/i.test(message)
      ? new ProjectGroundingError("GROUNDING_TOKEN_EXPIRED", "The Azure DevOps access token for this connection has expired.")
      : new ProjectGroundingError("GROUNDING_AUTH_FAILED", "Atomize could not sign in to this Azure DevOps project. Check its access token.");
  }
  return new ProjectGroundingError("GROUNDING_FETCH_FAILED", `Atomize could not load project metadata from Azure DevOps: ${message}`);
}

/**
 * The most Project Grounding a prompt carries. Raw metadata for a real project (every field of every
 * Work Item type) can run to hundreds of thousands of characters and exceed a model's input limit,
 * so prompts get a curated form that fits.
 */
export const PROJECT_GROUNDING_PROMPT_LIMIT = 30_000;

/** Work Item types Templates don't generate for or filter on; their fields only add noise. */
const NON_PLANNING_TYPES = /^(test (case|plan|suite)|shared (steps|parameter)|code review (request|response)|feedback (request|response))$/i;

/** System fields a Template may name; the rest are platform bookkeeping. */
const TEMPLATE_SYSTEM_FIELDS = new Set([
  "System.Title",
  "System.Description",
  "System.Tags",
  "System.State",
  "System.AreaPath",
  "System.IterationPath",
  "System.AssignedTo",
]);

type PromptField = { name: string; type: string; allowedValues?: string[] };

/** How much of each list a curated form keeps; each step is tighter than the last. */
const BUDGETS = [
  { values: 40, paths: 150, queries: 150, teams: 50 },
  { values: 15, paths: 60, queries: 60, teams: 20 },
  { values: 6, paths: 20, queries: 25, teams: 10 },
  { values: 0, paths: 0, queries: 0, teams: 0 },
] as const;

/**
 * Project Grounding as the prompt carries it: field details once, referenced by Work Item type,
 * without read-only, bookkeeping, or test-only fields, and with long lists shortened until it fits
 * the limit. `trimmed` says whether anything was shortened, so the AI and the user can know.
 */
export function projectGroundingForPrompt(grounding: ProjectGrounding, limit = PROJECT_GROUNDING_PROMPT_LIMIT): { text: string; trimmed: boolean } {
  let last = "";
  for (const budget of BUDGETS) {
    const { prompt, trimmed } = curate(grounding, budget);
    last = JSON.stringify(prompt);
    if (last.length <= limit) return { text: last, trimmed };
  }
  // Even without lists the field details are too many: keep types and states, which still prevent invented names.
  const minimal = {
    workItemTypes: grounding.workItemTypes,
    statesByWorkItemType: grounding.statesByWorkItemType,
    estimation: grounding.estimation,
    note: "The project's field list was too large to include; use only standard fields and names the user mentions.",
  };
  last = JSON.stringify(minimal);
  return { text: last.length <= limit ? last : last.slice(0, limit), trimmed: true };
}

function curate(grounding: ProjectGrounding, budget: (typeof BUDGETS)[number]) {
  let trimmed = false;
  const cap = <T>(list: T[], max: number): T[] => {
    if (list.length > max) trimmed = true;
    return list.slice(0, max);
  };
  const fields: Record<string, PromptField> = {};
  const fieldsByWorkItemType: Record<string, string[]> = {};
  // Grounding can arrive partial (e.g. from Studio's webview), so every list is optional here.
  for (const [type, schemas] of Object.entries(grounding.fieldsByWorkItemType ?? {})) {
    if (NON_PLANNING_TYPES.test(type)) continue;
    const kept = (schemas ?? []).filter((schema) => !schema.isReadOnly && (schema.isCustom || !schema.referenceName.startsWith("System.") || TEMPLATE_SYSTEM_FIELDS.has(schema.referenceName)));
    fieldsByWorkItemType[type] = kept.map((schema) => schema.referenceName);
    for (const schema of kept) {
      if (fields[schema.referenceName]) continue;
      const values = schema.allowedValues?.length ? cap(schema.allowedValues, budget.values) : [];
      fields[schema.referenceName] = { name: schema.name, type: schema.type, ...(values.length ? { allowedValues: values } : {}) };
    }
  }
  const prompt = {
    workItemTypes: grounding.workItemTypes,
    statesByWorkItemType: grounding.statesByWorkItemType,
    fields,
    fieldsByWorkItemType,
    areaPaths: cap(grounding.areaPaths ?? [], budget.paths),
    iterationPaths: cap(grounding.iterationPaths ?? [], budget.paths),
    teams: cap(grounding.teams ?? [], budget.teams),
    savedQueries: cap((grounding.savedQueries ?? []).map((query) => query.path), budget.queries),
    estimation: grounding.estimation,
  };
  return {
    trimmed,
    prompt: trimmed
      ? { ...prompt, note: "Some lists were shortened to fit; names that aren't listed may still exist in the project." }
      : prompt,
  };
}
