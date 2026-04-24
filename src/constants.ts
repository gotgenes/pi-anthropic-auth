/**
 * Prefix of Pi's built-in default system prompt preamble.
 *
 * Used to detect whether a system block contains Pi's original verbose
 * preamble so it can be replaced with the minimal neutral prompt.
 */
export const PI_DEFAULT_PROMPT_PREFIX =
  "You are an expert coding assistant operating inside pi, a coding agent harness.";

/**
 * Prefix of the minimal neutral Anthropic OAuth system prompt.
 *
 * Used as a detection marker in request shaping to identify system blocks
 * that have already been shaped.  Must match the first line of
 * MINIMAL_ANTHROPIC_OAUTH_PROMPT.
 */
export const MINIMAL_ANTHROPIC_OAUTH_PROMPT_PREFIX =
  "You are an expert coding assistant.";

/**
 * Minimal neutral system prompt used for Anthropic OAuth requests.
 *
 * Replaces Pi's verbose default preamble to avoid prompt fingerprinting
 * while preserving any project context that follows.
 */
export const MINIMAL_ANTHROPIC_OAUTH_PROMPT = [
  MINIMAL_ANTHROPIC_OAUTH_PROMPT_PREFIX,
  "Be concise and helpful.",
  "Use the available tools to answer the user's request.",
  "Show file paths clearly when working with files.",
].join("\n");

/**
 * Prefix of Claude Code's identity injection block.
 *
 * Used to detect OAuth Anthropic payloads built by Pi's built-in Anthropic
 * provider, which injects a "You are Claude Code, Anthropic's official CLI"
 * system block for OAuth sessions.
 */
export const CLAUDE_CODE_IDENTITY_PREFIX =
  "You are Claude Code, Anthropic's official CLI";

// ---------------------------------------------------------------------------
// Billing header constants
//
// These values are used to build the x-anthropic-billing-header injected into
// OAuth requests.  They must match the values Anthropic's backend expects for
// the current Claude Code release.
//
// CLAUDE_CODE_VERSION must be updated when Anthropic ships a new Claude Code
// version.  There is no upstream source to import it from; check the current
// version at https://github.com/anthropics/claude-code or in a working Claude
// Code installation (`claude --version`).
// ---------------------------------------------------------------------------

/**
 * Claude Code version string embedded in the billing header.
 *
 * **Must be kept in sync with the current Claude Code release.**
 * Update this value when a new Claude Code version ships.  If it drifts
 * too far from what Anthropic expects, OAuth requests may be rejected or
 * counted incorrectly.
 */
export const CLAUDE_CODE_VERSION = "2.1.108";

/** Salt used in the billing header suffix hash. */
export const BILLING_HEADER_SALT = "59cf53e54c78";

/** Character positions sampled from the first user message for the billing hash. */
export const BILLING_HEADER_POSITIONS = [4, 7, 20] as const;

/** Entrypoint identifier included in the billing header. */
export const CLAUDE_CODE_ENTRYPOINT = "sdk-cli";
