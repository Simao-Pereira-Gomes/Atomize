import { GitHubModelsProvider } from "./providers/github-models/github-models.provider";
import { MockAIProvider } from "./providers/mock/mock.provider";
import type { AIProvider } from "./providers/provider.interface";

export type AIProviderType = "github-models" | "mock";

export type AIProviderConfig =
  | { type: "github-models"; token: string; model?: string }
  | { type: "mock"; response?: string };

export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.type) {
    case "github-models":
      return new GitHubModelsProvider({ token: config.token, model: config.model });
    case "mock":
      return new MockAIProvider(config.response);
  }
}
