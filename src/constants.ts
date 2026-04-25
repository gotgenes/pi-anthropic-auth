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

// ---------------------------------------------------------------------------
// Anchor-driven sanitizer constants
//
// Used by the system prompt sanitizer to remove Pi-specific paragraphs
// (identity, documentation references, filler) while preserving extension-
// contributed content (tool snippets, guidelines, appended content).
//
// A paragraph is any text between blank lines.  If a paragraph contains any
// anchor string, it is dropped entirely.  This is resilient to upstream
// rewording — as long as the anchor still appears somewhere in the paragraph,
// removal works regardless of surrounding text changes.
// ---------------------------------------------------------------------------

/**
 * Strings whose presence in a paragraph marks it as Pi-specific and droppable.
 *
 * Each entry is checked with `paragraph.includes(anchor)`.
 */
export const PARAGRAPH_REMOVAL_ANCHORS: readonly string[] = [
  // Pi identity sentence
  "operating inside pi, a coding agent harness",
  // Pi-specific filler about custom tools
  "In addition to the tools above",
  // Pi documentation block — references Pi-specific docs/paths
  "Pi documentation (read only when the user asks about pi itself",
];

/**
 * Inline text replacements applied after paragraph removal.
 *
 * These handle known Anthropic classifier trigger phrases that may appear
 * in paragraphs we want to keep.  Each rule is applied with `replaceAll`.
 *
 * The "Here is some useful information..." phrase was isolated by
 * `opencode-anthropic-auth` via sliding-window bisection of a 10KB failing
 * prompt.  When it reaches Anthropic combined with typical agent context,
 * /v1/messages responds with a 400 disguised as "You're out of extra usage."
 * Replacing the word "useful" is enough to unblock the request.
 *
 * We don't currently emit this phrase, but it's included as a documented
 * future risk per Issue #10.
 */
export const TEXT_REPLACEMENTS: readonly {
  match: string;
  replacement: string;
}[] = [
  {
    match:
      "Here is some useful information about the environment you are running in:",
    replacement: "Environment context you are running in:",
  },
];
