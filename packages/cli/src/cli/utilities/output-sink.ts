import {
  cancel as clackCancel,
  intro as clackIntro,
  log as clackLog,
  outro as clackOutro,
} from "@clack/prompts";

import { createManagedSpinner } from "@/cli/utilities/terminal-output";

export interface SpinnerHandle {
  message(message: string): void;
  stop(message: string): void;
  fail(message: string): void;
}

export interface OutputSink {
  intro(title: string): void;
  outro(message: string): void;
  cancel(message: string): void;
  print(message: string): void;
  printAlways(message: string): void;
  blankLine(): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  startSpinner(message: string): SpinnerHandle;
}

export type OutputSinkFactory = (opts: { quiet: boolean; verbose?: boolean }) => OutputSink;

const noopSpinner: SpinnerHandle = { message: () => {}, stop: () => {}, fail: () => {} };

export function createOutputSink(opts: { quiet: boolean; verbose?: boolean }): OutputSink {
  const show = !opts.quiet;
  return {
    intro:      (title)   => { if (show) clackIntro(title); },
    outro:      (message) => { if (show) clackOutro(message); },
    cancel:     (message) => { clackCancel(message); },
    print:      (message) => { if (show) console.log(message); },
    printAlways:(message) => { console.log(message); },
    blankLine:  ()        => { if (show) console.log(""); },
    info:       (message) => { if (show) clackLog.info(message); },
    warn:       (message) => { if (show) clackLog.warn(message); },
    error:      (message) => { if (show) clackLog.error(message); },
    success:    (message) => { if (show) clackLog.success(message); },
    startSpinner(message) {
      if (!show) return noopSpinner;
      const s = createManagedSpinner();
      s.start(message);
      return {
        message: (msg) => s.message(msg),
        stop:    (msg) => s.stop(msg),
        fail:    (msg) => s.stop(msg),
      };
    },
  };
}
