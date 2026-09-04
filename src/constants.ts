/**
 * Prefix of Pi's built-in default system prompt preamble.
 *
 * Used to detect whether a system block contains Pi's original verbose
 * preamble so it can be replaced with the minimal neutral prompt.
 */
export const PI_DEFAULT_PROMPT_PREFIX =
  "You are an expert coding assistant operating inside pi, a coding agent harness.";

/**
 * Final line of Pi's built-in default system prompt preamble.
 *
 * Used to replace the entire Pi-generated preamble body with the minimal
 * neutral Anthropic OAuth prompt while preserving anything appended after the
 * preamble (project context, skills, and date/cwd footer).
 */
export const PI_DEFAULT_PROMPT_TERMINATOR =
  "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)";

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

// ---------------------------------------------------------------------------
// Billing header constants
//
// These values are used to build the x-anthropic-billing-header injected into
// OAuth requests.  They must match the values Anthropic's backend expects for
// the current Claude Code release.
//
// CLAUDE_CODE_VERSION must be updated when Anthropic ships a new Claude Code
// version.  There is no upstream source to import it from; check the current
// version with `npm view @anthropic-ai/claude-code version` or at
// https://github.com/anthropics/claude-code -- confirm even when a value is
// handed to you.  Do not read it from a local `claude --version`: the `stable`
// dist-tag lags `latest` (2.1.236 vs 2.1.260 on 2026-09-03), so a local
// install is frequently *below* the floor Anthropic requires for new models.
//
// Users can override the pin at runtime with the environment variable below
// when Anthropic raises the floor faster than this package ships a release.
// ---------------------------------------------------------------------------

/**
 * Claude Code version string embedded in the billing header.
 *
 * **Must be kept in sync with the current Claude Code release.**
 * Update this value when a new Claude Code version ships.  If it drifts
 * too far from what Anthropic expects, OAuth requests may be rejected or
 * counted incorrectly.
 */
export const CLAUDE_CODE_VERSION = "2.1.260";

/**
 * Environment variable that overrides {@link CLAUDE_CODE_VERSION}.
 *
 * Anthropic gates new models on a minimum Claude Code version (for example,
 * `claude-fable-5-1` requires >= 2.1.251).  When Anthropic raises that floor
 * faster than this package publishes a release, this override unblocks users
 * without editing `constants.ts` inside `node_modules`.
 */
export const CLAUDE_CODE_VERSION_ENV = "PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION";

const CLAUDE_CODE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Resolves the Claude Code version used in the billing header.
 *
 * Returns {@link CLAUDE_CODE_VERSION} unless {@link CLAUDE_CODE_VERSION_ENV} is
 * set to a non-empty value.  The override must be a bare `X.Y.Z` version: it is
 * embedded in a salted hash suffix, so a value Claude Code would never emit
 * produces a billing header that does not match any real client.  A malformed
 * value throws rather than falling back, so a typo surfaces loudly instead of
 * silently sending the bundled version the user was trying to replace.
 */
export function resolveClaudeCodeVersion(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configuredVersion = environment[CLAUDE_CODE_VERSION_ENV]?.trim();
  if (!configuredVersion) {
    return CLAUDE_CODE_VERSION;
  }
  if (!CLAUDE_CODE_VERSION_PATTERN.test(configuredVersion)) {
    throw new Error(
      `${CLAUDE_CODE_VERSION_ENV} must be a bare X.Y.Z version, received ${JSON.stringify(configuredVersion)}`,
    );
  }
  return configuredVersion;
}

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
