import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
  StreamFunction,
} from "@earendil-works/pi-ai";
import { shapeAnthropicOAuthPayload } from "./request-shaping";

/**
 * Anthropic OAuth access tokens are issued with an `sk-ant-oat` prefix.
 *
 * This is the same signal Pi's built-in Anthropic provider uses internally to
 * decide whether to emit Claude Code identity headers, so gating on it keeps
 * our shaping aligned with Pi's own OAuth detection.
 */
const ANTHROPIC_OAUTH_TOKEN_MARKER = "sk-ant-oat";

/**
 * The real built-in Anthropic `streamSimple` transport, typed for the
 * `anthropic-messages` API it serves.
 */
export type AnthropicStreamSimpleDelegate = StreamFunction<
  "anthropic-messages",
  SimpleStreamOptions
>;

/**
 * The transport-level `streamSimple` handler shape Pi's API registry uses.
 *
 * It matches `ApiStreamSimpleFunction` from `@earendil-works/pi-ai` and is
 * intentionally wider than a single concrete model type because Pi registers
 * it per `Api`, not per model.
 */
export type AnthropicStreamSimple = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

/**
 * Returns true when the resolved API key is an Anthropic OAuth access token.
 *
 * API-key requests (and OAuth tokens for other providers) return false, so the
 * caller leaves their payloads untouched.
 */
export function isAnthropicOAuthToken(
  apiKey: string | undefined,
): apiKey is string {
  return (
    typeof apiKey === "string" && apiKey.includes(ANTHROPIC_OAUTH_TOKEN_MARKER)
  );
}

/**
 * Wraps Pi's built-in Anthropic `streamSimple` transport so OAuth request
 * shaping runs on **every** Anthropic call path, not only the main agent loop.
 *
 * Pi only threads its `before_provider_request` hook into the interactive agent
 * loop.  Auxiliary calls — built-in compaction/summarization (`completeSimple`)
 * and third-party background agents (e.g. pi-observational-memory's observer /
 * reflector / dropper running via `agentLoop`) — issue requests through the
 * same singleton API-registry transport but without that hook.  Those OAuth
 * requests then reach Anthropic with no Claude Code billing header and are
 * classified as third-party app usage, producing the misleading "extra usage"
 * HTTP 400.
 *
 * By injecting our shaping as an `onPayload` on the underlying transport, every
 * Anthropic OAuth request is shaped regardless of which Pi code path issued it.
 * The wrapper composes (does not replace) any caller-provided `onPayload`, so
 * other extensions' `before_provider_request` handlers continue to run on the
 * main loop, and our shaping is applied last — closest to the wire.
 *
 * Gating is strictly OAuth-only: when the request is not an Anthropic OAuth
 * token, the payload passes through untouched, preserving Pi's normal
 * API-key and non-Anthropic transport behavior.
 *
 * @param delegate Pi's built-in Anthropic `streamSimple` transport, imported
 *   directly from `@earendil-works/pi-ai/anthropic`.  Importing it directly
 *   (rather than reading it out of the API registry) avoids the pi-ai 0.79.8
 *   lazy-registration clobber: the registry's `anthropic-messages` entry is a
 *   lazy stub whose first call re-registers the bare built-in via
 *   `registerApiProvider`, overwriting this wrapper.  Delegating to the
 *   imported transport means that re-register never fires through us, so our
 *   shaping stays in place for the lifetime of the session (Issue #28).
 */
export function createAnthropicOAuthStreamSimple(
  delegate: AnthropicStreamSimpleDelegate,
): AnthropicStreamSimple {
  return (model, context, options) => {
    const callerOnPayload = options?.onPayload;

    const onPayload: SimpleStreamOptions["onPayload"] = async (
      payload,
      payloadModel,
    ) => {
      const upstream = callerOnPayload
        ? ((await callerOnPayload(payload, payloadModel)) ?? payload)
        : payload;

      if (!isAnthropicOAuthToken(options?.apiKey)) {
        return upstream;
      }

      return shapeAnthropicOAuthPayload(upstream);
    };

    // The registry only invokes this transport for `anthropic-messages`
    // models (its `wrapStreamSimple` validates `model.api` before delegating),
    // so the wide `Model<Api>` is guaranteed to be `Model<"anthropic-messages">`
    // at runtime — safe to narrow for the delegate call.
    return delegate(model as Model<"anthropic-messages">, context, {
      ...options,
      onPayload,
    });
  };
}
