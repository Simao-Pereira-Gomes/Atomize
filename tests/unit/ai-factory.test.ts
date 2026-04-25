import { describe, expect, test } from "bun:test";
import { createAIProvider } from "../../src/ai/ai-factory";
import { GitHubModelsProvider } from "../../src/ai/providers/github-models/github-models.provider";
import { MockAIProvider } from "../../src/ai/providers/mock/mock.provider";

describe("createAIProvider", () => {
  test("creates a GitHub Models provider", () => {
    const provider = createAIProvider({
      type: "github-models",
      token: "ghp_testtoken12345678901234567890123456789",
      model: "gpt-4o-mini",
    });

    expect(provider).toBeInstanceOf(GitHubModelsProvider);
    expect(provider.id).toBe("github-models");
  });

  test("creates a mock provider with the provided response", async () => {
    const provider = createAIProvider({
      type: "mock",
      response: "mock response",
    });

    expect(provider).toBeInstanceOf(MockAIProvider);
    expect(provider.id).toBe("mock");
    await expect(provider.generate("", "")).resolves.toBe("mock response");
  });
});
