import { select } from "@clack/prompts";
import { readConnectionsFile } from "@config/connections.config";
import { resolveAzureConfig } from "@config/profile-resolver";
import { PlatformFactory } from "@platforms/platform-factory";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";
import type { IPlatformAdapter } from "@/platforms";

export async function promptProfileToTest(nameArg?: string): Promise<string | undefined> {
  if (nameArg) return nameArg;

  const file = await readConnectionsFile();
  if (file.profiles.length <= 1) return undefined;

  return assertNotCancelled(
    await select({
      message: "Select profile to test:",
      options: [
        ...(file.defaultProfile
          ? [{ label: `${file.defaultProfile} (default)`, value: file.defaultProfile }]
          : []),
        ...file.profiles
          .filter((p) => p.name !== file.defaultProfile)
          .map((p) => ({ label: p.name, value: p.name })),
      ],
      initialValue: file.defaultProfile ?? undefined,
    }),
  ) as string;
}

export async function buildPlatform(profileName?: string): Promise<IPlatformAdapter> {
  const config = await resolveAzureConfig(profileName);
  return PlatformFactory.create("azure-devops", config);
}

export type TestResult =
  | { ok: true; label: string }
  | { ok: false; reason: string };

export async function testPlatformConnection(platform: IPlatformAdapter): Promise<TestResult> {
  await platform.authenticate();

  if (platform.testConnection) {
    const ok = await platform.testConnection();
    return ok
      ? { ok: true, label: "Connection successful ✓" }
      : { ok: false, reason: "Could not connect. Check credentials." };
  }

  const meta = platform.getPlatformMetadata();
  return { ok: true, label: `Connected: ${meta.name} v${meta.version} ✓` };
}
