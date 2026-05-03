import type { AzureDevOpsAdapter } from "@platforms/adapters/azure-devops/azure-devops.adapter";

export async function createAzureDevOpsAdapter(profile?: string): Promise<AzureDevOpsAdapter> {
  const { resolveAzureConfig } = await import("@config/profile-resolver");
  const { AzureDevOpsAdapter: Adapter } = await import(
    "@platforms/adapters/azure-devops/azure-devops.adapter"
  );
  const azureConfig = await resolveAzureConfig(profile);
  const adapter = new Adapter(azureConfig);
  await adapter.authenticate();
  return adapter;
}
