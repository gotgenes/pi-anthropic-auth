import { createHash } from "node:crypto";

const ANTHROPIC_OAUTH_BETAS = ["claude-code-20250219", "oauth-2025-04-20"];
const BILLING_HEADER_SALT = "59cf53e54c78";
const BILLING_HEADER_POSITIONS = [4, 7, 20] as const;
const CLAUDE_CODE_VERSION = "2.1.87";
const CLAUDE_CODE_ENTRYPOINT = "sdk-cli";
const CLAUDE_CODE_IDENTITY_PREFIX =
  "You are Claude Code, Anthropic's official CLI";
const PI_MINIMAL_ANTHROPIC_PROMPT_PREFIX =
  "You are an expert coding assistant.";

type TextBlock = {
  type: "text";
  text: string;
  cache_control?: unknown;
  [key: string]: unknown;
};

type MessageBlock = {
  type?: string;
  text?: string;
  [key: string]: unknown;
};

type MessageParam = {
  role?: string;
  content?: string | MessageBlock[];
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

function isOAuthAnthropicPayload(payload: AnthropicPayload): boolean {
  if (!Array.isArray(payload.system)) {
    return false;
  }

  return payload.system.some(hasOAuthAnthropicSystemMarker);
}

function hasOAuthAnthropicSystemMarker(block: unknown): boolean {
  if (
    !isRecord(block) ||
    block.type !== "text" ||
    typeof block.text !== "string"
  ) {
    return false;
  }

  return (
    block.text.includes(CLAUDE_CODE_IDENTITY_PREFIX) ||
    block.text.includes("x-anthropic-billing-header:") ||
    block.text.startsWith(PI_MINIMAL_ANTHROPIC_PROMPT_PREFIX)
  );
}

function _hasClaudeCodeIdentity(block: unknown): boolean {
  return (
    isRecord(block) &&
    block.type === "text" &&
    typeof block.text === "string" &&
    block.text.includes(CLAUDE_CODE_IDENTITY_PREFIX)
  );
}

function getFirstUserText(messages: MessageParam[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return "";

  if (typeof firstUserMessage.content === "string") {
    return firstUserMessage.content;
  }

  if (!Array.isArray(firstUserMessage.content)) {
    return "";
  }

  const firstTextBlock = firstUserMessage.content.find(
    (block) => block?.type === "text" && typeof block.text === "string",
  );

  return typeof firstTextBlock?.text === "string" ? firstTextBlock.text : "";
}

function buildBillingHeaderValue(messages: MessageParam[]): string | undefined {
  const messageText = getFirstUserText(messages);
  if (!messageText) {
    return undefined;
  }

  const cch = createHash("sha256")
    .update(messageText)
    .digest("hex")
    .slice(0, 5);
  const sampledCharacters = BILLING_HEADER_POSITIONS.map(
    (index) => messageText[index] || "0",
  ).join("");
  const suffix = createHash("sha256")
    .update(`${BILLING_HEADER_SALT}${sampledCharacters}${CLAUDE_CODE_VERSION}`)
    .digest("hex")
    .slice(0, 3);

  return [
    "x-anthropic-billing-header:",
    `cc_version=${CLAUDE_CODE_VERSION}.${suffix};`,
    `cc_entrypoint=${CLAUDE_CODE_ENTRYPOINT};`,
    `cch=${cch};`,
  ].join(" ");
}

function normalizeSystemBlock(block: unknown): TextBlock {
  if (typeof block === "string") {
    return { type: "text", text: block };
  }

  if (isRecord(block) && typeof block.text === "string") {
    return {
      ...block,
      type: block.type === "text" ? "text" : "text",
      text: block.text,
    };
  }

  return { type: "text", text: String(block ?? "") };
}

function prependBillingHeader(
  system: unknown,
  messages: MessageParam[],
): TextBlock[] | unknown {
  const billingHeader = buildBillingHeaderValue(messages);
  if (!billingHeader) {
    return system;
  }

  const systemBlocks = Array.isArray(system)
    ? system.map(normalizeSystemBlock)
    : system == null
      ? []
      : [normalizeSystemBlock(system)];

  if (
    systemBlocks.some((block) =>
      block.text.includes("x-anthropic-billing-header:"),
    )
  ) {
    return systemBlocks;
  }

  const billingBlock: TextBlock = { type: "text", text: billingHeader };

  return [billingBlock, ...systemBlocks];
}

function mergeAnthropicBetas(betaHeader: string | undefined): string {
  const existing = (betaHeader ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...ANTHROPIC_OAUTH_BETAS, ...existing])].join(",");
}

function splitAssistantToolUseTrailingContent(
  messages: MessageParam[],
): MessageParam[] {
  return messages.flatMap((message) => {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      return [message];
    }

    const firstToolUseIndex = message.content.findIndex(
      (block) => block?.type === "tool_use",
    );
    if (firstToolUseIndex === -1) {
      return [message];
    }

    const trailingBlocks = message.content.slice(firstToolUseIndex);
    if (!trailingBlocks.some((block) => block?.type !== "tool_use")) {
      return [message];
    }

    const nonToolUseBlocks = message.content.filter(
      (block) => block?.type !== "tool_use",
    );
    const toolUseBlocks = message.content.filter(
      (block) => block?.type === "tool_use",
    );

    return [
      { ...message, content: nonToolUseBlocks },
      { ...message, content: toolUseBlocks },
    ];
  });
}

export function shapeAnthropicOAuthPayload(payload: unknown): unknown {
  if (!isAnthropicMessagesPayload(payload)) {
    return payload;
  }

  const messages = payload.messages as MessageParam[];
  if (!isOAuthAnthropicPayload(payload)) {
    return payload;
  }

  const normalizedMessages = splitAssistantToolUseTrailingContent(messages);

  const shapedPayload: AnthropicPayload = {
    ...payload,
    messages: normalizedMessages,
    system: prependBillingHeader(payload.system, normalizedMessages),
  };

  if (typeof payload["anthropic-beta"] === "string") {
    shapedPayload["anthropic-beta"] = mergeAnthropicBetas(
      payload["anthropic-beta"],
    );
  }

  return shapedPayload;
}
