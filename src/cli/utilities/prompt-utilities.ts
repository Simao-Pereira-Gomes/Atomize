import {
  cancel,
  confirm,
  isCancel,
  isCI,
  isTTY,
  select,
  text,
} from "@clack/prompts";
import z from "zod";
import { ExitCode } from "@/cli/utilities/exit-codes";

export { createManagedSpinner } from "@/cli/utilities/terminal-output";

/** Returns true when running in a real interactive terminal (not piped/CI). */
export function isInteractiveTerminal(): boolean {
  return isTTY(process.stdout) && !isCI();
}

/**
 * Strips ANSI escape sequences and C0/C1 control characters from a string
 * before it is written to the terminal. Use on any value that originated
 * outside the current process (disk, network, user input stored on disk).
 */
export function sanitizeTty(value: unknown): string {
  return (
    String(value ?? "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — strips ANSI/VT escape sequences
      .replace(/\x1b(?:\[[0-9;]*[a-zA-Z]|[@-Z\\-_])/g, "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — strips C0 control characters (preserves \t \n \r)
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
  );
}

const emailSchema = z.string().email();

/**
 * Assert that a clack prompt result is not a cancellation symbol.
 * Calls cancel() and exits if the user cancelled (Ctrl+C).
 */
export function assertNotCancelled<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) {
    cancel("Operation cancelled.");
    process.exit(ExitCode.Success);
  }
  return value as Exclude<T, symbol>;
}

/**
 * Validation functions.
 * Return a string (error message) or undefined (valid) — compatible with @clack/prompts validate.
 */
export const Validators = {
  required:
    (fieldName: string) =>
    (input: string | undefined): string | undefined => {
      if (!input || input.trim() === "") {
        return `${fieldName} is required`;
      }
      return undefined;
    },

  maxLength:
    (fieldName: string, maxLength: number) =>
    (input: string | undefined): string | undefined => {
      if (!input) return undefined;
      if (input.length > maxLength) {
        return `${fieldName} must be ${maxLength} characters or less`;
      }
      return undefined;
    },

  requiredWithMaxLength:
    (fieldName: string, maxLength: number) =>
    (input: string | undefined): string | undefined => {
      const required = Validators.required(fieldName)(input);
      if (required) return required;
      return Validators.maxLength(fieldName, maxLength)(input);
    },

  estimationPercent: (input: string | undefined): string | undefined => {
    const num = Number(input);
    if (Number.isNaN(num)) return "Estimation must be a valid number";
    if (num < 0) return "Estimation cannot be negative";
    if (num > 100) return "Estimation cannot exceed 100%";
    return undefined;
  },

  email: (input: string | undefined): string | undefined => {
    if (!input) return undefined;
    const parseEmail = emailSchema.safeParse(input);
    if (!parseEmail.success) {
      return "Please enter a valid email address";
    }
    return undefined;
  },

  /** Accepts an empty/blank string as "not provided" (optional field). */
  priorityRange: (input: string | undefined): string | undefined => {
    if (!input || input.trim() === "") return undefined; // Optional
    const num = Number(input);
    if (Number.isNaN(num)) return "Priority must be a valid number";
    if (num < 1 || num > 4) {
      return "Priority must be between 1 and 4";
    }
    return undefined;
  },

  /** Validates that the value is strictly greater than `min`, accepting empty/blank as "use default". */
  greaterThan:
    (fieldName: string, min: number) =>
    (input: string | undefined): string | undefined => {
      if (!input || input.trim() === "") return undefined;
      const n = Number(input);
      if (Number.isNaN(n)) return `${fieldName} must be a valid number`;
      if (n <= min) return `${fieldName} must be greater than ${min}`;
      return undefined;
    },

  /** Validates a numeric range, accepting empty/blank as "use default". */
  numericRange:
    (fieldName: string, min: number, max: number) =>
    (input: string | undefined): string | undefined => {
      if (!input || input.trim() === "") return undefined;
      const n = Number(input);
      if (Number.isNaN(n) || n < min || n > max)
        return `${fieldName} must be between ${min} and ${max}`;
      return undefined;
    },

  /** Accepts an empty/blank string as "not provided" (optional field). */
  nonNegative:
    (fieldName: string) =>
    (input: string | undefined): string | undefined => {
      if (!input || input.trim() === "") return undefined; // Optional
      const num = Number(input);
      if (Number.isNaN(num)) return `${fieldName} must be a valid number`;
      if (num < 0) {
        return `${fieldName} cannot be negative`;
      }
      return undefined;
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
 * Choice definitions for common select prompts (clack format: label/value)
 */
export const ChoiceSets = {
  assignmentTypes: [
    { label: "Parent's assignee", value: "@ParentAssignee" },
    { label: "Inherit from parent", value: "@Inherit" },
    { label: "Me (current user)", value: "@Me" },
    { label: "Custom email", value: "custom" },
    { label: "Unassigned", value: "@Unassigned" },
  ],

  activityTypes: [
    { label: "Design", value: "Design" },
    { label: "Development", value: "Development" },
    { label: "Testing", value: "Testing" },
    { label: "Documentation", value: "Documentation" },
    { label: "Deployment", value: "Deployment" },
    { label: "Requirements", value: "Requirements" },
    { label: "Code Review", value: "Code Review" },
    { label: "Custom", value: "Custom" },
    { label: "None", value: "None" },
  ],
};

/**
 * Config for a conditional two-step prompt (select + optional text input)
 */
interface ConditionalPromptConfig {
  selectPrompt: {
    name: string;
    message: string;
    choices: Array<{ label: string; value: string }>;
    defaultValue?: string;
  };
  conditionalPrompt?: {
    name: string;
    message: string;
    triggerValue: string;
    validate?: (input: string | undefined) => string | undefined;
  };
}

export async function promptConditionalSelect(
  config: ConditionalPromptConfig
): Promise<{ value: string; customValue?: string }> {
  const selectValue = assertNotCancelled(
    await select({
      message: config.selectPrompt.message,
      options: config.selectPrompt.choices,
      initialValue: config.selectPrompt.defaultValue,
    })
  );

  let customValue: string | undefined;
  if (
    config.conditionalPrompt &&
    selectValue === config.conditionalPrompt.triggerValue
  ) {
    customValue = assertNotCancelled(
      await text({
        message: config.conditionalPrompt.message,
        validate: config.conditionalPrompt.validate,
      })
    );
  }

  return { value: selectValue as string, customValue };
}

/**
 * Prompt for adding multiple items with continue confirmation.
 * @param itemName - Display name for the item type (e.g. "criterion")
 * @param promptFn - Factory called with the 1-based item index; returns the item
 * @param continueThreshold - Default "add more?" to true while count < threshold
 */
export async function promptMultipleItems<T>(
  itemName: string,
  promptFn: (index: number) => Promise<T>,
  continueThreshold?: number
): Promise<T[]> {
  const items: T[] = [];
  let shouldContinue = true;

  while (shouldContinue) {
    const item = await promptFn(items.length + 1);
    items.push(item);

    const more = assertNotCancelled(
      await confirm({
        message: `Add another ${itemName}?`,
        initialValue: continueThreshold
          ? items.length < continueThreshold
          : true,
      })
    );

    shouldContinue = more;
  }

  return items;
}

/**
 * Prompt for yes/no with an optional async follow-up.
 * @param featureName - Question label (appended with "?")
 * @param followUp - Called only when user answers yes; returns the feature data
 * @param defaultEnabled - Initial value for the confirm prompt
 */
export async function promptOptionalFeature<T>(
  featureName: string,
  followUp?: () => Promise<T>,
  defaultEnabled = false
): Promise<{ enabled: boolean; data?: T }> {
  const enabled = assertNotCancelled(
    await confirm({
      message: `${featureName}?`,
      initialValue: defaultEnabled,
    })
  );

  if (!enabled || !followUp) {
    return { enabled };
  }

  const data = await followUp();
  return { enabled, data };
}
