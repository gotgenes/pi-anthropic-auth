import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";

import {
  PI_DEFAULT_PROMPT_PREFIXES,
  PI_DOCS_SECTION_ANCHORS,
  PI_OWNED_SECTIONS,
  PI_TOOLS_FILLER_ANCHORS,
} from "#src/constants";
import {
  parseSystemPromptChunks,
  renderSystemPromptChunks,
} from "#src/system-prompt-sections";
import {
  _resetShapingWarnings,
  shapeAnthropicOAuthSystemPrompt,
  shapeSystemBlocks,
} from "#src/system-prompt-shaping";
import {
  APPENDED_NOTE,
  APPENDED_SYSTEM_PROMPT,
  EXTRA_GUIDELINE,
  FIXTURE_CONTEXT_FILE_PATH,
  FIXTURE_CWD,
  FIXTURE_SELECTED_TOOLS,
  FIXTURE_TOOL_SNIPPETS,
  PROJECT_INSTRUCTION,
} from "#test/system-prompt-fixture-parts";
// `buildSystemPrompt` is not listed in pi's `exports` map, which declares only
// `.`, `./rpc-entry`, and `./client`.  The bare subpath specifier is therefore
// rejected by Node (ERR_PACKAGE_PATH_NOT_EXPORTED) and by vite's resolver
// alike; a filesystem path bypasses the map.  This is not the
// `src/host-transport.ts` situation — that module has to survive pi's jiti
// alias and virtual-module maps, whereas this file only ever runs under vitest.
import { buildSystemPrompt } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";

// ---------------------------------------------------------------------------
// Upstream prompt drift check
//
// `src/constants.ts` holds strings and section names copied verbatim out of
// pi's default system prompt.  Nothing else in the suite verifies they still
// match the installed pi, so drift surfaces at request time — a `console.warn`
// on stderr mid-session when no section is recognized, and silence when only
// one anchor goes stale.
//
// This is the one file in the suite that deliberately imports a Pi internal
// rather than building a fixture inline (see AGENTS.md Testing Guidance):
// depending on the internal *is* the verification.
//
// If pi restructures its `dist/` layout, the import above throws and this file
// reds with a resolution error rather than a drift message.  That is intended:
// "the anchors can no longer be verified" is as blocking as "the anchors
// drifted", and both should stop a dependency bump.
// ---------------------------------------------------------------------------

/**
 * Build a prompt with the installed pi's own builder, using the full option
 * set so the preamble is surrounded by the same appended sections a real
 * session produces.
 *
 * A tool renders under "Available tools:" only when `toolSnippets` supplies a
 * one-line snippet for it *and* the name appears in `selectedTools`.
 */
function buildUpstreamPrompt(): string {
  return buildSystemPrompt({
    cwd: FIXTURE_CWD,
    selectedTools: FIXTURE_SELECTED_TOOLS,
    toolSnippets: FIXTURE_TOOL_SNIPPETS,
    promptGuidelines: [EXTRA_GUIDELINE],
    appendSystemPrompt: APPENDED_SYSTEM_PROMPT,
    contextFiles: [
      { path: FIXTURE_CONTEXT_FILE_PATH, content: PROJECT_INSTRUCTION },
    ],
  });
}

test("PI_DEFAULT_PROMPT_PREFIXES still opens the installed pi's default prompt", () => {
  const built = buildUpstreamPrompt();

  assert.ok(
    PI_DEFAULT_PROMPT_PREFIXES.some((prefix) => built.startsWith(prefix)),
    "no entry of PI_DEFAULT_PROMPT_PREFIXES opens the prompt the installed pi builds. " +
      "Shaping would leave pi's identity paragraph in every OAuth request. " +
      "Add the new wording to the front of the list, keeping the old ones the peer range still covers.",
  );
});

test("the installed pi still emits every section shaping keys on", () => {
  const chunks = parseSystemPromptChunks(buildUpstreamPrompt());
  const names = chunks.map((chunk) => chunk.name);

  assert.equal(
    names[0],
    null,
    "the installed pi no longer opens its prompt with untagged preamble text. " +
      "Shaping offers only the first untagged chunk to the preamble rule, so the " +
      "Pi identity would survive. Re-verify against buildSystemPromptSections.",
  );

  for (const section of PI_OWNED_SECTIONS) {
    assert.ok(
      names.includes(section),
      `PI_OWNED_SECTIONS entry ${JSON.stringify(section)} is not a section the installed ` +
        "pi emits. Shaping uses these names to recognize pi's own prompt, so a stale " +
        "entry moves it toward the degraded passthrough path. Re-verify the constant.",
    );
  }
});

test("PI_DOCS_SECTION_ANCHORS still matches the installed pi's docs section", () => {
  const docs = parseSystemPromptChunks(buildUpstreamPrompt()).find(
    (chunk) => chunk.name === "docs",
  );

  assert.ok(docs, "the installed pi emits no docs section");
  assert.ok(
    PI_DOCS_SECTION_ANCHORS.some((anchor) => docs.body.includes(anchor)),
    "no entry of PI_DOCS_SECTION_ANCHORS matches the docs section the installed pi builds. " +
      "The whole Pi documentation block would survive into shaped OAuth requests. " +
      "Add the new wording to the front of the list.",
  );
});

test("PI_TOOLS_FILLER_ANCHORS still matches the installed pi's tools section", () => {
  const tools = parseSystemPromptChunks(buildUpstreamPrompt()).find(
    (chunk) => chunk.name === "tools",
  );

  assert.ok(tools, "the installed pi emits no tools section");
  assert.ok(
    PI_TOOLS_FILLER_ANCHORS.some((anchor) => tools.body.includes(anchor)),
    "no entry of PI_TOOLS_FILLER_ANCHORS matches the tools section the installed pi builds. " +
      "The custom-tool filler sentence would survive into shaped OAuth requests. " +
      "Add the new wording to the front of the list.",
  );
});

test("the parser round-trips the installed pi's prompt byte-for-byte", () => {
  const built = buildUpstreamPrompt();

  assert.equal(
    renderSystemPromptChunks(parseSystemPromptChunks(built)),
    built,
    "parsing and re-rendering the prompt the installed pi builds is not lossless, " +
      "so shaping would corrupt content it means to pass through untouched.",
  );
});

test("shaping the installed pi's prompt takes the section path", () => {
  // The latches are module-global, so a warning tripped earlier in this file
  // would suppress the one this test is watching for.
  _resetShapingWarnings();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  onTestFinished(() => {
    warnSpy.mockRestore();
    _resetShapingWarnings();
  });

  // Through `shapeSystemBlocks`, the entry point request shaping uses, so the
  // preamble gate is exercised along with the section rules.
  const shaped = shapeSystemBlocks([
    { type: "text", text: buildUpstreamPrompt() },
  ])[0].text;

  assert.equal(
    warnSpy.mock.calls.length,
    0,
    "shaping the prompt the installed pi builds warned: either it degraded to the " +
      "passthrough path or its preamble went unrecognized. This is the mid-session " +
      "stderr warning, caught at build time instead.",
  );

  // Replaced: the Pi identity paragraph.
  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.doesNotMatch(shaped, /inside pi, a coding agent harness/);

  // Removed: the custom-tool filler and the whole Pi documentation section.
  for (const anchor of PI_TOOLS_FILLER_ANCHORS) {
    assert.ok(!shaped.includes(anchor), `filler survived: ${anchor}`);
  }
  assert.doesNotMatch(shaped, /Pi documentation \(read only/);
  assert.doesNotMatch(shaped, /<docs>/);
  assert.doesNotMatch(shaped, /<\/docs>/);

  // Retained: the tools section itself, with its snippets.
  assert.match(shaped, /<tools>/);
  assert.match(shaped, new RegExp(`- read: ${FIXTURE_TOOL_SNIPPETS.read}`));
  assert.match(shaped, new RegExp(`- bash: ${FIXTURE_TOOL_SNIPPETS.bash}`));

  // Retained: the extension-contributed guideline.
  assert.ok(
    shaped.includes(`- ${EXTRA_GUIDELINE}`),
    "extension-contributed guidelines must survive shaping",
  );

  // Retained: everything pi appends after the preamble (Issue #10, Issue #47).
  assert.ok(
    shaped.includes(APPENDED_NOTE),
    "--append-system-prompt content must survive shaping",
  );
  assert.match(shaped, /<project_context>/);
  assert.ok(
    shaped.includes(PROJECT_INSTRUCTION),
    "project context files must survive shaping",
  );
  assert.ok(
    shaped.endsWith(`<cwd>\n${FIXTURE_CWD}\n</cwd>`),
    "the cwd section must survive shaping as the prompt's last section",
  );
});

test("shaping leaves the installed pi's prompt tag-balanced", () => {
  _resetShapingWarnings();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  onTestFinished(() => {
    warnSpy.mockRestore();
    _resetShapingWarnings();
  });

  // Re-parsing is the balance check: a chunk whose tags no longer pair stops
  // being a named section, so a stray tag shows up as untagged text.
  const shaped = shapeAnthropicOAuthSystemPrompt(buildUpstreamPrompt());
  const untagged = parseSystemPromptChunks(shaped).filter(
    (chunk) => chunk.name === null,
  );

  assert.deepEqual(
    untagged.map((chunk) => chunk.raw),
    [
      [
        "You are an expert coding assistant.",
        "Be concise and helpful.",
        "Use the available tools to answer the user's request.",
        "Show file paths clearly when working with files.",
      ].join("\n"),
    ],
    "the only untagged chunk of the shaped prompt must be the minimal preamble; " +
      "anything else is an orphaned or unclosed section tag.",
  );
});
