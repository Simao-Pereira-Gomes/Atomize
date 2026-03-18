import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import {
  getAtomizeTestDir,
} from "@config/atomize-paths";
import {
  saveProfile,
  setDefaultProfile,
} from "@config/connections.config";
import type { ConnectionProfile } from "@config/connections.interface";
import { encryptWithKeyfile } from "@config/keyfile.service";
import {
  applyDefault,
  persistProfile,
  resolveDefaultBehaviour,
  validateOrganizationUrl,
  validateProfileName,
} from "@/cli/commands/auth/helpers/auth-add.helper";
import { deleteProfile } from "@/cli/commands/auth/helpers/auth-remove.helper";
import { rotateToken } from "@/cli/commands/auth/helpers/auth-rotate.helper";
import { testPlatformConnection } from "@/cli/commands/auth/helpers/auth-test.helper";
import type { IPlatformAdapter } from "@/platforms";

// ─── file backup ──────────────────────────────────────────────────────────────

const ORIGINAL_ATOMIZE_HOME = process.env.ATOMIZE_HOME;
const ATOMIZE_DIR = getAtomizeTestDir("atomize-auth-helpers-test");

beforeAll(async () => {
  process.env.ATOMIZE_HOME = ATOMIZE_DIR;
  await rm(ATOMIZE_DIR, { recursive: true, force: true });
  await mkdir(ATOMIZE_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(ATOMIZE_DIR, { recursive: true, force: true });
  if (ORIGINAL_ATOMIZE_HOME === undefined) {
    delete process.env.ATOMIZE_HOME;
  } else {
    process.env.ATOMIZE_HOME = ORIGINAL_ATOMIZE_HOME;
  }
});

// Reset the connections file before each test so tests are isolated
beforeEach(async () => {
  await rm(ATOMIZE_DIR, { recursive: true, force: true });
  await mkdir(ATOMIZE_DIR, { recursive: true });
});

// ─── shared fixture ───────────────────────────────────────────────────────────

async function makeKeyfileProfile(name = "test-profile"): Promise<ConnectionProfile> {
  const encrypted = await encryptWithKeyfile("fake-pat-token");
  return {
    name,
    platform: "azure-devops",
    organizationUrl: "https://dev.azure.com/testorg",
    project: "TestProject",
    team: "TestTeam",
    token: { strategy: "keyfile", ...encrypted },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// ─── validateProfileName ──────────────────────────────────────────────────────

describe("validateProfileName", () => {
  test("returns undefined for a valid name", () => {
    expect(validateProfileName("my-profile")).toBeUndefined();
    expect(validateProfileName("work_ado")).toBeUndefined();
    expect(validateProfileName("Profile1")).toBeUndefined();
  });

  test("returns error for empty string", () => {
    expect(validateProfileName("")).toBeDefined();
  });

  test("returns error for undefined", () => {
    expect(validateProfileName(undefined)).toBeDefined();
  });

  test("returns error for whitespace-only string", () => {
    expect(validateProfileName("   ")).toBeDefined();
  });

  test("returns error when name contains spaces", () => {
    expect(validateProfileName("my profile")).toBeDefined();
  });

  test("returns error when name contains special characters", () => {
    expect(validateProfileName("my@profile")).toBeDefined();
    expect(validateProfileName("my/profile")).toBeDefined();
    expect(validateProfileName("my.profile")).toBeDefined();
  });
});

describe("validateOrganizationUrl", () => {
  test("accepts Azure DevOps cloud URLs", () => {
    expect(validateOrganizationUrl("https://dev.azure.com/myorg")).toBeUndefined();
    expect(
      validateOrganizationUrl("https://customdomain.visualstudio.com"),
    ).toBeUndefined();
  });

  test("rejects missing URL", () => {
    expect(validateOrganizationUrl("")).toBe("Organization URL is required");
    expect(validateOrganizationUrl(undefined)).toBe("Organization URL is required");
  });

  test("rejects non-https URLs", () => {
    expect(validateOrganizationUrl("http://dev.azure.com/myorg")).toBe(
      "Organization URL must use https://",
    );
  });

  test("rejects non-Azure DevOps hosts", () => {
    expect(validateOrganizationUrl("https://example.com")).toBe(
      "Organization URL must be an Azure DevOps host (dev.azure.com or *.visualstudio.com)",
    );
  });

  test("rejects malformed URLs", () => {
    expect(validateOrganizationUrl("not-a-url")).toBe(
      "Organization URL must be a valid URL",
    );
  });
});

// ─── resolveDefaultBehaviour ──────────────────────────────────────────────────

describe("resolveDefaultBehaviour", () => {
  test("returns 'set-default' when forceDefault is true regardless of file state", async () => {
    const result = await resolveDefaultBehaviour(true);
    expect(result).toBe("set-default");
  });

  test("returns 'set-default' when no file exists (no current default)", async () => {
    // CONNECTIONS_PATH was removed in beforeEach — no default profile
    const result = await resolveDefaultBehaviour(false);
    expect(result).toBe("set-default");
  });

  test("returns 'prompt' when a default profile is already set", async () => {
    const profile = await makeKeyfileProfile();
    await saveProfile(profile);
    await setDefaultProfile(profile.name);

    const result = await resolveDefaultBehaviour(false);
    expect(result).toBe("prompt");
  });
});

// ─── persistProfile ───────────────────────────────────────────────────────────

describe("persistProfile", () => {
  test("saves the profile and reports storage strategy", async () => {
    const { useKeychain } = await persistProfile({
      name: "persist-test",
      platform: "azure-devops",
      organizationUrl: "https://dev.azure.com/org",
      project: "Proj",
      team: "Team",
      pat: "some-pat-token",
    });

    // In test environments keytar is typically unavailable → keyfile
    expect(typeof useKeychain).toBe("boolean");

    const { readConnectionsFile } = await import("@config/connections.config");
    const file = await readConnectionsFile();
    const saved = file.profiles.find((p) => p.name === "persist-test");
    expect(saved).toBeDefined();
    expect(saved?.organizationUrl).toBe("https://dev.azure.com/org");
    expect(saved?.project).toBe("Proj");
    expect(saved?.team).toBe("Team");
  });

  test("stores an encrypted token (strategy is set)", async () => {
    await persistProfile({
      name: "token-strategy-test",
      platform: "azure-devops",
      organizationUrl: "https://dev.azure.com/org",
      project: "P",
      team: "T",
      pat: "my-secret-token",
    });

    const { readConnectionsFile } = await import("@config/connections.config");
    const file = await readConnectionsFile();
    const saved = file.profiles.find((p) => p.name === "token-strategy-test");
    expect(saved).toBeDefined();
    expect(["keychain", "keyfile"]).toContain(saved?.token.strategy as string);
  });
});

// ─── applyDefault ─────────────────────────────────────────────────────────────

describe("applyDefault", () => {
  test("sets the named profile as default", async () => {
    const profile = await makeKeyfileProfile("apply-default-test");
    await saveProfile(profile);

    await applyDefault("apply-default-test");

    const { readConnectionsFile } = await import("@config/connections.config");
    const file = await readConnectionsFile();
    expect(file.defaultProfile).toBe("apply-default-test");
  });
});

// ─── deleteProfile ────────────────────────────────────────────────────────────

describe("deleteProfile", () => {
  test("removes the profile from the connections file", async () => {
    const profile = await makeKeyfileProfile("delete-test");
    await saveProfile(profile);

    await deleteProfile("delete-test", profile);

    const { readConnectionsFile } = await import("@config/connections.config");
    const file = await readConnectionsFile();
    expect(file.profiles.find((p) => p.name === "delete-test")).toBeUndefined();
  });

  test("returns wasDefault: false when the deleted profile was not the default", async () => {
    const profile = await makeKeyfileProfile("delete-non-default");
    const other = await makeKeyfileProfile("other-profile");
    await saveProfile(profile);
    await saveProfile(other);
    await setDefaultProfile("other-profile");

    const result = await deleteProfile("delete-non-default", profile);
    expect(result.wasDefault).toBe(false);
  });

  test("returns wasDefault: true when the deleted profile was the default", async () => {
    const profile = await makeKeyfileProfile("delete-default");
    await saveProfile(profile);
    await setDefaultProfile("delete-default");

    const result = await deleteProfile("delete-default", profile);
    expect(result.wasDefault).toBe(true);

    const { readConnectionsFile } = await import("@config/connections.config");
    const file = await readConnectionsFile();
    expect(file.defaultProfile).toBeNull();
  });
});

// ─── rotateToken ──────────────────────────────────────────────────────────────

describe("rotateToken", () => {
  test("updates the stored token for the profile", async () => {
    const profile = await makeKeyfileProfile("rotate-test");
    await saveProfile(profile);

    const { useKeychain } = await rotateToken(profile, "new-pat-token");

    expect(typeof useKeychain).toBe("boolean");

    const { readConnectionsFile } = await import("@config/connections.config");
    const file = await readConnectionsFile();
    const updated = file.profiles.find((p) => p.name === "rotate-test");

    // The token data should have been replaced (updatedAt changes)
    expect(updated).toBeDefined();
    expect(updated?.token.strategy).toBeDefined();
  });

  test("preserves profile metadata after rotation", async () => {
    const profile = await makeKeyfileProfile("rotate-metadata");
    await saveProfile(profile);

    await rotateToken(profile, "brand-new-token");

    const { readConnectionsFile } = await import("@config/connections.config");
    const file = await readConnectionsFile();
    const updated = file.profiles.find((p) => p.name === "rotate-metadata");

    expect(updated?.organizationUrl).toBe(profile.organizationUrl);
    expect(updated?.project).toBe(profile.project);
    expect(updated?.team).toBe(profile.team);
  });

  test("updates updatedAt after rotation", async () => {
    const profile = await makeKeyfileProfile("rotate-timestamp");
    await saveProfile(profile);

    await rotateToken(profile, "another-token");

    const { readConnectionsFile } = await import("@config/connections.config");
    const file = await readConnectionsFile();
    const updated = file.profiles.find((p) => p.name === "rotate-timestamp");

    expect(updated?.updatedAt).not.toBe(profile.updatedAt);
  });
});

// ─── testPlatformConnection ───────────────────────────────────────────────────

function makePlatform(
  overrides: Partial<IPlatformAdapter> = {},
): IPlatformAdapter {
  return {
    authenticate: mock(() => Promise.resolve()),
    getConnectUserEmail: mock(() => Promise.resolve("user@test.com")),
    queryWorkItems: mock(() => Promise.resolve([])),
    createTask: mock(() => Promise.resolve({ id: "1", title: "t" } as never)),
    createTasksBulk: mock(() => Promise.resolve([])),
    getPlatformMetadata: mock(() => ({ name: "TestPlatform", version: "1.0.0" })),
    ...overrides,
  };
}

describe("testPlatformConnection", () => {
  test("returns ok:true when testConnection resolves true", async () => {
    const platform = makePlatform({
      testConnection: mock(() => Promise.resolve(true)),
    });

    const result = await testPlatformConnection(platform);
    expect(result.ok).toBe(true);
  });

  test("returns ok:false when testConnection resolves false", async () => {
    const platform = makePlatform({
      testConnection: mock(() => Promise.resolve(false)),
    });

    const result = await testPlatformConnection(platform);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBeTruthy();
    }
  });

  test("falls back to authenticate + getPlatformMetadata when testConnection is not defined", async () => {
    const platform = makePlatform();
    // testConnection is not set → undefined

    const result = await testPlatformConnection(platform);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.label).toContain("TestPlatform");
    }
  });

  test("calls authenticate when testConnection is not defined", async () => {
    const authMock = mock(() => Promise.resolve());
    const platform = makePlatform({ authenticate: authMock });

    await testPlatformConnection(platform);
    expect(authMock).toHaveBeenCalledTimes(1);
  });
});
