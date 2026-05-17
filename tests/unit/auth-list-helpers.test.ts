import { describe, expect, test } from "bun:test";
import { serializeProfileForJson } from "@/cli/commands/auth/auth-list.command";
import type { ConnectionProfile } from "@config/connections.interface";

const azureProfile: ConnectionProfile = {
  name: "work",
  platform: "azure-devops",
  organizationUrl: "https://dev.azure.com/myorg",
  project: "MyProject",
  team: "MyTeam",
  token: { strategy: "keychain" },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z",
};

const githubProfile: ConnectionProfile = {
  name: "ai",
  platform: "github-models",
  model: "gpt-4o",
  token: { strategy: "keychain" },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z",
};

const githubProfileNoModel: ConnectionProfile = {
  name: "ai-default",
  platform: "github-models",
  token: { strategy: "keychain" },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z",
};

describe("serializeProfileForJson — azure-devops", () => {
  test("includes connection fields", () => {
    expect(serializeProfileForJson(azureProfile, {})).toEqual({
      name: "work",
      platform: "azure-devops",
      isDefault: false,
      organizationUrl: "https://dev.azure.com/myorg",
      project: "MyProject",
      team: "MyTeam",
    });
  });

  test("sets isDefault true when profile is the platform default", () => {
    const result = serializeProfileForJson(azureProfile, { "azure-devops": "work" });
    expect(result.isDefault).toBe(true);
  });

  test("sets isDefault false when a different profile is the platform default", () => {
    const result = serializeProfileForJson(azureProfile, { "azure-devops": "other" });
    expect(result.isDefault).toBe(false);
  });

  test("excludes token", () => {
    expect(serializeProfileForJson(azureProfile, {})).not.toHaveProperty("token");
  });

  test("excludes timestamps", () => {
    const result = serializeProfileForJson(azureProfile, {});
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
  });
});

describe("serializeProfileForJson — github-models", () => {
  test("includes model field", () => {
    expect(serializeProfileForJson(githubProfile, {})).toEqual({
      name: "ai",
      platform: "github-models",
      isDefault: false,
      model: "gpt-4o",
    });
  });

  test("defaults model to gpt-4o-mini when not stored", () => {
    const result = serializeProfileForJson(githubProfileNoModel, {});
    expect(result).toMatchObject({ model: "gpt-4o-mini" });
  });

  test("sets isDefault true when profile is the platform default", () => {
    const result = serializeProfileForJson(githubProfile, { "github-models": "ai" });
    expect(result.isDefault).toBe(true);
  });

  test("excludes token", () => {
    expect(serializeProfileForJson(githubProfile, {})).not.toHaveProperty("token");
  });

  test("excludes timestamps", () => {
    const result = serializeProfileForJson(githubProfile, {});
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
  });
});

describe("serializeProfileForJson — keyfile token exclusion", () => {
  test("excludes all keyfile crypto material from output", () => {
    const profileWithKeyfile: ConnectionProfile = {
      ...azureProfile,
      token: { strategy: "keyfile", iv: "abc123", authTag: "def456", ciphertext: "ghi789" },
    };
    const result = serializeProfileForJson(profileWithKeyfile, {});
    const serialized = JSON.stringify(result);
    expect(result).not.toHaveProperty("token");
    expect(serialized).not.toContain("ciphertext");
    expect(serialized).not.toContain("abc123");
  });
});
