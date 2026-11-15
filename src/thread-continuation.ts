/**
 * Carrying the billing header on Anthropic message-thread continuations.
 *
 * pi-ai >=1.5.0 sends later turns of a session as `thread: continue`
 * requests holding only the new messages, and builds them after `onPayload`
 * has run, leaving out `system` — where our billing header lives.  Claude
 * Code sends its continuations with `system` cut down to the billing-header
 * block, and Anthropic accepts that block on a continuation: it is outside
 * the thread's fingerprint, and it gates the Claude Code version exactly as
 * on the request that created the thread (measured live, Issue #90).
 */

/** The marker that shows a body may be a continuation, checked before parsing. */
const CONTINUE_MARKER = '"continue"';

/**
 * Returns `body` with `system: [{ type: "text", text: headerText }]` spliced
 * in, when `body` is a message-thread continuation that carries no `system`;
 * otherwise `undefined`.
 *
 * The body is parsed only to decide, never re-serialized: the block is
 * spliced in as text, so every other byte goes out exactly as pi built it.
 * Parsing is what makes the decision sound, because a `"system"` key can also
 * occur inside a `tool_use` input.
 */
export function withBillingBlockOnContinuation(
  body: string,
  headerText: string,
): string | undefined {
  if (!body.startsWith("{") || !body.includes(CONTINUE_MARKER)) {
    return undefined;
  }
  if (!isContinuationWithoutSystem(parseJson(body))) return undefined;

  const block = JSON.stringify({ type: "text", text: headerText });
  return `{"system":[${block}],${body.slice(1)}`;
}

function isContinuationWithoutSystem(value: unknown): boolean {
  if (!isRecord(value) || Object.hasOwn(value, "system")) return false;
  return isRecord(value.thread) && value.thread.type === "continue";
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
