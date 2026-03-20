import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assertSafeFilePermissions, ensureAtomizeDir, getAtomizeDir } from "./atomize-paths";
import type { ConnectionProfile, ConnectionsFile } from "./connections.interface";

const EncryptedTokenSchema = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("keychain") }),
  z.object({
    strategy: z.literal("keyfile"),
    iv: z.string(),
    authTag: z.string(),
    ciphertext: z.string(),
  }),
]);

const ConnectionProfileSchema = z.object({
  name: z.string(),
  platform: z.literal("azure-devops"),
  organizationUrl: z.string(),
  project: z.string(),
  team: z.string(),
  token: EncryptedTokenSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ConnectionsFileSchema = z.object({
  version: z.literal("1"),
  defaultProfile: z.string().nullable(),
  profiles: z.array(ConnectionProfileSchema),
});

function getConnectionsPath(): string {
  return join(getAtomizeDir(), "connections.json");
}

function getConnectionsTmpPath(): string {
  return join(getAtomizeDir(), "connections.json.tmp");
}

export async function readConnectionsFile(): Promise<ConnectionsFile> {
  await ensureAtomizeDir();
  await assertSafeFilePermissions(getConnectionsPath());
  let raw: string;
  try {
    raw = await readFile(getConnectionsPath(), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: "1", defaultProfile: null, profiles: [] };
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

  const result = ConnectionsFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(
      `Connections file at ${getConnectionsPath()} failed validation: ${issues}. ` +
        `Repair or remove it and try again.`,
    );
  }
  return result.data;
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
  file.profiles = file.profiles.filter((p) => p.name !== name);
  const wasDefault = file.defaultProfile === name;
  if (wasDefault) file.defaultProfile = null;
  await writeConnectionsFile(file);
  return { wasDefault };
}

export async function setDefaultProfile(name: string): Promise<void> {
  const file = await readConnectionsFile();
  if (!file.profiles.find((p) => p.name === name)) {
    throw new Error(`Profile "${name}" not found`);
  }
  file.defaultProfile = name;
  await writeConnectionsFile(file);
}

export async function getProfile(name: string): Promise<ConnectionProfile | undefined> {
  const file = await readConnectionsFile();
  return file.profiles.find((p) => p.name === name);
}

export async function getDefaultProfile(): Promise<ConnectionProfile | undefined> {
  const file = await readConnectionsFile();
  if (!file.defaultProfile) return undefined;
  return file.profiles.find((p) => p.name === file.defaultProfile);
}
