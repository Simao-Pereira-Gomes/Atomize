import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fetchTemplateContent } from "@/cli/utilities/template-fetch";

const originalFetch = globalThis.fetch;

function mockFetch(status: number, body = "", statusText = ""): void {
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: { get: () => null },
      text: () => Promise.resolve(body),
    } as unknown as Response),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchTemplateContent", () => {
  describe("success", () => {
    test("returns response body on 200", async () => {
      mockFetch(200, "name: feature\ntasks:\n  - title: Task");
      const content = await fetchTemplateContent("https://example.com/feature.yaml");
      expect(content).toBe("name: feature\ntasks:\n  - title: Task");
    });
  });

  describe("HTTP errors", () => {
    test("throws 'not found' message on 404", async () => {
      mockFetch(404);
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Template not found",
      );
    });

    test("throws 'access denied' message on 401", async () => {
      mockFetch(401);
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Access denied",
      );
    });

    test("throws 'access denied' message on 403", async () => {
      mockFetch(403);
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Access denied",
      );
    });

    test("throws 'rate limited' message on 429", async () => {
      mockFetch(429);
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Rate limited",
      );
    });

    test("throws 'server error' message on 500", async () => {
      mockFetch(500);
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Server error",
      );
    });

    test("throws 'server error' message on 503", async () => {
      mockFetch(503);
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Server error",
      );
    });

    test("throws generic HTTP message on other 4xx", async () => {
      mockFetch(400, "", "Bad Request");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "HTTP 400",
      );
    });
  });

  describe("network errors", () => {
    test("throws 'could not reach' on network failure", async () => {
      globalThis.fetch = mock(() => Promise.reject(new Error("Network unreachable"))) as unknown as typeof fetch;
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Could not reach",
      );
    });
  });

  describe("content-type guard", () => {
    function mockFetchWithType(contentType: string, body = "name: feature\ntasks: []"): void {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: { get: (h: string) => (h === "content-type" ? contentType : null) },
          text: () => Promise.resolve(body),
        } as unknown as Response),
      ) as unknown as typeof fetch;
    }

    test("accepts text/plain", async () => {
      mockFetchWithType("text/plain; charset=utf-8");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).resolves.toBeTruthy();
    });

    test("accepts text/yaml", async () => {
      mockFetchWithType("text/yaml");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).resolves.toBeTruthy();
    });

    test("accepts application/yaml", async () => {
      mockFetchWithType("application/yaml");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).resolves.toBeTruthy();
    });

    test("accepts application/octet-stream", async () => {
      mockFetchWithType("application/octet-stream");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).resolves.toBeTruthy();
    });

    test("accepts missing content-type header", async () => {
      mockFetchWithType("");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).resolves.toBeTruthy();
    });

    test("rejects text/html", async () => {
      mockFetchWithType("text/html; charset=utf-8");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Unexpected content type",
      );
    });

    test("rejects application/javascript", async () => {
      mockFetchWithType("application/javascript");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Unexpected content type",
      );
    });

    test("rejects application/json", async () => {
      mockFetchWithType("application/json");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Unexpected content type",
      );
    });

    test("rejects application/pdf", async () => {
      mockFetchWithType("application/pdf");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Unexpected content type",
      );
    });

    test("rejects image/png", async () => {
      mockFetchWithType("image/png");
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "Unexpected content type",
      );
    });
  });

  describe("size limit", () => {
    function mockFetchWithSize(contentLength: string | null, bodySize: number): void {
      const body = "x".repeat(bodySize);
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: { get: (h: string) => (h === "content-length" ? contentLength : null) },
          text: () => Promise.resolve(body),
        } as unknown as Response),
      ) as unknown as typeof fetch;
    }

    test("accepts a file within the size limit", async () => {
      mockFetchWithSize(null, 1024);
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).resolves.toBeTruthy();
    });

    test("rejects when content-length exceeds limit", async () => {
      mockFetchWithSize(String(600 * 1024), 1);
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "too large",
      );
    });

    test("rejects when body exceeds limit even without content-length", async () => {
      mockFetchWithSize(null, 600 * 1024);
      await expect(fetchTemplateContent("https://example.com/feature.yaml")).rejects.toThrow(
        "too large",
      );
    });
  });
});
