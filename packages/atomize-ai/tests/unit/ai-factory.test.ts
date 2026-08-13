import { describe, expect, test } from "bun:test";
import { createAIProvider } from "../../src";

describe("createAIProvider", () => {
  test("creates the GitHub Copilot provider without credentials or a model preference", () => {
    const provider = createAIProvider({ type: "github-copilot" });
    expect(provider.id).toBe("github-copilot");
    expect(typeof provider.authenticate).toBe("function");
  });

  test("creates a deterministic mock provider", async () => {
    const provider = createAIProvider({ type: "mock", response: "mock response" });
    await expect(provider.authenticate()).resolves.toBeUndefined();
    await expect(provider.generate("", "")).resolves.toBe("mock response");
  });
});
