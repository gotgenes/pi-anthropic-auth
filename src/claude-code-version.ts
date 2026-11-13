// ---------------------------------------------------------------------------
// Claude Code version
//
// Anthropic gates newly released models on a minimum Claude Code version and
// rejects OAuth requests below it with `error_code: claude_code_version_too_old`.
// The version this extension reports in its billing header is what Anthropic
// keys on, so this module decides whether a new model works at all.
//
// There is no upstream source to import the pin from -- pi-ai's own
// `claudeCodeVersion` is module-private.  Check the current release with
// `npm view @anthropic-ai/claude-code version`, and confirm it even when a
// value is handed to you.  Do not read it from a local `claude --version`:
// the `stable` dist-tag lags `latest` (2.1.267 vs 2.1.280 on 2026-09-22), so
// a local install is frequently *below* the floor Anthropic requires for new
// models.
//
// Known floors: claude-fable-5-1 requires >= 2.1.251; claude-opus-5-5
// requires >= 2.1.280.  claude-sonnet-5-5 accepts 2.1.280 with no rejection
// (measured live on pi 0.99.1; no floor named).
// ---------------------------------------------------------------------------

/**
 * Claude Code version string embedded in the billing header.
 *
 * **Must be kept in sync with the current Claude Code release.**
 * Update this value when a new Claude Code version ships.  If it drifts
 * too far from what Anthropic expects, OAuth requests may be rejected or
 * counted incorrectly.
 */
export const CLAUDE_CODE_VERSION = "2.1.323";

/**
 * Environment variable that overrides {@link CLAUDE_CODE_VERSION}.
 *
 * Anthropic gates new models on a minimum Claude Code version (for example,
 * `claude-opus-5-5` requires >= 2.1.280).  When Anthropic raises that floor
 * faster than this package publishes a release, this override unblocks users
 * without editing `claude-code-version.ts` inside `node_modules`.
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

/**
 * Reports whether an explicit {@link CLAUDE_CODE_VERSION_ENV} override is set.
 *
 * An override is absolute: `src/billing-version-sync.ts` consults this to
 * leave a user's pin alone rather than raising it from Pi's reported version.
 */
export function hasClaudeCodeVersionOverride(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(environment[CLAUDE_CODE_VERSION_ENV]?.trim());
}

/**
 * Matches the `claude-cli/X.Y.Z` token in a `user-agent` header.
 *
 * The leading boundary keeps `notclaude-cli/2.1.280` from matching, and the
 * trailing boundary rejects a version with extra components.
 */
const CLAUDE_CLI_USER_AGENT_PATTERN =
  /(?:^|\s)claude-cli\/(\d+\.\d+\.\d+)(?=\s|$)/;

/**
 * Reads the Claude Code version out of Pi's own `user-agent` header.
 *
 * Pi's built-in Anthropic transport sends `user-agent: claude-cli/<version>`
 * from a module-private constant, so this header is the only runtime handle on
 * the version Pi believes it is.  Returns `undefined` when the header is
 * absent, belongs to another client, or carries a version this package would
 * not emit itself.
 */
export function readClaudeCliVersion(
  userAgent: string | null | undefined,
): string | undefined {
  if (!userAgent) {
    return undefined;
  }
  return CLAUDE_CLI_USER_AGENT_PATTERN.exec(userAgent)?.[1];
}

/**
 * Returns whichever of two `X.Y.Z` versions is higher, comparing numerically.
 *
 * `baseline` wins ties and wins outright when `candidate` is absent or is not
 * a bare `X.Y.Z` version: an unparseable upstream signal must never lower the
 * version this package reports.
 */
export function higherVersion(
  baseline: string,
  candidate: string | undefined,
): string {
  if (!candidate || !CLAUDE_CODE_VERSION_PATTERN.test(candidate)) {
    return baseline;
  }

  const baselineParts = baseline.split(".").map(Number);
  const candidateParts = candidate.split(".").map(Number);

  for (let index = 0; index < candidateParts.length; index += 1) {
    const baselinePart = baselineParts[index] ?? 0;
    const candidatePart = candidateParts[index] ?? 0;
    if (candidatePart !== baselinePart) {
      return candidatePart > baselinePart ? candidate : baseline;
    }
  }

  return baseline;
}

/**
 * The highest Claude Code version Anthropic has demanded this process.
 *
 * `src/billing-version-sync.ts` teaches it the floor named in a
 * `claude_code_version_too_old` rejection, and applies it to every later
 * request, so only the first request after a floor rise pays the rejected
 * round trip.  One floor serves every model: a floor Anthropic names is a
 * released Claude Code version, which real Claude Code sends to every model.
 */
export interface LearnedClaudeCodeFloor {
  /** Raises the floor; a lower, equal, or unparseable version is ignored. */
  learn(version: string): void;
  /** Returns `version` raised to the learned floor, if one has been learned. */
  applyTo(version: string): string;
}

export function createLearnedClaudeCodeFloor(): LearnedClaudeCodeFloor {
  let learned: string | undefined;

  return {
    learn(version) {
      if (!CLAUDE_CODE_VERSION_PATTERN.test(version)) return;
      learned = learned ? higherVersion(learned, version) : version;
    },
    applyTo(version) {
      return higherVersion(version, learned);
    },
  };
}
