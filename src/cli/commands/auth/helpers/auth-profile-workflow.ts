import type { ConnectionProfile } from "@config/connections.interface";
import {
  applyDefault,
  type ProfileInputs,
  persistProfile,
  resolveDefaultBehaviour,
} from "./auth-add.helper";

export interface AuthProfileWorkflowResult {
  useKeychain: boolean;
  defaultApplied: boolean;
  defaultBehaviour: "set-default" | "prompt" | "skip";
}

export async function saveAuthProfileWorkflow(
  inputs: ProfileInputs,
  options: {
    allowKeyfileStorage: boolean;
    forceDefault: boolean;
    shouldSetDefault?: (profileName: string) => Promise<boolean>;
  },
): Promise<AuthProfileWorkflowResult> {
  const { useKeychain } = await persistProfile(inputs, {
    allowKeyfileStorage: options.allowKeyfileStorage,
  });
  const defaultBehaviour = await resolveDefaultBehaviour(
    options.forceDefault,
    inputs.platform as ConnectionProfile["platform"],
  );

  if (defaultBehaviour === "set-default") {
    await applyDefault(inputs.name);
    return { useKeychain, defaultApplied: true, defaultBehaviour };
  }

  if (defaultBehaviour === "prompt" && options.shouldSetDefault) {
    const apply = await options.shouldSetDefault(inputs.name);
    if (apply) {
      await applyDefault(inputs.name);
      return { useKeychain, defaultApplied: true, defaultBehaviour };
    }
  }

  return { useKeychain, defaultApplied: false, defaultBehaviour };
}
