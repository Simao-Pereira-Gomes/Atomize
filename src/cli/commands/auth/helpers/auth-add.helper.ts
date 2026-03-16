import { confirm, password, select, text } from "@clack/prompts";
import {
  readConnectionsFile,
  saveProfile,
  setDefaultProfile,
} from "@config/connections.config";
import { storeToken } from "@config/keychain.service";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";

export interface ProfileInputs {
  name: string;
  platform: "azure-devops";
  organizationUrl: string;
  project: string;
  team: string;
  pat: string;
}

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

export async function promptRemainingInputs(
  name: string,
): Promise<ProfileInputs> {
  const platform = assertNotCancelled(
    await select({
      message: "Platform:",
      options: [{ label: "Azure DevOps", value: "azure-devops" }],
      initialValue: "azure-devops",
    }),
  ) as "azure-devops";

  const organizationUrl = assertNotCancelled(
    await text({
      message: "Organization URL:",
      placeholder: "https://dev.azure.com/myorg",
      validate: (input: string | undefined): string | undefined => {
        if (!input || input.trim() === "")
          return "Organization URL is required";
        if (!input.startsWith("https://"))
          return "URL must start with https://";
        return undefined;
      },
    }),
  );

  const project = assertNotCancelled(
    await text({
      message: "Project name:",
      validate: (input: string | undefined): string | undefined => {
        if (!input || input.trim() === "") return "Project name is required";
        return undefined;
      },
    }),
  );

  const team = assertNotCancelled(
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

  return { name, platform, organizationUrl, project, team, pat };
}

export async function persistProfile(
  inputs: ProfileInputs,
): Promise<{ useKeychain: boolean }> {
  const tokenData = await storeToken(inputs.name, inputs.pat);
  const now = new Date().toISOString();
  await saveProfile({
    name: inputs.name,
    platform: inputs.platform,
    organizationUrl: inputs.organizationUrl,
    project: inputs.project,
    team: inputs.team,
    token: tokenData,
    createdAt: now,
    updatedAt: now,
  });
  return { useKeychain: tokenData.strategy === "keychain" };
}

export async function resolveDefaultBehaviour(
  forceDefault: boolean,
): Promise<"set-default" | "prompt" | "skip"> {
  if (forceDefault) return "set-default";
  const file = await readConnectionsFile();
  if (!file.defaultProfile) return "set-default";
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
