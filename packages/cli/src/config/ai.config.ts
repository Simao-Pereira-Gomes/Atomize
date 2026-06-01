import { createAIProvider } from "@/ai/ai-factory";
import type { AIProvider } from "@/ai/providers/provider.interface";
import { getDefaultProfile, getProfile, readConnectionsFile } from "./connections.config";
import type { GitHubModelsProfile } from "./connections.interface";
import { retrieveToken } from "./keychain.service";

async function buildProvider(profile: GitHubModelsProfile): Promise<AIProvider> {
  const token = await retrieveToken(profile.name, profile.token);
  return createAIProvider({ type: "github-models", token, model: profile.model });
}

export async function resolveAIProvider(profileName?: string): Promise<AIProvider> {
  const name = profileName ?? process.env.ATOMIZE_AI_PROFILE;

  if (name) {
    const profile = await getProfile(name);
    if (!profile)
      throw new Error(`Profile "${name}" not found. Run: atomize auth list`);
    if (profile.platform !== "github-models")
      throw new Error(
        `Profile "${name}" is a ${profile.platform} profile, not an AI provider. ` +
          `Add a GitHub Models profile with: atomize auth add`,
      );
    return buildProvider(profile);
  }

  const defaultProfile = await getDefaultProfile("github-models");
  if (defaultProfile) {
    return buildProvider(defaultProfile);
  }

  const file = await readConnectionsFile();
  const aiProfile = file.profiles.find(
    (p): p is GitHubModelsProfile => p.platform === "github-models",
  );
  if (aiProfile) return buildProvider(aiProfile);

  throw new Error(
    "No AI provider profile configured.\n" +
      "  Add a GitHub Models profile with: atomize auth add\n" +
      "  Then select 'GitHub Models (AI)' as the platform.\n" +
      "  Or set ATOMIZE_AI_PROFILE to an existing profile name.",
  );
}
