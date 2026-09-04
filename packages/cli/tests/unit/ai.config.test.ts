import { describe, expect, test } from "bun:test";
import { resolveAIProvider } from "@config/ai.config";

describe("resolveAIProvider", () => {
  test("always resolves the credential-free GitHub Copilot provider", () => {
    expect(resolveAIProvider().id).toBe("github-copilot");
  });
});
