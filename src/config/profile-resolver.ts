import type { AzureDevOpsConfig } from "@platforms/adapters/azure-devops/azure-devops.adapter";
import { validateOrganizationUrl } from "@/cli/commands/auth/helpers/auth-add.helper";
import { getDefaultProfile, getProfile } from "./connections.config";
import { retrieveToken } from "./keychain.service";

function assertValidUrl(url: string, profileName: string): void {
  const error = validateOrganizationUrl(url);
  if (error) {
    throw new Error(
      `Profile "${profileName}" has an invalid organizationUrl: ${error}. ` +
        `Edit ~/.atomize/connections.json or re-create the profile.`,
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
    assertValidUrl(profile.organizationUrl, profile.name);
    const token = await retrieveToken(profile.name, profile.token);
    return {
      type: "azure-devops",
      organizationUrl: profile.organizationUrl,
      project: profile.project,
      team: profile.team,
      token,
    };
  }

  const defaultProfile = await getDefaultProfile();
  if (defaultProfile) {
    assertValidUrl(defaultProfile.organizationUrl, defaultProfile.name);
    const token = await retrieveToken(defaultProfile.name, defaultProfile.token);
    return {
      type: "azure-devops",
      organizationUrl: defaultProfile.organizationUrl,
      project: defaultProfile.project,
      team: defaultProfile.team,
      token,
    };
  }

  throw new Error(
    "No connection profile configured.\n" +
      "  Run: atomize auth add",
  );
}
