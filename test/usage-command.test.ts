import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";
import {
  createUsageCommandHandler,
  createUsageDashboardComponent,
  formatUsageReport,
  type UsageCommandContext,
} from "#src/usage-command";
import { UsageSnapshotCache } from "#src/usage-cache";
import type { UsageSnapshot } from "#src/usage-types";
import { fetchAnthropicUsage } from "#src/usage-client";

const TOKEN = "sk-ant-oat-test-token";
const SNAPSHOT: UsageSnapshot = {
  windows: [
    {
      id: "five_hour",
      label: "5-hour session",
      utilizationPercent: 40,
      resetAt: "2026-08-22T20:00:00Z",
      source: "five_hour",
    },
    {
      id: "seven_day_sonnet",
      label: "Sonnet weekly",
      utilizationPercent: 20,
      resetAt: null,
      source: "seven_day_sonnet",
      model: "sonnet",
    },
  ],
  extraUsage: {
    enabled: true,
    monthlyLimit: 10000,
    usedCredits: 2500,
    utilizationPercent: 25,
    currency: "USD",
    decimalPlaces: 2,
    disabledReason: "spend limit reached",
    userDisabled: false,
    spendLimitReached: false,
    creditsEverEnabled: true,
  },
  spend: {
    usedMinor: 1250,
    limitMinor: 5000,
    currency: "USD",
    exponent: 2,
    utilizationPercent: 25,
    enabled: true,
    disabledReason: null,
    canPurchaseCredits: true,
    canToggle: true,
    disclaimer: null,
  },
  memberDashboardAvailable: true,
  account: {
    email: "ada@example.com",
    organizationName: "Analytical Engines",
    subscriptionStatus: "canceled",
    billingType: "apple_subscription",
  },
  fetchedAt: "2026-08-22T19:00:00.000Z",
  warnings: [],
};

function context(
  mode: UsageCommandContext["mode"],
  authKind: "oauth" | "api_key" | "none" = "oauth",
) {
  const custom = vi.fn<UsageCommandContext["ui"]["custom"]>(() =>
    Promise.resolve(undefined),
  );
  return {
    mode,
    hasUI: false,
    modelRegistry: {
      getProviderAuth: vi.fn(async () => {
        if (authKind === "none") return undefined;
        const apiKey = authKind === "oauth" ? TOKEN : "sk-ant-api-key";
        return { auth: { apiKey } };
      }),
    },
    ui: {
      notify: vi.fn(),
      custom,
    },
  };
}

describe("formatUsageReport", () => {
  test("renders every returned window and extra usage fields", () => {
    const report = formatUsageReport(SNAPSHOT);

    assert.match(report, /5-hour session: 40%/);
    assert.match(report, /resets \d{4}-\d{2}-\d{2} \d{2}:\d{2} .+/);
    assert.doesNotMatch(report, /resets \d{4}-\d{2}-\d{2}T/);
    assert.match(report, /Sonnet weekly: 20%/);
    assert.match(report, /credits used: 25 USD/);
    assert.match(report, /monthly limit: 100 USD/);
    assert.match(report, /ada@example\.com/);
    assert.match(report, /billing: Apple App Store/);
    assert.match(report, /check that store for renewal status/);
  });

  test("marks stale reports and preserves the refresh error", () => {
    const report = formatUsageReport(SNAPSHOT, true, "rate limited");

    assert.match(report, /stale/);
    assert.match(report, /warning: rate limited/);
  });

  test("preserves an invalid reset timestamp instead of throwing", () => {
    const report = formatUsageReport({
      ...SNAPSHOT,
      windows: [{ ...SNAPSHOT.windows[0], resetAt: "not-a-date" }],
    });
    assert.match(report, /resets not-a-date/);
  });

  test("explains Google Play billing and omits the note for active subscriptions", () => {
    const googleReport = formatUsageReport({
      ...SNAPSHOT,
      account: {
        ...SNAPSHOT.account,
        billingType: "google_subscription",
      },
    });
    assert.match(googleReport, /billing: Google Play Store/);
    assert.match(googleReport, /check that store for renewal status/);

    const activeReport = formatUsageReport({
      ...SNAPSHOT,
      account: {
        ...SNAPSHOT.account,
        subscriptionStatus: "active",
      },
    });
    assert.doesNotMatch(activeReport, /Subscription billing is managed/);
  });
});

describe("createUsageDashboardComponent", () => {
  test("colors additional quotas red and explains their zero values", () => {
    const component = createUsageDashboardComponent(
      {
        ...SNAPSHOT,
        windows: [
          ...SNAPSHOT.windows,
          {
            id: "nimbus_quill",
            label: "Additional quota (Nimbus Quill)",
            utilizationPercent: 0,
            resetAt: null,
            source: "nimbus_quill",
          },
        ],
      },
      false,
      undefined,
      { requestRender: vi.fn() },
      vi.fn(),
    );
    const usage = component.render(200).join("\n");

    assert.match(usage, /Additional quota \(Nimbus Quill\): 0%/);
    assert.match(usage, /\u001b\[31mAdditional quota/);
    assert.match(usage, /0% means no reported usage/);
  });

  test("uses server severity for named quota colors", () => {
    const component = createUsageDashboardComponent(
      {
        ...SNAPSHOT,
        windows: [
          {
            id: "named-warning",
            label: "Named quota",
            utilizationPercent: 10,
            resetAt: null,
            source: "limits",
            severity: "critical",
          },
        ],
      },
      false,
      undefined,
      { requestRender: vi.fn() },
      vi.fn(),
    );
    assert.match(
      component.render(200).join("\n"),
      /\u001b\[31mNamed quota: 10%/,
    );
  });

  test("renders dynamic windows, account fields, extra usage, and tab navigation", () => {
    const tui = { requestRender: vi.fn() };
    let closed = false;
    const component = createUsageDashboardComponent(
      SNAPSHOT,
      false,
      undefined,
      tui,
      () => {
        closed = true;
      },
    );

    const rendered = component.render(200);
    assert.equal(rendered[0], `\u001b[94m${"─".repeat(200)}\u001b[0m`);
    assert.equal(rendered.at(-1), `\u001b[94m${"─".repeat(200)}\u001b[0m`);
    const usage = rendered.join("\n");
    assert.match(usage, /5-hour session/);
    assert.match(usage, /Sonnet weekly/);
    assert.match(usage, /\[Usage\]/);
    assert.match(usage, /\u001b\[36m/);

    component.handleInput("\t");
    const account = component.render(200).join("\n");
    assert.match(account, /last updated:/);
    assert.match(account, /ada@example\.com/);
    assert.match(account, /member dashboard: true/);
    assert.match(account, /billing: Apple App Store/);
    assert.match(account, /check that store for renewal status/);

    component.handleInput("\t");
    const extra = component.render(200).join("\n");
    assert.match(extra, /remaining credits: 75 USD/);
    assert.match(extra, /disabled reason: spend limit reached/);
    assert.match(extra, /spent: 12.5 USD/);

    component.handleInput("\u001b[D");
    assert.match(component.render(200).join("\n"), /\[Account\]/);
    component.handleInput("q");
    assert.equal(closed, true);
    assert.equal(tui.requestRender.mock.calls.length, 3);
  });
});

describe("createUsageCommandHandler", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    consoleSpy.mockClear();
  });

  test("prints a headless report using the resolved OAuth credential", async () => {
    const fetchUsage = vi
      .fn<typeof fetchAnthropicUsage>()
      .mockResolvedValue(SNAPSHOT);
    const ctx = context("print");
    const handler = createUsageCommandHandler({
      fetchUsage,
      cache: new UsageSnapshotCache({
        now: () => new Date("2026-08-22T19:00:00Z"),
      }),
    });

    await handler("", ctx);

    assert.equal(fetchUsage.mock.calls.length, 1);
    assert.equal(consoleSpy.mock.calls.length, 1);
    assert.match(String(consoleSpy.mock.calls[0]?.[0]), /Anthropic usage/);
  });

  test("requires an OAuth credential without calling the usage client", async () => {
    const fetchUsage = vi
      .fn<typeof fetchAnthropicUsage>()
      .mockResolvedValue(SNAPSHOT);
    const ctx = context("print", "api_key");
    const handler = createUsageCommandHandler({ fetchUsage });

    await handler("", ctx);

    assert.equal(fetchUsage.mock.calls.length, 0);
    assert.equal(consoleSpy.mock.calls.length, 1);
    assert.match(
      String(consoleSpy.mock.calls[0]?.[0]),
      /OAuth login is required/,
    );
  });

  test("uses custom TUI only in TUI mode", async () => {
    const fetchUsage = vi
      .fn<typeof fetchAnthropicUsage>()
      .mockResolvedValue(SNAPSHOT);
    const ctx = context("tui");
    const handler = createUsageCommandHandler({ fetchUsage });

    await handler("", ctx);

    assert.equal(ctx.ui.custom.mock.calls.length, 1);
    assert.equal(consoleSpy.mock.calls.length, 0);
  });
});
