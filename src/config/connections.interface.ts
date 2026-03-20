export type EncryptedToken =
  | { strategy: "keychain" }
  | { strategy: "keyfile"; iv: string; authTag: string; ciphertext: string };

export interface ConnectionProfile {
  name: string;
  platform: "azure-devops";
  organizationUrl: string;
  project: string;
  team: string;
  token: EncryptedToken;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionsFile {
  version: "1";
  defaultProfile: string | null;
  profiles: ConnectionProfile[];
}
