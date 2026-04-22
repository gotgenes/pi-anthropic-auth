import assert from "node:assert/strict";
import test from "node:test";

import { shapeAnthropicOAuthSystemPrompt } from "../src/system-prompt-shaping.js";

test("replaces Pi default prompt body with a minimal neutral prompt", () => {
  const systemPrompt = [
    "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.",
    "",
    "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
    "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)",
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

  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.match(shaped, /Be concise and helpful\./);
  assert.match(
    shaped,
    /Use the available tools to answer the user's request\./,
  );
  assert.match(shaped, /# Project Context/);
  assert.match(shaped, /Preserve built-in Anthropic behavior by default\./);
  assert.doesNotMatch(shaped, /operating inside pi, a coding agent harness/);
  assert.doesNotMatch(
    shaped,
    /Pi documentation \(read only when the user asks about pi itself/,
  );
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
