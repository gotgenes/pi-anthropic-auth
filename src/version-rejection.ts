import { CLAUDE_CODE_VERSION_ENV } from "./claude-code-version";

// ---------------------------------------------------------------------------
// `claude_code_version_too_old` rejections
//
// Anthropic rejects an OAuth request for a gated model with a 400 whose
// `error.details.error_code` is `claude_code_version_too_old` and whose
// message names the required floor:
//
//   "Claude Code 2.1.260 does not support this model; version 2.1.280 or
//    newer is required. ..."
//
// Measured on 2026-09-23 across both gated models (n=4), the floor is always
// named this way and is inclusive.  The wording is a convention, not a
// contract, so an unparseable floor degrades to a hint rather than a guess.
// ---------------------------------------------------------------------------

const CLAUDE_CODE_VERSION_TOO_OLD = "claude_code_version_too_old";

/** Matches the floor Anthropic names, not the rejected version before it. */
const REQUIRED_VERSION_PATTERN = /version (\d+\.\d+\.\d+) or newer is required/;

const HINT_PREFIX = "[pi-anthropic-auth]";

const CURRENT_RELEASE =
  "the current Claude Code release (npm view @anthropic-ai/claude-code dist-tags)";

/** A parsed `claude_code_version_too_old` rejection body. */
export interface ClaudeCodeVersionRejection {
  /** The floor Anthropic named, when its message carries a parseable one. */
  readonly requiredVersion: string | undefined;
  /**
   * Returns the same error body with `hint` appended to `error.message`.
   *
   * Every other field — `type`, `error.type`, `error.details.error_code`,
   * `request_id` — is preserved, so consumers keyed on them are unaffected.
   */
  withHint(hint: string): string;
}

/** Why automatic recovery could not turn a rejection into a success. */
export type RecoveryHintReason =
  | {
      /** An explicit env override is absolute, so recovery never runs. */
      kind: "override";
      overrideVersion: string;
      requiredVersion: string | undefined;
    }
  | {
      /** The billing header already met the floor; Pi's own version did not. */
      kind: "upgrade-pi";
      sentVersion: string;
    }
  | {
      /** No retry was possible, or the retry was rejected too. */
      kind: "set-override";
      requiredVersion: string | undefined;
    }
  | {
      /**
       * The request carried no billing header, so Anthropic read Pi's own
       * `claude-cli` user-agent, which neither the pin nor the override changes.
       */
      kind: "no-billing-header";
      userAgentVersion: string | undefined;
    };

/**
 * Parses a response body as a `claude_code_version_too_old` rejection.
 *
 * Returns `undefined` for anything else — a non-JSON body, another error
 * code, or a body with no `error` object — so the caller leaves that response
 * untouched.
 */
export function readClaudeCodeVersionRejection(
  bodyText: string,
): ClaudeCodeVersionRejection | undefined {
  const body = parseJsonRecord(bodyText);
  const error = body?.error;
  if (!body || !isRecord(error)) return undefined;

  const details = error.details;
  if (
    !isRecord(details) ||
    details.error_code !== CLAUDE_CODE_VERSION_TOO_OLD
  ) {
    return undefined;
  }

  const message = typeof error.message === "string" ? error.message : "";

  return {
    requiredVersion: REQUIRED_VERSION_PATTERN.exec(message)?.[1],
    withHint(hint) {
      return JSON.stringify({
        ...body,
        error: { ...error, message: message ? `${message} ${hint}` : hint },
      });
    },
  };
}

/** Renders the user-facing hint appended to an unrecovered rejection. */
export function describeRecoveryHint(reason: RecoveryHintReason): string {
  switch (reason.kind) {
    case "override":
      return `${HINT_PREFIX} ${CLAUDE_CODE_VERSION_ENV}=${reason.overrideVersion} is sent verbatim; raise it to ${
        reason.requiredVersion
          ? `${reason.requiredVersion} or newer`
          : CURRENT_RELEASE
      }, or unset it to let pi-anthropic-auth recover automatically.`;
    case "upgrade-pi":
      return `${HINT_PREFIX} The billing header already reported ${reason.sentVersion}; this rejection likely comes from Pi's own claude-cli version. Upgrade Pi.`;
    case "set-override":
      return `${HINT_PREFIX} Automatic recovery did not succeed; set ${
        reason.requiredVersion
          ? `${CLAUDE_CODE_VERSION_ENV}=${reason.requiredVersion}`
          : `${CLAUDE_CODE_VERSION_ENV} to ${CURRENT_RELEASE}`
      } and retry.`;
    case "no-billing-header":
      return `${HINT_PREFIX} This request carried no billing header, so Anthropic checked Pi's own claude-cli version${
        reason.userAgentVersion ? ` (${reason.userAgentVersion})` : ""
      }. Upgrade Pi.`;
  }
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
