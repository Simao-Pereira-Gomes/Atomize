import { select } from "@clack/prompts";
import { resolveAIProvider } from "@config/ai.config";
import { readConnectionsFile } from "@config/connections.config";
import type { ConnectionProfile } from "@config/connections.interface";
import { resolveAzureConfig } from "@config/profile-resolver";
import { PlatformFactory } from "@platforms/platform-factory";
import type { AIProvider } from "@/ai/providers/provider.interface";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";
import type { IPlatformAdapter } from "@/platforms";

const PLATFORM_LABELS: Record<ConnectionProfile["platform"], string> = {
  "azure-devops": "Azure DevOps",
  "github-models": "GitHub Models (AI)",
};

export async function promptProfileToTest(nameArg?: string): Promise<string | undefined> {
  if (nameArg) return nameArg;

  const file = await readConnectionsFile();
  if (file.profiles.length === 1) return file.profiles[0]?.name;
  if (file.profiles.length === 0) return undefined;

  const defaults = file.defaultProfiles;
  const defaultNames = new Set(Object.values(defaults).filter((v): v is string => !!v));
  const firstDefault = defaults["azure-devops"] ?? defaults["github-models"];

  return assertNotCancelled(
    await select({
      message: "Select profile to test:",
      options: [
        ...file.profiles
          .filter((p) => defaultNames.has(p.name))
          .map((p) => ({
            label: `${p.name} (${PLATFORM_LABELS[p.platform]} · default)`,
            value: p.name,
          })),
        ...file.profiles
          .filter((p) => !defaultNames.has(p.name))
          .map((p) => ({
            label: `${p.name} (${PLATFORM_LABELS[p.platform]})`,
            value: p.name,
          })),
      ],
      initialValue: firstDefault ?? undefined,
    }),
  ) as string;
}

export type TestTarget =
  | { kind: "ado"; platform: IPlatformAdapter }
  | { kind: "ai"; provider: AIProvider; model?: string };

export async function resolveTestTarget(profileName?: string): Promise<TestTarget> {
  const file = await readConnectionsFile();
  const profile = profileName
    ? file.profiles.find((p) => p.name === profileName)
    : (file.profiles.find((p) => p.name === file.defaultProfiles["azure-devops"]) ??
       file.profiles.find((p) => p.name === file.defaultProfiles["github-models"]) ??
       file.profiles[0]);

  if (!profile) throw new Error("No profile found. Run: atomize auth add");

  if (profile.platform === "azure-devops") {
    const config = await resolveAzureConfig(profile.name);
    const platform = PlatformFactory.create("azure-devops", config);
    return { kind: "ado", platform };
  }

  const provider = await resolveAIProvider(profile.name);
  return { kind: "ai", provider, model: profile.model };
}

export type TestResult =
  | { ok: true; label: string }
  | { ok: false; reason: string };

export async function testPlatformConnection(platform: IPlatformAdapter): Promise<TestResult> {
  await platform.authenticate();

  if (platform.testConnection) {
    const ok = await platform.testConnection();
    return ok
      ? { ok: true, label: "Connected to Azure DevOps ✓" }
      : { ok: false, reason: "Could not connect. Check credentials and project access." };
  }

  const meta = platform.getPlatformMetadata();
  return { ok: true, label: `Connected: ${meta.name} v${meta.version} ✓` };
}

export async function testAIProviderConnection(
  provider: AIProvider,
  model?: string,
): Promise<TestResult> {
  if (provider.testConnection) {
    const ok = await provider.testConnection();
    return ok
      ? { ok: true, label: `GitHub Models ready — model: ${model ?? "default"} ✓` }
      : { ok: false, reason: "Could not reach GitHub Models. Check your token." };
  }
  return { ok: true, label: "GitHub Models token accepted ✓" };
}
