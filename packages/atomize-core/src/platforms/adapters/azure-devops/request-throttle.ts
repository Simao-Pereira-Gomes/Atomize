import { logger } from "../../../logger";

/**
 * 429 means Azure DevOps blocked the request before doing any work, so any request can be sent again.
 * A 503 can come back after a write was applied, so only reads are retried on it.
 */
const RETRY_STATUSES = { write: new Set([429]), read: new Set([429, 503]) };
/** However often the run is throttled, it keeps at least this many requests in flight. */
const MIN_LIMIT = 2;
/** SDK method names that change Work Items; every other Work Item Tracking method only reads. */
const WRITE_METHOD = /^(create|update|delete|destroy|restore)/;

export interface RequestThrottleOptions {
  maxRetries?: number;
  /** First backoff when a throttled response has no Retry-After; doubles each retry (default 1000 ms). */
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  /** After this long without a throttle signal the limit is lifted again (default 5 minutes). */
  recoverAfterMs?: number;
  /** Called when Azure DevOps answers 401: the credentials were rejected (an expired or revoked PAT). */
  onUnauthorized?: () => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface ThrottledRequestOptions {
  /** False for writes, which aren't retried on 503 (default true). */
  idempotent?: boolean;
}

/**
 * Keeps one run's Azure DevOps requests under the service's rate limits.
 *
 * Azure DevOps returns 429 when it blocks a user, and can slow a user down with a successful response
 * that carries Retry-After (https://learn.microsoft.com/en-us/azure/devops/integrate/concepts/rate-limits).
 * On either signal every request waits out the Retry-After delay, and the number of requests in flight
 * is halved (from the run's peak, never below two) until Azure DevOps has been quiet for a while. 429 responses are retried
 * after the delay, and so are 503 responses to reads.
 *
 * azure-devops-node-api (17+) attaches parsed rate-limit headers as `rateLimit` to results and errors,
 * and the status as `statusCode` to errors; that is what this reads.
 */
export class RequestThrottle {
  private limit = Number.POSITIVE_INFINITY;
  private inFlight = 0;
  private peakInFlight = 0;
  private pausedUntil = 0;
  private lastThrottledAt = 0;
  /** A throttle signal from a request sent before the latest limit cut doesn't cut again. */
  private limitCuts = 0;
  private warned = false;
  private readonly waiters: Array<() => void> = [];
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly recoverAfterMs: number;
  private readonly onUnauthorized: (() => void) | undefined;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options: RequestThrottleOptions = {}) {
    this.maxRetries = options.maxRetries ?? 5;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 1000;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 5 * 60_000;
    this.recoverAfterMs = options.recoverAfterMs ?? 5 * 60_000;
    this.onUnauthorized = options.onUnauthorized;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  get currentLimit(): number {
    return this.limit;
  }

  async run<T>(request: () => Promise<T>, options: ThrottledRequestOptions = {}): Promise<T> {
    const retryStatuses = options.idempotent === false ? RETRY_STATUSES.write : RETRY_STATUSES.read;
    for (let attempt = 0; ; attempt++) {
      const cutsAtStart = await this.acquire();
      try {
        const result = await request();
        const retryAfterMs = this.retryAfterMsOf(result);
        if (retryAfterMs !== undefined && retryAfterMs > 0) this.onThrottled(cutsAtStart, retryAfterMs);
        return result;
      } catch (error) {
        const status = statusCodeOf(error);
        if (status === 401) this.onUnauthorized?.();
        if (status === undefined || !retryStatuses.has(status) || attempt >= this.maxRetries) throw error;
        const delayMs = this.retryAfterMsOf(error) ?? this.baseRetryDelayMs * 2 ** attempt;
        this.onThrottled(cutsAtStart, delayMs);
        logger.debug(`AzureDevOps: HTTP ${status}, retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt + 1})`);
      } finally {
        this.release();
      }
    }
  }

  private onThrottled(cutsAtStart: number, delayMs: number): void {
    this.lastThrottledAt = this.now();
    this.pausedUntil = Math.max(this.pausedUntil, this.lastThrottledAt + Math.min(delayMs, this.maxRetryDelayMs));
    if (cutsAtStart !== this.limitCuts) return;
    this.limitCuts++;
    const base = Number.isFinite(this.limit) ? this.limit : this.peakInFlight;
    this.limit = Math.max(MIN_LIMIT, Math.floor(base / 2));
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
      if (Number.isFinite(this.limit) && this.now() - this.lastThrottledAt >= this.recoverAfterMs) {
        this.limit = Number.POSITIVE_INFINITY;
        this.peakInFlight = this.inFlight;
        this.warned = false;
      }
      if (this.inFlight < this.limit) {
        this.inFlight++;
        this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
        return this.limitCuts;
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  private release(): void {
    this.inFlight--;
    this.waiters.shift()?.();
  }

  /** Retry-After in milliseconds from an SDK result or error, if Azure DevOps sent one. */
  private retryAfterMsOf(value: unknown): number | undefined {
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
    return Number.isNaN(date) ? undefined : Math.max(0, date - this.now());
  }
}

/**
 * Wraps a REST client API object so every method call goes through `throttle`, treating methods named
 * create*, update*, delete*, destroy* or restore* as writes. Use it only for azure-devops-node-api
 * client APIs (such as IWorkItemTrackingApi), whose methods all return Promises.
 */
export function withRequestThrottle<T extends object>(api: T, throttle: RequestThrottle): T {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      const idempotent = typeof property !== "string" || !WRITE_METHOD.test(property);
      return (...args: unknown[]) => throttle.run(() => value.apply(target, args), { idempotent });
    },
  });
}

function statusCodeOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { statusCode?: unknown }).statusCode;
  return typeof code === "number" ? code : undefined;
}
