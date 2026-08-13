import { select } from "@clack/prompts";
import { readConnectionsFile } from "@config/connections.config";
import { resolveAzureConfig } from "@config/profile-resolver";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import { PlatformFactory } from "@sppg2001/atomize-core/platforms/platform-factory";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";

export async function promptProfileToTest(nameArg?: string): Promise<string | undefined> {
  if (nameArg) return nameArg;

  const file = await readConnectionsFile();
  const profiles = file.profiles.filter((profile) => profile.platform === "azure-devops");
  if (profiles.length === 1) return profiles[0]?.name;
  if (profiles.length === 0) return undefined;

  const defaults = file.defaultProfiles;
  const defaultNames = new Set([defaults["azure-devops"]].filter((v): v is string => !!v));
  const firstDefault = defaults["azure-devops"];

  return assertNotCancelled(
    await select({
      message: "Select profile to test:",
      options: [
        ...profiles
          .filter((p) => defaultNames.has(p.name))
          .map((p) => ({
            label: `${p.name} (Azure DevOps · default)`,
            value: p.name,
          })),
        ...profiles
          .filter((p) => !defaultNames.has(p.name))
          .map((p) => ({
            label: `${p.name} (Azure DevOps)`,
            value: p.name,
          })),
      ],
      initialValue: firstDefault ?? undefined,
    }),
  ) as string;
}

export type TestTarget = { kind: "ado"; platform: IPlatformAdapter };

export async function resolveTestTarget(profileName?: string): Promise<TestTarget> {
  const file = await readConnectionsFile();
  const profile = profileName
    ? file.profiles.find((p) => p.name === profileName)
    : (file.profiles.find((p) => p.name === file.defaultProfiles["azure-devops"]) ?? file.profiles.find((p) => p.platform === "azure-devops"));

  if (!profile) throw new Error("No profile found. Run: atomize auth add");

  if (profile.platform !== "azure-devops") {
    throw new Error("GitHub Models was retired. Remove this legacy profile with: atomize auth remove " + profile.name);
  }
  const config = await resolveAzureConfig(profile.name);
  const platform = PlatformFactory.create("azure-devops", config);
  return { kind: "ado", platform };
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
