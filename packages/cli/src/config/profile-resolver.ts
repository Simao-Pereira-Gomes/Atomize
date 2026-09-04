import {
  type AzureDevOpsConnectionFields,
  buildAzureDevOpsConfig,
} from "@sppg2001/atomize-core";
import type { AzureDevOpsConfig } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/azure-devops.adapter";
import { getDefaultProfile, getProfile } from "./connections.config";
import { retrieveToken } from "./keychain.service";

function buildConfigOrThrow(
  fields: AzureDevOpsConnectionFields,
  resolvedToken: string,
  profileName: string,
): AzureDevOpsConfig {
  try {
    return buildAzureDevOpsConfig(fields, resolvedToken);
  } catch (err) {
    throw new Error(
      `Profile "${profileName}" has an invalid organizationUrl: ${
        err instanceof Error ? err.message : String(err)
      }. Edit ~/.atomize/connections.json or re-create the profile.`,
    );
  }
}

export async function resolveAzureConfig(
  profileName?: string,
): Promise<AzureDevOpsConfig> {
  const name = profileName ?? process.env.ATOMIZE_PROFILE;

  if (name) {
    const profile = await getProfile(name);
    if (!profile)
      throw new Error(`Profile "${name}" not found. Run: atomize auth list`);
    if (profile.platform !== "azure-devops")
      throw new Error(
        `Profile "${name}" is a ${profile.platform} profile, not Azure DevOps. ` +
          `Use an Azure DevOps profile or run: atomize auth add`,
      );
    const token = await retrieveToken(profile.name, profile.token);
    return buildConfigOrThrow(profile, token, profile.name);
  }

  const defaultProfile = await getDefaultProfile("azure-devops");
  if (defaultProfile) {
    const token = await retrieveToken(defaultProfile.name, defaultProfile.token);
    return buildConfigOrThrow(defaultProfile, token, defaultProfile.name);
  }

  throw new Error(
    "No connection profile configured.\n" +
      "  Run: atomize auth add",
  );
}
