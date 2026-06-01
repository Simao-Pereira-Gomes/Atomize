import { confirm, multiselect } from "@clack/prompts";
import type { ADoFieldSchema } from "@platforms/interfaces/field-schema.interface";
import type { TaskTemplate } from "@templates/schema";
import chalk from "chalk";
import { createAzureDevOpsAdapter } from "@/cli/utilities/ado-adapter";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { assertNotCancelled, createManagedSpinner } from "@/cli/utilities/prompt-utilities";
import {
  requireProjectMetadataReader,
  requireSavedQueryReader,
} from "@/platforms/capabilities";
import { CancellationError, ConfigurationError } from "@/utils/errors";
import {
  configureBasicInfo,
  configureEstimation,
  configureFilter,
  configureMetadata,
  configureValidation,
  editTasksInteractively,
  previewTemplate,
  type TemplateWizardContext,
} from "./template-wizard";
import type { FilterWizardContext } from "./template-wizard-helper.command";

const output = createCommandOutput(resolveCommandOutputPolicy({}));

type CustomizeSectionKey = "basicInfo" | "filter" | "tasks" | "estimation" | "validation" | "metadata";

export async function customizeTemplate(
  template: TaskTemplate,
  profile?: string,
): Promise<TaskTemplate> {
  output.print(chalk.cyan("\nCustomize Template\n"));
  let connectionSettled = false;
  const connectionPromise = (async () => {
    const adapter = await createAzureDevOpsAdapter(profile);
    const metadataReader = requireProjectMetadataReader(adapter);
    const savedQueryReader = requireSavedQueryReader(adapter);
    const [
      taskSchemas,
      liveWorkItemTypes,
      liveAreaPaths,
      liveIterationPaths,
      liveTeams,
      liveSavedQueries,
    ] = await Promise.all([
      metadataReader.getFieldSchemas("Task"),
      metadataReader.getWorkItemTypes(),
      metadataReader.getAreaPaths(),
      metadataReader.getIterationPaths(),
      metadataReader.getTeams(),
      savedQueryReader.listSavedQueries(),
    ]);
    return {
      metadataReader,
      fieldSchemas: taskSchemas,
      filterCtx: {
        workItemTypes: liveWorkItemTypes,
        getStatesForType: (type: string) =>
          metadataReader.getStatesForWorkItemType(type),
        areaPaths: liveAreaPaths,
        iterationPaths: liveIterationPaths,
        teams: liveTeams,
        savedQueries: liveSavedQueries,
      },
    };
  })().finally(() => {
    connectionSettled = true;
  });

  const sections = assertNotCancelled(
    await multiselect<CustomizeSectionKey>({
      message: "Which sections would you like to customize?",
      options: [
        { label: "Name & Description", value: "basicInfo" },
        { label: "Filter", value: "filter" },
        { label: "Tasks", value: "tasks" },
        { label: "Estimation", value: "estimation" },
        { label: "Validation Rules", value: "validation" },
        { label: "Metadata", value: "metadata" },
      ],
      required: false,
    }),
  ) as CustomizeSectionKey[];

  if (sections.includes("basicInfo")) {
    output.print(chalk.cyan("\nEditing Name & Description\n"));
    const basicInfo = await configureBasicInfo({
      name: template.name,
      description: template.description,
      author: template.author,
      tags: template.tags,
    });
    template.name = basicInfo.name;
    template.description = basicInfo.description;
    template.author = basicInfo.author;
    template.tags = basicInfo.tags;
  }

  const wasAlreadyConnected = connectionSettled;
  const connectSpinner = createManagedSpinner();
  if (!wasAlreadyConnected) connectSpinner.start("Connecting to ADO...");

  let filterCtx: FilterWizardContext;
  let fieldSchemas: ADoFieldSchema[];
  let adapterForWizard: ReturnType<typeof requireProjectMetadataReader>;

  try {
    const conn = await connectionPromise;
    if (!wasAlreadyConnected) connectSpinner.stop("Connected ✓");
    filterCtx = conn.filterCtx;
    fieldSchemas = conn.fieldSchemas;
    adapterForWizard = conn.metadataReader;
  } catch (err) {
    if (!wasAlreadyConnected) connectSpinner.stop("Connection failed");
    const message = err instanceof Error ? err.message : String(err);
    const hint =
      err instanceof ConfigurationError
        ? '\n\n  Run "atomize auth add" to configure a connection profile.'
        : "";
    throw new ConfigurationError(`${message}${hint}`);
  }

  let storyFieldSchemas: ADoFieldSchema[] = [];
  let storySchemasFetched = false;

  for (const section of (
    ["filter", "tasks", "estimation", "validation", "metadata"] as const
  )) {
    if (!sections.includes(section)) continue;

    switch (section) {
      case "filter": {
        output.print(chalk.cyan("\nEditing Filter Configuration\n"));
        template.filter = await configureFilter(filterCtx, template.filter);
        if (
          (!template.filter.workItemTypes || template.filter.workItemTypes.length === 0) &&
          (!template.filter.states || template.filter.states.length === 0)
        ) {
          output.print(chalk.yellow("\n Warning: No work item types or states configured."));
          output.print(chalk.yellow("   This template will match ALL work items."));
          const continueAnyway = assertNotCancelled(
            await confirm({ message: "Continue with empty filter?", initialValue: false }),
          );
          if (!continueAnyway) {
            throw new CancellationError(
              "Template creation cancelled. Please configure filter criteria.",
            );
          }
        }
        storySchemasFetched = false;
        break;
      }
      case "tasks": {
        output.print(chalk.cyan("\nEditing Tasks\n"));
        if (!storySchemasFetched) {
          const wit = template.filter.workItemTypes?.[0];
          storyFieldSchemas = wit ? await adapterForWizard.getFieldSchemas(wit) : [];
          storySchemasFetched = true;
        }
        template.tasks = await editTasksInteractively(
          template.tasks,
          fieldSchemas,
          storyFieldSchemas,
        );
        break;
      }
      case "estimation": {
        output.print(chalk.cyan("\nEditing Estimation Settings\n"));
        template.estimation = await configureEstimation(template.estimation);
        break;
      }
      case "validation": {
        output.print(chalk.cyan("\nEditing Validation Rules\n"));
        const enable = assertNotCancelled(
          await confirm({
            message: "Enable validation rules?",
            initialValue: !!template.validation,
          }),
        );
        template.validation = enable
          ? await configureValidation(template.validation)
          : undefined;
        break;
      }
      case "metadata": {
        output.print(chalk.cyan("\nEditing Metadata\n"));
        const enable = assertNotCancelled(
          await confirm({
            message: "Enable metadata?",
            initialValue: !!template.metadata,
          }),
        );
        template.metadata = enable
          ? await configureMetadata(template.metadata)
          : undefined;
        break;
      }
    }
  }

  if (!storySchemasFetched) {
    const wit = template.filter.workItemTypes?.[0];
    storyFieldSchemas = wit ? await adapterForWizard.getFieldSchemas(wit) : [];
  }

  template.created = new Date().toISOString();

  output.print(chalk.green("\n✓ Template customized successfully!\n"));
  output.print(chalk.gray("Review your template and choose an action below.\n"));

  const wizardCtx: TemplateWizardContext = {
    filterCtx,
    fieldSchemas,
    storyFieldSchemas,
    workItemType: template.filter.workItemTypes?.[0],
  };

  const confirmed = await previewTemplate(template, wizardCtx);

  if (!confirmed) {
    throw new CancellationError("Template customization cancelled by user");
  }

  return template;
}
