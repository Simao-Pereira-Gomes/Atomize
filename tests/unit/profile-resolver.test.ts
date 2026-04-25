import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ATOMIZE_DIR = join(
  tmpdir(),
  `atomize-profile-resolver-test-${process.pid}`,
);

mock.module("@config/atomize-paths", () => ({
  getAtomizeDir: () => ATOMIZE_DIR,
  ensureAtomizeDir: async () => {
    await mkdir(ATOMIZE_DIR, { recursive: true });
  },
}));

import {
  removeProfile,
  saveProfile,
  setDefaultProfile,
} from "@config/connections.config";
import type { ConnectionProfile } from "@config/connections.interface";
import { resolveAzureConfig } from "@config/profile-resolver";

// A profile that uses keyfile strategy so we don't need keychain
const profileWithKeyfile: ConnectionProfile = {
  name: "resolver-test-profile",
  platform: "azure-devops",
  organizationUrl: "https://dev.azure.com/resolverorg",
  project: "ResolverProject",
  team: "ResolverTeam",
  token: {
    strategy: "keyfile",
    // These will be real encrypted values written in beforeAll
    iv: "",
    authTag: "",
    ciphertext: "",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const profileWithKeyfile2: ConnectionProfile = {
  name: "resolver-default-profile",
  platform: "azure-devops",
  organizationUrl: "https://dev.azure.com/defaultorg",
  project: "DefaultProject",
  team: "DefaultTeam",
  token: {
    strategy: "keyfile",
    iv: "",
    authTag: "",
    ciphertext: "",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

let encryptedToken1: { iv: string; authTag: string; ciphertext: string };
let encryptedToken2: { iv: string; authTag: string; ciphertext: string };

beforeAll(async () => {
  await rm(ATOMIZE_DIR, { recursive: true, force: true });
  await mkdir(ATOMIZE_DIR, { recursive: true });

  // Encrypt a real token using keyfile so retrieveToken works in tests
  const { encryptWithKeyfile } = await import("@config/keyfile.service");
  encryptedToken1 = await encryptWithKeyfile("pat-token-for-resolver-test-1");
  encryptedToken2 = await encryptWithKeyfile("pat-token-for-resolver-test-2");

  const profile1: ConnectionProfile = {
    ...profileWithKeyfile,
    token: { strategy: "keyfile", ...encryptedToken1 },
  };
  const profile2: ConnectionProfile = {
    ...profileWithKeyfile2,
    token: { strategy: "keyfile", ...encryptedToken2 },
  };

  await saveProfile(profile1);
  await saveProfile(profile2);
});

afterAll(async () => {
  await rm(ATOMIZE_DIR, { recursive: true, force: true });
});

describe("profile-resolver", () => {
  describe("resolveAzureConfig", () => {
    test("resolves correct AzureDevOpsConfig when profile name is given explicitly", async () => {
      delete process.env.ATOMIZE_PROFILE;

      const config = await resolveAzureConfig("resolver-test-profile");

      expect(config.type).toBe("azure-devops");
      expect(config.organizationUrl).toBe("https://dev.azure.com/resolverorg");
      expect(config.project).toBe("ResolverProject");
      expect(config.team).toBe("ResolverTeam");
      expect(config.token).toBe("pat-token-for-resolver-test-1");
    });

    test("uses ATOMIZE_PROFILE env var when no profile name is passed", async () => {
      process.env.ATOMIZE_PROFILE = "resolver-test-profile";

      const config = await resolveAzureConfig();

      expect(config.organizationUrl).toBe("https://dev.azure.com/resolverorg");
      expect(config.token).toBe("pat-token-for-resolver-test-1");

      delete process.env.ATOMIZE_PROFILE;
    });

    test("ATOMIZE_PROFILE env var is overridden by explicit profileName argument", async () => {
      process.env.ATOMIZE_PROFILE = "resolver-test-profile";

      // Explicit name takes precedence
      const config = await resolveAzureConfig("resolver-default-profile");

      expect(config.organizationUrl).toBe("https://dev.azure.com/defaultorg");
      expect(config.project).toBe("DefaultProject");

      delete process.env.ATOMIZE_PROFILE;
    });

    test("throws when profile name is given but profile does not exist", async () => {
      delete process.env.ATOMIZE_PROFILE;

      await expect(resolveAzureConfig("non-existent-profile")).rejects.toThrow(
        'Profile "non-existent-profile" not found',
      );
    });

    test("throws when no profile name and no default profile configured", async () => {
      delete process.env.ATOMIZE_PROFILE;
      // Ensure no ADO default is set by resetting the file defaultProfiles.
      // The beforeAll doesn't set a default, so this should already be empty.
      const { readConnectionsFile } =
        await import("@config/connections.config");
      const file = await readConnectionsFile();

      if (file.defaultProfiles["azure-devops"]) {
        // Remove the default by re-adding profiles without setting a default
        const names = file.profiles.map((p) => p.name);
        for (const name of names) {
          await removeProfile(name);
        }
        // Re-add without setting default
        const { encryptWithKeyfile } = await import("@config/keyfile.service");
        const e1 = await encryptWithKeyfile("pat-token-for-resolver-test-1");
        const e2 = await encryptWithKeyfile("pat-token-for-resolver-test-2");
        await saveProfile({
          ...profileWithKeyfile,
          token: { strategy: "keyfile", ...e1 },
        });
        await saveProfile({
          ...profileWithKeyfile2,
          token: { strategy: "keyfile", ...e2 },
        });
      }

      await expect(resolveAzureConfig()).rejects.toThrow(
        "No connection profile configured",
      );
    });

    test("uses default profile when no profile name and no env var, but default is set", async () => {
      delete process.env.ATOMIZE_PROFILE;

      await setDefaultProfile("resolver-default-profile");

      const config = await resolveAzureConfig();

      expect(config.organizationUrl).toBe("https://dev.azure.com/defaultorg");
      expect(config.project).toBe("DefaultProject");
      expect(config.team).toBe("DefaultTeam");
    });
  });
});
