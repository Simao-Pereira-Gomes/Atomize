import { getProfile, readConnectionsFile } from "@config/connections.config";
import type { ConnectionProfile } from "@config/connections.interface";

export async function hasProfiles(): Promise<boolean> {
  const file = await readConnectionsFile();
  return file.profiles.length > 0;
}

export async function loadProfileOrFail(name: string): Promise<ConnectionProfile | null> {
  return (await getProfile(name)) ?? null;
}
