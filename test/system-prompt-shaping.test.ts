import assert from "node:assert/strict";
import test from "node:test";

import {
  _resetShapingWarnings,
  shapeAnthropicOAuthSystemPrompt,
  shapeSystemBlocks,
} from "../src/system-prompt-shaping.js";

const PI_PREAMBLE = [
  "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.",
  "",
  "Available tools:",
  "- read: Read file contents",
  "- bash: Execute shell commands",
  "",
  "Guidelines:",
  "- Be concise in your responses",
  "- Show file paths clearly when working with files",
  "",
  "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
  "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)",
].join("\n");

test("replaces Pi default prompt body with a minimal neutral prompt", () => {
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

test("preserves content appended between preamble and Project Context (issue #9)", () => {
  // Simulates Pi's appendSystemPrompt content (from --append-system-prompt,
  // APPEND_SYSTEM.md, or before_agent_start extensions chaining into
  // event.systemPrompt).  Pi's buildSystemPrompt inserts this between the
  // preamble and the # Project Context section.
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
  // When no AGENTS.md files are loaded, Pi emits no `# Project Context`
  // section but still appends `Current date:` and `Current working directory:`.
  // The previous slice-based shaping returned only the minimal prompt and
  // dropped the footer entirely.
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
  // The issue #9 reproduction example: an extension appends to the end of
  // event.systemPrompt, which lands after `Current working directory:`.
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

test("falls back to '# Project Context' anchor when terminator is missing and warns once", () => {
  _resetShapingWarnings();
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };

  try {
    // Preamble prefix is present but the terminator line is not (simulating
    // upstream rewording).  Two calls — only the first should warn.
    const reworded = [
      "You are an expert coding assistant operating inside pi, a coding agent harness. Reworded preamble that no longer ends with the terminator bullet.",
      "",
      "# Project Context",
      "",
      "Project guidance.",
    ].join("\n");

    const shaped1 = shapeAnthropicOAuthSystemPrompt(reworded);
    const shaped2 = shapeAnthropicOAuthSystemPrompt(reworded);

    // Fallback path produces: minimal prompt + slice from `# Project Context`.
    assert.match(shaped1, /^You are an expert coding assistant\./);
    assert.match(shaped1, /# Project Context/);
    assert.match(shaped1, /Project guidance\./);
    assert.doesNotMatch(shaped1, /operating inside pi, a coding agent harness/);
    assert.doesNotMatch(shaped1, /Reworded preamble/);

    // Identical output across calls.
    assert.equal(shaped1, shaped2);

    // Warning fires exactly once across both calls.
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /preamble terminator not found/);
  } finally {
    console.warn = originalWarn;
    _resetShapingWarnings();
  }
});

test("falls back to minimal-only when terminator and Project Context are both missing", () => {
  _resetShapingWarnings();
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    // No terminator and no `# Project Context` section.  We deliberately
    // accept losing the trailing content here (tracked as a degraded-mode
    // fallback) — the priority is that we still strip the Pi-flavored
    // preamble for OAuth.
    const reworded = [
      "You are an expert coding assistant operating inside pi, a coding agent harness. Reworded preamble.",
      "",
      "Trailing content with no known anchors.",
    ].join("\n");

    const shaped = shapeAnthropicOAuthSystemPrompt(reworded);

    assert.match(shaped, /^You are an expert coding assistant\./);
    assert.doesNotMatch(shaped, /operating inside pi, a coding agent harness/);
    assert.doesNotMatch(shaped, /Reworded preamble/);
  } finally {
    console.warn = originalWarn;
    _resetShapingWarnings();
  }
});

test("shapeSystemBlocks passes through non-text blocks and blocks without the prefix", () => {
  const blocks = [
    {
      type: "text" as const,
      text: "You are Claude Code, Anthropic's official CLI for Claude.",
    },
    {
      type: "image" as const,
      // Non-text block — should pass through untouched even though shaping
      // is hard-coded to look at .text.
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
  // Block 1: non-text, unchanged (and not the same reference is fine, but
  // semantically equal).
  assert.deepEqual(shaped[1], blocks[1]);
  // Block 2: preamble replaced.
  assert.match(shaped[2]?.text ?? "", /^You are an expert coding assistant\./);
  assert.match(shaped[2]?.text ?? "", /# Project Context/);
  assert.match(shaped[2]?.text ?? "", /Guidance\./);
});
