import { confirm, select } from "@clack/prompts";
import { readConnectionsFile, removeProfile } from "@config/connections.config";
import type { ConnectionProfile } from "@config/connections.interface";
import { deleteToken } from "@config/keychain.service";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";
import { hasProfiles, loadProfileOrFail } from "./shared";

export { hasProfiles, loadProfileOrFail };

export async function promptProfileToRemove(nameArg?: string): Promise<string> {
  if (nameArg) return nameArg;

  const file = await readConnectionsFile();
  return assertNotCancelled(
    await select({
      message: "Select profile to remove:",
      options: file.profiles.map((p) => ({
        label: p.name === file.defaultProfile ? `${p.name} (default)` : p.name,
        value: p.name,
      })),
    }),
  ) as string;
}

export async function confirmRemoval(name: string): Promise<boolean> {
  return assertNotCancelled(
    await confirm({
      message: `Remove profile "${name}"? This cannot be undone.`,
      initialValue: false,
    }),
  );
}

export async function deleteProfile(
  name: string,
  profile: ConnectionProfile,
): Promise<{ wasDefault: boolean }> {
  await deleteToken(name, profile.token);
  return removeProfile(name);
}
