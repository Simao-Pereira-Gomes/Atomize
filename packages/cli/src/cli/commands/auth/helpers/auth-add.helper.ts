import { confirm, password, text } from "@clack/prompts";
import {
  readConnectionsFile,
  saveProfile,
  setDefaultProfile,
} from "@config/connections.config";
import type { ConnectionProfile } from "@config/connections.interface";
import { storeToken } from "@config/keychain.service";
import { validateOrganizationUrl } from "@sppg2001/atomize-core";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";
export interface AzureDevOpsProfileInputs {
  name: string;
  platform: "azure-devops";
  organizationUrl: string;
  project: string;
  team: string;
  pat: string;
}

export type ProfileInputs = AzureDevOpsProfileInputs;

const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function validateProfileName(
  name: string | undefined,
): string | undefined {
  if (!name || name.trim() === "") return "Profile name is required";
  if (!PROFILE_NAME_PATTERN.test(name))
    return "Only letters, numbers, hyphens, and underscores are allowed";
  return undefined;
}

export async function checkProfileNameAvailable(
  name: string,
): Promise<string | undefined> {
  const file = await readConnectionsFile();
  if (file.profiles.some((p) => p.name === name)) {
    return `Profile "${name}" already exists. Use "atomize auth rotate ${name}" to update its token.`;
  }
  return undefined;
}

export async function promptProfileName(): Promise<string> {
  return assertNotCancelled(
    await text({
      message: "Profile name:",
      placeholder: "work-ado",
      validate: validateProfileName,
    }),
  );
}

export function validateGitHubPAT(pat: string | undefined): string | undefined {
  if (!pat || pat.trim() === "") return "GitHub PAT is required";
  const trimmed = pat.trim();
  if (!trimmed.startsWith("ghp_") && !trimmed.startsWith("github_pat_")) {
    return "GitHub PAT must start with 'ghp_' or 'github_pat_'";
  }
  if (trimmed.length < 40) return "GitHub PAT seems too short (must be at least 40 characters)";
  return undefined;
}

export async function promptRemainingInputs(
  name: string,
  prefill: Partial<Omit<AzureDevOpsProfileInputs, "name" | "platform">> = {},
): Promise<ProfileInputs> {
  const organizationUrl = prefill.organizationUrl ?? assertNotCancelled(
    await text({
      message: "Organization URL:",
      placeholder: "https://dev.azure.com/myorg",
      validate: validateOrganizationUrl,
    }),
  );

  const project = prefill.project ?? assertNotCancelled(
    await text({
      message: "Project name:",
      validate: (input: string | undefined): string | undefined => {
        if (!input || input.trim() === "") return "Project name is required";
        return undefined;
      },
    }),
  );

  const team = prefill.team ?? assertNotCancelled(
    await text({
      message: "Team name:",
      placeholder: "e.g. MyTeam",
      validate: (input: string | undefined): string | undefined => {
        if (!input || input.trim() === "") return "Team name is required";
        return undefined;
      },
    }),
  );

  const pat = assertNotCancelled(
    await password({
      message: "Personal Access Token (PAT):",
      validate: (input: string | undefined): string | undefined => {
        if (!input || input.trim() === "") return "PAT is required";
        return undefined;
      },
    }),
  );

  return { name, platform: "azure-devops", organizationUrl, project, team, pat };
}

export async function persistProfile(
  inputs: ProfileInputs,
  { allowKeyfileStorage = false }: { allowKeyfileStorage?: boolean } = {},
): Promise<{ useKeychain: boolean }> {
  const tokenData = await storeToken(inputs.name, inputs.pat, { allowKeyfileStorage });
  const now = new Date().toISOString();

  if (inputs.platform === "azure-devops") {
    await saveProfile({
      name: inputs.name,
      platform: "azure-devops",
      organizationUrl: inputs.organizationUrl,
      project: inputs.project,
      team: inputs.team,
      token: tokenData,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { useKeychain: tokenData.strategy === "keychain" };
}

export async function resolveDefaultBehaviour(
  forceDefault: boolean,
  platform: ConnectionProfile["platform"],
): Promise<"set-default" | "prompt" | "skip"> {
  if (forceDefault) return "set-default";
  const file = await readConnectionsFile();
  if (!file.defaultProfiles[platform]) return "set-default";
  return "prompt";
}

export async function promptSetAsDefault(
  profileName: string,
): Promise<boolean> {
  return assertNotCancelled(
    await confirm({
      message: `Set "${profileName}" as the default profile?`,
      initialValue: false,
    }),
  );
}

export async function applyDefault(profileName: string): Promise<void> {
  await setDefaultProfile(profileName);
}
