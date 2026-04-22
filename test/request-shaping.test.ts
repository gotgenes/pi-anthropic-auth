import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import test from "node:test"

import { shapeAnthropicOAuthPayload } from "../src/request-shaping.js"

const BILLING_HEADER_SALT = "59cf53e54c78"
const BILLING_HEADER_POSITIONS = [4, 7, 20] as const
const CLAUDE_CODE_VERSION = "2.1.87"

function buildExpectedBillingHeader(messageText: string): string {
  const cch = createHash("sha256").update(messageText).digest("hex").slice(0, 5)
  const sampledCharacters = BILLING_HEADER_POSITIONS.map((index) => messageText[index] || "0").join("")
  const suffix = createHash("sha256")
    .update(`${BILLING_HEADER_SALT}${sampledCharacters}${CLAUDE_CODE_VERSION}`)
    .digest("hex")
    .slice(0, 3)

  return [
    "x-anthropic-billing-header:",
    `cc_version=${CLAUDE_CODE_VERSION}.${suffix};`,
    "cc_entrypoint=sdk-cli;",
    `cch=${cch};`,
  ].join(" ")
}

function createOAuthPayload(overrides: Record<string, unknown> = {}) {
  return {
    model: "claude-sonnet-4-20250514",
    stream: true,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Please summarize this repository status." }],
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
  }
}

test("shapes only OAuth Anthropic payloads", () => {
  const payload = {
    model: "claude-sonnet-4-20250514",
    stream: true,
    messages: [{ role: "user", content: "Hello" }],
    system: [{ type: "text", text: "Generic system prompt." }],
  }

  const shaped = shapeAnthropicOAuthPayload(payload)

  assert.equal(shaped, payload)
})

test("prepends the billing header block without adding cache control on OAuth payloads", () => {
  const payload = createOAuthPayload({ "anthropic-beta": "existing-beta" })

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload
  const systemBlocks = shaped.system as Array<{ text: string; cache_control?: unknown }>
  const expectedHeader = buildExpectedBillingHeader("Please summarize this repository status.")

  assert.notEqual(shaped, payload)
  assert.equal(systemBlocks[0]?.text, expectedHeader)
  assert.equal(systemBlocks[0]?.cache_control, undefined)
  assert.equal(systemBlocks[1]?.text, payload.system[0]?.text)
  assert.equal(shaped["anthropic-beta"], "claude-code-20250219,oauth-2025-04-20,existing-beta")
})

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
  })

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload
  const systemBlocks = shaped.system as Array<{ cache_control?: unknown }>

  assert.equal(systemBlocks.length, 5)
  assert.equal(systemBlocks.filter((block) => block.cache_control != null).length, 4)
  assert.equal(systemBlocks[0]?.cache_control, undefined)
})

test("does not duplicate an existing billing header block", () => {
  const billingHeader = buildExpectedBillingHeader("Please summarize this repository status.")
  const payload = createOAuthPayload({
    system: [
      { type: "text", text: billingHeader },
      {
        type: "text",
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
      },
    ],
  })

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload
  const systemBlocks = shaped.system as Array<{ text: string }>

  assert.equal(systemBlocks.length, 2)
  assert.equal(systemBlocks[0]?.text, billingHeader)
})

test("leaves payloads without a user text message unchanged", () => {
  const payload = createOAuthPayload({
    messages: [
      {
        role: "user",
        content: [{ type: "tool_result", output: "not text" }],
      },
    ],
  })

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload

  assert.deepEqual(shaped.system, payload.system)
})

test("shapes OAuth payloads detected by the injected billing header marker", () => {
  const payload = {
    model: "claude-sonnet-4-20250514",
    stream: true,
    messages: [{ role: "user", content: "Please summarize this repository status." }],
    system: [
      {
        type: "text",
        text: buildExpectedBillingHeader("Please summarize this repository status."),
      },
      {
        type: "text",
        text: "Follow the user's instructions.",
      },
    ],
  }

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload

  assert.equal(shaped.system[0]?.text, payload.system[0]?.text)
})

test("shapes OAuth payloads detected by the minimal neutral system prompt marker", () => {
  const payload = {
    model: "claude-sonnet-4-20250514",
    stream: true,
    messages: [{ role: "user", content: "Please summarize this repository status." }],
    system: [
      {
        type: "text",
        text: "You are an expert coding assistant.\nBe concise and helpful.",
      },
    ],
  }

  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload
  const systemBlocks = shaped.system as Array<{ text: string }>

  assert.equal(systemBlocks[0]?.text, buildExpectedBillingHeader("Please summarize this repository status."))
  assert.equal(systemBlocks[1]?.text, payload.system[0]?.text)
})
