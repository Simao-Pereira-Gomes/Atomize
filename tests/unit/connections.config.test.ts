import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AzureDevOpsProfile } from "@config/connections.interface";

const ATOMIZE_DIR = join(tmpdir(), `atomize-connections-config-test-${process.pid}`);

mock.module("@config/atomize-paths", () => ({
  getAtomizeDir: () => ATOMIZE_DIR,
  ensureAtomizeDir: async () => { await mkdir(ATOMIZE_DIR, { recursive: true }); },
}));

import {
  getDefaultProfile,
  getProfile,
  readConnectionsFile,
  removeProfile,
  saveProfile,
  setDefaultProfile,
} from "@config/connections.config";
import type { ConnectionProfile } from "@config/connections.interface";

const CONNECTIONS_PATH = join(ATOMIZE_DIR, "connections.json");

const testProfile: ConnectionProfile = {
  name: "test-profile",
  platform: "azure-devops",
  organizationUrl: "https://dev.azure.com/testorg",
  project: "TestProject",
  team: "TestTeam",
  token: {
    strategy: "keyfile",
    iv: "aabbcc",
    authTag: "ddeeff",
    ciphertext: "112233",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const testProfile2: ConnectionProfile = {
  name: "test-profile-2",
  platform: "azure-devops",
  organizationUrl: "https://dev.azure.com/anotherorg",
  project: "AnotherProject",
  team: "AnotherTeam",
  token: {
    strategy: "keyfile",
    iv: "ccddee",
    authTag: "ffaabb",
    ciphertext: "334455",
  },
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

beforeAll(async () => {
  await rm(ATOMIZE_DIR, { recursive: true, force: true });
  await mkdir(ATOMIZE_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(ATOMIZE_DIR, { recursive: true, force: true });
});

describe("connections.config", () => {
  describe("readConnectionsFile", () => {
    test("returns empty file structure when no file exists", async () => {
      // Ensure the file doesn't exist at test start
      if (existsSync(CONNECTIONS_PATH)) {
        await rm(CONNECTIONS_PATH, { force: true });
      }

      const result = await readConnectionsFile();

      expect(result).toEqual({
        version: "1",
        defaultProfiles: {},
        profiles: [],
      });
    });
  });

  describe("saveProfile", () => {
    test("saves a new profile and can be retrieved with getProfile", async () => {
      await saveProfile(testProfile);

      const retrieved = await getProfile("test-profile");

      expect(retrieved).toEqual(testProfile);
    });

    test("overwrites an existing profile with the same name", async () => {
      const updated: ConnectionProfile = {
        ...testProfile,
        project: "UpdatedProject",
        updatedAt: "2026-02-01T00:00:00.000Z",
      };

      await saveProfile(updated);

      const retrieved = await getProfile("test-profile") as AzureDevOpsProfile | undefined;
      expect(retrieved?.project).toBe("UpdatedProject");
    });

    test("saves multiple profiles without overwriting others", async () => {
      await saveProfile(testProfile2);

      const first = await getProfile("test-profile");
      const second = await getProfile("test-profile-2");

      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect((second as AzureDevOpsProfile | undefined)?.organizationUrl).toBe("https://dev.azure.com/anotherorg");
    });
  });

  describe("removeProfile", () => {
    test("removes an existing profile", async () => {
      await saveProfile(testProfile);

      await removeProfile("test-profile");

      const retrieved = await getProfile("test-profile");
      expect(retrieved).toBeUndefined();
    });

    test("returns wasDefault: false when removed profile was not the default", async () => {
      await saveProfile(testProfile2);

      const result = await removeProfile("test-profile-2");

      expect(result.wasDefault).toBe(false);
    });

    test("returns wasDefault: true and clears defaultProfile when default is removed", async () => {
      await saveProfile(testProfile);
      await saveProfile(testProfile2);
      await setDefaultProfile("test-profile");

      const result = await removeProfile("test-profile");

      expect(result.wasDefault).toBe(true);

      const file = await readConnectionsFile();
      expect(file.defaultProfiles["azure-devops"]).toBeUndefined();
    });

    test("removing a non-existent profile is a no-op", async () => {
      const before = await readConnectionsFile();
      const beforeCount = before.profiles.length;

      await removeProfile("does-not-exist");

      const after = await readConnectionsFile();
      expect(after.profiles.length).toBe(beforeCount);
    });
  });

  describe("setDefaultProfile", () => {
    test("sets the default profile for its platform", async () => {
      await saveProfile(testProfile);
      await saveProfile(testProfile2);

      await setDefaultProfile("test-profile");

      const file = await readConnectionsFile();
      expect(file.defaultProfiles["azure-devops"]).toBe("test-profile");
    });

    test("throws when profile does not exist", async () => {
      await expect(setDefaultProfile("non-existent-profile")).rejects.toThrow(
        'Profile "non-existent-profile" not found',
      );
    });

    test("can change the default profile for a platform", async () => {
      await saveProfile(testProfile);
      await saveProfile(testProfile2);
      await setDefaultProfile("test-profile");
      await setDefaultProfile("test-profile-2");

      const file = await readConnectionsFile();
      expect(file.defaultProfiles["azure-devops"]).toBe("test-profile-2");
    });
  });

  describe("getDefaultProfile", () => {
    test("returns undefined when no default is set for the platform", async () => {
      // Reset the file to a clean state
      if (existsSync(CONNECTIONS_PATH)) {
        await rm(CONNECTIONS_PATH, { force: true });
      }

      const result = await getDefaultProfile("azure-devops");
      expect(result).toBeUndefined();
    });

    test("returns the default profile when one is set", async () => {
      await saveProfile(testProfile);
      await setDefaultProfile("test-profile");

      const result = await getDefaultProfile("azure-devops");

      expect(result).toBeDefined();
      expect(result?.name).toBe("test-profile");
    });
  });

  describe("getProfile", () => {
    test("returns undefined when profile does not exist", async () => {
      const result = await getProfile("absolutely-not-there");
      expect(result).toBeUndefined();
    });

    test("returns the correct profile by name", async () => {
      await saveProfile(testProfile);
      await saveProfile(testProfile2);

      const result = await getProfile("test-profile-2");

      expect(result?.name).toBe("test-profile-2");
      expect((result as AzureDevOpsProfile | undefined)?.organizationUrl).toBe("https://dev.azure.com/anotherorg");
    });
  });
});
