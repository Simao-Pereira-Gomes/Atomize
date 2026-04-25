import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ATOMIZE_DIR = join(tmpdir(), `atomize-ai-config-test-${process.pid}`);

mock.module("@config/atomize-paths", () => ({
  getAtomizeDir: () => ATOMIZE_DIR,
  ensureAtomizeDir: async () => { await mkdir(ATOMIZE_DIR, { recursive: true }); },
}));

// Mock keytar so we can use keyfile storage in tests
mock.module("keytar", () => ({ default: null }));

import { resolveAIProvider } from "@config/ai.config";
import { readConnectionsFile, saveProfile, setDefaultProfile } from "@config/connections.config";
import { encryptWithKeyfile } from "@config/keyfile.service";

async function makeGitHubModelsProfile(name: string, model?: string) {
  const encrypted = await encryptWithKeyfile("ghp_testtoken12345678901234567890123456789");
  await saveProfile({
    name,
    platform: "github-models",
    model,
    token: { strategy: "keyfile", ...encrypted },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function makeAzureDevOpsProfile(name: string) {
  const encrypted = await encryptWithKeyfile("ado-pat-token");
  await saveProfile({
    name,
    platform: "azure-devops",
    organizationUrl: "https://dev.azure.com/org",
    project: "Proj",
    team: "Team",
    token: { strategy: "keyfile", ...encrypted },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

beforeAll(async () => {
  await mkdir(ATOMIZE_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(ATOMIZE_DIR, { recursive: true, force: true });
});

beforeEach(async () => {
  // Clear all profiles before each test
  const file = await readConnectionsFile();
  for (const p of file.profiles) {
    const { removeProfile } = await import("@config/connections.config");
    await removeProfile(p.name);
  }
});

describe("resolveAIProvider", () => {
  test("resolves named github-models profile", async () => {
    await makeGitHubModelsProfile("my-ai");
    const provider = await resolveAIProvider("my-ai");
    expect(provider.id).toBe("github-models");
  });

  test("throws when named profile does not exist", async () => {
    await expect(resolveAIProvider("nonexistent")).rejects.toThrow("not found");
  });

  test("throws when named profile is not a github-models profile", async () => {
    await makeAzureDevOpsProfile("my-ado");
    await expect(resolveAIProvider("my-ado")).rejects.toThrow("azure-devops");
  });

  test("resolves default github-models profile when no name given", async () => {
    await makeGitHubModelsProfile("default-ai");
    await setDefaultProfile("default-ai");
    const provider = await resolveAIProvider();
    expect(provider.id).toBe("github-models");
  });

  test("falls back to first github-models profile when default is ADO", async () => {
    await makeAzureDevOpsProfile("my-ado");
    await makeGitHubModelsProfile("my-ai");
    await setDefaultProfile("my-ado");
    const provider = await resolveAIProvider();
    expect(provider.id).toBe("github-models");
  });

  test("throws when no github-models profile exists", async () => {
    await makeAzureDevOpsProfile("only-ado");
    await expect(resolveAIProvider()).rejects.toThrow("No AI provider profile configured");
  });

  test("uses ATOMIZE_AI_PROFILE env var when no profileName given", async () => {
    await makeGitHubModelsProfile("env-ai");
    process.env.ATOMIZE_AI_PROFILE = "env-ai";
    try {
      const provider = await resolveAIProvider();
      expect(provider.id).toBe("github-models");
    } finally {
      delete process.env.ATOMIZE_AI_PROFILE;
    }
  });
});
