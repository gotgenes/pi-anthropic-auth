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

// ---------------------------------------------------------------------------
// Extra shaped providers
//
// Pi applies an extension's `streamSimple` per provider *name*, so wrapping
// the built-in `anthropic` provider leaves any other Anthropic OAuth provider
// on Pi's bare built-in transport.  Extensions that register additional
// Claude subscriptions under their own names -- pi-multi-pass registers
// `anthropic-2`, `anthropic-3`, ... -- therefore send OAuth requests with no
// billing header and no prompt shaping, which Anthropic answers with a
// 400 "You're out of extra usage." once the prompt is a real agent prompt.
//
// There is no host API that enumerates extension-registered providers, so the
// extra names are named explicitly by the user.
// ---------------------------------------------------------------------------

/**
 * Environment variable naming additional providers to shape.
 *
 * Comma-separated provider names, for example
 * `PI_ANTHROPIC_AUTH_PROVIDERS=anthropic-2,anthropic-3`.  Each named provider
 * is registered with the same OAuth transport wrapper as `anthropic`, so its
 * requests are shaped whenever they carry an `sk-ant-oat` token.
 */
export const EXTRA_PROVIDERS_ENV = "PI_ANTHROPIC_AUTH_PROVIDERS";

/**
 * Provider names Pi accepts: the shape its own providers and the
 * `provider/model` model selector use.
 */
const PROVIDER_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * Resolves the extra provider names to wrap alongside `anthropic`.
 *
 * Entries are trimmed, de-duplicated, and `anthropic` is dropped because it is
 * always wrapped.  A malformed entry throws rather than being skipped: a typo
 * would otherwise leave that provider silently unshaped, which is the exact
 * failure this setting exists to fix.
 */
export function resolveExtraProviderNames(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const configured = environment[EXTRA_PROVIDERS_ENV]?.trim();
  if (!configured) {
    return [];
  }

  const names: string[] = [];
  for (const entry of configured.split(",")) {
    const name = entry.trim();
    if (name.length === 0) {
      continue;
    }
    if (!PROVIDER_NAME_PATTERN.test(name)) {
      throw new Error(
        `${EXTRA_PROVIDERS_ENV} entries must be provider names, received ${JSON.stringify(name)}`,
      );
    }
    if (name === "anthropic" || names.includes(name)) {
      continue;
    }
    names.push(name);
  }

  return names;
}

/** Salt used in the billing header suffix hash. */
export const BILLING_HEADER_SALT = "59cf53e54c78";

/** Character positions sampled from the first user message for the billing hash. */
export const BILLING_HEADER_POSITIONS = [4, 7, 20] as const;

/** Entrypoint identifier included in the billing header. */
export const CLAUDE_CODE_ENTRYPOINT = "sdk-cli";

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
// Anchors stay resilient to upstream rewording — as long as the anchor still
// appears in the section, the rule fires regardless of surrounding changes.
// `test/upstream-prompt-drift.test.ts` checks each one against the installed
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
 * Marks the `tools` section's trailing filler sentence about custom tools.
 *
 * The paragraph containing it is dropped; the section and its tool snippets
 * are kept, because extensions contribute those (Issue #10).
 */
export const PI_TOOLS_FILLER_ANCHOR = "In addition to the tools above";

/**
 * Marks a `docs` section as Pi's own documentation block.
 *
 * Extensions may register a section named `docs` of their own, and upstream
 * applies custom sections after the built-ins, so the section is dropped on
 * this anchor rather than on its name alone.
 */
export const PI_DOCS_SECTION_ANCHOR =
  "Pi documentation (read only when the user asks about pi itself";

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
