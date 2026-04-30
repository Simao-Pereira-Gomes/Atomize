import { getErrorMessage } from "@/utils/errors";

const MAX_TEMPLATE_BYTES = 512 * 1024; // 512 KB

// Servers use inconsistent MIME types for YAML files. This allowlist covers known-safe
// types: text/plain (GitHub raw), text/yaml / application/yaml (proper YAML types),
// and application/octet-stream (generic CDN fallback).
const ALLOWED_CONTENT_TYPES = new Set([
  "text/plain",
  "text/yaml",
  "text/x-yaml",
  "application/yaml",
  "application/x-yaml",
  "application/octet-stream",
]);

/** Fetches a template from an HTTPS URL and returns its content as a string. */
export async function fetchTemplateContent(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (cause) {
    throw new Error(`Could not reach "${url}": ${getErrorMessage(cause)}`);
  }

  if (!res.ok) {
    switch (res.status) {
      case 404:
        throw new Error(`Template not found — check the URL is correct (${url})`);
      case 401:
      case 403:
        throw new Error(`Access denied — this URL requires authentication, which is not supported (HTTP ${res.status})`);
      case 429:
        throw new Error("Rate limited — try again later");
      default:
        throw new Error(
          res.status >= 500
            ? `Server error — try again later (HTTP ${res.status})`
            : `Failed to fetch template: HTTP ${res.status} ${res.statusText}`,
        );
    }
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
