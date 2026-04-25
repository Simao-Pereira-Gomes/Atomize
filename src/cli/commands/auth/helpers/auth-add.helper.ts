import { confirm, password, select, text } from "@clack/prompts";
import { assertNotCancelled, createManagedSpinner, selectOrAutocomplete } from "@/cli/utilities/prompt-utilities";
import {
  readConnectionsFile,
  saveProfile,
  setDefaultProfile,
} from "@config/connections.config";
import type { ConnectionProfile } from "@config/connections.interface";
import { storeToken } from "@config/keychain.service";
import { z } from "zod";
export interface AzureDevOpsProfileInputs {
  name: string;
  platform: "azure-devops";
  organizationUrl: string;
  project: string;
  team: string;
  pat: string;
}

export interface GitHubModelsProfileInputs {
  name: string;
  platform: "github-models";
  model?: string;
  pat: string;
}

export type ProfileInputs = AzureDevOpsProfileInputs | GitHubModelsProfileInputs;

const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const AZURE_DEVOPS_HOST_RE =
  /^(dev\.azure\.com|vsrm\.dev\.azure\.com|[^.]+\.visualstudio\.com)$/i;

const OrganizationUrlSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, "Organization URL is required"),
  )
  .superRefine((input, ctx) => {
    let parsed: URL;

    try {
      parsed = new URL(input);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Organization URL must be a valid URL",
      });
      return;
    }

    if (parsed.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: "Organization URL must use https://",
      });
    }

    if (!AZURE_DEVOPS_HOST_RE.test(parsed.hostname)) {
      ctx.addIssue({
        code: "custom",
        message:
          "Organization URL must be an Azure DevOps host (dev.azure.com or *.visualstudio.com)",
      });
    }
  });

export function validateProfileName(
  name: string | undefined,
): string | undefined {
  if (!name || name.trim() === "") return "Profile name is required";
  if (!PROFILE_NAME_PATTERN.test(name))
    return "Only letters, numbers, hyphens, and underscores are allowed";
  return undefined;
}

export function validateOrganizationUrl(
  organizationUrl: string | undefined,
): string | undefined {
  if (organizationUrl === undefined) {
    return "Organization URL is required";
  }
  const result = OrganizationUrlSchema.safeParse(organizationUrl);
  return result.success ? undefined : result.error.issues[0]?.message;
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

const GITHUB_MODELS_BASE_URL = "https://models.inference.ai.azure.com";

interface GitHubModel {
  name: string;
  friendly_name: string;
  task: string;
}

export interface FetchedModel {
  name: string;
  label: string;
}

async function fetchGitHubModels(token: string): Promise<FetchedModel[]> {
  try {
    const res = await fetch(`${GITHUB_MODELS_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as GitHubModel[];
    if (!Array.isArray(body)) return [];
    return body
      .filter((m) => m.task === "chat-completion")
      .map((m) => ({ name: m.name, label: m.friendly_name || m.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}

async function promptGitHubModelsInputs(name: string): Promise<GitHubModelsProfileInputs> {
  const pat = assertNotCancelled(
    await password({
      message: "GitHub Personal Access Token (PAT):",
      validate: validateGitHubPAT,
    }),
  );

  const modelSpinner = createManagedSpinner();
  modelSpinner.start("Fetching available models from GitHub Models…");
  const models = await fetchGitHubModels(pat);
  modelSpinner.stop(models.length > 0 ? `${models.length} models available` : "Could not fetch model list");

  if (models.length === 0) {
    throw new Error("No models could be fetched. Check your PAT and try again.");
  }

  const defaultModel = models.find((m) => m.name === "gpt-4o-mini")?.name ?? models[0]?.name;
  const model = await selectOrAutocomplete({
    message: "Model:",
    options: models.map((m) => ({ label: m.label, value: m.name })),
    initialValue: defaultModel,
  });

  return { name, platform: "github-models", model, pat };
}

export async function promptRemainingInputs(
  name: string,
  prefill: Partial<Omit<AzureDevOpsProfileInputs, "name" | "platform">> = {},
): Promise<ProfileInputs> {
  const platform = assertNotCancelled(
    await select({
      message: "Platform:",
      options: [
        { label: "Azure DevOps", value: "azure-devops" },
        { label: "GitHub Models (AI template generation)", value: "github-models" },
      ],
      initialValue: "azure-devops",
    }),
  ) as "azure-devops" | "github-models";

  if (platform === "github-models") {
    return promptGitHubModelsInputs(name);
  }

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

  return { name, platform, organizationUrl, project, team, pat };
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
  } else {
    await saveProfile({
      name: inputs.name,
      platform: "github-models",
      model: inputs.model,
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
