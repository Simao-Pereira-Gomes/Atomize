import type {
  EstimationConfig,
  FilterCriteria,
  Metadata,
  ValidationConfig,
} from "@templates/schema";
import inquirer from "inquirer";
import { match } from "ts-pattern";
import type { CustomFieldFilter } from "@/platforms";

interface WorkItemPromptAnswers {
  workItemTypes: string[];
  customWorkItemTypes?: string[];
}

interface StatePromptAnswers {
  states: string[];
  customStates?: string[];
}

const OS_PLATFORM = process.platform;
const ListType = OS_PLATFORM === "win32" ? "rawlist" : "list";

/**
 * Configure filter criteria with support for custom query and custom fields
 */
export async function configureFilter(): Promise<FilterCriteria> {
  const filter: FilterCriteria = {};

  const { workItemTypes, customWorkItemTypes } =
    await inquirer.prompt<WorkItemPromptAnswers>([
      {
        type: "checkbox",
        name: "workItemTypes",
        message: "Select work item types:",
        choices: [
          { name: "User Story", checked: true },
          { name: "Bug" },
          { name: "Task" },
          { name: "Epic" },
          { name: "Feature" },
          { name: "Issue" },
          { name: "+ Add custom type", value: "__custom__" },
        ],
      },
      {
        type: "input",
        name: "customWorkItemTypes",
        message: "Enter custom work item types (comma-separated):",
        when: (answers) => answers.workItemTypes?.includes("__custom__"),
        filter: (input: string) => {
          if (!input) return [];
          return input.split(",").map((t) => t.trim());
        },
      },
    ]);

  if (workItemTypes.length > 0) {
    const filtered = workItemTypes.filter((t: string) => t !== "__custom__");
    const allTypes = [...filtered, ...(customWorkItemTypes || [])];
    if (allTypes.length > 0) {
      filter.workItemTypes = allTypes;
    }
  }

  const { states, customStates } = await inquirer.prompt<StatePromptAnswers>([
    {
      type: "checkbox",
      name: "states",
      message: "Select states:",
      choices: [
        { name: "New", checked: true },
        { name: "Active", checked: true },
        { name: "Removed" },
        { name: "Resolved" },
        { name: "Closed" },
        { name: "+ Add custom state", value: "__custom__" },
      ],
    },
    {
      type: "input",
      name: "customStates",
      message: "Enter custom states (comma-separated):",
      when: (answers) => answers.states?.includes("__custom__"),
      filter: (input: string) => {
        if (!input) return [];
        return input.split(",").map((t) => t.trim());
      },
    },
  ]);

  if (states.length > 0) {
    const filtered = states.filter((s: string) => s !== "__custom__");
    const allStates = [...filtered, ...(customStates || [])];
    if (allStates.length > 0) {
      filter.states = allStates;
    }
  }

  const { useTags } = await inquirer.prompt([
    {
      type: "confirm",
      name: "useTags",
      message: "Filter by tags?",
      default: false,
    },
  ]);

  if (useTags) {
    const tagConfig = await inquirer.prompt([
      {
        type: "input",
        name: "include",
        message: "Tags to include (comma-separated):",
        filter: (input: string) => {
          if (!input) return [];
          return input.split(",").map((t) => t.trim());
        },
      },
      {
        type: "input",
        name: "exclude",
        message: "Tags to exclude (comma-separated):",
        filter: (input: string) => {
          if (!input) return [];
          return input.split(",").map((t) => t.trim());
        },
      },
    ]);

    if (tagConfig.include.length > 0 || tagConfig.exclude.length > 0) {
      filter.tags = {};
      if (tagConfig.include.length > 0) {
        filter.tags.include = tagConfig.include;
      }
      if (tagConfig.exclude.length > 0) {
        filter.tags.exclude = tagConfig.exclude;
      }
    }
  }

  // Exclude if has tasks
  const { excludeIfHasTasks } = await inquirer.prompt([
    {
      type: "confirm",
      name: "excludeIfHasTasks",
      message: "Exclude work items that already have tasks?",
      default: true,
    },
  ]);

  if (excludeIfHasTasks) {
    filter.excludeIfHasTasks = true;
  }

  // Advanced options
  const { advancedFilter } = await inquirer.prompt([
    {
      type: "confirm",
      name: "advancedFilter",
      message: "Add advanced filter options?",
      default: false,
    },
  ]);

  if (advancedFilter) {
    const advanced = await inquirer.prompt([
      {
        type: "input",
        name: "areaPaths",
        message: "Area paths (comma-separated):",
        filter: (input: string) => {
          if (!input) return [];
          return input.split(",").map((t) => t.trim());
        },
      },
      {
        type: "input",
        name: "iterations",
        message: "Iterations (comma-separated):",
        filter: (input: string) => {
          if (!input) return [];
          return input.split(",").map((t) => t.trim());
        },
      },
      {
        type: "input",
        name: "assignedTo",
        message: "Assigned to (comma-separated email addresses):",
        filter: (input: string) => {
          if (!input) return [];
          return input.split(",").map((t) => t.trim());
        },
      },
      {
        type: "confirm",
        name: "usePriority",
        message: "Filter by priority range?",
        default: false,
      },
    ]);

    if (advanced.areaPaths.length > 0) {
      filter.areaPaths = advanced.areaPaths;
    }
    if (advanced.iterations.length > 0) {
      filter.iterations = advanced.iterations;
    }
    if (advanced.assignedTo.length > 0) {
      filter.assignedTo = advanced.assignedTo;
    }

    if (advanced.usePriority) {
      const priority = await inquirer.prompt([
        {
          type: "number",
          name: "min",
          message: "Minimum priority (1-5):",
          default: 1,
          validate: (input: number) => {
            if (input < 1 || input > 5)
              return "Priority must be between 1 and 5";
            return true;
          },
        },
        {
          type: "number",
          name: "max",
          message: "Maximum priority (1-5):",
          default: 3,
          validate: (input: number) => {
            if (input < 1 || input > 5)
              return "Priority must be between 1 and 5";
            return true;
          },
        },
      ]);

      filter.priority = {
        min: priority.min,
        max: priority.max,
      };
    }

    const { useCustomFields } = await inquirer.prompt([
      {
        type: "confirm",
        name: "useCustomFields",
        message: "Add custom field filters?",
        default: false,
      },
    ]);

    if (useCustomFields) {
      filter.customFields = await configureCustomFields();
    }

    const { useCustomQuery } = await inquirer.prompt([
      {
        type: "confirm",
        name: "useCustomQuery",
        message: "Use a custom query string? (overrides other filters)",
        default: false,
      },
    ]);

    if (useCustomQuery) {
      const { customQuery } = await inquirer.prompt([
        {
          type: "input",
          name: "customQuery",
          message: "Enter custom query (e.g., WIQL for Azure DevOps):",
          validate: (input: string) => {
            if (!input || input.trim() === "") {
              return "Custom query cannot be empty";
            }
            return true;
          },
        },
      ]);

      filter.customQuery = customQuery;
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
    const field = await inquirer.prompt([
      {
        type: "input",
        name: "field",
        message: "Field name (e.g., Custom.Team, System.ChangedBy):",
        validate: (input: string) => {
          if (!input || input.trim() === "") {
            return "Field name is required";
          }
          return true;
        },
      },
      {
        type: ListType,
        name: "operator",
        message: "Operator:",
        choices: [
          { name: "Equals", value: "equals" },
          { name: "Not Equals", value: "notEquals" },
          { name: "Contains", value: "contains" },
          { name: "Greater Than", value: "greaterThan" },
          { name: "Less Than", value: "lessThan" },
        ],
      },
      {
        type: "input",
        name: "value",
        message: "Value:",
        validate: (input: string) => {
          if (!input || input.trim() === "") {
            return "Value is required";
          }
          return true;
        },
      },
    ]);

    let parsedValue: string | number | boolean = field.value;
    if (!Number.isNaN(Number(field.value))) {
      parsedValue = Number(field.value);
    } else if (field.value.toLowerCase() === "true") {
      parsedValue = true;
    } else if (field.value.toLowerCase() === "false") {
      parsedValue = false;
    }

    customFields.push({
      field: field.field,
      operator: field.operator,
      value: parsedValue,
    });

    const { more } = await inquirer.prompt([
      {
        type: "confirm",
        name: "more",
        message: "Add another custom field filter?",
        default: false,
      },
    ]);

    addMore = more;
  }

  return customFields;
}

/**
 * Configure estimation settings
 */
export async function configureEstimation(): Promise<
  EstimationConfig | undefined
> {
  const config = await inquirer.prompt([
    {
      type: ListType,
      name: "strategy",
      message: "Estimation strategy:",
      choices: [{ name: "Percentage-based", value: "percentage" }],
      default: "percentage",
    },
    {
      type: ListType,
      name: "rounding",
      message: "Rounding strategy:",
      choices: [
        { name: "Nearest integer", value: "nearest" },
        { name: "Round up", value: "up" },
        { name: "Round down", value: "down" },
        { name: "No rounding", value: "none" },
      ],
      default: "none",
    },
    {
      type: "number",
      name: "minimumTaskPoints",
      message: "Minimum task points (0 for no minimum):",
      default: 0,
    },
  ]);

  return {
    strategy: config.strategy,
    rounding: config.rounding,
    minimumTaskPoints: config.minimumTaskPoints || undefined,
  };
}

/**
 * Configure validation rules
 */
export async function configureValidation(): Promise<
  ValidationConfig | undefined
> {
  const validation: ValidationConfig = {};

  const { validationType } = await inquirer.prompt([
    {
      type: ListType,
      name: "validationType",
      message: "Estimation validation type:",
      choices: [
        { name: "Must equal 100%", value: "exact" },
        { name: "Range (e.g., 95-105%)", value: "range" },
        { name: "No validation", value: "none" },
      ],
      default: "exact",
    },
  ]);

  match(validationType)
    .with("exact", () => {
      validation.totalEstimationMustBe = 100;
    })
    .with("range", async () => {
      const range = await inquirer.prompt([
        {
          type: "number",
          name: "min",
          message: "Minimum total estimation %:",
          default: 95,
        },
        {
          type: "number",
          name: "max",
          message: "Maximum total estimation %:",
          default: 105,
        },
      ]);
      validation.totalEstimationRange = {
        min: range.min,
        max: range.max,
      };
    })
    .otherwise(() => {
      return;
    });

  const { taskLimits } = await inquirer.prompt([
    {
      type: "confirm",
      name: "taskLimits",
      message: "Set task count limits?",
      default: false,
    },
  ]);

  if (taskLimits) {
    const limits = await inquirer.prompt([
      {
        type: "number",
        name: "minTasks",
        message: "Minimum number of tasks:",
        default: 3,
      },
      {
        type: "number",
        name: "maxTasks",
        message: "Maximum number of tasks:",
        default: 10,
      },
    ]);

    validation.minTasks = limits.minTasks;
    validation.maxTasks = limits.maxTasks;
  }

  return Object.keys(validation).length > 0 ? validation : undefined;
}

/**
 * Configure metadata
 */
export async function configureMetadata(): Promise<Metadata | undefined> {
  const metadata: Metadata = {};

  const config = await inquirer.prompt([
    {
      type: "input",
      name: "category",
      message: "Category (e.g., Backend Development):",
    },
    {
      type: ListType,
      name: "difficulty",
      message: "Difficulty level:",
      choices: [
        { name: "Beginner", value: "beginner" },
        { name: "Intermediate", value: "intermediate" },
        { name: "Advanced", value: "advanced" },
      ],
    },
    {
      type: "input",
      name: "recommendedFor",
      message: "Recommended for (comma-separated):",
      filter: (input: string) => {
        if (!input) return [];
        return input.split(",").map((t) => t.trim());
      },
    },
    {
      type: "input",
      name: "estimationGuidelines",
      message: "Estimation guidelines:",
    },
  ]);

  if (config.category) metadata.category = config.category;
  if (config.difficulty) metadata.difficulty = config.difficulty;
  if (config.recommendedFor.length > 0)
    metadata.recommendedFor = config.recommendedFor;
  if (config.estimationGuidelines)
    metadata.estimationGuidelines = config.estimationGuidelines;

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
