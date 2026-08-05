import type { SettingsManager } from "@earendil-works/pi-coding-agent";

export type WarningSettingsManager = Pick<
  SettingsManager,
  "getWarnings" | "setWarnings"
>;

/**
 * Suppresses Pi's OAuth extra-usage warning once pi-anthropic-auth has loaded.
 *
 * The warning is presentation-only: changing it does not change Anthropic
 * billing. Preserve all other warning preferences while disabling this one.
 *
 * @returns Whether the setting was changed.
 */
export function disableAnthropicExtraUsageWarning(
  settingsManager: WarningSettingsManager,
): boolean {
  const warnings = settingsManager.getWarnings();
  if (warnings.anthropicExtraUsage === false) {
    return false;
  }

  settingsManager.setWarnings({
    ...warnings,
    anthropicExtraUsage: false,
  });
  return true;
}
