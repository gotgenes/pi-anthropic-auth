import type { UsageSnapshot } from "./usage-types";

export const DEFAULT_USAGE_CACHE_MAX_AGE_MS = 60_000;

export interface UsageCacheOptions {
  maxAgeMs?: number;
  now?: () => Date;
}

export interface CachedUsageSnapshot {
  snapshot: UsageSnapshot;
  stale: boolean;
  error?: string;
}

export class UsageSnapshotCache {
  private readonly maxAgeMs: number;
  private readonly now: () => Date;
  private readonly snapshots = new Map<string, UsageSnapshot>();
  private readonly storedAtMs = new Map<string, number>();
  private readonly refreshPromises = new Map<string, Promise<UsageSnapshot>>();

  constructor(options: UsageCacheOptions = {}) {
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_USAGE_CACHE_MAX_AGE_MS;
    this.now = options.now ?? (() => new Date());
  }

  async get(
    fetchSnapshot: () => Promise<UsageSnapshot>,
    cacheKey = "default",
  ): Promise<CachedUsageSnapshot> {
    const cachedSnapshot = this.snapshots.get(cacheKey);
    if (cachedSnapshot && this.isFresh(cacheKey)) {
      return { snapshot: cachedSnapshot, stale: false };
    }

    const refresh =
      this.refreshPromises.get(cacheKey) ??
      this.startRefresh(cacheKey, fetchSnapshot);
    try {
      return { snapshot: await refresh, stale: false };
    } catch (error) {
      const staleSnapshot = this.snapshots.get(cacheKey);
      if (staleSnapshot) {
        return {
          snapshot: staleSnapshot,
          stale: true,
          error: errorMessage(error),
        };
      }
      throw error;
    } finally {
      if (this.refreshPromises.get(cacheKey) === refresh) {
        this.refreshPromises.delete(cacheKey);
      }
    }
  }

  private startRefresh(
    cacheKey: string,
    fetchSnapshot: () => Promise<UsageSnapshot>,
  ): Promise<UsageSnapshot> {
    const refresh = Promise.resolve()
      .then(fetchSnapshot)
      .then((snapshot) => {
        this.snapshots.set(cacheKey, snapshot);
        this.storedAtMs.set(cacheKey, this.now().getTime());
        return snapshot;
      });
    this.refreshPromises.set(cacheKey, refresh);
    return refresh;
  }

  private isFresh(cacheKey: string): boolean {
    const storedAtMs = this.storedAtMs.get(cacheKey);
    if (storedAtMs === undefined) return false;
    return this.now().getTime() - storedAtMs < this.maxAgeMs;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
