import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";
import {
  disableAnthropicExtraUsageWarning,
  type WarningSettingsManager,
} from "#src/anthropic-extra-usage-warning";

describe("disableAnthropicExtraUsageWarning", () => {
  test("disables the warning while preserving other preferences", () => {
    const setWarnings = vi.fn();
    const settingsManager = {
      getWarnings: () => ({ otherWarning: true }),
      setWarnings,
    };

    const changed = disableAnthropicExtraUsageWarning(
      settingsManager as WarningSettingsManager,
    );

    assert.equal(changed, true);
    assert.deepEqual(setWarnings.mock.calls, [
      [{ otherWarning: true, anthropicExtraUsage: false }],
    ]);
  });

  test("does not rewrite settings when the warning is already disabled", () => {
    const setWarnings = vi.fn();
    const settingsManager = {
      getWarnings: () => ({ anthropicExtraUsage: false }),
      setWarnings,
    };

    const changed = disableAnthropicExtraUsageWarning(settingsManager);

    assert.equal(changed, false);
    assert.equal(setWarnings.mock.calls.length, 0);
  });
});
