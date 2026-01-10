import type { Answers, Question } from "inquirer";
import inquirer from "inquirer";

const OS_PLATFORM = process.platform;
export const ListType = OS_PLATFORM === "win32" ? "rawlist" : "list";

/**
 * Validation functions
 */
export const Validators = {
  required:
    (fieldName: string) =>
    (input: string): boolean | string => {
      if (!input || input.trim() === "") {
        return `${fieldName} is required`;
      }
      return true;
    },

  maxLength:
    (fieldName: string, maxLength: number) =>
    (input: string): boolean | string => {
      if (input.length > maxLength) {
        return `${fieldName} must be ${maxLength} characters or less`;
      }
      return true;
    },

  requiredWithMaxLength:
    (fieldName: string, maxLength: number) =>
    (input: string): boolean | string => {
      const required = Validators.required(fieldName)(input);
      if (required !== true) return required;
      return Validators.maxLength(fieldName, maxLength)(input);
    },

  estimationPercent: (input: string): boolean | string => {
    const num = Number(input);
    if (Number.isNaN(num)) return "Estimation must be a valid number";
    if (num < 0) return "Estimation cannot be negative";
    if (num > 100) return "Estimation cannot exceed 100%";
    return true;
  },

  email: (input: string): boolean | string => {
    //TODO: Use a more robust email validation
    if (!input.includes("@")) {
      return "Please enter a valid email address";
    }
    return true;
  },

  priorityRange: (input: number): boolean | string => {
    if (Number.isNaN(input)) return true; // Optional
    if (input < 1 || input > 4) {
      return "Priority must be between 1 and 4";
    }
    return true;
  },

  nonNegative:
    (fieldName: string) =>
    (input: number): boolean | string => {
      if (Number.isNaN(input)) return true; // Optional
      if (input < 0) {
        return `${fieldName} cannot be negative`;
      }
      return true;
    },
};

/**
 * Common filter transformations
 */
export const Filters = {
  commaSeparated: (input: string): string[] => {
    if (!input) return [];
    return input.split(",").map((t) => t.trim());
  },

  toNumber: (input: string): number => Number(input),
};

/**
 * Choice definitions for common select prompts
 */
export const ChoiceSets = {
  assignmentTypes: [
    { name: "Parent's assignee", value: "@ParentAssignee" },
    { name: "Inherit from parent", value: "@Inherit" },
    { name: "Me (current user)", value: "@Me" },
    { name: "Custom email", value: "custom" },
    { name: "Unassigned", value: "@Unassigned" },
  ],

  activityTypes: [
    { name: "Design", value: "Design" },
    { name: "Development", value: "Development" },
    { name: "Testing", value: "Testing" },
    { name: "Documentation", value: "Documentation" },
    { name: "Deployment", value: "Deployment" },
    { name: "Requirements", value: "Requirements" },
    { name: "Code Review", value: "Code Review" },
    { name: "Custom", value: "Custom" },
    { name: "None", value: "None" },
  ],
};

/**
 * Prompt builder for conditional two-step prompts (select + conditional input)
 */
interface ConditionalPromptConfig {
  selectPrompt: {
    name: string;
    message: string;
    choices: Array<{ name: string; value: string }>;
    defaultValue?: string;
  };
  conditionalPrompt?: {
    name: string;
    message: string;
    triggerValue: string;
    validate?: (input: string) => boolean | string;
  };
}

export async function promptConditionalSelect(
  config: ConditionalPromptConfig
): Promise<{ value: string; customValue?: string }> {
  const prompts: Array<
    Question & { validate?: (input: string) => boolean | string }
  > = [
    {
      type: ListType,
      name: config.selectPrompt.name,
      message: config.selectPrompt.message,
      choices: config.selectPrompt.choices,
      default: config.selectPrompt.defaultValue,
    },
  ];

  if (config.conditionalPrompt) {
    prompts.push({
      type: "input",
      name: config.conditionalPrompt.name,
      message: config.conditionalPrompt.message,
      when: (answers: Answers) =>
        answers[config.selectPrompt.name] ===
        config.conditionalPrompt?.triggerValue,
      validate: config.conditionalPrompt.validate,
    });
  }

  const answers = await inquirer.prompt(prompts);
  const selectValue = answers[config.selectPrompt.name] as string;
  const customValue = config.conditionalPrompt
    ? (answers[config.conditionalPrompt.name] as string | undefined)
    : undefined;

  return {
    value: selectValue,
    customValue,
  };
}

/**
 * Prompt for adding multiple items with continue confirmation
 */
export async function promptMultipleItems<T extends Answers>(itemConfig: {
  itemName: string;
  prompts: Array<Question & { validate?: (input: T) => boolean | string }>;
  continueThreshold?: number;
}): Promise<T[]> {
  const items: T[] = [];
  let shouldContinue = true;

  while (shouldContinue) {
    const itemAnswers = await inquirer.prompt<T>(itemConfig.prompts);
    items.push(itemAnswers as T);

    const { more } = await inquirer.prompt<{ more: boolean }>([
      {
        type: "confirm",
        name: "more",
        message: `Add another ${itemConfig.itemName}?`,
        default: itemConfig.continueThreshold
          ? items.length < itemConfig.continueThreshold
          : true,
      },
    ]);

    shouldContinue = more;
  }

  return items;
}

/**
 * Prompt for yes/no with optional follow-up prompts
 */
export async function promptOptionalFeature<T extends Answers>(
  featureName: string,
  followUpPrompts?: Array<
    Question & { validate?: (input: T) => boolean | string }
  >,
  defaultEnabled = false
): Promise<{ enabled: boolean; data?: T }> {
  const { enabled } = await inquirer.prompt<{ enabled: boolean }>([
    {
      type: "confirm",
      name: "enabled",
      message: `${featureName}?`,
      default: defaultEnabled,
    },
  ]);

  if (!enabled || !followUpPrompts) {
    return { enabled };
  }

  const data = await inquirer.prompt<T>(followUpPrompts);
  return { enabled, data: data as T };
}
