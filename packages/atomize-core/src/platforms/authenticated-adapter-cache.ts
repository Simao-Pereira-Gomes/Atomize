import { createHash } from "node:crypto";
import type { AzureDevOpsConfig } from "./adapters/azure-devops/azure-devops.adapter";
import type { IPlatformAdapter } from "./interfaces/platform.interface";
import { PlatformFactory } from "./platform-factory";

export interface AuthenticatedAdapterCacheOptions {
  /** How long an authenticated adapter is reused before authenticating again (default 30 minutes). */
  ttlMs?: number;
  now?: () => number;
  create?: (config: AzureDevOpsConfig) => IPlatformAdapter;
}

/**
 * Hands out authenticated Azure DevOps adapters, reusing one per connection and token, for hosts that
 * talk to Azure DevOps many times in one session (the VS Code extension, Studio's sidecar). Reuse
 * skips authentication's round trips and keeps the adapter's field-schema and state caches warm.
 *
 * A changed token, organization, project or team gets a fresh adapter, a failed authentication isn't
 * kept, and an adapter is re-authenticated after `ttlMs`, or as soon as it reports it's no longer
 * connected (the Azure DevOps adapter does after any 401, such as a revoked PAT). The token is hashed, never stored as a key.
 */
export class AuthenticatedAdapterCache {
  private readonly entries = new Map<string, { adapter: Promise<IPlatformAdapter>; createdAt: number }>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly create: (config: AzureDevOpsConfig) => IPlatformAdapter;

  constructor(options: AuthenticatedAdapterCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30 * 60_000;
    this.now = options.now ?? Date.now;
    this.create = options.create ?? ((config) => PlatformFactory.create("azure-devops", config));
  }

  async get(config: AzureDevOpsConfig): Promise<IPlatformAdapter> {
    const key = cacheKey(config);
    const existing = this.entries.get(key);
    if (existing && this.now() - existing.createdAt < this.ttlMs) {
      const adapter = await existing.adapter;
      if (adapter.getPlatformMetadata?.().connected !== false) return adapter;
      if (this.entries.get(key) === existing) this.entries.delete(key);
      return this.get(config);
    }

    const adapter = (async () => {
      const created = this.create(config);
      await created.authenticate();
      return created;
    })();
    const entry = { adapter, createdAt: this.now() };
    this.entries.set(key, entry);
    adapter.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return adapter;
  }

  clear(): void {
    this.entries.clear();
  }

  /** The current cache keys, for tests. */
  keys(): string[] {
    return [...this.entries.keys()];
  }
}

function cacheKey(config: AzureDevOpsConfig): string {
  const tokenHash = createHash("sha256").update(config.token).digest("hex");
  return JSON.stringify([config.organizationUrl, config.project, config.team, config.maxConcurrency ?? null, tokenHash]);
}
