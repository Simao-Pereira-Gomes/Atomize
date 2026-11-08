import { AsyncLocalStorage } from "node:async_hooks";

export const LOG_LEVEL_VALUES = ["error", "warn", "info", "debug"] as const;

export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface Logger {
  level: LogLevel;
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}

let currentLevel: LogLevel = "warn";

/** Set inside `silently`: log calls made in that async context are dropped. */
const silenced = new AsyncLocalStorage<true>();

// Looked up on each call, so a replaced console (a test spy, say) is used.
const CONSOLE_METHOD: Record<LogLevel, (...args: unknown[]) => void> = {
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  info: (...args) => console.info(...args),
  debug: (...args) => console.debug(...args),
};

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (silenced.getStore()) return;
  if (LEVELS[level] > LEVELS[currentLevel]) return;
  if (meta === undefined) {
    CONSOLE_METHOD[level](message);
  } else {
    CONSOLE_METHOD[level](message, meta);
  }
}

export const logger: Logger = {
  get level(): LogLevel {
    return currentLevel;
  },
  set level(value: LogLevel) {
    currentLevel = value;
  },
  error: (message, meta) => write("error", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  info: (message, meta) => write("info", message, meta),
  debug: (message, meta) => write("debug", message, meta),
};

export default logger;

/**
 * Runs `work` with logging switched off for it alone, including everything it awaits. Other work
 * running at the same time (another sidecar request, say) keeps logging. For callers that report
 * what happened in their own result, so the log would only repeat it.
 */
export function silently<T>(work: () => T): T {
  return silenced.run(true, work);
}
