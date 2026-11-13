import assert from "node:assert/strict";
import type { Context } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { test } from "vitest";

import { shapeAnthropicOAuthPayload } from "#src/request-shaping";

const TEST_MODEL = "claude-haiku-4-5";
const USER_TEXT = "Check my home directory for PDFs.";

/**
 * Builds an Anthropic messages payload with one assistant turn under test.
 *
 * Every shaping assertion in this file differs only in that turn's content
 * blocks (and, sometimes, a trailing tool_result message), so the surrounding
 * envelope lives here rather than being restated per test.  This mirrors
 * `createOAuthPayload` in `test/request-shaping.test.ts`.
 */
function createShapingPayload(
  assistantContent: unknown[],
  trailingMessages: unknown[] = [],
) {
  return {
    model: TEST_MODEL,
    stream: true,
    messages: [
      { role: "user", content: [{ type: "text", text: USER_TEXT }] },
      { role: "assistant", content: assistantContent },
      ...trailingMessages,
    ],
    system: [
      {
        type: "text",
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
      },
      {
        type: "text",
        text: "Follow the user's instructions.",
      },
    ],
  };
}

/**
 * Shapes a payload and reports the block types of each assistant message it
 * emits, as one array per assistant message.
 *
 * Returning the nested shape lets a test pin both how many assistant messages
 * shaping produced and what each one carries in a single assertion.
 */
function shapedAssistantBlockTypes(
  assistantContent: unknown[],
  trailingMessages: unknown[] = [],
): string[][] {
  const shaped = shapeAnthropicOAuthPayload(
    createShapingPayload(assistantContent, trailingMessages),
  ) as { messages: Array<{ role: string; content: Array<{ type: string }> }> };

  return shaped.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content.map((block) => block.type));
}

function createMockSseResponse(): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          [
            "event: message_start",
            'data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-haiku-4-5","stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":1}}}',
            "",
            "event: message_delta",
            'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":1}}',
            "",
            "event: message_stop",
            'data: {"type":"message_stop"}',
            "",
          ].join("\n"),
        ),
      );
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

type AssistantMessage = Extract<
  Context["messages"][number],
  { role: "assistant" }
>;
type AssistantContent = AssistantMessage["content"];

const TEST_TOOLS: Context["tools"] = [
  {
    name: "read",
    description: "Read a file",
    parameters: {
      type: "object",
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  {
    name: "glob",
    description: "Find files by glob",
    parameters: {
      type: "object",
      properties: { pattern: { type: "string" } },
      required: ["pattern"],
    },
  },
];

function createAssistantMessage(content: AssistantContent): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "anthropic",
    model: TEST_MODEL,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: Date.now(),
  };
}

function createToolResult(
  toolCallId: string,
  toolName: string,
  text: string,
): Context["messages"][number] {
  return {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text }],
    isError: false,
    timestamp: Date.now(),
  };
}

/**
 * Runs Pi's own Anthropic serializer over an assistant turn and reports the
 * block types it emits, as one array per assistant message.
 *
 * These tests characterize upstream rather than this extension, so they must
 * go through `streamSimple` itself.  The transport is pinned to a mocked SSE
 * response and the payload is captured from `onPayload`; `globalThis.fetch` is
 * always restored, including when the stream throws.
 */
async function serializedAssistantBlockTypes(
  assistantContent: AssistantContent,
  toolResults: Context["messages"],
): Promise<string[][]> {
  const context: Context = {
    systemPrompt: "Follow the user's instructions.",
    messages: [
      { role: "user", content: USER_TEXT, timestamp: Date.now() },
      createAssistantMessage(assistantContent),
      ...toolResults,
    ],
    tools: TEST_TOOLS,
  };

  let capturedPayload: unknown;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => createMockSseResponse();

  try {
    const stream = streamSimple(
      getBuiltinModel("anthropic", TEST_MODEL),
      context,
      {
        apiKey: "sk-ant-oat01-test-token",
        onPayload(payload) {
          capturedPayload = payload;
          return payload;
        },
      },
    );

    await stream.result();
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(capturedPayload, "expected onPayload to capture a payload");
  const payload = capturedPayload as {
    messages: Array<{ role: string; content: Array<{ type: string }> }>;
  };

  return payload.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content.map((block) => block.type));
}

test("experiment: Pi serializer preserves trailing assistant text after tool_use blocks", async () => {
  const blockTypes = await serializedAssistantBlockTypes(
    [
      {
        type: "toolCall",
        id: "toolu_1",
        name: "read",
        arguments: { filePath: "/root" },
      },
      {
        type: "toolCall",
        id: "toolu_2",
        name: "glob",
        arguments: { pattern: "**/*.pdf" },
      },
      {
        type: "text",
        text: "I checked your home directory and looked for PDF files.",
      },
    ],
    [
      createToolResult("toolu_1", "read", "ok"),
      createToolResult("toolu_2", "glob", "No files found"),
    ],
  );

  assert.deepEqual(blockTypes, [["tool_use", "tool_use", "text"]]);
});

test("experiment: Pi serializer preserves interleaved thinking between tool_use blocks", async () => {
  const blockTypes = await serializedAssistantBlockTypes(
    [
      {
        type: "thinking",
        thinking: "First I should look at the home directory.",
        thinkingSignature: "sig-1",
      },
      {
        type: "toolCall",
        id: "toolu_1",
        name: "read",
        arguments: { filePath: "/root" },
      },
      {
        type: "thinking",
        thinking: "Now I should search for the PDFs themselves.",
        thinkingSignature: "sig-2",
      },
      {
        type: "toolCall",
        id: "toolu_2",
        name: "glob",
        arguments: { pattern: "**/*.pdf" },
      },
    ],
    [
      createToolResult("toolu_1", "read", "ok"),
      createToolResult("toolu_2", "glob", "No files found"),
    ],
  );

  assert.deepEqual(blockTypes, [
    ["thinking", "tool_use", "thinking", "tool_use"],
  ]);
});

test("shaping leaves assistant text trailing tool_use blocks in place", () => {
  // Anthropic accepts this ordering; measured 200 OK across every model this
  // extension serves, which is why the split that used to rewrite it is gone
  // (Issue #66).
  const blockTypes = shapedAssistantBlockTypes(
    [
      {
        type: "tool_use",
        id: "toolu_1",
        name: "Read",
        input: { filePath: "/root" },
      },
      {
        type: "tool_use",
        id: "toolu_2",
        name: "Glob",
        input: { pattern: "**/*.pdf" },
      },
      {
        type: "text",
        text: "I checked your home directory and looked for PDF files.",
      },
    ],
    [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: "ok",
            is_error: false,
          },
          {
            type: "tool_result",
            tool_use_id: "toolu_2",
            content: "No files found",
            is_error: false,
          },
        ],
      },
    ],
  );

  assert.deepEqual(blockTypes, [["tool_use", "tool_use", "text"]]);
});

test("shaping leaves text-first assistant ordering unchanged", () => {
  const blockTypes = shapedAssistantBlockTypes([
    {
      type: "text",
      text: "I checked your home directory and looked for PDF files.",
    },
    {
      type: "tool_use",
      id: "toolu_1",
      name: "Read",
      input: { filePath: "/root" },
    },
    {
      type: "tool_use",
      id: "toolu_2",
      name: "Glob",
      input: { pattern: "**/*.pdf" },
    },
  ]);

  assert.deepEqual(blockTypes, [["text", "tool_use", "tool_use"]]);
});

test("shaping preserves interleaved thinking blocks in an assistant turn", () => {
  // Anthropic signs `thinking` blocks and rejects the next request when the
  // latest assistant turn's signed blocks move relative to the content they
  // were produced against (Issue #66).  Shaping must leave the turn alone.
  const blockTypes = shapedAssistantBlockTypes(
    [
      { type: "thinking", thinking: "t1", signature: "sig-1" },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "Read",
        input: { filePath: "/root" },
      },
      { type: "thinking", thinking: "t2", signature: "sig-2" },
      {
        type: "tool_use",
        id: "toolu_2",
        name: "Glob",
        input: { pattern: "**/*.pdf" },
      },
    ],
    [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: "ok",
            is_error: false,
          },
          {
            type: "tool_result",
            tool_use_id: "toolu_2",
            content: "No files found",
            is_error: false,
          },
        ],
      },
    ],
  );

  assert.deepEqual(blockTypes, [
    ["thinking", "tool_use", "thinking", "tool_use"],
  ]);
});
