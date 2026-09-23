import type { MessageBlock, MessageParam } from "./anthropic-message";
import {
  BILLING_HEADER_MARKER,
  buildBillingHeaderValue,
  getFirstUserText,
} from "./billing-header";
import { resolveClaudeCodeVersion } from "./claude-code-version";
import { debugLog, isToolUseOnlyDebugEnabled } from "./debug";
import {
  shapeSystemBlocks,
  shapeSystemUpdateText,
} from "./system-prompt-shaping";

type TextBlock = {
  type: "text";
  text: string;
  cache_control?: unknown;
  [key: string]: unknown;
};

type AnthropicPayload = {
  model?: unknown;
  messages?: unknown;
  system?: unknown;
  stream?: unknown;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAnthropicMessagesPayload(
  payload: unknown,
): payload is AnthropicPayload {
  return (
    isRecord(payload) &&
    typeof payload.model === "string" &&
    Array.isArray(payload.messages) &&
    typeof payload.stream === "boolean"
  );
}

/**
 * Coerce a payload's `system` field into an array of text blocks.
 *
 * Anthropic accepts `system` as a bare string, an array of blocks, or nothing
 * at all; callers that need to inspect or rewrite it want one shape.
 */
function normalizeSystemBlocks(system: unknown): TextBlock[] {
  if (Array.isArray(system)) {
    return system.map(normalizeSystemBlock);
  }
  return system == null ? [] : [normalizeSystemBlock(system)];
}

function normalizeSystemBlock(block: unknown): TextBlock {
  if (typeof block === "string") {
    return { type: "text", text: block };
  }

  if (isRecord(block) && typeof block.text === "string") {
    return {
      ...block,
      type: "text",
      text: block.text,
    };
  }

  return { type: "text", text: "" };
}

function prependBillingHeader(
  system: unknown,
  messages: MessageParam[],
): unknown {
  const billingHeader = buildBillingHeaderValue(
    getFirstUserText(messages),
    resolveClaudeCodeVersion(),
  );
  if (!billingHeader) {
    return system;
  }

  const systemBlocks = normalizeSystemBlocks(system);

  if (
    systemBlocks.some((block) => block.text.includes(BILLING_HEADER_MARKER))
  ) {
    return systemBlocks;
  }

  const billingBlock: TextBlock = { type: "text", text: billingHeader };

  return [billingBlock, ...systemBlocks];
}

/**
 * Applies system prompt shaping to `role: "system"` messages.
 *
 * Pi 0.86.0 re-sends changed prompt sections mid-conversation as system
 * messages inside `messages[]` on models that accept them, so Pi content the
 * sanitizer strips from `system[]` would otherwise reach Anthropic by that
 * second route (Issue #69).
 *
 * A message whose text blocks all shape away is dropped, since Anthropic
 * rejects an empty `content` array.  Non-text blocks — the `tool_addition`
 * and `tool_removal` entries a section update can carry — pass through, and
 * keep their message alive.  So does `output_config`: Pi carries the
 * requested effort for managed-effort models in content-less system messages.
 */
function shapeSystemRoleMessages(messages: MessageParam[]): MessageParam[] {
  return messages.flatMap((message) => {
    if (message.role !== "system" || !Array.isArray(message.content)) {
      return [message];
    }

    const content = message.content.flatMap(shapeSystemMessageBlock);
    return content.length > 0 || message.output_config !== undefined
      ? [{ ...message, content }]
      : [];
  });
}

function shapeSystemMessageBlock(block: MessageBlock): MessageBlock[] {
  if (block.type !== "text" || typeof block.text !== "string") {
    return [block];
  }

  const shaped = shapeSystemUpdateText(block.text);
  return shaped === undefined ? [] : [{ ...block, text: shaped }];
}

function countSystemRoleMessages(messages: MessageParam[]): number {
  return messages.filter((message) => message.role === "system").length;
}

function getToolDefinitionNames(payload: AnthropicPayload): string[] {
  const tools = payload.tools;
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools
    .map((tool) =>
      isRecord(tool) && typeof tool.name === "string" ? tool.name : undefined,
    )
    .filter((name): name is string => typeof name === "string");
}

function getToolUseNames(messages: MessageParam[]): string[] {
  return messages.flatMap((message) => {
    if (!Array.isArray(message.content)) {
      return [];
    }

    return message.content
      .map((block) =>
        block.type === "tool_use" && typeof block.name === "string"
          ? block.name
          : undefined,
      )
      .filter((name): name is string => typeof name === "string");
  });
}

function countAssistantMessages(messages: MessageParam[]): number {
  return messages.filter((message) => message.role === "assistant").length;
}

function shouldLogRequestDebug(messages: MessageParam[]): boolean {
  if (!isToolUseOnlyDebugEnabled()) {
    return true;
  }

  return getToolUseNames(messages).length > 0;
}

/**
 * Applies Anthropic Claude Code OAuth shaping to a built provider payload.
 *
 * This function assumes the caller has already confirmed the request is an
 * Anthropic OAuth request.  OAuth gating lives at the transport seam
 * (`createAnthropicOAuthStreamSimple`), which only invokes this shaping when
 * the request carries an `sk-ant-oat` access token.  We therefore do not
 * sniff system-prompt markers here; non-Anthropic-messages payloads are still
 * returned untouched as a structural guard.
 *
 * Assistant messages pass through unmodified.  We previously split assistant
 * turns that carried non-tool_use blocks after a tool_use block, on the
 * premise — ported from OpenCode, never verified here — that Anthropic
 * rejects that ordering.  A live probe found it does not (see
 * `docs/architecture.md`), while the split moved signed `thinking` blocks away
 * from the content they were produced against, which Anthropic *does* reject
 * (Issue #66).
 */
export function shapeAnthropicOAuthPayload(payload: unknown): unknown {
  if (!isAnthropicMessagesPayload(payload)) {
    return payload;
  }

  const messages = payload.messages as MessageParam[];
  const normalizedMessages = shapeSystemRoleMessages(messages);

  const shapedSystem = Array.isArray(payload.system)
    ? shapeSystemBlocks(payload.system as TextBlock[])
    : payload.system;
  const finalSystem = prependBillingHeader(shapedSystem, normalizedMessages);

  if (shouldLogRequestDebug(messages)) {
    debugLog("before-provider-request", {
      model: payload.model,
      systemBlockCountBefore: Array.isArray(payload.system)
        ? payload.system.length
        : 0,
      systemBlockCountAfter: Array.isArray(finalSystem)
        ? finalSystem.length
        : 0,
      // Only `role: "system"` messages are rewritten, so the assistant count
      // and the tool-use names cannot differ before and after shaping; a
      // before/after pair that cannot differ would only mislead.
      assistantMessages: countAssistantMessages(messages),
      systemMessagesBefore: countSystemRoleMessages(messages),
      systemMessagesAfter: countSystemRoleMessages(normalizedMessages),
      toolDefinitions: getToolDefinitionNames(payload),
      toolUseNames: getToolUseNames(messages),
    });
  }

  return {
    ...payload,
    messages: normalizedMessages,
    system: finalSystem,
  };
}
