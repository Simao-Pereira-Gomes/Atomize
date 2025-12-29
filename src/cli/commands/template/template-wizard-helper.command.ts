import inquirer from "inquirer";
import type {
  FilterCriteria,
  TaskDefinition,
  EstimationConfig,
  ValidationConfig,
  Metadata,
} from "@templates/schema";
import { CustomFieldFilter } from "@/platforms";
import { match } from "ts-pattern";

const OS_PLATFORM = process.platform;
const ListType = OS_PLATFORM === "win32" ? "rawlist" : "list";

/**
 * Configure filter criteria with support for custom query and custom fields
 */
export async function configureFilter(): Promise<FilterCriteria> {
  const filter: FilterCriteria = {};

  const { workItemTypes, customWorkItemTypes } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "workItemTypes",
      message: "Select work item types:",
      choices: [
        { name: "User Story", checked: true },
        { name: "Product Backlog Item" },
        { name: "Bug" },
        { name: "Task" },
        { name: "Epic" },
        { name: "Feature" },
        { name: "Issue" },
        { name: "Subtask" },
        { name: "+ Add custom type", value: "__custom__" },
      ],
    },
    {
      type: "input",
      name: "customWorkItemTypes",
      message: "Enter custom work item types (comma-separated):",
      when: (answers: any) => answers.workItemTypes.includes("__custom__"),
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

  const { states, customStates } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "states",
      message: "Select states:",
      choices: [
        { name: "New", checked: true },
        { name: "Active", checked: true },
        { name: "Approved", checked: true },
        { name: "Committed" },
        { name: "Done" },
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
      when: (answers: any) => answers.states.includes("__custom__"),
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
    if (!isNaN(Number(field.value))) {
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
 * Configure tasks with assignment options
 */
export async function configureTasks(): Promise<TaskDefinition[]> {
  const tasks: TaskDefinition[] = [];
  let addMore = true;
  let taskCounter = 1;

  while (addMore) {
    console.log(`\nTask #${taskCounter}:`);

    const task = await inquirer.prompt([
      {
        type: "input",
        name: "id",
        message: "Task ID (optional):",
      },
      {
        type: "input",
        name: "title",
        message: "Task title:",
        validate: (input: string) => {
          if (!input || input.trim() === "") {
            return "Task title is required";
          }
          return true;
        },
      },
      {
        type: "input",
        name: "description",
        message: "Description (optional):",
      },
      {
        type: "number",
        name: "estimationPercent",
        message: "Estimation percentage (0-100):",
        default: 0,
        validate: (input: number) => {
          if (input < 0 || input > 100) {
            return "Estimation must be between 0 and 100";
          }
          return true;
        },
      },
    ]);

    const { activity, customActivity } = await inquirer.prompt([
      {
        type: ListType,
        name: "activity",
        message: "Activity type:",
        choices: [
          "Design",
          "Development",
          "Testing",
          "Documentation",
          "Deployment",
          "Requirements",
          "Code Review",
          "Custom",
          "None",
        ],
        default: "Development",
      },
      {
        type: "input",
        name: "customActivity",
        message: "Enter custom activity type:",
        when: (answers: any) => answers.activity === "Custom",
      },
    ]);

    const finalActivity = activity === "Custom" ? customActivity : activity;

    const moreDetails = await inquirer.prompt([
      {
        type: "input",
        name: "tags",
        message: "Tags (comma-separated, optional):",
        filter: (input: string) => {
          if (!input) return [];
          return input.split(",").map((t) => t.trim());
        },
      },
      {
        type: "confirm",
        name: "assignTask",
        message: "Assign this task?",
        default: false,
      },
    ]);

    let assignTo: string | undefined;
    if (moreDetails.assignTask) {
      const { assignmentType, customEmail } = await inquirer.prompt([
        {
          type: ListType,
          name: "assignmentType",
          message: "Assignment:",
          choices: [
            {
              name: "Parent Assignee (inherit from story)",
              value: "@ParentAssignee",
            },
            { name: "Inherit (same as @ParentAssignee)", value: "@Inherit" },
            { name: "Me (current user)", value: "@Me" },
            { name: "Auto (let system decide)", value: "@Auto" },
            { name: "Specific email", value: "custom" },
          ],
        },
        {
          type: "input",
          name: "customEmail",
          message: "Enter email address:",
          when: (answers: any) => answers.assignmentType === "custom",
          validate: (input: string) => {
            if (!input || input.trim() === "") {
              return "Email is required";
            }
            var regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!regex.test(input)) {
              return "Please enter a valid email address";
            }

            return true;
          },
        },
      ]);

      assignTo = assignmentType === "custom" ? customEmail : assignmentType;
    }

    const taskDef: TaskDefinition = {
      title: task.title,
    };

    if (task.id) taskDef.id = task.id;
    if (task.description) taskDef.description = task.description;
    if (task.estimationPercent > 0)
      taskDef.estimationPercent = task.estimationPercent;
    if (finalActivity && finalActivity !== "None")
      taskDef.activity = finalActivity;
    if (moreDetails.tags.length > 0) taskDef.tags = moreDetails.tags;
    if (assignTo) taskDef.assignTo = assignTo;

    const { advancedOptions } = await inquirer.prompt([
      {
        type: "confirm",
        name: "advancedOptions",
        message: "Add advanced options (dependencies, conditions, priority)?",
        default: false,
      },
    ]);

    if (advancedOptions) {
      const advanced = await inquirer.prompt([
        {
          type: "input",
          name: "dependsOn",
          message: "Depends on (comma-separated task IDs):",
          filter: (input: string) => {
            if (!input) return [];
            return input.split(",").map((t) => t.trim());
          },
        },
        {
          type: "input",
          name: "condition",
          message: "Condition (e.g., ${story.tags} CONTAINS 'security'):",
        },
        {
          type: "number",
          name: "priority",
          message: "Priority (1-5, where 1 is highest):",
          validate: (input: number) => {
            if (input && (input < 1 || input > 5)) {
              return "Priority must be between 1 and 5";
            }
            return true;
          },
        },
        {
          type: "number",
          name: "remainingWork",
          message: "Remaining work (hours):",
        },
      ]);

      if (advanced.dependsOn.length > 0) taskDef.dependsOn = advanced.dependsOn;
      if (advanced.condition) taskDef.condition = advanced.condition;
      if (advanced.priority) taskDef.priority = advanced.priority;
      if (advanced.remainingWork)
        taskDef.remainingWork = advanced.remainingWork;

      const { useTaskCustomFields } = await inquirer.prompt([
        {
          type: "confirm",
          name: "useTaskCustomFields",
          message: "Add custom fields to this task?",
          default: false,
        },
      ]);

      if (useTaskCustomFields) {
        taskDef.customFields = await configureTaskCustomFields();
      }
    }

    tasks.push(taskDef);
    taskCounter++;

    const { more } = await inquirer.prompt([
      {
        type: "confirm",
        name: "more",
        message: "Add another task?",
        default: taskCounter <= 5,
      },
    ]);

    addMore = more;
  }

  const totalEstimation = tasks.reduce(
    (sum, task) => sum + (task.estimationPercent || 0),
    0
  );

  if (totalEstimation !== 100) {
    console.log(
      `\n Warning: Total estimation is ${totalEstimation}% (should be 100%)`
    );

    const { normalize } = await inquirer.prompt([
      {
        type: "confirm",
        name: "normalize",
        message: "Normalize estimations to sum to 100%?",
        default: true,
      },
    ]);

    if (normalize) {
      normalizeEstimations(tasks);
      console.log("Estimations normalized to 100%");
    }
  }

  return tasks;
}

/**
 * Configure custom fields for a task
 */
async function configureTaskCustomFields(): Promise<Record<string, any>> {
  const customFields: Record<string, any> = {};
  let addMore = true;

  while (addMore) {
    const field = await inquirer.prompt([
      {
        type: "input",
        name: "fieldName",
        message: "Field name (e.g., Custom.Complexity, System.IterationPath):",
        validate: (input: string) => {
          if (!input || input.trim() === "") {
            return "Field name is required";
          }
          return true;
        },
      },
      {
        type: "input",
        name: "fieldValue",
        message: "Field value:",
        validate: (input: string) => {
          if (input === null || input === undefined) {
            return "Field value is required";
          }
          return true;
        },
      },
    ]);

    let parsedValue: any = field.fieldValue;
    if (!isNaN(Number(field.fieldValue))) {
      parsedValue = Number(field.fieldValue);
    } else if (field.fieldValue.toLowerCase() === "true") {
      parsedValue = true;
    } else if (field.fieldValue.toLowerCase() === "false") {
      parsedValue = false;
    }

    customFields[field.fieldName] = parsedValue;

    const { more } = await inquirer.prompt([
      {
        type: "confirm",
        name: "more",
        message: "Add another custom field?",
        default: false,
      },
    ]);

    addMore = more;
  }

  return customFields;
}

/**
 * Normalize task estimations to sum to 100%
 */
function normalizeEstimations(tasks: TaskDefinition[]): void {
  const total = tasks.reduce(
    (sum, task) => sum + (task.estimationPercent || 0),
    0
  );

  if (total === 0) {
    const percent = Math.floor(100 / tasks.length);
    const remainder = 100 - percent * tasks.length;

    tasks.forEach((task, index) => {
      task.estimationPercent = index === 0 ? percent + remainder : percent;
    });
  } else {
    const scale = 100 / total;
    let sum = 0;

    tasks.forEach((task, index) => {
      if (index === tasks.length - 1) {
        task.estimationPercent = 100 - sum;
      } else {
        const scaled = Math.round((task.estimationPercent || 0) * scale);
        task.estimationPercent = scaled;
        sum += scaled;
      }
    });
  }
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
      choices: [
        { name: "Percentage-based", value: "percentage" },
        { name: "Fixed values", value: "fixed" },
        { name: "Hours", value: "hours" },
        { name: "Fibonacci", value: "fibonacci" },
      ],
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
