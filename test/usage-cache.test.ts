import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";
import {
  DEFAULT_USAGE_CACHE_MAX_AGE_MS,
  UsageSnapshotCache,
} from "#src/usage-cache";
import type { UsageSnapshot } from "#src/usage-types";

const FIRST_TIME = new Date("2026-08-22T20:00:00Z");

function snapshot(fetchedAt = FIRST_TIME.toISOString()): UsageSnapshot {
  return {
    windows: [
      {
        id: "five_hour",
        label: "5-hour session",
        utilizationPercent: 25,
        resetAt: null,
        source: "five_hour",
      },
    ],
    account: {},
    fetchedAt,
    warnings: [],
  };
}

describe("UsageSnapshotCache", () => {
  test("uses a fresh snapshot without fetching again", async () => {
    const fetchSnapshot = vi.fn(async () => snapshot());
    const cache = new UsageSnapshotCache({
      maxAgeMs: DEFAULT_USAGE_CACHE_MAX_AGE_MS,
      now: () => FIRST_TIME,
    });

    await cache.get(fetchSnapshot);
    const result = await cache.get(fetchSnapshot);

    assert.equal(fetchSnapshot.mock.calls.length, 1);
    assert.equal(result.stale, false);
    assert.equal(result.snapshot.windows[0]?.utilizationPercent, 25);
  });

  test("refreshes an expired snapshot", async () => {
    let now = FIRST_TIME.getTime();
    const fetchSnapshot = vi
      .fn<() => Promise<UsageSnapshot>>()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot(new Date(now + 61_000).toISOString()));
    const cache = new UsageSnapshotCache({
      maxAgeMs: 60_000,
      now: () => new Date(now),
    });

    await cache.get(fetchSnapshot);
    now += 61_000;
    const result = await cache.get(fetchSnapshot);

    assert.equal(fetchSnapshot.mock.calls.length, 2);
    assert.equal(result.stale, false);
    assert.equal(result.snapshot.fetchedAt, new Date(now).toISOString());
  });

  test("returns the last snapshot as stale after refresh failure", async () => {
    let now = FIRST_TIME.getTime();
    const fetchSnapshot = vi
      .fn<() => Promise<UsageSnapshot>>()
      .mockResolvedValueOnce(snapshot())
      .mockRejectedValueOnce(new Error("429 from usage endpoint"));
    const cache = new UsageSnapshotCache({
      maxAgeMs: 60_000,
      now: () => new Date(now),
    });

    await cache.get(fetchSnapshot);
    now += 61_000;
    const result = await cache.get(fetchSnapshot);

    assert.equal(result.stale, true);
    assert.equal(result.snapshot.fetchedAt, FIRST_TIME.toISOString());
    assert.equal(result.error, "429 from usage endpoint");
  });

  test("does not return an empty dashboard when the first fetch fails", async () => {
    const cache = new UsageSnapshotCache({ now: () => FIRST_TIME });

    await assert.rejects(
      cache.get(async () => {
        throw new Error("network down");
      }),
      /network down/,
    );
  });

  test("shares one in-flight refresh between concurrent callers", async () => {
    const deferred = Promise.withResolvers<UsageSnapshot>();
    const fetchSnapshot = vi.fn(() => deferred.promise);
    const cache = new UsageSnapshotCache({ now: () => FIRST_TIME });

    const first = cache.get(fetchSnapshot);
    const second = cache.get(fetchSnapshot);
    deferred.resolve(snapshot());
    await Promise.all([first, second]);

    assert.equal(fetchSnapshot.mock.calls.length, 1);
  });

  test("keeps snapshots isolated by cache key", async () => {
    const cache = new UsageSnapshotCache({ now: () => FIRST_TIME });
    const first = snapshot();
    const second = snapshot("2026-08-22T21:00:00.000Z");

    await cache.get(async () => first, "account-a");
    await cache.get(async () => second, "account-b");

    const result = await cache.get(
      async () => snapshot("unexpected"),
      "account-a",
    );
    assert.equal(result.snapshot.fetchedAt, first.fetchedAt);
  });
});
