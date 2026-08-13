import { createAIProvider, type AIProvider } from "@sppg2001/atomize-ai";

export function resolveAIProvider(): AIProvider {
  return createAIProvider({ type: "github-copilot" });
}
