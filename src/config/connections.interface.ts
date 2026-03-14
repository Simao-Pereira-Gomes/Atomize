export interface EncryptedToken {
  strategy: "keychain" | "keyfile";
  iv?: string;       // hex — only when strategy=keyfile
  authTag?: string;  // hex — only when strategy=keyfile
  ciphertext?: string; // hex — only when strategy=keyfile
}

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
