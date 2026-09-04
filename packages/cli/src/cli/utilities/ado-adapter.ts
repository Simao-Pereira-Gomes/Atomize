import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";

export async function createAzureDevOpsAdapter(profile?: string): Promise<IPlatformAdapter> {
  const { resolveAzureConfig } = await import("@config/profile-resolver");
  const { AzureDevOpsAdapter: Adapter } = await import(
    "@sppg2001/atomize-core/platforms/adapters/azure-devops/azure-devops.adapter"
  );
  const azureConfig = await resolveAzureConfig(profile);
  const adapter = new Adapter(azureConfig);
  await adapter.authenticate();
  return adapter;
}
