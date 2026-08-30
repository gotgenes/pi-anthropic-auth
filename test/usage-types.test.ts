import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  normalizeProfileResponse,
  normalizeUsageResponse,
} from "#src/usage-types";

describe("normalizeUsageResponse", () => {
  test("normalizes legacy quota windows", () => {
    const result = normalizeUsageResponse({
      five_hour: { utilization: 12.5, resets_at: "2026-08-22T20:00:00Z" },
      seven_day: { utilization: 34, resets_at: "2026-08-29T20:00:00Z" },
      seven_day_sonnet: {
        utilization: 56,
        resets_at: "2026-08-29T20:00:00Z",
      },
    });

    assert.deepEqual(result.windows, [
      {
        id: "five_hour",
        label: "5-hour session",
        utilizationPercent: 12.5,
        resetAt: "2026-08-22T20:00:00Z",
        source: "five_hour",
      },
      {
        id: "seven_day",
        label: "7-day all models",
        utilizationPercent: 34,
        resetAt: "2026-08-29T20:00:00Z",
        source: "seven_day",
      },
      {
        id: "seven_day_sonnet",
        label: "Sonnet weekly",
        utilizationPercent: 56,
        resetAt: "2026-08-29T20:00:00Z",
        source: "seven_day_sonnet",
        model: "sonnet",
      },
    ]);
  });

  test("prefers limits and hides opaque Nimbus quota data", () => {
    const result = normalizeUsageResponse({
      five_hour: { utilization: 12, resets_at: "2026-08-22T20:00:00Z" },
      nimbus_quill: { utilization: 25, resets_at: null },
      limits: [
        {
          kind: "session",
          group: "session",
          percent: 40,
          resets_at: "2026-08-22T20:00:00Z",
          is_active: true,
        },
        {
          kind: "weekly_scoped",
          group: "weekly",
          percent: 0,
          resets_at: null,
          scope: { model: { display_name: "Fable" }, surface: null },
        },
      ],
    });

    assert.deepEqual(result.windows, [
      {
        id: "limits:0",
        label: "5-hour session",
        utilizationPercent: 40,
        resetAt: "2026-08-22T20:00:00Z",
        source: "limits",
        isActive: true,
      },
      {
        id: "limits:1",
        label: "Fable weekly",
        utilizationPercent: 0,
        resetAt: null,
        source: "limits",
        model: "Fable",
      },
    ]);
  });

  test("uses legacy windows when limits are absent", () => {
    const result = normalizeUsageResponse({
      nimbus_quill: { utilization: 25, resets_at: null },
      seven_day_sonnet: {
        utilization: 56,
        resets_at: "2026-08-29T20:00:00Z",
      },
    });

    assert.deepEqual(result.windows, [
      {
        id: "seven_day_sonnet",
        label: "Sonnet weekly",
        utilizationPercent: 56,
        resetAt: "2026-08-29T20:00:00Z",
        source: "seven_day_sonnet",
        model: "sonnet",
      },
    ]);
  });

  test("normalizes extra usage without converting missing values to zero", () => {
    const result = normalizeUsageResponse({
      extra_usage: {
        is_enabled: true,
        monthly_limit: 100,
        used_credits: 25,
        utilization: 25,
        currency: "USD",
        decimal_places: 2,
        disabled_reason: null,
        user_disabled: false,
        spend_limit_reached: false,
        credits_ever_enabled: true,
      },
      spend: {
        used: { amount_minor: 1250, currency: "USD", exponent: 2 },
        limit: { amount_minor: 5000, currency: "USD", exponent: 2 },
        percent: 25,
        enabled: true,
        disabled_reason: null,
        can_purchase_credits: true,
        can_toggle: false,
        disclaimer: "Usage credits apply after included usage.",
      },
      member_dashboard_available: true,
    });

    assert.deepEqual(result.extraUsage, {
      enabled: true,
      monthlyLimit: 100,
      usedCredits: 25,
      utilizationPercent: 25,
      currency: "USD",
      decimalPlaces: 2,
      disabledReason: null,
      userDisabled: false,
      spendLimitReached: false,
      creditsEverEnabled: true,
    });
    assert.deepEqual(result.spend, {
      usedMinor: 1250,
      limitMinor: 5000,
      currency: "USD",
      exponent: 2,
      utilizationPercent: 25,
      enabled: true,
      disabledReason: null,
      canPurchaseCredits: true,
      canToggle: false,
      disclaimer: "Usage credits apply after included usage.",
    });
    assert.equal(result.memberDashboardAvailable, true);
  });

  test("preserves zero utilization as a real value", () => {
    const result = normalizeUsageResponse({
      five_hour: { utilization: 0, resets_at: null },
    });

    assert.equal(result.windows[0]?.utilizationPercent, 0);
  });
});

describe("normalizeProfileResponse", () => {
  test("normalizes account and organization identity", () => {
    const result = normalizeProfileResponse({
      account: {
        uuid: "account-1",
        full_name: "Ada Lovelace",
        display_name: "Ada",
        email: "ada@example.com",
        has_claude_max: true,
        has_claude_pro: false,
        created_at: "2026-01-01T00:00:00Z",
      },
      organization: {
        uuid: "org-1",
        name: "Analytical Engines",
        organization_type: "claude_ai",
        billing_type: "subscription",
        rate_limit_tier: "default_claude_max_5x",
        seat_tier: null,
        has_extra_usage_enabled: true,
        subscription_status: "active",
      },
    });

    assert.deepEqual(result, {
      accountUuid: "account-1",
      fullName: "Ada Lovelace",
      displayName: "Ada",
      email: "ada@example.com",
      hasClaudeMax: true,
      hasClaudePro: false,
      createdAt: "2026-01-01T00:00:00Z",
      organizationUuid: "org-1",
      organizationName: "Analytical Engines",
      organizationType: "claude_ai",
      billingType: "subscription",
      rateLimitTier: "default_claude_max_5x",
      seatTier: null,
      hasExtraUsageEnabled: true,
      subscriptionStatus: "active",
    });
  });

  test("returns an empty normalized profile for missing optional objects", () => {
    assert.deepEqual(normalizeProfileResponse({}), {});
  });
});
