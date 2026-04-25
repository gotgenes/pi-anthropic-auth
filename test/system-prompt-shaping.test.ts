import assert from "node:assert/strict";
import { test } from "vitest";

import {
  sanitizeSystemText,
  shapeAnthropicOAuthSystemPrompt,
  shapeSystemBlocks,
} from "../src/system-prompt-shaping.js";

// ---------------------------------------------------------------------------
// Realistic Pi preamble fixture
//
// Mirrors the structure upstream `buildSystemPrompt` produces, including the
// "In addition to the tools above" filler and the Pi documentation block.
// Extension-contributed promptSnippets appear in "Available tools:" and
// extension-contributed promptGuidelines appear in "Guidelines:".
// ---------------------------------------------------------------------------
const PI_PREAMBLE = [
  "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.",
  "",
  "Available tools:",
  "- read: Read file contents",
  "- bash: Execute shell commands",
  "- my_ext_tool: Extension-registered tool snippet",
  "",
  "In addition to the tools above, you may have access to other custom tools depending on the project.",
  "",
  "Guidelines:",
  "- Be concise in your responses",
  "- Show file paths clearly when working with files",
  "- Always check the frobnicator before deploying",
  "",
  "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
  "- Main documentation: /home/user/.pi/agent/README.md",
  "- Additional docs: /home/user/.pi/agent/docs",
  "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)",
].join("\n");

// ===== sanitizeSystemText =====

test("sanitizeSystemText removes paragraphs with Pi identity anchor", () => {
  const text = [
    "You are an expert coding assistant operating inside pi, a coding agent harness. You help users.",
    "",
    "Some other paragraph.",
  ].join("\n");

  const result = sanitizeSystemText(text);

  assert.doesNotMatch(result, /operating inside pi, a coding agent harness/);
  assert.match(result, /Some other paragraph\./);
});

test("sanitizeSystemText removes 'In addition to the tools above' filler", () => {
  const text = [
    "Available tools:",
    "- read: Read file contents",
    "",
    "In addition to the tools above, you may have access to other custom tools depending on the project.",
    "",
    "Guidelines:",
    "- Be concise",
  ].join("\n");

  const result = sanitizeSystemText(text);

  assert.match(result, /Available tools:/);
  assert.doesNotMatch(result, /In addition to the tools above/);
  assert.match(result, /Guidelines:/);
});

test("sanitizeSystemText removes Pi documentation block", () => {
  const text = [
    "Guidelines:",
    "- Be concise",
    "",
    "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
    "- Main documentation: /home/user/.pi/agent/README.md",
    "- Always read pi .md files completely",
    "",
    "# Project Context",
  ].join("\n");

  const result = sanitizeSystemText(text);

  assert.match(result, /Guidelines:/);
  assert.doesNotMatch(
    result,
    /Pi documentation \(read only when the user asks about pi itself/,
  );
  assert.doesNotMatch(result, /Main documentation:/);
  assert.match(result, /# Project Context/);
});

test("sanitizeSystemText applies TEXT_REPLACEMENTS for known classifier phrases", () => {
  const text =
    "Here is some useful information about the environment you are running in:\nOS: Linux";

  const result = sanitizeSystemText(text);

  assert.doesNotMatch(result, /Here is some useful information/);
  assert.match(result, /Environment context you are running in:/);
  assert.match(result, /OS: Linux/);
});

test("sanitizeSystemText preserves paragraphs without anchors", () => {
  const text = [
    "## Custom Note",
    "- Some critical instruction.",
    "",
    "# Project Context",
    "",
    "Project guidance.",
  ].join("\n");

  assert.equal(sanitizeSystemText(text), text);
});

// ===== shapeAnthropicOAuthSystemPrompt =====

test("replaces Pi preamble with minimal prompt and preserves tools, guidelines, and context", () => {
  const systemPrompt = [
    PI_PREAMBLE,
    "",
    "# Project Context",
    "",
    "Project-specific instructions and guidelines:",
    "",
    "## /tmp/AGENTS.md",
    "",
    "Preserve built-in Anthropic behavior by default.",
    "Current date: 2026-04-21",
    "Current working directory: /tmp/project",
  ].join("\n");

  const shaped = shapeAnthropicOAuthSystemPrompt(systemPrompt);

  // Minimal prompt prepended
  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.match(shaped, /Be concise and helpful\./);
  assert.match(
    shaped,
    /Use the available tools to answer the user's request\./,
  );

  // Pi identity removed
  assert.doesNotMatch(shaped, /operating inside pi, a coding agent harness/);

  // Pi documentation removed
  assert.doesNotMatch(
    shaped,
    /Pi documentation \(read only when the user asks about pi itself/,
  );
  assert.doesNotMatch(shaped, /Main documentation:/);

  // Pi filler removed
  assert.doesNotMatch(shaped, /In addition to the tools above/);

  // Extension-contributed tool snippets preserved
  assert.match(shaped, /my_ext_tool: Extension-registered tool snippet/);

  // Extension-contributed guidelines preserved
  assert.match(shaped, /Always check the frobnicator before deploying/);

  // Built-in guidelines preserved
  assert.match(shaped, /Be concise in your responses/);

  // Project context preserved
  assert.match(shaped, /# Project Context/);
  assert.match(shaped, /Preserve built-in Anthropic behavior by default\./);

  // Footer preserved
  assert.match(shaped, /Current date: 2026-04-21/);
  assert.match(shaped, /Current working directory: \/tmp\/project/);
});

test("leaves unrelated system prompt content unchanged", () => {
  const systemPrompt = [
    "Project-specific instructions and guidelines:",
    "## AGENTS.md",
    "Preserve built-in Anthropic behavior by default.",
  ].join("\n");

  assert.equal(shapeAnthropicOAuthSystemPrompt(systemPrompt), systemPrompt);
});

test("preserves content appended between preamble and Project Context (issue #9)", () => {
  const systemPrompt = [
    PI_PREAMBLE,
    "",
    "## Custom Note",
    "- Some critical instruction added by another extension.",
    "",
    "# Project Context",
    "",
    "## /tmp/AGENTS.md",
    "",
    "Project guidance.",
  ].join("\n");

  const shaped = shapeAnthropicOAuthSystemPrompt(systemPrompt);

  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.match(shaped, /## Custom Note/);
  assert.match(
    shaped,
    /- Some critical instruction added by another extension\./,
  );
  assert.match(shaped, /# Project Context/);
  assert.match(shaped, /Project guidance\./);
  assert.doesNotMatch(shaped, /operating inside pi, a coding agent harness/);
});

test("preserves trailing footer when there is no Project Context section", () => {
  const systemPrompt = [
    PI_PREAMBLE,
    "",
    "## Trailing Note",
    "- Appended by another extension.",
    "Current date: 2026-04-21",
    "Current working directory: /tmp/project",
  ].join("\n");

  const shaped = shapeAnthropicOAuthSystemPrompt(systemPrompt);

  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.match(shaped, /## Trailing Note/);
  assert.match(shaped, /- Appended by another extension\./);
  assert.match(shaped, /Current date: 2026-04-21/);
  assert.match(shaped, /Current working directory: \/tmp\/project/);
  assert.doesNotMatch(shaped, /operating inside pi, a coding agent harness/);
});

test("preserves content appended at the very end of the system prompt", () => {
  const systemPrompt = [
    PI_PREAMBLE,
    "",
    "# Project Context",
    "",
    "## /tmp/AGENTS.md",
    "",
    "Project guidance.",
    "Current date: 2026-04-21",
    "Current working directory: /tmp/project",
    "",
    "## Custom Note",
    "- Some critical instruction.",
  ].join("\n");

  const shaped = shapeAnthropicOAuthSystemPrompt(systemPrompt);

  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.match(shaped, /## Custom Note/);
  assert.match(shaped, /- Some critical instruction\./);
  assert.match(shaped, /Project guidance\./);
});

test("handles reworded preamble gracefully via anchor removal", () => {
  // Even if Pi rewords the preamble, as long as the identity anchor
  // string is still present, the sanitizer removes the paragraph.
  const reworded = [
    "You are an expert coding assistant operating inside pi, a coding agent harness. Completely reworded preamble with new text.",
    "",
    "# Project Context",
    "",
    "Project guidance.",
  ].join("\n");

  const shaped = shapeAnthropicOAuthSystemPrompt(reworded);

  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.match(shaped, /# Project Context/);
  assert.match(shaped, /Project guidance\./);
  assert.doesNotMatch(shaped, /operating inside pi, a coding agent harness/);
  assert.doesNotMatch(shaped, /Completely reworded preamble/);
});

test("returns minimal prompt when sanitizer removes everything", () => {
  // Pathological case: all paragraphs match anchors.
  const systemPrompt =
    "You are an expert coding assistant operating inside pi, a coding agent harness.";

  const shaped = shapeAnthropicOAuthSystemPrompt(systemPrompt);

  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.match(shaped, /Be concise and helpful\./);
});

// ===== shapeSystemBlocks =====

test("shapeSystemBlocks passes through non-text blocks and blocks without the prefix", () => {
  const blocks = [
    {
      type: "text" as const,
      text: "You are Claude Code, Anthropic's official CLI for Claude.",
    },
    {
      type: "image" as const,
      text: "ignored",
    },
    {
      type: "text" as const,
      text: [PI_PREAMBLE, "", "# Project Context", "", "Guidance."].join("\n"),
    },
  ];

  const shaped = shapeSystemBlocks(
    blocks as Parameters<typeof shapeSystemBlocks>[0],
  );

  // Block 0: identity block, unchanged.
  assert.equal(shaped[0]?.text, blocks[0]?.text);
  // Block 1: non-text, unchanged.
  assert.deepEqual(shaped[1], blocks[1]);
  // Block 2: preamble replaced, extension content preserved.
  assert.match(shaped[2]?.text ?? "", /^You are an expert coding assistant\./);
  assert.match(shaped[2]?.text ?? "", /# Project Context/);
  assert.match(shaped[2]?.text ?? "", /Guidance\./);
  assert.match(
    shaped[2]?.text ?? "",
    /my_ext_tool: Extension-registered tool snippet/,
  );
});
