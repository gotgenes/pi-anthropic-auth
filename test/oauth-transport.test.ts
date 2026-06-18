import assert from "node:assert/strict";
import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { beforeEach, describe, test } from "vitest";
import {
  createAnthropicOAuthStreamSimple,
  isAnthropicOAuthToken,
} from "#src/oauth-transport";

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

const CONTEXT = { messages: [] } as unknown as Context;

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
    context: Context,
    options?: SimpleStreamOptions,
  ) => AssistantMessageEventStream;
  calls: Array<{
    model: Model<Api>;
    context: Context;
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
});
