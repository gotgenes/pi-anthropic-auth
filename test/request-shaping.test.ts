import assert from "node:assert/strict";
import { test } from "vitest";

import {
  CLAUDE_CODE_VERSION,
  CLAUDE_CODE_VERSION_ENV,
  resolveClaudeCodeVersion,
} from "#src/claude-code-version";
import { shapeAnthropicOAuthPayload } from "#src/request-shaping";
import {
  buildExpectedBillingHeader,
  withVersionOverride,
} from "#test/billing-header-fixtures";

const TEST_MODEL = "claude-haiku-4-5";

function createOAuthPayload(overrides: Record<string, unknown> = {}) {
  return {
    model: TEST_MODEL,
    stream: true,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Please summarize this repository status." },
        ],
      },
    ],
    system: [
      {
        type: "text",
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: "Follow the user's instructions.",
      },
    ],
    ...overrides,
  };
}

test("shapes any anthropic-messages payload (OAuth gating handled by the transport)", () => {
  // shapeAnthropicOAuthPayload no longer sniffs system-prompt markers: the
  // transport wrapper gates on the sk-ant-oat token, so this function shapes
  // whatever valid anthropic-messages payload it is handed.
  const payload = {
    model: TEST_MODEL,
    stream: true,
    messages: [{ role: "user", content: "Hello" }],
    system: [{ type: "text", text: "Generic system prompt." }],
  };

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;
  const systemBlocks = shaped.system as Array<{ text: string }>;

  assert.ok(systemBlocks[0]?.text.includes("x-anthropic-billing-header:"));
  assert.equal(systemBlocks[1]?.text, "Generic system prompt.");
});

test("returns non-anthropic-messages payloads unchanged", () => {
  // Structural guard: anything that is not a streaming messages payload is a
  // pass-through, regardless of OAuth state.
  const payload = { not: "an anthropic payload" };

  assert.equal(shapeAnthropicOAuthPayload(payload), payload);
});

test("prepends the billing header block without adding cache control on OAuth payloads", () => {
  const payload = createOAuthPayload({ "anthropic-beta": "existing-beta" });

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload &
    Record<string, unknown>;
  const systemBlocks = shaped.system as Array<{
    text: string;
    cache_control?: unknown;
  }>;
  const expectedHeader = buildExpectedBillingHeader(
    "Please summarize this repository status.",
  );

  assert.notEqual(shaped, payload);
  assert.equal(systemBlocks[0]?.text, expectedHeader);
  assert.equal(systemBlocks[0]?.cache_control, undefined);
  assert.equal(systemBlocks[1]?.text, payload.system[0]?.text);
  assert.equal(shaped["anthropic-beta"], "existing-beta");
});

test("pins a Claude Code version at or above the Opus 5.5 floor", () => {
  // Anthropic rejects OAuth requests for claude-opus-5-5 when the reported
  // Claude Code version is below 2.1.280 (error_code: claude_code_version_too_old).
  // The previous floor was 2.1.251, for claude-fable-5-1.
  const [major, minor, patch] = CLAUDE_CODE_VERSION.split(".").map(Number);

  assert.equal(major, 2);
  assert.equal(minor, 1);
  assert.ok(
    patch >= 280,
    `CLAUDE_CODE_VERSION ${CLAUDE_CODE_VERSION} is below the 2.1.280 floor`,
  );
});

test("falls back to the bundled version when no override is set", () => {
  assert.equal(resolveClaudeCodeVersion({}), CLAUDE_CODE_VERSION);
  assert.equal(
    resolveClaudeCodeVersion({ [CLAUDE_CODE_VERSION_ENV]: "   " }),
    CLAUDE_CODE_VERSION,
  );
});

test("trims a configured Claude Code version", () => {
  assert.equal(
    resolveClaudeCodeVersion({ [CLAUDE_CODE_VERSION_ENV]: " 2.1.300 " }),
    "2.1.300",
  );
});

test("uses the configured Claude Code version in the billing header", () => {
  withVersionOverride("2.1.300");

  const payload = createOAuthPayload();
  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;
  const systemBlocks = shaped.system as Array<{ text: string }>;

  // The override must reach both the emitted cc_version and its hashed suffix.
  assert.equal(
    systemBlocks[0]?.text,
    buildExpectedBillingHeader(
      "Please summarize this repository status.",
      "2.1.300",
    ),
  );
});

test("rejects a malformed Claude Code version override", () => {
  for (const invalid of ["latest", "2.1", "v2.1.260", "2.1.260-beta"]) {
    assert.throws(
      () => resolveClaudeCodeVersion({ [CLAUDE_CODE_VERSION_ENV]: invalid }),
      /must be a bare X\.Y\.Z version/,
      `expected ${invalid} to be rejected`,
    );
  }
});

test("does not add anthropic-beta to the request body when it is absent", () => {
  const payload = createOAuthPayload();

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload &
    Record<string, unknown>;

  assert.equal("anthropic-beta" in shaped, false);
});

test("does not increase the number of cache-controlled system blocks", () => {
  const payload = createOAuthPayload({
    system: [
      {
        type: "text",
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: "Block 2",
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: "Block 3",
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: "Block 4",
        cache_control: { type: "ephemeral" },
      },
    ],
  });

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;
  const systemBlocks = shaped.system as Array<{ cache_control?: unknown }>;

  assert.equal(systemBlocks.length, 5);
  assert.equal(
    systemBlocks.filter((block) => block.cache_control != null).length,
    4,
  );
  assert.equal(systemBlocks[0]?.cache_control, undefined);
});

test("does not duplicate an existing billing header block", () => {
  const billingHeader = buildExpectedBillingHeader(
    "Please summarize this repository status.",
  );
  const payload = createOAuthPayload({
    system: [
      { type: "text", text: billingHeader },
      {
        type: "text",
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
      },
    ],
  });

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;
  const systemBlocks = shaped.system as Array<{ text: string }>;

  assert.equal(systemBlocks.length, 2);
  assert.equal(systemBlocks[0]?.text, billingHeader);
});

test("leaves payloads without a user text message unchanged", () => {
  const payload = createOAuthPayload({
    messages: [
      {
        role: "user",
        content: [{ type: "tool_result", output: "not text" }],
      },
    ],
  });

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;

  assert.deepEqual(shaped.system, payload.system);
});

test("shapes OAuth payloads detected by the injected billing header marker", () => {
  const payload = {
    model: TEST_MODEL,
    stream: true,
    messages: [
      { role: "user", content: "Please summarize this repository status." },
    ],
    system: [
      {
        type: "text",
        text: buildExpectedBillingHeader(
          "Please summarize this repository status.",
        ),
      },
      {
        type: "text",
        text: "Follow the user's instructions.",
      },
    ],
  };

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;

  assert.equal(shaped.system[0]?.text, payload.system[0]?.text);
});

test("shapes Pi default system prompt in OAuth payloads", () => {
  const piDefaultPrompt = [
    "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.",
    "",
    "<tools>",
    "- read: Read file contents",
    "- bash: Execute shell commands",
    "",
    "In addition to the tools above, you may have access to other custom tools depending on the project.",
    "</tools>",
    "",
    "<project_context>",
    "This is a test project.",
    "</project_context>",
  ].join("\n");
  const payload = createOAuthPayload({
    system: [
      {
        type: "text",
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
      },
      {
        type: "text",
        text: piDefaultPrompt,
      },
    ],
  });

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;
  const systemBlocks = shaped.system as Array<{ text: string }>;

  // The billing header is prepended
  assert.ok(systemBlocks[0]?.text.includes("x-anthropic-billing-header:"));
  // The Claude Code identity block is unchanged
  assert.equal(
    systemBlocks[1]?.text,
    "You are Claude Code, Anthropic's official CLI for Claude.",
  );
  // The Pi default prompt preamble is replaced with the minimal prompt,
  // but project context is preserved
  assert.ok(
    systemBlocks[2]?.text.startsWith("You are an expert coding assistant.\n"),
  );
  assert.ok(systemBlocks[2]?.text.includes("<project_context>"));
  assert.ok(systemBlocks[2]?.text.includes("This is a test project."));
  assert.ok(
    !systemBlocks[2]?.text.includes(
      "operating inside pi, a coding agent harness",
    ),
  );
});

test("shapes the Pi default system prompt preamble when present", () => {
  const piDefaultPrompt = [
    "You are an expert coding assistant operating inside pi, a coding agent harness. You help users.",
    "",
    "<rules>",
    "- Be concise in your responses",
    "</rules>",
  ].join("\n");
  const payload = {
    model: TEST_MODEL,
    stream: true,
    messages: [{ role: "user", content: "Hello" }],
    system: [
      {
        type: "text",
        text: piDefaultPrompt,
      },
    ],
  };

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;
  const systemBlocks = shaped.system as Array<{ text: string }>;

  // Billing header is prepended and the Pi identity preamble is stripped.
  assert.ok(systemBlocks[0]?.text.includes("x-anthropic-billing-header:"));
  assert.ok(
    !systemBlocks[1]?.text.includes(
      "operating inside pi, a coding agent harness",
    ),
  );
});

test("shapes OAuth payloads detected by the minimal neutral system prompt marker", () => {
  const payload = {
    model: TEST_MODEL,
    stream: true,
    messages: [
      { role: "user", content: "Please summarize this repository status." },
    ],
    system: [
      {
        type: "text",
        text: "You are an expert coding assistant.\nBe concise and helpful.",
      },
    ],
  };

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;
  const systemBlocks = shaped.system as Array<{ text: string }>;

  assert.equal(
    systemBlocks[0]?.text,
    buildExpectedBillingHeader("Please summarize this repository status."),
  );
  assert.equal(systemBlocks[1]?.text, payload.system[0]?.text);
});

// ===== mid-conversation system messages (Issue #69) =====
//
// Pi 0.86.0 re-sends changed prompt sections as `role: "system"` messages
// inside `messages[]` on models with `supportsMidConvoSystemMessages`
// (claude-fable-5, claude-fable-5-1, claude-opus-4-8, claude-opus-5).
// `renderSystemMessageUpdate` frames each one by section name, so the same
// Pi content the sanitizer strips from `system[]` arrives by a second route.

/** Frame a section update the way upstream `renderSystemMessageUpdate` does. */
function sectionUpdate(name: string, body: string): string {
  return `Updated system prompt section "${name}":\n\n<${name}>\n${body}\n</${name}>`;
}

const PI_DOCS_UPDATE_BODY = [
  "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
  "- Main documentation: /home/user/.pi/agent/README.md",
].join("\n");

/** Build an OAuth payload carrying one `role: "system"` message. */
function payloadWithSystemMessage(content: unknown) {
  return createOAuthPayload({
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Please summarize the repository." }],
      },
      { role: "system", content },
    ],
  });
}

function shapedMessages(payload: unknown): Array<Record<string, unknown>> {
  const shaped = shapeAnthropicOAuthPayload(payload) as {
    messages: Array<Record<string, unknown>>;
  };
  return shaped.messages;
}

/** Text of the first content block of `messages[index]`. */
function blockText(
  messages: Array<Record<string, unknown>>,
  index: number,
): string | undefined {
  const content = messages[index]?.content;
  if (!Array.isArray(content)) return undefined;
  const block: unknown = content[0];
  return typeof block === "object" && block !== null && "text" in block
    ? (block as { text: string }).text
    : undefined;
}

test("drops a mid-conversation docs section update entirely", () => {
  const messages = shapedMessages(
    payloadWithSystemMessage([
      { type: "text", text: sectionUpdate("docs", PI_DOCS_UPDATE_BODY) },
    ]),
  );

  assert.deepEqual(
    messages.map((message) => message.role),
    ["user"],
    "a system message left with no content must be dropped, not sent empty",
  );
});

test("strips the filler from a mid-conversation tools section update", () => {
  const body = [
    "- read: Read file contents",
    "",
    "In addition to the tools above, you may have access to other custom tools depending on the project.",
  ].join("\n");
  const messages = shapedMessages(
    payloadWithSystemMessage([
      { type: "text", text: sectionUpdate("tools", body) },
    ]),
  );

  assert.equal(
    blockText(messages, 1),
    sectionUpdate("tools", "- read: Read file contents"),
    "the update keeps its framing and section tags; only the filler goes",
  );
});

test("replaces a mid-conversation preamble update carrying the Pi identity", () => {
  // `diffSystemPromptSections` iterates every section including `preamble`,
  // which upstream renders untagged, so the identity can arrive this way too.
  const messages = shapedMessages(
    payloadWithSystemMessage([
      {
        type: "text",
        text:
          'Updated system prompt section "preamble":\n\n' +
          "You are an expert coding assistant operating inside pi, a coding agent harness. You help users.",
      },
    ]),
  );

  const text = blockText(messages, 1) ?? "";
  assert.doesNotMatch(text, /operating inside pi, a coding agent harness/);
  assert.ok(text.includes("You are an expert coding assistant.\n"));
});

test("keeps a mid-conversation update for a section it does not own", () => {
  const update = sectionUpdate("project_context", "Team guidance.");
  const messages = shapedMessages(
    payloadWithSystemMessage([{ type: "text", text: update }]),
  );

  assert.equal(blockText(messages, 1), update);
});

test("keeps non-text blocks when a system message's only text block is dropped", () => {
  const messages = shapedMessages(
    payloadWithSystemMessage([
      { type: "text", text: sectionUpdate("docs", PI_DOCS_UPDATE_BODY) },
      { type: "tool_addition", tool: { type: "tool_reference", name: "Read" } },
    ]),
  );

  assert.deepEqual(
    messages.map((message) => message.role),
    ["user", "system"],
  );
  assert.deepEqual(messages[1]?.content, [
    { type: "tool_addition", tool: { type: "tool_reference", name: "Read" } },
  ]);
});

test("keeps a per-message effort system message that has no content", () => {
  // Pi 0.87.1 carries the requested effort on managed-effort models
  // (claude-opus-5-5, claude-opus-5, claude-fable-5-1) as content-less
  // system messages; the top-level `output_config` is pinned to "high".
  const payload = createOAuthPayload({
    output_config: { effort: "high" },
    messages: [
      { role: "user", content: [{ type: "text", text: "First question." }] },
      { role: "system", content: [], output_config: { effort: "medium" } },
      { role: "assistant", content: [{ type: "text", text: "First answer." }] },
      { role: "user", content: [{ type: "text", text: "Second question." }] },
      { role: "system", content: [], output_config: { effort: "low" } },
    ],
  });

  assert.deepEqual(shapedMessages(payload), payload.messages);
});

test("keeps effort on a system message whose only text block is dropped", () => {
  const payload = payloadWithSystemMessage([
    { type: "text", text: sectionUpdate("docs", PI_DOCS_UPDATE_BODY) },
  ]);
  const messages = shapedMessages({
    ...payload,
    messages: payload.messages.map((message) =>
      message.role === "system"
        ? { ...message, output_config: { effort: "low" } }
        : message,
    ),
  });

  assert.deepEqual(messages[1], {
    role: "system",
    content: [],
    output_config: { effort: "low" },
  });
});

test("drops only the docs part of a multi-section update", () => {
  const toolsUpdate = sectionUpdate("tools", "- read: Read file contents");
  const messages = shapedMessages(
    payloadWithSystemMessage([
      {
        type: "text",
        text: `${sectionUpdate("docs", PI_DOCS_UPDATE_BODY)}\n\n${toolsUpdate}`,
      },
    ]),
  );

  assert.equal(
    blockText(messages, 1),
    toolsUpdate,
    "the surviving part keeps its own framing and the dropped one leaves none behind",
  );
});

test("drops a removal notice for pi's own docs section", () => {
  const messages = shapedMessages(
    payloadWithSystemMessage([
      { type: "text", text: 'Removed system prompt section "docs".' },
    ]),
  );

  assert.deepEqual(
    messages.map((message) => message.role),
    ["user"],
    "we never sent pi's docs section, so its removal notice names nothing the model has",
  );
});

test("leaves a system message with plain text untouched", () => {
  const messages = shapedMessages(
    payloadWithSystemMessage([
      { type: "text", text: "Some unframed system note." },
    ]),
  );

  assert.equal(blockText(messages, 1), "Some unframed system note.");
});

test("leaves user and assistant messages untouched", () => {
  const update = sectionUpdate("docs", PI_DOCS_UPDATE_BODY);
  const payload = createOAuthPayload({
    messages: [
      { role: "user", content: [{ type: "text", text: update }] },
      { role: "assistant", content: [{ type: "text", text: update }] },
    ],
  });

  const messages = shapedMessages(payload);

  assert.equal(messages.length, 2);
  assert.equal(blockText(messages, 0), update);
  assert.equal(blockText(messages, 1), update);
});
