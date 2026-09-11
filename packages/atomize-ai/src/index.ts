import type { AIProvider } from "./provider.interface";
import { GitHubCopilotProvider } from "./providers/github-copilot.provider";
import { MockAIProvider } from "./providers/mock.provider";

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

export type { AIDraftSession, AIProvider } from "./provider.interface";
export { CopilotAuthenticationError, GitHubCopilotProvider } from "./providers/github-copilot.provider";
