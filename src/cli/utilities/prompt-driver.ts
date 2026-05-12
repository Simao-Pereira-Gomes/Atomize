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
        await clackMultiselect({
          ...opts,
          required: opts.required ?? true,
        } as Parameters<typeof clackMultiselect<T>>[0]),
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
