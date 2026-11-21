import {
  confirm as clackConfirm,
  multiselect as clackMultiselect,
  password as clackPassword,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";

type ValidateFn = (v: string | undefined) => string | undefined;

export interface PromptDriver {
  text(opts: {
    message: string;
    placeholder?: string;
    validate?: ValidateFn;
  }): Promise<string>;

  select<T extends string>(opts: {
    message: string;
    options: { label: string; value: T; hint?: string }[];
    initialValue?: T;
  }): Promise<T>;

  multiselect<T extends string>(opts: {
    message: string;
    options: { label: string; value: T }[];
    required?: boolean;
  }): Promise<T[]>;

  confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean>;

  password(opts: {
    message: string;
    validate?: ValidateFn;
  }): Promise<string>;
}

export function createPromptDriver(): PromptDriver {
  return {
    async text(opts) {
      return assertNotCancelled(await clackText(opts));
    },
    async select<T extends string>(opts: {
      message: string;
      options: { label: string; value: T; hint?: string }[];
      initialValue?: T;
    }): Promise<T> {
      return assertNotCancelled(
        await clackSelect(opts as Parameters<typeof clackSelect<T>>[0]),
      ) as T;
    },
    async multiselect<T extends string>(opts: {
      message: string;
      options: { label: string; value: T }[];
      required?: boolean;
    }): Promise<T[]> {
      return assertNotCancelled(
        // Clack's Option<T> is conditional on T, which TypeScript can't resolve for a generic T, so the
        // prompt runs over plain strings (T extends string) and the answers are narrowed back to T.
        await clackMultiselect<string>({
          message: opts.message,
          options: opts.options,
          required: opts.required ?? true,
        }),
      ) as T[];
    },
    async confirm(opts) {
      return assertNotCancelled(await clackConfirm(opts));
    },
    async password(opts) {
      return assertNotCancelled(await clackPassword(opts));
    },
  };
}
