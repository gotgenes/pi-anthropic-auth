import assert from "node:assert/strict";
import type {
  Api,
  AssistantMessageEventStream,
  Model,
  SimpleStreamOptions,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai";
import { beforeEach, describe, test } from "vitest";
import {
  createAnthropicOAuthStreamSimple,
  isAnthropicOAuthToken,
  type MessageThreadOptOut,
} from "#src/oauth-transport";
import {
  claudeCodeVersionTooOldResponse,
  okResponse,
} from "#test/version-rejection-fixtures";

const OAUTH_TOKEN = "sk-ant-oat01-example-access-token";
const API_KEY = "sk-ant-api03-example-key";

const STREAM_STUB = {
  __stub: true,
} as unknown as AssistantMessageEventStream;

const MODEL = {
  id: "claude-haiku-4-5",
  api: "anthropic-messages",
  provider: "anthropic",
} as unknown as Model<"anthropic-messages">;

// `normalizeContext` is the only producer of the brand pi-ai's stream
// signature requires, so the fake is minted rather than cast.
const CONTEXT = normalizeContext({ messages: [] });

function samplePayload() {
  return {
    model: "claude-haiku-4-5",
    stream: true,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Summarize the repository status." }],
      },
    ],
    system: [
      {
        type: "text",
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
      },
    ],
  };
}

type CapturingDelegate = {
  delegate: (
    model: Model<Api>,
    context: TranscriptContext,
    options?: SimpleStreamOptions,
  ) => AssistantMessageEventStream;
  calls: Array<{
    model: Model<Api>;
    context: TranscriptContext;
    options?: SimpleStreamOptions;
  }>;
};

function createCapturingDelegate(): CapturingDelegate {
  const calls: CapturingDelegate["calls"] = [];
  const delegate: CapturingDelegate["delegate"] = (model, context, options) => {
    calls.push({ model, context, options });
    return STREAM_STUB;
  };
  return { delegate, calls };
}

function systemTexts(payload: unknown): string[] {
  const system = (payload as { system?: Array<{ text?: string }> }).system;
  return Array.isArray(system)
    ? system.map((block) => (typeof block.text === "string" ? block.text : ""))
    : [];
}

// Resolve the captured onPayload callback the wrapper handed the delegate.
function resolveOnPayload(
  calls: CapturingDelegate["calls"],
): NonNullable<SimpleStreamOptions["onPayload"]> {
  const onPayload = calls[0]?.options?.onPayload;
  assert.ok(onPayload);
  return onPayload;
}

test("isAnthropicOAuthToken recognizes only sk-ant-oat access tokens", () => {
  assert.equal(isAnthropicOAuthToken(OAUTH_TOKEN), true);
  assert.equal(isAnthropicOAuthToken(API_KEY), false);
  assert.equal(isAnthropicOAuthToken(undefined), false);
  assert.equal(isAnthropicOAuthToken(""), false);
});

describe("createAnthropicOAuthStreamSimple", () => {
  let calls: CapturingDelegate["calls"];
  let wrapped: ReturnType<typeof createAnthropicOAuthStreamSimple>;

  beforeEach(() => {
    const capturing = createCapturingDelegate();
    calls = capturing.calls;
    wrapped = createAnthropicOAuthStreamSimple(capturing.delegate);
  });

  test("delegates to the underlying transport with composed options", () => {
    const result = wrapped(MODEL, CONTEXT, { apiKey: OAUTH_TOKEN });

    assert.equal(result, STREAM_STUB);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.model, MODEL);
    assert.equal(calls[0]?.context, CONTEXT);
    assert.equal(calls[0]?.options?.apiKey, OAUTH_TOKEN);
    assert.equal(typeof calls[0]?.options?.onPayload, "function");
  });

  // Pi 0.84.0 documents the `ProviderConfig.streamSimple` contract explicitly:
  // an implementation must invoke `options.onPayload` before sending the
  // request and `options.onResponse` after receiving it, matching built-in
  // providers.  We satisfy the `onResponse` half by forwarding the caller's
  // callback untouched to the built-in delegate, which owns the HTTP response.
  // Pin that pass-through so a future refactor of the options spread cannot
  // silently drop it.
  test("forwards onResponse to the delegate unchanged", () => {
    const onResponse: SimpleStreamOptions["onResponse"] = () => {};

    wrapped(MODEL, CONTEXT, { apiKey: OAUTH_TOKEN, onResponse });

    assert.equal(calls[0]?.options?.onResponse, onResponse);
  });

  test("shapes the payload for OAuth access tokens", async () => {
    wrapped(MODEL, CONTEXT, { apiKey: OAUTH_TOKEN });

    const shaped = await resolveOnPayload(calls)(samplePayload(), MODEL);
    const texts = systemTexts(shaped);

    assert.ok(texts[0]?.includes("x-anthropic-billing-header:"));
    assert.ok(
      texts.some((text) =>
        text.includes("You are Claude Code, Anthropic's official CLI"),
      ),
    );
  });

  test("leaves the payload untouched for API-key requests", async () => {
    wrapped(MODEL, CONTEXT, { apiKey: API_KEY });

    const input = samplePayload();
    const result = await resolveOnPayload(calls)(input, MODEL);
    const texts = systemTexts(result);

    assert.equal(result, input);
    assert.ok(
      !texts.some((text) => text.includes("x-anthropic-billing-header:")),
    );
  });

  test("composes a caller-provided onPayload before shaping", async () => {
    const callerOnPayload: SimpleStreamOptions["onPayload"] = (payload) => {
      const next = payload as ReturnType<typeof samplePayload>;
      return {
        ...next,
        system: [...next.system, { type: "text", text: "INJECTED_BY_CALLER" }],
      };
    };

    wrapped(MODEL, CONTEXT, {
      apiKey: OAUTH_TOKEN,
      onPayload: callerOnPayload,
    });

    const shaped = await resolveOnPayload(calls)(samplePayload(), MODEL);
    const texts = systemTexts(shaped);

    // Caller transform ran (its block survives) and our shaping ran on top.
    assert.ok(texts.includes("INJECTED_BY_CALLER"));
    assert.ok(texts[0]?.includes("x-anthropic-billing-header:"));
  });

  test("falls back to the original payload when caller onPayload returns undefined", async () => {
    wrapped(MODEL, CONTEXT, {
      apiKey: OAUTH_TOKEN,
      onPayload: () => undefined,
    });

    const shaped = await resolveOnPayload(calls)(samplePayload(), MODEL);
    const texts = systemTexts(shaped);

    assert.ok(texts[0]?.includes("x-anthropic-billing-header:"));
  });

  // The billing-version sync needs its own seam at the transport: it reads
  // Pi's `user-agent: claude-cli/<version>` off the built request, which only
  // exists at the fetch boundary.
  test("injects a fetch wrapper for OAuth access tokens", () => {
    wrapped(MODEL, CONTEXT, { apiKey: OAUTH_TOKEN });

    assert.equal(typeof calls[0]?.options?.fetch, "function");
  });

  test("leaves fetch untouched for API-key requests", () => {
    const callerFetch = (() => Promise.resolve(new Response())) as typeof fetch;

    wrapped(MODEL, CONTEXT, { apiKey: API_KEY, fetch: callerFetch });

    assert.equal(calls[0]?.options?.fetch, callerFetch);
  });

  test("does not add a fetch to API-key requests that had none", () => {
    wrapped(MODEL, CONTEXT, { apiKey: API_KEY });

    assert.equal(calls[0]?.options?.fetch, undefined);
  });

  test("composes a caller-provided fetch for OAuth requests", async () => {
    let received: RequestInit | undefined;
    const callerFetch = ((_input: unknown, init?: RequestInit) => {
      received = init;
      return Promise.resolve(new Response());
    }) as typeof fetch;

    wrapped(MODEL, CONTEXT, { apiKey: OAUTH_TOKEN, fetch: callerFetch });

    const injected = calls[0]?.options?.fetch;
    assert.ok(injected);
    await injected("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: "{}",
    });

    assert.equal(received?.method, "POST");
  });

  // The learned floor must outlive a single `streamSimple` call, or every
  // request to a gated model would pay the rejected round trip again.
  test("shares the learned Claude Code floor across requests", async () => {
    const sentBodies: string[] = [];
    const responses = [
      claudeCodeVersionTooOldResponse("2.9.0"),
      okResponse(),
      okResponse(),
    ];
    const callerFetch = ((_input: unknown, init?: RequestInit) => {
      sentBodies.push(typeof init?.body === "string" ? init.body : "");
      const response = responses.shift();
      assert.ok(response);
      return Promise.resolve(response);
    }) as typeof fetch;

    for (const index of [0, 1]) {
      wrapped(MODEL, CONTEXT, { apiKey: OAUTH_TOKEN, fetch: callerFetch });
      const options = calls[index]?.options;
      const shaped = await options?.onPayload?.(samplePayload(), MODEL);
      assert.ok(options?.fetch);
      await options.fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        body: JSON.stringify(shaped),
      });
    }

    assert.equal(sentBodies.length, 3);
    assert.match(sentBodies[1] ?? "", /cc_version=2\.9\.0\./);
    assert.match(sentBodies[2] ?? "", /cc_version=2\.9\.0\./);
  });

  // pi-ai >=1.5.0 strips `system` from message-thread continuations after
  // `onPayload` runs, so a continuation cannot carry the billing header.
  describe("message-thread opt-out", () => {
    function delegatedOptions(): SimpleStreamOptions & MessageThreadOptOut {
      const options = calls[0]?.options;
      assert.ok(options);
      return options;
    }

    test("opts OAuth requests out of continuations", () => {
      wrapped(MODEL, CONTEXT, { apiKey: OAUTH_TOKEN });

      assert.equal(delegatedOptions().disableContinuation, true);
    });

    test("overrides a caller that allowed continuations on an OAuth request", () => {
      const callerOptions: SimpleStreamOptions & MessageThreadOptOut = {
        apiKey: OAUTH_TOKEN,
        disableContinuation: false,
      };

      wrapped(MODEL, CONTEXT, callerOptions);

      assert.equal(delegatedOptions().disableContinuation, true);
    });

    test("adds no opt-out to API-key requests", () => {
      wrapped(MODEL, CONTEXT, { apiKey: API_KEY });

      assert.equal("disableContinuation" in delegatedOptions(), false);
    });

    test("keeps an API-key caller's own opt-out", () => {
      const callerOptions: SimpleStreamOptions & MessageThreadOptOut = {
        apiKey: API_KEY,
        disableContinuation: true,
      };

      wrapped(MODEL, CONTEXT, callerOptions);

      assert.equal(delegatedOptions().disableContinuation, true);
    });
  });
});
