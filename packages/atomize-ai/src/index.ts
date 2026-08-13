import { GitHubCopilotProvider } from "./providers/github-copilot.provider";
import { MockAIProvider } from "./providers/mock.provider";
import type { AIProvider } from "./provider.interface";

export type AIProviderConfig =
  | { type: "github-copilot" }
  | { type: "mock"; response?: string };

export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.type) {
    case "github-copilot":
      return new GitHubCopilotProvider();
    case "mock":
      return new MockAIProvider(config.response);
  }
}

export type { AIProvider } from "./provider.interface";
