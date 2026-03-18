import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAtomizeDir } from "./atomize-paths";
import type { ConnectionProfile, ConnectionsFile } from "./connections.interface";

const EMPTY_FILE: ConnectionsFile = {
  version: "1",
  defaultProfile: null,
  profiles: [],
};

function getConnectionsPath(): string {
  return join(getAtomizeDir(), "connections.json");
}

function getConnectionsTmpPath(): string {
  return join(getAtomizeDir(), "connections.json.tmp");
}

export async function readConnectionsFile(): Promise<ConnectionsFile> {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(getConnectionsPath(), "utf-8");
    return JSON.parse(raw) as ConnectionsFile;
  } catch {
    return { ...EMPTY_FILE };
  }
}

async function writeConnectionsFile(data: ConnectionsFile): Promise<void> {
  const atomizeDir = getAtomizeDir();
  const connectionsPath = getConnectionsPath();
  const connectionsTmpPath = getConnectionsTmpPath();

  await mkdir(atomizeDir, { recursive: true, mode: 0o700 });
  await writeFile(connectionsTmpPath, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
  await rename(connectionsTmpPath, connectionsPath);
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
