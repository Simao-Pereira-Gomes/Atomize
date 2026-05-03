export type EncryptedToken =
  | { strategy: "keychain" }
  | { strategy: "keyfile"; iv: string; authTag: string; ciphertext: string };

interface BaseConnectionProfile {
  name: string;
  token: EncryptedToken;
  createdAt: string;
  updatedAt: string;
}

export interface AzureDevOpsProfile extends BaseConnectionProfile {
  platform: "azure-devops";
  organizationUrl: string;
  project: string;
  team: string;
}

export interface GitHubModelsProfile extends BaseConnectionProfile {
  platform: "github-models";
  model?: string;
}

export type ConnectionProfile = AzureDevOpsProfile | GitHubModelsProfile;

export interface ConnectionsFile {
  version: "1" | "2";
  defaultProfiles: Partial<Record<ConnectionProfile["platform"], string>>;
  profiles: ConnectionProfile[];
}
