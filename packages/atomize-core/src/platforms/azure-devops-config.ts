import { z } from "zod";
import type { AzureDevOpsConfig } from "./adapters/azure-devops/azure-devops.adapter";

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

export function validateOrganizationUrl(
  organizationUrl: string | undefined,
): string | undefined {
  if (organizationUrl === undefined) {
    return "Organization URL is required";
  }
  const result = OrganizationUrlSchema.safeParse(organizationUrl);
  return result.success ? undefined : result.error.issues[0]?.message;
}

/**
 * The non-secret shape of an Azure DevOps connection profile — no name, no
 * token. Consumers resolve a profile's identity and secret through their own
 * credential store, then pass the resolved fields and secret here.
 */
export interface AzureDevOpsConnectionFields {
  organizationUrl: string;
  project: string;
  team: string;
}

export function buildAzureDevOpsConfig(
  fields: AzureDevOpsConnectionFields,
  resolvedToken: string,
): AzureDevOpsConfig {
  const error = validateOrganizationUrl(fields.organizationUrl);
  if (error) {
    throw new Error(error);
  }

  return {
    type: "azure-devops",
    organizationUrl: fields.organizationUrl,
    project: fields.project,
    team: fields.team,
    token: resolvedToken,
  };
}
