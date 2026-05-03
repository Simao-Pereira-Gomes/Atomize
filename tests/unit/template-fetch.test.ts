import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fetchTemplateContent } from "@/cli/utilities/template-fetch";
import { expectToReject } from "../utils/matchers";

const originalFetch = globalThis.fetch;
const templateUrl = "https://example.com/feature.yaml";

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

function retryOptions(delays: number[] = []) {
  return {
    sleep: (ms: number): Promise<void> => {
      delays.push(ms);
      return Promise.resolve();
    },
    now: () => Date.UTC(2026, 0, 1, 0, 0, 0),
  };
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchTemplateContent", () => {
  describe("URL validation", () => {
    test("rejects non-HTTPS URLs before fetching", async () => {
      const fetchMock = mock(() => Promise.resolve({} as Response));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await expectToReject(fetchTemplateContent("http://example.com/feature.yaml"), "https://");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("rejects malformed URLs before fetching", async () => {
      const fetchMock = mock(() => Promise.resolve({} as Response));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await expectToReject(fetchTemplateContent("not a url"), "Invalid template URL");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("success", () => {
    test("returns response body on 200", async () => {
      mockFetch(200, "name: feature\ntasks:\n  - title: Task");
      const content = await fetchTemplateContent(templateUrl);
      expect(content).toBe("name: feature\ntasks:\n  - title: Task");
    });
  });

  describe("HTTP errors", () => {
    test("throws 'not found' message on 404", async () => {
      mockFetch(404);
      await expectToReject(fetchTemplateContent(templateUrl), "Template not found");
    });

    test("throws 'access denied' message on 401", async () => {
      mockFetch(401);
      await expectToReject(fetchTemplateContent(templateUrl), "Access denied");
    });

    test("throws 'access denied' message on 403", async () => {
      mockFetch(403);
      await expectToReject(fetchTemplateContent(templateUrl), "Access denied");
    });

    test("throws 'rate limited' message on 429", async () => {
      mockFetch(429);
      await expectToReject(fetchTemplateContent(templateUrl, retryOptions()), "Rate limited");
    });

    test("throws 'server error' message on 500", async () => {
      mockFetch(500);
      await expectToReject(fetchTemplateContent(templateUrl, retryOptions()), "Server error");
    });

    test("throws 'server error' message on 503", async () => {
      mockFetch(503);
      await expectToReject(fetchTemplateContent(templateUrl, retryOptions()), "Server error");
    });

    test("throws generic HTTP message on other 4xx", async () => {
      mockFetch(400, "", "Bad Request");
      await expectToReject(fetchTemplateContent(templateUrl), "HTTP 400");
    });
  });

  describe("network errors", () => {
    test("retries transient network failure and succeeds", async () => {
      let call = 0;
      const fetchMock = mock(() => {
        call++;
        if (call === 1) return Promise.reject(new TypeError("fetch failed: ECONNRESET"));
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: { get: () => null },
          text: () => Promise.resolve("name: feature\ntasks: []"),
        } as unknown as Response);
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const content = await fetchTemplateContent(templateUrl, retryOptions());
      expect(content).toBe("name: feature\ntasks: []");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("does not retry non-transient network failure", async () => {
      const fetchMock = mock(() => Promise.reject(new Error("self signed certificate")));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await expectToReject(fetchTemplateContent(templateUrl, retryOptions()), "Could not reach");
      expect(fetchMock).toHaveBeenCalledTimes(1);
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
      const content = await fetchTemplateContent(templateUrl);
      expect(content).toBeTruthy();
    });

    test("accepts text/yaml", async () => {
      mockFetchWithType("text/yaml");
      const content = await fetchTemplateContent(templateUrl);
      expect(content).toBeTruthy();
    });

    test("accepts application/yaml", async () => {
      mockFetchWithType("application/yaml");
      const content = await fetchTemplateContent(templateUrl);
      expect(content).toBeTruthy();
    });

    test("accepts application/octet-stream", async () => {
      mockFetchWithType("application/octet-stream");
      const content = await fetchTemplateContent(templateUrl);
      expect(content).toBeTruthy();
    });

    test("accepts missing content-type header", async () => {
      mockFetchWithType("");
      const content = await fetchTemplateContent(templateUrl);
      expect(content).toBeTruthy();
    });

    test("rejects text/html", async () => {
      mockFetchWithType("text/html; charset=utf-8");
      await expectToReject(fetchTemplateContent(templateUrl), "Unexpected content type");
    });

    test("rejects application/javascript", async () => {
      mockFetchWithType("application/javascript");
      await expectToReject(fetchTemplateContent(templateUrl), "Unexpected content type");
    });

    test("rejects application/json", async () => {
      mockFetchWithType("application/json");
      await expectToReject(fetchTemplateContent(templateUrl), "Unexpected content type");
    });

    test("rejects application/pdf", async () => {
      mockFetchWithType("application/pdf");
      await expectToReject(fetchTemplateContent(templateUrl), "Unexpected content type");
    });

    test("rejects image/png", async () => {
      mockFetchWithType("image/png");
      await expectToReject(fetchTemplateContent(templateUrl), "Unexpected content type");
    });
  });

  describe("retry behavior", () => {
    type FakeResponse = { status: number; body?: string; headers?: Record<string, string> };

    function mockFetchSequence(responses: Array<FakeResponse>): { getCallCount: () => number } {
      let call = 0;
      globalThis.fetch = mock(() => {
        const index = Math.min(call++, responses.length - 1);
        const r = responses[index];
        if (r === undefined) throw new Error("mockFetchSequence requires at least one response");
        return Promise.resolve({
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          statusText: "",
          headers: { get: (h: string) => r.headers?.[h] ?? null },
          text: () => Promise.resolve(r.body ?? "name: feature\ntasks: []"),
        } as unknown as Response);
      }) as unknown as typeof fetch;
      return { getCallCount: () => call };
    }

    for (const status of [408, 429, 500, 502, 503, 504]) {
      test(`retries on ${status} and succeeds on second attempt`, async () => {
        const calls = mockFetchSequence([{ status }, { status: 200 }]);
        const delays: number[] = [];
        const content = await fetchTemplateContent(templateUrl, retryOptions(delays));
        expect(content).toBe("name: feature\ntasks: []");
        expect(calls.getCallCount()).toBe(2);
        expect(delays).toEqual([150]);
      });

      test(`retries on ${status} and succeeds on third attempt`, async () => {
        const calls = mockFetchSequence([{ status }, { status }, { status: 200 }]);
        const delays: number[] = [];
        const content = await fetchTemplateContent(templateUrl, retryOptions(delays));
        expect(content).toBe("name: feature\ntasks: []");
        expect(calls.getCallCount()).toBe(3);
        expect(delays).toEqual([150, 400]);
      });
    }

    test("exhausts all three attempts and throws last error", async () => {
      const calls = mockFetchSequence([{ status: 503 }, { status: 503 }, { status: 503 }]);
      await expectToReject(fetchTemplateContent(templateUrl, retryOptions()), "Server error");
      expect(calls.getCallCount()).toBe(3);
    });

    for (const status of [400, 401, 403, 404]) {
      test(`does not retry on ${status}`, async () => {
        const fetchMock = mock(() =>
          Promise.resolve({
            ok: false,
            status,
            statusText: "",
            headers: { get: () => null },
            text: () => Promise.resolve(""),
          } as unknown as Response),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        await expectToReject(fetchTemplateContent(templateUrl));
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    }

    test("respects Retry-After header on 429, capped at 2s", async () => {
      const delays: number[] = [];
      mockFetchSequence([
        { status: 429, headers: { "retry-after": "9999" } },
        { status: 200 },
      ]);
      const content = await fetchTemplateContent(templateUrl, retryOptions(delays));
      expect(content).toBe("name: feature\ntasks: []");
      expect(delays).toEqual([2000]);
    });

    test("respects HTTP-date Retry-After header on 503", async () => {
      const delays: number[] = [];
      mockFetchSequence([
        { status: 503, headers: { "retry-after": "Thu, 01 Jan 2026 00:00:01 GMT" } },
        { status: 200 },
      ]);
      const content = await fetchTemplateContent(templateUrl, retryOptions(delays));
      expect(content).toBe("name: feature\ntasks: []");
      expect(delays).toEqual([1000]);
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
      const content = await fetchTemplateContent(templateUrl);
      expect(content).toBeTruthy();
    });

    test("rejects when content-length exceeds limit", async () => {
      mockFetchWithSize(String(600 * 1024), 1);
      await expectToReject(fetchTemplateContent(templateUrl), "too large");
    });

    test("rejects when body exceeds limit even without content-length", async () => {
      mockFetchWithSize(null, 600 * 1024);
      await expectToReject(fetchTemplateContent(templateUrl), "too large");
    });
  });
});
