import assert from "node:assert/strict";
import {
  type AssistantMessage,
  type Message,
  normalizeContext,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/compat";
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { describe, test } from "vitest";

import { BILLING_HEADER_MARKER } from "#src/billing-header";
import { createAnthropicOAuthStreamSimple } from "#src/oauth-transport";

// This suite drives the installed Pi's own Anthropic transport, the way
// `test/managed-effort-drift.test.ts` does.  Depending on the internal *is*
// what it verifies; it is not a precedent for other suites.
//
// pi-ai >=1.5.0 sends later turns of a session as Anthropic message-thread
// continuations, built after `onPayload` and without `system`, where our
// billing header lives.  OAuth requests opt out with `disableContinuation`
// (Issue #86).  `test/oauth-transport.test.ts` pins that the wrapper passes
// the option; this suite pins that Pi still honors it, which no type check
// can see.

const OAUTH_TOKEN_STUB = "sk-ant-oat01-stub-token-for-drift-check";
const API_KEY_STUB = "sk-ant-api03-stub-key-for-drift-check";

type OutboundBody = {
  thread?: unknown;
  system?: { text?: string }[];
  messages?: unknown[];
};

/**
 * A minimal streamed reply, enough for pi to record the turn as a thread
 * reply it could continue from.
 */
function streamedReply(messageId: string): Response {
  const events: [string, unknown][] = [
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: messageId,
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ],
    [
      "content_block_start",
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    ],
    [
      "content_block_delta",
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "First answer." },
      },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 3 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
  const body = events
    .map(
      ([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    )
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function userMessage(text: string): Message {
  return {
    role: "user",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  };
}

/**
 * Sends two turns of one session and captures both request bodies.
 *
 * Nothing leaves the process: the injected `fetch` answers every request with
 * {@link streamedReply}.  pi keeps thread state per `sessionId` at module
 * scope, so each caller passes its own.
 */
async function captureTwoTurns({
  wrapped,
  apiKey,
  sessionId,
}: {
  wrapped: boolean;
  apiKey: string;
  sessionId: string;
}): Promise<{ firstReply: AssistantMessage; bodies: OutboundBody[] }> {
  const bodies: OutboundBody[] = [];
  const capturingFetch = ((_input: unknown, init?: RequestInit) => {
    // Pi's transport serializes the payload itself, so the body is a string.
    bodies.push(JSON.parse(init?.body as string) as OutboundBody);
    return Promise.resolve(streamedReply(`msg_${String(bodies.length)}`));
  }) as typeof fetch;

  const piTransport = anthropicMessagesApi().streamSimple;
  const transport = wrapped
    ? createAnthropicOAuthStreamSimple(piTransport)
    : piTransport;
  const model = getBuiltinModel("anthropic", "claude-haiku-4-5");
  const options = {
    apiKey,
    fetch: capturingFetch,
    maxRetries: 0,
    sessionId,
    cacheRetention: "short" as const,
  };

  const firstQuestion = userMessage("First question.");
  const firstReply = await transport(
    model,
    normalizeContext({ systemPrompt: "Be brief.", messages: [firstQuestion] }),
    options,
  ).result();

  await transport(
    model,
    normalizeContext({
      systemPrompt: "Be brief.",
      messages: [firstQuestion, firstReply, userMessage("Second question.")],
    }),
    options,
  ).result();

  return { firstReply, bodies };
}

describe("Anthropic message threads", () => {
  test("Pi continues an OAuth session's second turn without system", async () => {
    // The control: without it, the opt-out test below would pass on a fixture
    // that never reaches pi's thread path at all.
    const { firstReply, bodies } = await captureTwoTurns({
      wrapped: false,
      apiKey: OAUTH_TOKEN_STUB,
      sessionId: "thread-drift-control",
    });

    assert.equal(firstReply.stopReason, "stop");
    assert.deepEqual(
      bodies.map((body) => body.thread),
      [{ type: "create" }, { type: "continue", previous_message_id: "msg_1" }],
    );
    assert.equal("system" in (bodies[1] ?? {}), false);
  });

  test("the OAuth wrapper sends the second turn in full, with the billing header", async () => {
    const { bodies } = await captureTwoTurns({
      wrapped: true,
      apiKey: OAUTH_TOKEN_STUB,
      sessionId: "thread-drift-oauth",
    });

    assert.deepEqual(
      bodies.map((body) => "thread" in body),
      [false, false],
    );
    const secondTurn = bodies[1];
    assert.ok(secondTurn);
    assert.ok(
      secondTurn.system?.[0]?.text?.includes(BILLING_HEADER_MARKER),
      "the second OAuth turn must lead with the billing header block",
    );
    assert.equal(secondTurn.messages?.length, 3);
  });

  test("the wrapper leaves API-key sessions on Pi's threads", async () => {
    const { bodies } = await captureTwoTurns({
      wrapped: true,
      apiKey: API_KEY_STUB,
      sessionId: "thread-drift-api-key",
    });

    assert.deepEqual(bodies[1]?.thread, {
      type: "continue",
      previous_message_id: "msg_1",
    });
  });
});
