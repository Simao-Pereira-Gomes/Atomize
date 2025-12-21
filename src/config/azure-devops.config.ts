import type { AzureDevOpsConfig } from "@platforms/adapters/azure-devops/azure-devops.adapter";
import { ConfigurationError } from "@utils/errors";

/**
 * Load Azure DevOps configuration from environment variables
 */
export function loadAzureDevOpsConfig(): AzureDevOpsConfig {
  const organizationUrl = process.env.AZURE_DEVOPS_ORG_URL;
  const project = process.env.AZURE_DEVOPS_PROJECT;
  const token = process.env.AZURE_DEVOPS_PAT;

  if (!organizationUrl) {
    throw new ConfigurationError(
      "AZURE_DEVOPS_ORG_URL environment variable is required. Example: https://dev.azure.com/myorg"
    );
  }

  if (!project) {
    throw new ConfigurationError(
      "AZURE_DEVOPS_PROJECT environment variable is required. Example: MyProject"
    );
  }

  if (!token) {
    throw new ConfigurationError(
      "AZURE_DEVOPS_PAT environment variable is required. Get a PAT from: https://dev.azure.com/[org]/_usersSettings/tokens"
    );
  }

  return {
    type: "azure-devops",
    organizationUrl,
    project,
    token,
    team: process.env.AZURE_DEVOPS_TEAM,
  };
}

/**
 * Validate Azure DevOps configuration
 */
export function validateAzureDevOpsConfig(
  config: Partial<AzureDevOpsConfig>
): void {
  const errors: string[] = [];

  if (!config.organizationUrl) {
    errors.push("organizationUrl is required");
  } else if (!config.organizationUrl.startsWith("https://")) {
    errors.push("organizationUrl must start with https://");
  }

  if (!config.project || config.project.trim() === "") {
    errors.push("project is required and cannot be empty");
  }

  if (!config.token || config.token.trim() === "") {
    errors.push("token (PAT) is required and cannot be empty");
  }

  if (errors.length > 0) {
    throw new ConfigurationError(
      `Invalid Azure DevOps configuration: ${errors.join(", ")}`
    );
  }
}

/**
 * Create Azure DevOps configuration from explicit values
 */
export function createAzureDevOpsConfig(
  organizationUrl: string,
  project: string,
  token: string,
  team?: string
): AzureDevOpsConfig {
  const config: AzureDevOpsConfig = {
    type: "azure-devops",
    organizationUrl,
    project,
    token,
    team,
  };

  validateAzureDevOpsConfig(config);

  return config;
}
