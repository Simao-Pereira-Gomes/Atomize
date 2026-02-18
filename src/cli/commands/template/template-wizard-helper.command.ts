import { confirm, multiselect, select, text } from "@clack/prompts";
import type {
  EstimationConfig,
  FilterCriteria,
  Metadata,
  ValidationConfig,
} from "@templates/schema";
import type { CustomFieldFilter } from "@/platforms";
import { assertNotCancelled, Filters } from "../../utilities/prompt-utilities";

interface WorkItemPromptAnswers {
  workItemTypes: string[];
  customWorkItemTypes?: string[];
}

interface StatePromptAnswers {
  states: string[];
  customStates?: string[];
}

/**
 * Configure filter criteria with support for custom query and custom fields
 */
export async function configureFilter(): Promise<FilterCriteria> {
  const filter: FilterCriteria = {};

  const workItemTypes = assertNotCancelled(
    await multiselect<WorkItemPromptAnswers["workItemTypes"][number]>({
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

  let customWorkItemTypes: string[] = [];
  if (workItemTypes.includes("__custom__")) {
    const raw = assertNotCancelled(
      await text({
        message: "Enter custom work item types (comma-separated):",
      }),
    );
    customWorkItemTypes = Filters.commaSeparated(raw);
  }

  if (workItemTypes.length > 0) {
    const filtered = workItemTypes.filter((t) => t !== "__custom__");
    const allTypes = [...filtered, ...customWorkItemTypes];
    if (allTypes.length > 0) {
      filter.workItemTypes = allTypes;
    }
  }

  const states = assertNotCancelled(
    await multiselect<StatePromptAnswers["states"][number]>({
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

  let customStates: string[] = [];
  if (states.includes("__custom__")) {
    const raw = assertNotCancelled(
      await text({
        message: "Enter custom states (comma-separated):",
      }),
    );
    customStates = Filters.commaSeparated(raw);
  }

  if (states.length > 0) {
    const filtered = states.filter((s) => s !== "__custom__");
    const allStates = [...filtered, ...customStates];
    if (allStates.length > 0) {
      filter.states = allStates;
    }
  }

  const useTags = assertNotCancelled(
    await confirm({
      message: "Filter by tags?",
      initialValue: false,
    }),
  );

  if (useTags) {
    const includeRaw = assertNotCancelled(
      await text({
        message: "Tags to include (comma-separated):",
      }),
    );
    const excludeRaw = assertNotCancelled(
      await text({
        message: "Tags to exclude (comma-separated):",
      }),
    );

    const include = Filters.commaSeparated(includeRaw);
    const exclude = Filters.commaSeparated(excludeRaw);

    if (include.length > 0 || exclude.length > 0) {
      filter.tags = {};
      if (include.length > 0) {
        filter.tags.include = include;
      }
      if (exclude.length > 0) {
        filter.tags.exclude = exclude;
      }
    }
  }

  const excludeIfHasTasks = assertNotCancelled(
    await confirm({
      message: "Exclude work items that already have tasks?",
      initialValue: true,
    }),
  );

  if (excludeIfHasTasks) {
    filter.excludeIfHasTasks = true;
  }

  const advancedFilter = assertNotCancelled(
    await confirm({
      message: "Add advanced filter options?",
      initialValue: false,
    }),
  );

  if (advancedFilter) {
    const areaPaths = Filters.commaSeparated(
      assertNotCancelled(
        await text({ message: "Area paths (comma-separated):" }),
      ),
    );
    const iterations = Filters.commaSeparated(
      assertNotCancelled(
        await text({ message: "Iterations (comma-separated):" }),
      ),
    );
    const assignedTo = Filters.commaSeparated(
      assertNotCancelled(
        await text({
          message: "Assigned to (comma-separated email addresses):",
        }),
      ),
    );
    const usePriority = assertNotCancelled(
      await confirm({
        message: "Filter by priority range?",
        initialValue: false,
      }),
    );

    if (areaPaths.length > 0) {
      filter.areaPaths = areaPaths;
    }
    if (iterations.length > 0) {
      filter.iterations = iterations;
    }
    if (assignedTo.length > 0) {
      filter.assignedTo = assignedTo;
    }

    if (usePriority) {
      const minRaw = assertNotCancelled(
        await text({
          message: "Minimum priority (1-5):",
          defaultValue: "1",
          validate: (input): string | undefined => {
            const n = Number(input);
            if (Number.isNaN(n) || n < 1 || n > 5)
              return "Priority must be between 1 and 5";
            return undefined;
          },
        }),
      );
      const maxRaw = assertNotCancelled(
        await text({
          message: "Maximum priority (1-5):",
          defaultValue: "3",
          validate: (input): string | undefined => {
            const n = Number(input);
            if (Number.isNaN(n) || n < 1 || n > 5)
              return "Priority must be between 1 and 5";
            return undefined;
          },
        }),
      );

      filter.priority = {
        min: Number(minRaw),
        max: Number(maxRaw),
      };
    }

    const useCustomFields = assertNotCancelled(
      await confirm({
        message: "Add custom field filters?",
        initialValue: false,
      }),
    );

    if (useCustomFields) {
      filter.customFields = await configureCustomFields();
    }

    const useCustomQuery = assertNotCancelled(
      await confirm({
        message: "Use a custom query string? (overrides other filters)",
        initialValue: false,
      }),
    );

    if (useCustomQuery) {
      filter.customQuery = assertNotCancelled(
        await text({
          message: "Enter custom query (e.g., WIQL for Azure DevOps):",
          validate: (input): string | undefined => {
            if (!input || input.trim() === "") {
              return "Custom query cannot be empty";
            }
            return undefined;
          },
        }),
      );
    }
  }

  return filter;
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
        message: "Field name (e.g., Custom.Team, System.ChangedBy):",
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
  const strategy = assertNotCancelled(
    await select({
      message: "Estimation strategy:",
      options: [{ label: "Percentage-based", value: "percentage" }],
      initialValue: "percentage",
    }),
  );

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
    strategy: strategy as EstimationConfig["strategy"],
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
      }),
    );
    const maxRaw = assertNotCancelled(
      await text({
        message: "Maximum total estimation %:",
        defaultValue: "105",
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
      }),
    );
    const maxTasksRaw = assertNotCancelled(
      await text({
        message: "Maximum number of tasks:",
        defaultValue: "10",
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
      message: "Category (e.g., Backend Development):",
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
    }),
  );
  const recommendedFor = Filters.commaSeparated(recommendedForRaw);

  const estimationGuidelines = assertNotCancelled(
    await text({
      message: "Estimation guidelines:",
    }),
  );

  if (category) metadata.category = category;
  if (difficulty) metadata.difficulty = difficulty as Metadata["difficulty"];
  if (recommendedFor.length > 0) metadata.recommendedFor = recommendedFor;
  if (estimationGuidelines) metadata.estimationGuidelines = estimationGuidelines;

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
  defaults?: Partial<BasicInfoResult>
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
      defaultValue: defaults?.author || "Atomize",
    }),
  );

  const tagsRaw = assertNotCancelled(
    await text({
      message: "Tags (comma-separated, optional):",
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

