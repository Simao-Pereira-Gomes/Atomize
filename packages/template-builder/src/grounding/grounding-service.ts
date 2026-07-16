import { type CliExecutor, CliRuntimeError, invoke } from "../cli/cli-bridge";

export type AzureDevOpsProfile = {
  name: string;
  platform: "azure-devops";
  isDefault: boolean;
  organizationUrl: string;
  project: string;
  team: string;
};

export type SavedQuery = { id: string; path: string };

export type GroundedFieldOptions = {
  workItemTypes: string[];
  statesByWorkItemType: Record<string, string[]>;
  areaPaths: string[];
  iterationPaths: string[];
  teams: string[];
  savedQueries: SavedQuery[];
  /** Reserved for future custom-field and condition controls. */
  taskFields: unknown[];
};

export class CliGroundingUnavailableError extends Error {
  override readonly name = "CliGroundingUnavailableError";
  constructor() {
    super("Your installed Atomize CLI needs an update before it can connect a work project. Install the current Atomize build, then try again.");
  }
}

export class ProjectConnectionError extends Error {
  override readonly name = "ProjectConnectionError";
  constructor(message = "We couldn’t connect to that Azure DevOps project. Check the project settings and try again.") {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

export function parseGroundedFieldOptions(value: unknown): GroundedFieldOptions {
  if (!isRecord(value)) throw new Error("CLI returned invalid template grounding metadata.");
  const rawStates = isRecord(value.statesByWorkItemType) ? value.statesByWorkItemType : {};
  const statesByWorkItemType = Object.fromEntries(
    Object.entries(rawStates).map(([type, states]) => [type, strings(states)]),
  );
  const savedQueries = Array.isArray(value.savedQueries)
    ? value.savedQueries.flatMap((query) =>
      isRecord(query) && typeof query.id === "string" && typeof query.path === "string"
        ? [{ id: query.id, path: query.path }]
        : [],
    )
    : [];
  return {
    workItemTypes: strings(value.workItemTypes),
    statesByWorkItemType,
    areaPaths: strings(value.areaPaths),
    iterationPaths: strings(value.iterationPaths),
    teams: strings(value.teams),
    savedQueries,
    taskFields: Array.isArray(value.taskFields) ? value.taskFields : [],
  };
}

export async function listAzureDevOpsProfiles(execute?: CliExecutor): Promise<AzureDevOpsProfile[]> {
  const value = await invoke(["auth", "list", "--json"], execute);
  if (!Array.isArray(value)) throw new Error("CLI returned invalid Connection Profiles.");
  return value.flatMap((profile) =>
    isRecord(profile) && profile.platform === "azure-devops" &&
    typeof profile.name === "string" && typeof profile.isDefault === "boolean" &&
    typeof profile.organizationUrl === "string" && typeof profile.project === "string" && typeof profile.team === "string"
      ? [{
        name: profile.name,
        platform: "azure-devops" as const,
        isDefault: profile.isDefault,
        organizationUrl: profile.organizationUrl,
        project: profile.project,
        team: profile.team,
      }]
      : [],
  );
}

export async function loadGroundedFieldOptions(profile: string, execute?: CliExecutor): Promise<GroundedFieldOptions> {
  try {
    return parseGroundedFieldOptions(await invoke(["template", "metadata", "--profile", profile, "--json"], execute));
  } catch (error) {
    if (error instanceof CliRuntimeError && /unknown command ['"]?metadata/i.test(error.message)) {
      throw new CliGroundingUnavailableError();
    }
    if (error instanceof CliRuntimeError) {
      if (/token.*expired|personal access token.*expired/i.test(error.message)) {
        throw new ProjectConnectionError("Your Azure DevOps access token has expired. Add a new project connection with a current token, then try again.");
      }
      throw new ProjectConnectionError();
    }
    throw error;
  }
}

export function statesForTypes(options: GroundedFieldOptions | undefined, types: string[]): string[] {
  const typesToInclude = types.length > 0 ? types : Object.keys(options?.statesByWorkItemType ?? {});
  return [...new Set(typesToInclude.flatMap((type) => options?.statesByWorkItemType[type] ?? []))].sort();
}
