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
