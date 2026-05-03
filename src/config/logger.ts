import { writeManagedOutput } from "@/cli/utilities/terminal-output";

export const LOG_LEVEL_VALUES = ["error", "warn", "info", "debug"] as const;

export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN = /token|pat|api[-_]?key|authorization|secret|password/i;

let overrideLevel: LogLevel | undefined;

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && value in LEVELS;
}

function resolveLevel(): LogLevel {
  if (overrideLevel) return overrideLevel;
  if (process.env.ATOMIZE_DEBUG === "1") return "debug";
  const env = process.env.LOG_LEVEL;
  if (isLogLevel(env)) return env;
  return "warn";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function timestamp(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeMeta(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMeta(item, seen));
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);

    const sanitizedEntries = Object.entries(value).map(([key, nestedValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, REDACTED] as const;
      }

      return [key, sanitizeMeta(nestedValue, seen)] as const;
    });

    return Object.fromEntries(sanitizedEntries);
  }

  return value;
}

function format(message: string, meta?: unknown): string {
  if (meta === undefined) return message;
  try {
    return `${message} ${JSON.stringify(sanitizeMeta(meta))}`;
  } catch {
    return `${message} [unserializable metadata]`;
  }
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (LEVELS[level] > LEVELS[resolveLevel()]) return;
  const stream = level === "error" || level === "warn" ? "stderr" : "stdout";
  writeManagedOutput(stream, `${timestamp()} [${level}]: ${format(message, meta)}`);
}

export const logger = {
  get level(): LogLevel {
    return resolveLevel();
  },
  set level(value: LogLevel) {
    overrideLevel = value;
  },
  error: (message: string, meta?: unknown) => write("error", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  info: (message: string, meta?: unknown) => write("info", message, meta),
  debug: (message: string, meta?: unknown) => write("debug", message, meta),
};

export function resetLoggerForTests(): void {
  overrideLevel = undefined;
}

export default logger;
