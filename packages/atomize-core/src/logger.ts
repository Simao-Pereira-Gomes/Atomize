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

const CONSOLE_METHOD: Record<LogLevel, (...args: unknown[]) => void> = {
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

function write(level: LogLevel, message: string, meta?: unknown): void {
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
