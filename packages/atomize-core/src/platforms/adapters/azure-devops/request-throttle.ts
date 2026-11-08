import { logger } from "../../../logger";

/** Statuses Azure DevOps uses when it blocks or sheds a request; both are safe to send again later. */
const THROTTLED_STATUSES = new Set([429, 503]);

export interface RequestThrottleOptions {
  maxRetries?: number;
  /** First backoff when a throttled response has no Retry-After; doubles each retry (default 1000 ms). */
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Keeps one run's Azure DevOps requests under the service's rate limits.
 *
 * Azure DevOps returns 429 when it blocks a user, and can slow a user down with a successful response
 * that carries Retry-After (https://learn.microsoft.com/en-us/azure/devops/integrate/concepts/rate-limits).
 * On either signal every request waits out the Retry-After delay, and the number of requests in flight
 * is halved for the rest of the run. 429 and 503 responses are retried after the delay.
 *
 * azure-devops-node-api (17+) attaches parsed rate-limit headers as `rateLimit` to results and errors,
 * and the status as `statusCode` to errors; that is what this reads.
 */
export class RequestThrottle {
  private limit = Number.POSITIVE_INFINITY;
  private inFlight = 0;
  private pausedUntil = 0;
  private generation = 0;
  private warned = false;
  private readonly waiters: Array<() => void> = [];
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options: RequestThrottleOptions = {}) {
    this.maxRetries = options.maxRetries ?? 5;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 1000;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 5 * 60_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  get currentLimit(): number {
    return this.limit;
  }

  async run<T>(request: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const generation = await this.acquire();
      try {
        const result = await request();
        const retryAfterMs = retryAfterMsOf(result);
        if (retryAfterMs !== undefined && retryAfterMs > 0) this.onThrottled(generation, retryAfterMs);
        return result;
      } catch (error) {
        const status = statusCodeOf(error);
        if (status === undefined || !THROTTLED_STATUSES.has(status) || attempt >= this.maxRetries) throw error;
        const delayMs = retryAfterMsOf(error) ?? this.baseRetryDelayMs * 2 ** attempt;
        this.onThrottled(generation, delayMs);
        logger.debug(`AzureDevOps: HTTP ${status}, retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt + 1})`);
      } finally {
        this.release();
      }
    }
  }

  private onThrottled(generation: number, delayMs: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + Math.min(delayMs, this.maxRetryDelayMs));
    if (generation !== this.generation) return;
    this.generation++;
    const base = Number.isFinite(this.limit) ? this.limit : this.inFlight;
    this.limit = Math.max(1, Math.floor(base / 2));
    if (!this.warned) {
      this.warned = true;
      logger.warn(
        `AzureDevOps: requests are being throttled; slowing down to ${this.limit} at a time for the rest of this run`,
      );
    }
  }

  private async acquire(): Promise<number> {
    for (;;) {
      const waitMs = this.pausedUntil - this.now();
      if (waitMs > 0) {
        await this.sleep(waitMs);
        continue;
      }
      if (this.inFlight < this.limit) {
        this.inFlight++;
        return this.generation;
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  private release(): void {
    this.inFlight--;
    this.waiters.shift()?.();
  }
}

/**
 * Wraps a REST client API object so every method call goes through `throttle`. Use it only for
 * azure-devops-node-api client APIs (such as IWorkItemTrackingApi), whose methods all return Promises.
 */
export function withRequestThrottle<T extends object>(api: T, throttle: RequestThrottle): T {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => throttle.run(() => value.apply(target, args));
    },
  });
}

function statusCodeOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { statusCode?: unknown }).statusCode;
  return typeof code === "number" ? code : undefined;
}

/** Retry-After in milliseconds from an SDK result or error, if Azure DevOps sent one. */
function retryAfterMsOf(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const parsed = (value as { rateLimit?: { retryAfter?: unknown } }).rateLimit?.retryAfter;
  if (typeof parsed === "number" && Number.isFinite(parsed)) return parsed * 1000;
  const headers = (value as { responseHeaders?: Record<string, unknown> }).responseHeaders;
  const raw = headers?.["retry-after"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (typeof header !== "string" && typeof header !== "number") return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(String(header));
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
