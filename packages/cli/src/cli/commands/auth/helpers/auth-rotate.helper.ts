import { password, select } from "@clack/prompts";
import { readConnectionsFile, saveProfile } from "@config/connections.config";
import type { ConnectionProfile } from "@config/connections.interface";
import { deleteToken, storeToken } from "@config/keychain.service";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";
import { hasProfiles, loadProfileOrFail } from "./shared";

export { hasProfiles, loadProfileOrFail };

export async function promptProfileToRotate(nameArg?: string): Promise<string> {
  if (nameArg) return nameArg;

  const file = await readConnectionsFile();
  return assertNotCancelled(
    await select({
      message: "Select profile to rotate:",
      options: file.profiles.map((p) => ({
        label: file.defaultProfiles[p.platform] === p.name ? `${p.name} (default)` : p.name,
        value: p.name,
      })),
    }),
  ) as string;
}

export async function promptNewPat(): Promise<string> {
  return assertNotCancelled(
    await password({
      message: "New Personal Access Token (PAT):",
      validate: (input: string | undefined): string | undefined => {
        if (!input || input.trim() === "") return "PAT is required";
        return undefined;
      },
    }),
  );
}

export async function rotateToken(
  profile: ConnectionProfile,
  newPat: string,
  { allowKeyfileStorage = false }: { allowKeyfileStorage?: boolean } = {},
): Promise<{ useKeychain: boolean }> {
  await deleteToken(profile.name, profile.token);
  const tokenData = await storeToken(profile.name, newPat, { allowKeyfileStorage });
  await saveProfile({ ...profile, token: tokenData, updatedAt: new Date().toISOString() });
  return { useKeychain: tokenData.strategy === "keychain" };
}
