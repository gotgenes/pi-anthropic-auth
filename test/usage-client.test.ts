import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";
import {
  fetchAnthropicUsage,
  UsageClientError,
  USAGE_ENDPOINT,
} from "#src/usage-client";

const TOKEN = "sk-ant-oat-test-token";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchAnthropicUsage", () => {
  test("fetches usage and profile with Bearer OAuth authentication", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          five_hour: { utilization: 10, resets_at: null },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          account: { email: "ada@example.com" },
          organization: { name: "Analytical Engines" },
        }),
      );

    const result = await fetchAnthropicUsage(TOKEN, {
      fetchImpl: fetchMock,
      now: () => new Date("2026-08-22T20:00:00Z"),
    });

    assert.equal(fetchMock.mock.calls.length, 2);
    const [usageUrl, usageInit] = fetchMock.mock.calls[0];
    assert.equal(usageUrl, USAGE_ENDPOINT);
    assert.equal(
      new Headers(usageInit?.headers).get("authorization"),
      `Bearer ${TOKEN}`,
    );
    assert.equal(
      new Headers(usageInit?.headers).get("anthropic-beta"),
      "oauth-2025-04-20",
    );
    assert.deepEqual(result.account, {
      email: "ada@example.com",
      organizationName: "Analytical Engines",
    });
    assert.equal(result.windows[0]?.utilizationPercent, 10);
    assert.equal(result.fetchedAt, "2026-08-22T20:00:00.000Z");
    assert.deepEqual(result.warnings, []);
  });

  test("does not make a request when the OAuth token is missing", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await assert.rejects(
      fetchAnthropicUsage("", { fetchImpl: fetchMock }),
      (error: unknown) => {
        assert.ok(error instanceof UsageClientError);
        assert.equal(error.code, "missing_token");
        return true;
      },
    );
    assert.equal(fetchMock.mock.calls.length, 0);
  });

  test("keeps usage data when profile enrichment fails", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ seven_day: { utilization: 20, resets_at: null } }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "forbidden" }, 403));

    const result = await fetchAnthropicUsage(TOKEN, { fetchImpl: fetchMock });

    assert.equal(result.windows[0]?.utilizationPercent, 20);
    assert.deepEqual(result.account, {});
    assert.deepEqual(result.warnings, [
      "profile request failed with status 403",
    ]);
  });

  test("classifies usage authorization failures without including credentials", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));

    await assert.rejects(
      fetchAnthropicUsage(TOKEN, { fetchImpl: fetchMock }),
      (error: unknown) => {
        assert.ok(error instanceof UsageClientError);
        assert.equal(error.code, "unauthorized");
        assert.equal(error.status, 401);
        assert.ok(!error.message.includes(TOKEN));
        return true;
      },
    );
  });

  test.each([
    [429, "rate_limited"],
    [503, "server_error"],
  ] as const)("classifies HTTP %s usage failures", async (status, code) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "failure" }, status));

    await assert.rejects(
      fetchAnthropicUsage(TOKEN, { fetchImpl: fetchMock }),
      (error: unknown) => {
        assert.ok(error instanceof UsageClientError);
        assert.equal(error.code, code);
        assert.equal(error.status, status);
        return true;
      },
    );
  });

  test("classifies malformed usage JSON", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not json", { status: 200 }));

    await assert.rejects(
      fetchAnthropicUsage(TOKEN, { fetchImpl: fetchMock }),
      (error: unknown) => {
        assert.ok(error instanceof UsageClientError);
        assert.equal(error.code, "invalid_json");
        return true;
      },
    );
  });
});
