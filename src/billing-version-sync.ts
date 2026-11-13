import type { FetchFunction } from "@earendil-works/pi-ai";
import type { MessageParam } from "./anthropic-message";
import {
  BILLING_HEADER_MARKER,
  buildBillingHeaderValue,
  getFirstUserText,
} from "./billing-header";
import {
  hasClaudeCodeVersionOverride,
  higherVersion,
  type LearnedClaudeCodeFloor,
  readClaudeCliVersion,
  resolveClaudeCodeVersion,
} from "./claude-code-version";
import { debugLog } from "./debug";
import {
  type ClaudeCodeVersionRejection,
  describeRecoveryHint,
  type RecoveryHintReason,
  readClaudeCodeVersionRejection,
} from "./version-rejection";

/**
 * Per-request reconciliation of our `cc_version` with Pi's reported one.
 *
 * Two independent Claude Code version signals reach Anthropic on an OAuth
 * request: Pi's `user-agent: claude-cli/<version>`, and the `cc_version` in
 * the billing header this extension injects.  Anthropic gates new models on
 * the billing header when it is present, so a stale pin blocks a model even
 * when the host Pi is new enough.
 *
 * The bundled pin is a *floor*: when Pi reports a higher version, the
 * billing header is rebuilt at Pi's version on the way out.  When Pi is at or
 * below the pin — pi-ai 0.86.0 and pi 0.87.0 both report 2.1.251 — the
 * request is sent exactly as shaping produced it.
 *
 * When Anthropic raises a model's floor above both Pi and the pin, it rejects
 * the request as `claude_code_version_too_old` and names the floor (Issue
 * #75).  The sync then retries once with the billing header at that floor,
 * and teaches it to the shared {@link LearnedClaudeCodeFloor} so later
 * requests go out at it directly.  Only a 400 is ever read, and only through
 * a clone, so the streaming success path is untouched.
 *
 * A rejected request that carried no billing header is neither retried nor
 * learned from: Anthropic gated Pi's own user-agent, so the hint says to
 * upgrade Pi (Issue #86).
 */
export interface BillingVersionSync {
  /**
   * Records the payload whose billing header may need rebuilding.
   *
   * Called from the transport's `onPayload`, which runs before `fetch` on the
   * same request, so the two share this object's closure.
   */
  recordRequest(payload: unknown): void;

  /**
   * Drop-in `fetch` that raises `cc_version` to Pi's reported version and
   * recovers from a `claude_code_version_too_old` rejection.
   *
   * Pi's version is only observable here: the `user-agent` header is added by
   * pi-ai's own `createClient`, downstream of every other seam this extension
   * can reach.
   */
  fetch: FetchFunction;
}

export function createBillingVersionSync(
  learnedFloor: LearnedClaudeCodeFloor,
  baseFetch?: FetchFunction,
): BillingVersionSync {
  let firstUserText = "";

  /**
   * Returns `body` with its billing header moved from `fromVersion` to
   * `toVersion`, or `undefined` when the body cannot be rebuilt.
   *
   * Every bail-out is deliberate: we never construct a body we cannot verify
   * against the exact header string shaping emitted moments earlier.
   */
  function rebuildBody(
    body: BodyInit | null | undefined,
    fromVersion: string,
    toVersion: string,
  ): string | undefined {
    if (!firstUserText || typeof body !== "string") return undefined;

    const fromHeader = buildBillingHeaderValue(firstUserText, fromVersion);
    const toHeader = buildBillingHeaderValue(firstUserText, toVersion);
    if (!fromHeader || !toHeader || !body.includes(fromHeader)) {
      return undefined;
    }

    return body.replace(fromHeader, toHeader);
  }

  /**
   * The version this request's billing header should carry: the pin raised
   * to Pi's reported version and to any learned floor.  An explicit user pin
   * is absolute and is never raised.
   */
  function targetVersion(userAgent: string | undefined): string {
    const pinned = resolveClaudeCodeVersion();
    if (hasClaudeCodeVersionOverride()) return pinned;
    return learnedFloor.applyTo(
      higherVersion(pinned, readClaudeCliVersion(userAgent)),
    );
  }

  const syncFetch = (async (input, init) => {
    const dispatch = baseFetch ?? globalThis.fetch;
    const pinned = resolveClaudeCodeVersion();
    const userAgent = readUserAgent(input, init);
    const target = targetVersion(userAgent);
    const upgraded =
      target === pinned ? undefined : rebuildBody(init?.body, pinned, target);
    const sentInit =
      upgraded === undefined ? init : { ...init, body: upgraded };
    // When the upgrade could not be verified, the body still carries the pin.
    const sentVersion = upgraded === undefined ? pinned : target;

    const response = await dispatch(input, sentInit);
    const rejection = await readVersionRejection(response);
    if (!rejection) return response;

    // Checked before `planRecovery`, which would learn the floor and blame
    // the override: without our header, Anthropic gated Pi's user-agent, so
    // neither the floor nor the override bears on it.  A retry body always
    // carries the header, so only this first rejection can be header-less.
    if (lacksBillingHeader(sentInit?.body)) {
      return hintedResponse(response, rejection, {
        kind: "no-billing-header",
        userAgentVersion: readClaudeCliVersion(userAgent),
      });
    }

    const recovery = planRecovery(rejection, sentInit?.body, sentVersion);
    if (recovery.kind === "hint") {
      return hintedResponse(response, rejection, recovery.reason);
    }

    debugLog("claude-code-version-recovery", {
      sentVersion,
      requiredVersion: recovery.requiredVersion,
    });
    await response.body?.cancel();
    const retried = await dispatch(input, { ...sentInit, body: recovery.body });
    const retryRejection = await readVersionRejection(retried);
    if (!retryRejection) return retried;

    // One retry only: a second rejection is explained, never chased.
    const second = planRecovery(
      retryRejection,
      recovery.body,
      recovery.requiredVersion,
    );
    return hintedResponse(
      retried,
      retryRejection,
      second.kind === "hint"
        ? second.reason
        : { kind: "set-override", requiredVersion: second.requiredVersion },
    );
  }) as FetchFunction;

  /**
   * Decides whether a rejected request can be retried at the floor Anthropic
   * named, and if not, which hint explains why.
   *
   * A named floor is learned even when this request cannot be retried, so the
   * next request goes out at it.  An explicit user pin is absolute, so it is
   * neither retried nor taught to the floor.
   */
  function planRecovery(
    rejection: ClaudeCodeVersionRejection,
    sentBody: BodyInit | null | undefined,
    sentVersion: string,
  ): Recovery {
    const required = rejection.requiredVersion;
    if (hasClaudeCodeVersionOverride()) {
      return hint({
        kind: "override",
        overrideVersion: resolveClaudeCodeVersion(),
        requiredVersion: required,
      });
    }
    if (!required)
      return hint({ kind: "set-override", requiredVersion: undefined });

    learnedFloor.learn(required);
    const body = rebuildBody(sentBody, sentVersion, required);
    if (body === undefined) {
      return hint({ kind: "set-override", requiredVersion: required });
    }
    if (higherVersion(sentVersion, required) === sentVersion) {
      return hint({ kind: "upgrade-pi", sentVersion });
    }
    return { kind: "retry", body, requiredVersion: required };
  }

  return {
    recordRequest(payload) {
      firstUserText =
        isRecord(payload) && Array.isArray(payload.messages)
          ? getFirstUserText(payload.messages as MessageParam[])
          : "";
    },
    fetch: syncFetch,
  };
}

/**
 * True when a request body provably carries no billing header.
 *
 * pi-ai >=1.5.0 sends message-thread continuations without `system`, and
 * shaping adds no header when the first user message has no text.  A body
 * that is not a string cannot be inspected, so it is not reported as
 * header-less.
 */
function lacksBillingHeader(body: BodyInit | null | undefined): boolean {
  return typeof body === "string" && !body.includes(BILLING_HEADER_MARKER);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reads a response as a `claude_code_version_too_old` rejection.
 *
 * Only a 400 is inspected, and only through a clone, so a streaming success
 * response and any other error reach the SDK exactly as received.
 */
async function readVersionRejection(
  response: Response,
): Promise<ClaudeCodeVersionRejection | undefined> {
  if (response.status !== 400) return undefined;
  return readClaudeCodeVersionRejection(await response.clone().text());
}

/** What to do about a `claude_code_version_too_old` rejection. */
type Recovery =
  | { kind: "retry"; body: string; requiredVersion: string }
  | { kind: "hint"; reason: RecoveryHintReason };

function hint(reason: RecoveryHintReason): Recovery {
  return { kind: "hint", reason };
}

/**
 * Rebuilds a rejection with the recovery hint appended to `error.message`.
 *
 * Status and headers are kept, so the SDK still raises the same
 * `BadRequestError` with the same `request-id`.  `content-length` and
 * `content-encoding` are dropped because the new body is decoded and
 * differently sized.
 */
async function hintedResponse(
  response: Response,
  rejection: ClaudeCodeVersionRejection,
  reason: RecoveryHintReason,
): Promise<Response> {
  await response.body?.cancel();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(rejection.withHint(describeRecoveryHint(reason)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Reads the `user-agent` header off whichever argument carries it. */
function readUserAgent(
  input: Parameters<FetchFunction>[0],
  init: RequestInit | undefined,
): string | undefined {
  const source =
    init?.headers ?? (input instanceof Request ? input.headers : undefined);
  return source
    ? (new Headers(source).get("user-agent") ?? undefined)
    : undefined;
}
