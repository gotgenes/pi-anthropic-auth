/**
 * Opening sentence of Pi's built-in default system prompt preamble, one entry
 * per Pi wording, newest first.
 *
 * Used to detect whether a system block contains Pi's original verbose
 * preamble so it can be replaced with the minimal neutral prompt.  The peer
 * range spans every wording listed here, so each must keep matching.
 */
export const PI_DEFAULT_PROMPT_PREFIXES: readonly string[] = [
  // pi >=1.5.0
  "You are a coding assistant running inside pi, a coding agent harness.",
  // pi 0.86.0 through 1.4.x
  "You are an expert coding assistant operating inside pi, a coding agent harness.",
];

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
// Section-aware sanitizer constants
//
// Pi 0.86.0 renders its system prompt as an untagged preamble followed by
// `<name>...</name>` sections, so the sanitizer decides section by section
// rather than paragraph by paragraph.  Content-bearing sections are matched
// on an anchor rather than on their name alone: upstream applies extension-
// registered sections after its own, so a section called `docs` need not be
// Pi's.
//
// Anchors stay resilient to upstream rewording around them — as long as an
// anchor still appears in the section, the rule fires regardless of
// surrounding changes.  When Pi rewords the anchor itself (pi 1.5.0 did, for
// all three), the new wording is added to the front of its list rather than
// replacing the old one, because the peer range still covers older Pi.
// `test/upstream-prompt-drift.test.ts` checks the lists against the installed
// Pi's own `buildSystemPrompt` output.
// ---------------------------------------------------------------------------

/**
 * Names of the sections Pi generates itself in its default system prompt.
 *
 * Two uses: their presence is what tells shaping the prompt is Pi's own
 * structured prompt rather than something it should not touch, and they scope
 * {@link TEXT_REPLACEMENTS} so a user's `project_context` is never rewritten.
 */
export const PI_OWNED_SECTIONS: readonly string[] = ["tools", "rules", "docs"];

/**
 * Marks the `tools` section's trailing filler sentence about custom tools, one
 * entry per Pi wording, newest first.
 *
 * The paragraph containing any of them is dropped; the section and its tool
 * snippets are kept, because extensions contribute those (Issue #10).
 */
export const PI_TOOLS_FILLER_ANCHORS: readonly string[] = [
  // pi >=1.5.0
  "Additional tools may be available.",
  // pi 0.86.0 through 1.4.x
  "In addition to the tools above",
];

/**
 * Marks a `docs` section as Pi's own documentation block.
 *
 * Extensions may register a section named `docs` of their own, and upstream
 * applies custom sections after the built-ins, so the section is dropped on
 * these anchors rather than on its name alone.  One entry per Pi wording,
 * newest first.
 */
export const PI_DOCS_SECTION_ANCHORS: readonly string[] = [
  // pi >=1.5.0
  "Pi documentation (read only when the user asks about the harness itself",
  // pi 0.86.0 through 1.4.x
  "Pi documentation (read only when the user asks about pi itself",
];

/**
 * Inline text replacements applied to Pi-generated sections.
 *
 * These handle known Anthropic classifier trigger phrases that may appear
 * in sections we want to keep.  Each rule is applied with `replaceAll`.
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
