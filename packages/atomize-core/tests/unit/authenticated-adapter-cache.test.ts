import { describe, expect, test } from "bun:test";
import type { AzureDevOpsConfig } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/azure-devops.adapter";
import { AuthenticatedAdapterCache } from "@sppg2001/atomize-core/platforms/authenticated-adapter-cache";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";

const config = (overrides: Partial<AzureDevOpsConfig> = {}): AzureDevOpsConfig => ({
  type: "azure-devops",
  organizationUrl: "https://dev.azure.com/org",
  project: "P",
  team: "T",
  token: "pat-1",
  ...overrides,
});

function fakeFactory(options: { failFirst?: boolean } = {}) {
  const created: AzureDevOpsConfig[] = [];
  let authentications = 0;
  const create = (c: AzureDevOpsConfig) => {
    created.push(c);
    return {
      authenticate: async () => {
        authentications++;
        if (options.failFirst && authentications === 1) throw new Error("401");
      },
    } as unknown as IPlatformAdapter;
  };
  return { create, created, authentications: () => authentications };
}

describe("AuthenticatedAdapterCache", () => {
  test("reuses one authenticated adapter for the same connection and token", async () => {
    const factory = fakeFactory();
    const cache = new AuthenticatedAdapterCache({ create: factory.create });

    const [a, b] = await Promise.all([cache.get(config()), cache.get(config())]);
    const c = await cache.get(config());

    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(factory.authentications()).toBe(1);
  });

  test("a different token, project, team or organization gets its own adapter", async () => {
    const factory = fakeFactory();
    const cache = new AuthenticatedAdapterCache({ create: factory.create });

    await cache.get(config());
    await cache.get(config({ token: "pat-2" }));
    await cache.get(config({ project: "Q" }));
    await cache.get(config({ team: "U" }));
    await cache.get(config({ organizationUrl: "https://dev.azure.com/other" }));

    expect(factory.created).toHaveLength(5);
  });

  test("doesn't keep an adapter whose authentication failed", async () => {
    const factory = fakeFactory({ failFirst: true });
    const cache = new AuthenticatedAdapterCache({ create: factory.create });

    await expect(cache.get(config())).rejects.toThrow("401");
    await cache.get(config());

    expect(factory.authentications()).toBe(2);
  });

  test("authenticates again once the cached adapter is older than the time to live", async () => {
    let now = 0;
    const factory = fakeFactory();
    const cache = new AuthenticatedAdapterCache({ create: factory.create, ttlMs: 1000, now: () => now });

    await cache.get(config());
    now = 999;
    await cache.get(config());
    now = 1000;
    await cache.get(config());

    expect(factory.authentications()).toBe(2);
  });

  test("clear forgets every adapter", async () => {
    const factory = fakeFactory();
    const cache = new AuthenticatedAdapterCache({ create: factory.create });

    await cache.get(config());
    cache.clear();
    await cache.get(config());

    expect(factory.authentications()).toBe(2);
  });

  test("doesn't keep the token itself in the cache key", async () => {
    const cache = new AuthenticatedAdapterCache({ create: fakeFactory().create });
    await cache.get(config({ token: "secret-pat-value" }));
    expect(cache.keys().some((key) => key.includes("secret-pat-value"))).toBe(false);
  });
});
