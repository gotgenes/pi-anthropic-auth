import { createHash } from "node:crypto";
import { onTestFinished } from "vitest";

import {
  BILLING_HEADER_POSITIONS,
  BILLING_HEADER_SALT,
} from "#src/billing-header";
import {
  CLAUDE_CODE_VERSION,
  CLAUDE_CODE_VERSION_ENV,
} from "#src/claude-code-version";

/**
 * Sets the Claude Code version override for one test and restores the previous
 * value (including "was unset") when the test finishes.
 */
export function withVersionOverride(value: string): void {
  const previous = process.env[CLAUDE_CODE_VERSION_ENV];
  process.env[CLAUDE_CODE_VERSION_ENV] = value;
  onTestFinished(() => {
    if (previous === undefined) {
      delete process.env.PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION;
      return;
    }
    process.env[CLAUDE_CODE_VERSION_ENV] = previous;
  });
}

/**
 * Rebuilds the expected billing header independently of production code.
 *
 * This is deliberately a second implementation of the hashing recipe rather
 * than a call into `buildBillingHeaderValue`: it is the oracle that would
 * catch a change to that recipe, so importing the function under test would
 * make every assertion vacuous.
 */
export function buildExpectedBillingHeader(
  messageText: string,
  claudeCodeVersion: string = CLAUDE_CODE_VERSION,
): string {
  const cch = createHash("sha256")
    .update(messageText)
    .digest("hex")
    .slice(0, 5);
  const sampledCharacters = BILLING_HEADER_POSITIONS.map(
    (index) => messageText[index] || "0",
  ).join("");
  const suffix = createHash("sha256")
    .update(`${BILLING_HEADER_SALT}${sampledCharacters}${claudeCodeVersion}`)
    .digest("hex")
    .slice(0, 3);

  return [
    "x-anthropic-billing-header:",
    `cc_version=${claudeCodeVersion}.${suffix};`,
    // Deliberate pin, not a stale fixture: see CLAUDE_CODE_ENTRYPOINT (Issue #83).
    "cc_entrypoint=sdk-cli;",
    `cch=${cch};`,
  ].join(" ");
}
