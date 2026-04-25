import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assertSafeFilePermissions, ensureAtomizeDir, getAtomizeDir } from "./atomize-paths";
import type { AzureDevOpsProfile, ConnectionProfile, ConnectionsFile, GitHubModelsProfile } from "./connections.interface";

const EncryptedTokenSchema = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("keychain") }),
  z.object({
    strategy: z.literal("keyfile"),
    iv: z.string(),
    authTag: z.string(),
    ciphertext: z.string(),
  }),
]);

const AzureDevOpsProfileSchema = z.object({
  name: z.string(),
  platform: z.literal("azure-devops"),
  organizationUrl: z.string(),
  project: z.string(),
  team: z.string(),
  token: EncryptedTokenSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const GitHubModelsProfileSchema = z.object({
  name: z.string(),
  platform: z.literal("github-models"),
  model: z.string().optional(),
  token: EncryptedTokenSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ConnectionProfileSchema = z.discriminatedUnion("platform", [
  AzureDevOpsProfileSchema,
  GitHubModelsProfileSchema,
]);

const ConnectionsFileSchema = z.object({
  version: z.union([z.literal("1"), z.literal("2")]),
  defaultProfiles: z.record(z.string(), z.string()).optional().default({}),
  profiles: z.array(ConnectionProfileSchema),
});

function getConnectionsPath(): string {
  return join(getAtomizeDir(), "connections.json");
}

function getConnectionsTmpPath(): string {
  return join(getAtomizeDir(), "connections.json.tmp");
}

// Migration from v1 single-default format (defaultProfile: string | null) to per-platform
// defaults (defaultProfiles: Record<platform, string>). Stamps version "2" on the migrated
// object so the next write seals the new format on disk permanently.
// Safe to remove when dropping support for v1 files: change the schema back to
// z.literal("2"), narrow ConnectionsFile.version back to "2", update the empty-file
// fallback below, and delete this function.
function migrateRawData(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const obj = parsed as Record<string, unknown>;

  if ("defaultProfile" in obj && !("defaultProfiles" in obj)) {
    const defaultName = obj.defaultProfile;
    if (typeof defaultName === "string") {
      const profiles = Array.isArray(obj.profiles) ? obj.profiles : [];
      const match = profiles.find(
        (p): p is Record<string, unknown> =>
          !!p && typeof p === "object" && (p as Record<string, unknown>).name === defaultName,
      );
      obj.defaultProfiles = match ? { [match.platform as string]: defaultName } : {};
    } else {
      obj.defaultProfiles = {};
    }
    delete obj.defaultProfile;
    obj.version = "2";
  }

  return obj;
}

export async function readConnectionsFile(): Promise<ConnectionsFile> {
  await ensureAtomizeDir();
  await assertSafeFilePermissions(getConnectionsPath());
  let raw: string;
  try {
    raw = await readFile(getConnectionsPath(), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: "1", defaultProfiles: {}, profiles: [] };
    }
    throw new Error(
      `Failed to read connections file: ${err instanceof Error ? err.message : String(err)}. ` +
        `Repair or remove ${getConnectionsPath()} and try again.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Connections file at ${getConnectionsPath()} contains invalid JSON. ` +
        `Repair or remove it and try again.`,
    );
  }

  const migrated = migrateRawData(parsed);
  const result = ConnectionsFileSchema.safeParse(migrated);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(
      `Connections file at ${getConnectionsPath()} failed validation: ${issues}. ` +
        `Repair or remove it and try again.`,
    );
  }
  return result.data as ConnectionsFile;
}

async function writeConnectionsFile(data: ConnectionsFile): Promise<void> {
  await ensureAtomizeDir();
  const connectionsPath = getConnectionsPath();
  const connectionsTmpPath = getConnectionsTmpPath();

  await writeFile(connectionsTmpPath, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
  await rename(connectionsTmpPath, connectionsPath);
  await chmod(connectionsPath, 0o600);
}

export async function saveProfile(profile: ConnectionProfile): Promise<void> {
  const file = await readConnectionsFile();
  const idx = file.profiles.findIndex((p) => p.name === profile.name);
  if (idx >= 0) {
    file.profiles[idx] = profile;
  } else {
    file.profiles.push(profile);
  }
  await writeConnectionsFile(file);
}

export async function removeProfile(name: string): Promise<{ wasDefault: boolean }> {
  const file = await readConnectionsFile();
  const profile = file.profiles.find((p) => p.name === name);
  file.profiles = file.profiles.filter((p) => p.name !== name);

  let wasDefault = false;
  if (profile && file.defaultProfiles[profile.platform] === name) {
    delete file.defaultProfiles[profile.platform];
    wasDefault = true;
  }

  await writeConnectionsFile(file);
  return { wasDefault };
}

export async function setDefaultProfile(name: string): Promise<void> {
  const file = await readConnectionsFile();
  const profile = file.profiles.find((p) => p.name === name);
  if (!profile) {
    throw new Error(`Profile "${name}" not found`);
  }
  file.defaultProfiles[profile.platform] = name;
  await writeConnectionsFile(file);
}

export async function getProfile(name: string): Promise<ConnectionProfile | undefined> {
  const file = await readConnectionsFile();
  return file.profiles.find((p) => p.name === name);
}

export async function getDefaultProfile(platform: "azure-devops"): Promise<AzureDevOpsProfile | undefined>;
export async function getDefaultProfile(platform: "github-models"): Promise<GitHubModelsProfile | undefined>;
export async function getDefaultProfile(
  platform: ConnectionProfile["platform"],
): Promise<ConnectionProfile | undefined> {
  const file = await readConnectionsFile();
  const defaultName = file.defaultProfiles[platform];
  if (!defaultName) return undefined;
  return file.profiles.find((p) => p.name === defaultName && p.platform === platform);
}
