import { requireProjectMetadataReader, requireSavedQueryReader } from "@sppg2001/atomize-core/platforms/capabilities";
import { AuthError, getErrorMessage } from "@sppg2001/atomize-core/utils/errors";
import { Command } from "commander";
import { createAzureDevOpsAdapter } from "@/cli/utilities/ado-adapter";
import { createCommandOutput, resolveCommandOutputPolicy } from "@/cli/utilities/command-output";
import { writeManagedOutput } from "@/cli/utilities/terminal-output";

export type TemplateGroundingMetadata = {
  workItemTypes: string[];
  statesByWorkItemType: Record<string, string[]>;
  areaPaths: string[];
  iterationPaths: string[];
  teams: string[];
  savedQueries: Array<{ id: string; path: string }>;
  taskFields: unknown[];
  fieldsByWorkItemType: Record<string, unknown[]>;
};

export function describeMetadataConnectionError(error: unknown): string {
  const message = getErrorMessage(error);
  if (error instanceof AuthError || /authentication failed|access denied/i.test(message)) {
    if (/token.*expired|personal access token.*expired/i.test(message)) {
      return "Your Azure DevOps access token has expired. Add a new project connection with a current token, then try again.";
    }
    return "Atomize could not sign in to this Azure DevOps project. Check its access token, then try again.";
  }
  return "Atomize could not load choices from this Azure DevOps project. Check the connection and try again.";
}

/** Machine-readable project metadata for visual template authoring surfaces. */
export const templateMetadataCommand = new Command("metadata")
  .description("Read Azure DevOps metadata for template authoring")
  .option("--profile <name>", "Azure DevOps connection profile (uses the default if omitted)")
  .option("--json", "Print metadata as JSON", false)
  .action(async (options: { profile?: string; json: boolean }) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({ quiet: options.json, verbose: false }));
    try {
      const adapter = await createAzureDevOpsAdapter(options.profile);
      const metadataReader = requireProjectMetadataReader(adapter);
      const queryReader = requireSavedQueryReader(adapter);
      const workItemTypes = await metadataReader.getWorkItemTypes();
      const [states, areaPaths, iterationPaths, teams, savedQueries, taskFields, fieldsByWorkItemType] = await Promise.all([
        Promise.all(workItemTypes.map(async (type) => [type, await metadataReader.getStatesForWorkItemType(type)] as const)),
        metadataReader.getAreaPaths(),
        metadataReader.getIterationPaths(),
        metadataReader.getTeams(),
        queryReader.listSavedQueries(),
        metadataReader.getFieldSchemas("Task"),
        Promise.all(workItemTypes.map(async (type) => [type, await metadataReader.getFieldSchemas(type)] as const)),
      ]);
      const result: TemplateGroundingMetadata = {
        workItemTypes,
        statesByWorkItemType: Object.fromEntries(states),
        areaPaths,
        iterationPaths,
        teams,
        savedQueries: savedQueries.map(({ id, path }) => ({ id, path })),
        taskFields,
        fieldsByWorkItemType: Object.fromEntries(fieldsByWorkItemType),
      };
      if (options.json) output.printJson(result);
      else output.print(JSON.stringify(result, null, 2));
    } catch (error) {
      writeManagedOutput("stderr", `Error: ${describeMetadataConnectionError(error)}`);
      process.exitCode = 1;
    }
  });
