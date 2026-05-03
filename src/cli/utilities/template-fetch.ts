import { getErrorMessage } from "@/utils/errors";

const MAX_TEMPLATE_BYTES = 512 * 1024; // 512 KB
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [150, 400] as const;
const MAX_RETRY_AFTER_MS = 2_000;
const FETCH_TIMEOUT_MS = 10_000;

const HttpStatus = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REQUEST_TIMEOUT: 408,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

const RETRYABLE_STATUSES = new Set<number>([
  HttpStatus.REQUEST_TIMEOUT,
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.INTERNAL_SERVER_ERROR,
  HttpStatus.BAD_GATEWAY,
  HttpStatus.SERVICE_UNAVAILABLE,
  HttpStatus.GATEWAY_TIMEOUT,
]);

const TRANSIENT_NETWORK_ERROR_PATTERNS = [
  "abort",
  "timeout",
  "timed out",
  "network",
  "fetch failed",
  "connection reset",
  "socket hang up",
  "econnreset",
  "etimedout",
  "eai_again",
];

type FetchTemplateOptions = {
  readonly sleep?: (ms: number) => Promise<void>;
  readonly timeoutMs?: number;
  readonly now?: () => number;
};

const ALLOWED_CONTENT_TYPES = new Set([
  "text/plain",
  "text/yaml",
  "text/x-yaml",
  "application/yaml",
  "application/x-yaml",
  "application/octet-stream",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: URL, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    return cause === undefined ? error.message : `${error.message} ${getErrorMessage(cause)}`;
  }
  return String(error);
}

function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;

  const message = errorDetail(error).toLowerCase();
  return TRANSIENT_NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function statusError(res: Response, url: string): Error {
  switch (res.status) {
    case HttpStatus.NOT_FOUND:
      return new Error(`Template not found — check the URL is correct (${url})`);
    case HttpStatus.UNAUTHORIZED:
    case HttpStatus.FORBIDDEN:
      return new Error(
        `Access denied — this URL requires authentication, which is not supported (HTTP ${res.status})`,
      );
    case HttpStatus.TOO_MANY_REQUESTS:
      return new Error("Rate limited — try again later");
    default:
      return new Error(
        res.status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? `Server error — try again later (HTTP ${res.status})`
          : `Failed to fetch template: HTTP ${res.status} ${res.statusText}`,
      );
  }
}

function retryDelayMs(res: Response, attempt: number, now: () => number): number {
  if (res.status === HttpStatus.TOO_MANY_REQUESTS || res.status === HttpStatus.SERVICE_UNAVAILABLE) {
    const header = res.headers.get("retry-after");
    if (header !== null) {
      const seconds = Number(header);
      if (!Number.isNaN(seconds) && seconds > 0) {
        return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
      }

      const retryAt = Date.parse(header);
      if (!Number.isNaN(retryAt)) {
        return Math.min(Math.max(retryAt - now(), 0), MAX_RETRY_AFTER_MS);
      }
    }
  }
  return RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[0];
}

export async function fetchTemplateContent(url: string, options: FetchTemplateOptions = {}): Promise<string> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid template URL: "${url}"`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Template URLs must use https://");
  }

  let lastError: Error | undefined;
  let nextDelay: number = RETRY_DELAYS_MS[0];
  const wait = options.sleep ?? sleep;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const now = options.now ?? Date.now;

  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) await wait(nextDelay);

    let res: Response;
    try {
      res = await fetchWithTimeout(parsedUrl, timeoutMs);
    } catch (cause) {
      const error = new Error(`Could not reach "${url}": ${getErrorMessage(cause)}`);
      if (attempt === MAX_FETCH_ATTEMPTS - 1 || !isTransientNetworkError(cause)) throw error;
      lastError = error;
      nextDelay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[0];
      continue;
    }

    if (!res.ok) {
      const error = statusError(res, url);
      if (!RETRYABLE_STATUSES.has(res.status)) throw error;
      lastError = error;
      nextDelay = retryDelayMs(res, attempt, now);
      continue;
    }

    const rawContentType = res.headers.get("content-type") ?? "";
    const [mimeType = ""] = rawContentType.split(";");
    const contentType = mimeType.trim().toLowerCase();
    if (contentType && !ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new Error(
        `Unexpected content type "${contentType}" — the URL does not appear to point to a YAML file.`,
      );
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) > MAX_TEMPLATE_BYTES) {
      throw new Error(
        `Template file too large (${contentLength} bytes). Maximum allowed: ${MAX_TEMPLATE_BYTES / 1024} KB.`,
      );
    }

    const text = await res.text();
    if (text.length > MAX_TEMPLATE_BYTES) {
      throw new Error(
        `Template file too large (${text.length} bytes). Maximum allowed: ${MAX_TEMPLATE_BYTES / 1024} KB.`,
      );
    }

    return text;
  }

  throw lastError ?? new Error(`Failed to fetch template after ${MAX_FETCH_ATTEMPTS} attempts`);
}
