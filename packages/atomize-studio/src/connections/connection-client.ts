import { invoke } from "@tauri-apps/api/core";
import { observed } from "../telemetry/telemetry";

export type AzureDevOpsProfile = {
  name: string;
  platform: "azure-devops";
  isDefault: boolean;
  organizationUrl: string;
  project: string;
  team: string;
};

export type NewAzureDevOpsProfile = Omit<AzureDevOpsProfile, "platform" | "isDefault"> & { pat: string };

type Invoker = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
const tauriInvoke: Invoker = invoke;

export async function listAzureDevOpsProfiles(call: Invoker = tauriInvoke): Promise<AzureDevOpsProfile[]> {
  return await call<AzureDevOpsProfile[]>("connection_list_profiles");
}

export async function addAzureDevOpsProfile(profile: NewAzureDevOpsProfile, call: Invoker = tauriInvoke): Promise<void> {
  await observed("auth.add", {}, () => call("connection_add_profile", { profile }));
}

export async function rotateAzureDevOpsToken(name: string, pat: string, call: Invoker = tauriInvoke): Promise<void> {
  await observed("auth.rotate", {}, () => call("connection_rotate_token", { name, pat }));
}

export async function removeConnectionProfile(name: string, call: Invoker = tauriInvoke): Promise<void> {
  await observed("auth.remove", {}, () => call("connection_remove_profile", { name }));
}

export async function setDefaultConnectionProfile(name: string, call: Invoker = tauriInvoke): Promise<void> {
  await observed("auth.use", {}, () => call("connection_set_default", { name }));
}
