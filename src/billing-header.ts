import { createHash } from "node:crypto";
import type { MessageParam } from "./anthropic-message";

// ---------------------------------------------------------------------------
// Billing header construction
//
// The `x-anthropic-billing-header` system block identifies the request as
// Claude Code usage.  Without it, Anthropic classifies an OAuth request as
// third-party app usage and rejects it with a 400 disguised as
// "You're out of extra usage."
//
// The recipe below must match what Anthropic's backend expects.  The version
// is a parameter rather than a module constant so the transport can rebuild
// the same header at a different version (see `src/claude-code-version.ts`).
// ---------------------------------------------------------------------------

/** Salt used in the billing header suffix hash. */
export const BILLING_HEADER_SALT = "59cf53e54c78";

/** Character positions sampled from the first user message for the billing hash. */
export const BILLING_HEADER_POSITIONS = [4, 7, 20] as const;

/**
 * Entrypoint identifier included in the billing header (`cc_entrypoint`).
 *
 * Claude Code sends `sdk-cli` from print mode (`claude -p`) and `cli` from
 * its interactive app (observed on 2.1.309).  `sdk-cli` seems the closer fit
 * for a program driving the model.
 *
 * Users have reported `sdk-*` labels drawing down the 5-hour window faster
 * (https://github.com/anthropics/claude-code/issues/97074); Anthropic has not
 * said whether that is intended.  See Issue #83 before changing this value.
 */
export const CLAUDE_CODE_ENTRYPOINT = "sdk-cli";

/** Prefix every billing header carries, used to detect an already-shaped block. */
export const BILLING_HEADER_MARKER = "x-anthropic-billing-header:";

/**
 * Returns the text of the first user message, which seeds the billing hash.
 *
 * Returns the empty string when the payload carries no user message with text
 * content; callers treat that as "no billing header to build".
 */
export function getFirstUserText(messages: MessageParam[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return "";

  if (typeof firstUserMessage.content === "string") {
    return firstUserMessage.content;
  }

  if (!Array.isArray(firstUserMessage.content)) {
    return "";
  }

  const firstTextBlock = firstUserMessage.content.find(
    (block) => block.type === "text" && typeof block.text === "string",
  );

  return typeof firstTextBlock?.text === "string" ? firstTextBlock.text : "";
}

/**
 * Builds the `x-anthropic-billing-header` value for a request.
 *
 * Returns `undefined` when there is no first user text to hash, since the
 * header's `cch` field is derived from it.
 */
export function buildBillingHeaderValue(
  messageText: string,
  claudeCodeVersion: string,
): string | undefined {
  if (!messageText) {
    return undefined;
  }

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
    BILLING_HEADER_MARKER,
    `cc_version=${claudeCodeVersion}.${suffix};`,
    `cc_entrypoint=${CLAUDE_CODE_ENTRYPOINT};`,
    `cch=${cch};`,
  ].join(" ");
}
