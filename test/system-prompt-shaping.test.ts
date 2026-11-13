import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";

import {
  _resetShapingWarnings,
  shapeAnthropicOAuthSystemPrompt,
  shapeSystemBlocks,
} from "#src/system-prompt-shaping";
import {
  APPENDED_NOTE,
  APPENDED_NOTE_BODY,
  EXTRA_GUIDELINE,
  FIXTURE_CONTEXT_FILE_PATH,
  FIXTURE_CWD,
  FIXTURE_TOOL_SNIPPETS,
  PI_WORDING_1_4,
  type PiPromptWording,
  PROJECT_INSTRUCTION,
} from "#test/system-prompt-fixture-parts";

// ---------------------------------------------------------------------------
// Pi system-prompt fixture
//
// Mirrors what upstream `buildSystemPromptSections` + `getSystemMessageText`
// render: an untagged preamble, then `<name>...</name>` sections joined by a
// blank line.  The structure was verified against the prompt pi 0.86.0 builds;
// the Pi-authored wording comes from a `PiPromptWording`, and the
// caller-supplied literals from the shared fixture module, so this stays in
// step with `test/upstream-prompt-drift.test.ts`.
// ---------------------------------------------------------------------------
function piToolsBody(wording: PiPromptWording = PI_WORDING_1_4): string {
  return [
    `- read: ${FIXTURE_TOOL_SNIPPETS.read}`,
    `- bash: ${FIXTURE_TOOL_SNIPPETS.bash}`,
    "- my_ext_tool: Extension-registered tool snippet",
    "",
    wording.toolsFiller,
  ].join("\n");
}

function piDocsBody(wording: PiPromptWording = PI_WORDING_1_4): string {
  return [
    wording.docsIntro,
    "- Main documentation: /home/user/.pi/agent/README.md",
    "- Additional docs: /home/user/.pi/agent/docs",
    "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)",
  ].join("\n");
}

const PI_RULES_BODY = [
  "- Use bash for file operations like ls, rg, find",
  `- ${EXTRA_GUIDELINE}`,
  "- Be concise in your responses",
  "- Show file paths clearly when working with files",
].join("\n");

function section(name: string, body: string): string {
  return `<${name}>\n${body}\n</${name}>`;
}

/** Build a Pi-shaped prompt, overriding individual sections per case. */
function piPrompt(
  overrides: { preamble?: string; sections?: string[] } = {},
  wording: PiPromptWording = PI_WORDING_1_4,
): string {
  const preamble = overrides.preamble ?? wording.preamble;
  const sections = overrides.sections ?? [
    section("tools", piToolsBody(wording)),
    section("rules", PI_RULES_BODY),
    section("docs", piDocsBody(wording)),
    section("addendum", `${APPENDED_NOTE}\n${APPENDED_NOTE_BODY}`),
    section(
      "project_context",
      [
        "Project-specific instructions and guidelines:",
        "",
        `<project_instructions path="${FIXTURE_CONTEXT_FILE_PATH}">`,
        PROJECT_INSTRUCTION,
        "</project_instructions>",
      ].join("\n"),
    ),
    section("skills", "- deploy: how to ship this project"),
    section("cwd", FIXTURE_CWD),
  ];
  return [preamble, ...sections].join("\n\n");
}

/**
 * Count XML section tags that have no partner.
 *
 * This is the defect the issue reports: shaping used to remove `</tools>`
 * along with the filler paragraph and leave `</docs>` with nothing to close.
 */
function unbalancedTags(text: string): string[] {
  // Attributes are allowed on the open tag so `<project_instructions path=…>`
  // pairs with its close rather than counting as an orphan.
  const open = [...text.matchAll(/^<([a-z][a-z0-9_-]*)(?:\s[^>]*)?>$/gm)].map(
    (match) => match[1],
  );
  const close = [...text.matchAll(/^<\/([a-z][a-z0-9_-]*)>$/gm)].map(
    (match) => match[1],
  );
  const unmatched: string[] = [];
  const remaining = [...close];
  for (const name of open) {
    const idx = remaining.indexOf(name);
    if (idx === -1) unmatched.push(`<${name}>`);
    else remaining.splice(idx, 1);
  }
  return [...unmatched, ...remaining.map((name) => `</${name}>`)];
}

test("the fixture is well-formed before shaping", () => {
  // Guards the tag-balance assertions below from false-greening on a fixture
  // that was already unbalanced.
  assert.deepEqual(unbalancedTags(piPrompt()), []);
});

test("leaves no unbalanced section tags in the shaped prompt", () => {
  assert.deepEqual(
    unbalancedTags(shapeAnthropicOAuthSystemPrompt(piPrompt())),
    [],
  );
});

// Assert the preamble-replacement invariant shared across shaping tests:
// the minimal prompt replaces pi's identity paragraph.
function assertPreambleReplaced(
  shaped: string,
  wording: PiPromptWording = PI_WORDING_1_4,
): void {
  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.ok(
    !shaped.includes(wording.preamble),
    "pi's identity paragraph must not survive shaping",
  );
}

test("replaces the untagged preamble with the minimal prompt", () => {
  const shaped = shapeAnthropicOAuthSystemPrompt(piPrompt());

  assertPreambleReplaced(shaped);
  assert.match(shaped, /Be concise and helpful\./);
  assert.match(
    shaped,
    /Use the available tools to answer the user's request\./,
  );
});

test("drops the whole docs section", () => {
  const shaped = shapeAnthropicOAuthSystemPrompt(piPrompt());

  assert.doesNotMatch(shaped, /<docs>/);
  assert.doesNotMatch(shaped, /<\/docs>/);
  assert.ok(
    !shaped.includes(PI_WORDING_1_4.docsIntro),
    "pi's documentation intro must not survive shaping",
  );
  assert.doesNotMatch(shaped, /- Main documentation:/);
});

test("strips the filler from the tools section but keeps the section", () => {
  const shaped = shapeAnthropicOAuthSystemPrompt(piPrompt());

  assert.ok(
    !shaped.includes(PI_WORDING_1_4.toolsFiller),
    "the custom-tool filler must not survive shaping",
  );
  assert.match(
    shaped,
    /<tools>\n- read: Read file contents\n- bash: Execute shell commands\n- my_ext_tool: Extension-registered tool snippet\n<\/tools>/,
  );
});

test("preserves rules, addendum, project context, skills, and cwd verbatim", () => {
  const shaped = shapeAnthropicOAuthSystemPrompt(piPrompt());

  assert.ok(shaped.includes(section("rules", PI_RULES_BODY)));
  assert.ok(
    shaped.includes(
      section("addendum", `${APPENDED_NOTE}\n${APPENDED_NOTE_BODY}`),
    ),
  );
  assert.match(shaped, /<project_context>/);
  assert.ok(shaped.includes(PROJECT_INSTRUCTION));
  assert.ok(
    shaped.includes(section("skills", "- deploy: how to ship this project")),
  );
  assert.ok(shaped.endsWith(section("cwd", FIXTURE_CWD)));
});

test("keeps an extension-registered section it knows nothing about", () => {
  const shaped = shapeAnthropicOAuthSystemPrompt(
    piPrompt({
      sections: [
        section("tools", piToolsBody()),
        section("my_ext", "Extension-owned guidance."),
      ],
    }),
  );

  assert.ok(shaped.includes(section("my_ext", "Extension-owned guidance.")));
});

test("keeps a docs section an extension overwrote with its own content", () => {
  const shaped = shapeAnthropicOAuthSystemPrompt(
    piPrompt({
      sections: [
        section("tools", piToolsBody()),
        section("docs", "Our team's runbook lives at docs/runbook.md."),
      ],
    }),
  );

  assert.ok(
    shaped.includes(
      section("docs", "Our team's runbook lives at docs/runbook.md."),
    ),
    "only pi's own docs content is dropped, matched by anchor",
  );
});

test("applies TEXT_REPLACEMENTS inside pi-owned sections", () => {
  const shaped = shapeAnthropicOAuthSystemPrompt(
    piPrompt({
      sections: [
        section(
          "rules",
          "Here is some useful information about the environment you are running in:",
        ),
        section("tools", piToolsBody()),
      ],
    }),
  );

  assert.doesNotMatch(shaped, /Here is some useful information/);
  assert.match(shaped, /Environment context you are running in:/);
});

test("leaves a user's project context untouched by TEXT_REPLACEMENTS", () => {
  const quoted =
    "Here is some useful information about the environment you are running in:";
  const shaped = shapeAnthropicOAuthSystemPrompt(
    piPrompt({
      sections: [
        section("tools", piToolsBody()),
        section("project_context", quoted),
      ],
    }),
  );

  assert.ok(
    shaped.includes(section("project_context", quoted)),
    "replacements are scoped to pi-generated sections",
  );
});

test("keeps a custom preamble that is not pi's default", () => {
  const shaped = shapeAnthropicOAuthSystemPrompt(
    piPrompt({ preamble: "You are a helpful assistant for Acme Corp." }),
  );

  assert.match(shaped, /^You are a helpful assistant for Acme Corp\./);
});

test("passes an unstructured prompt through untouched and warns once", () => {
  _resetShapingWarnings();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  onTestFinished(() => {
    warnSpy.mockRestore();
    _resetShapingWarnings();
  });

  // A pre-0.86 flat prompt: the Pi identity is there, but no sections are.
  // Shaping cannot replace the single untagged chunk without discarding the
  // project context and footer along with the preamble, so it declines.
  const flat = [
    "You are an expert coding assistant operating inside pi, a coding agent harness.",
    "",
    "Available tools:",
    `- read: ${FIXTURE_TOOL_SNIPPETS.read}`,
    "",
    `Current working directory: ${FIXTURE_CWD}`,
  ].join("\n");

  assert.equal(shapeAnthropicOAuthSystemPrompt(flat), flat);
  assert.equal(shapeAnthropicOAuthSystemPrompt(flat), flat);
  assert.equal(
    warnSpy.mock.calls.length,
    1,
    "the degraded-path warning is latched to one emission per process",
  );
});

test("leaves a prompt without pi's preamble or sections unchanged", () => {
  _resetShapingWarnings();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  onTestFinished(() => {
    warnSpy.mockRestore();
    _resetShapingWarnings();
  });

  const systemPrompt = [
    "Project-specific instructions and guidelines:",
    "## AGENTS.md",
    PROJECT_INSTRUCTION,
  ].join("\n");

  assert.equal(shapeAnthropicOAuthSystemPrompt(systemPrompt), systemPrompt);
});

test("keeps the filler sentence when an extension quotes it downstream", () => {
  // The anchor only fires inside pi's own tools section, so an extension that
  // quotes the same sentence in its addendum keeps it (Issue #10).
  const quoted =
    "In addition to the tools above, this extension adds a downstream policy paragraph.";
  const shaped = shapeAnthropicOAuthSystemPrompt(
    piPrompt({
      sections: [section("tools", piToolsBody()), section("addendum", quoted)],
    }),
  );

  assert.ok(shaped.includes(section("addendum", quoted)));
  assert.ok(!shaped.includes(PI_WORDING_1_4.toolsFiller));
});

test("preserves a prompt with no project context or skills sections", () => {
  const shaped = shapeAnthropicOAuthSystemPrompt(
    piPrompt({
      sections: [
        section("tools", piToolsBody()),
        section("docs", piDocsBody()),
        section("cwd", FIXTURE_CWD),
      ],
    }),
  );

  assertPreambleReplaced(shaped);
  assert.doesNotMatch(shaped, /<docs>/);
  assert.ok(shaped.endsWith(section("cwd", FIXTURE_CWD)));
  assert.deepEqual(unbalancedTags(shaped), []);
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
      text: piPrompt(),
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
  assert.match(shaped[2]?.text ?? "", /<project_context>/);
  assert.ok((shaped[2]?.text ?? "").includes(PROJECT_INSTRUCTION));
  assert.match(
    shaped[2]?.text ?? "",
    /my_ext_tool: Extension-registered tool snippet/,
  );
});
