import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";

import {
  PARAGRAPH_REMOVAL_ANCHORS,
  PI_DEFAULT_PROMPT_PREFIX,
  PI_DEFAULT_PROMPT_TERMINATOR,
} from "#src/constants";
import {
  _resetShapingWarnings,
  shapeAnthropicOAuthSystemPrompt,
} from "#src/system-prompt-shaping";
// `buildSystemPrompt` is not listed in pi's `exports` map, which declares only
// `.`, `./rpc-entry`, and `./client`.  The bare subpath specifier is therefore
// rejected by Node (ERR_PACKAGE_PATH_NOT_EXPORTED) and by vite's resolver
// alike; a filesystem path bypasses the map.  This is not the
// `src/host-transport.ts` situation — that module has to survive pi's jiti
// alias and virtual-module maps, whereas this file only ever runs under vitest.
import { buildSystemPrompt } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";

// ---------------------------------------------------------------------------
// Upstream anchor drift check
//
// `src/constants.ts` holds five strings copied verbatim out of pi's default
// system prompt.  Nothing else in the suite verifies they still match the
// installed pi, so drift surfaces at request time — a `console.warn` on stderr
// mid-session for the terminator, and silence for a removal anchor.
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

const APPENDED_NOTE = "## Custom Note (from another extension)";
const PROJECT_INSTRUCTION = "Preserve built-in Anthropic behavior by default.";
const EXTRA_GUIDELINE = "Always check the frobnicator before deploying";

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
    cwd: "/tmp/project",
    selectedTools: ["read", "bash"],
    toolSnippets: {
      read: "Read file contents",
      bash: "Execute shell commands",
    },
    promptGuidelines: [EXTRA_GUIDELINE],
    appendSystemPrompt: `${APPENDED_NOTE}\n- Some critical project instruction.`,
    contextFiles: [
      { path: "/tmp/project/AGENTS.md", content: PROJECT_INSTRUCTION },
    ],
  });
}

test("PI_DEFAULT_PROMPT_PREFIX still opens the installed pi's default prompt", () => {
  const built = buildUpstreamPrompt();

  assert.ok(
    built.startsWith(PI_DEFAULT_PROMPT_PREFIX),
    "PI_DEFAULT_PROMPT_PREFIX no longer opens the prompt the installed pi builds. " +
      "Shaping would pass every OAuth request through untouched. " +
      "Re-verify the constant against buildSystemPrompt in @earendil-works/pi-coding-agent.",
  );
});

test("PI_DEFAULT_PROMPT_TERMINATOR still ends the installed pi's preamble", () => {
  const built = buildUpstreamPrompt();
  const terminatorIdx = built.indexOf(PI_DEFAULT_PROMPT_TERMINATOR);

  assert.notEqual(
    terminatorIdx,
    -1,
    "PI_DEFAULT_PROMPT_TERMINATOR no longer appears in the prompt the installed pi builds. " +
      "Shaping would degrade to whole-prompt sanitization. " +
      "Re-verify the constant against buildSystemPrompt in @earendil-works/pi-coding-agent.",
  );
  assert.ok(
    terminatorIdx > built.indexOf(PI_DEFAULT_PROMPT_PREFIX),
    "PI_DEFAULT_PROMPT_TERMINATOR must appear after PI_DEFAULT_PROMPT_PREFIX; " +
      "shaping searches for it from the prefix onwards.",
  );

  // Scoped to the boundary claim rather than the whole tail: what matters is
  // that no Pi-generated text survives between the terminator and the content
  // pi appends, not how that appended content is formatted.
  assert.ok(
    built
      .slice(terminatorIdx + PI_DEFAULT_PROMPT_TERMINATOR.length)
      .startsWith(`\n\n${APPENDED_NOTE}`),
    "PI_DEFAULT_PROMPT_TERMINATOR no longer ends the preamble — pi emits more of its own " +
      "text after it, which shaping would leave in the OAuth request. Re-verify the constant.",
  );
});

test("every PARAGRAPH_REMOVAL_ANCHORS entry still matches a paragraph", () => {
  // Same split the sanitizer uses, so a match here means a match there.
  const paragraphs = buildUpstreamPrompt().split(/\n\n+/);

  for (const anchor of PARAGRAPH_REMOVAL_ANCHORS) {
    assert.ok(
      paragraphs.some((paragraph) => paragraph.includes(anchor)),
      `PARAGRAPH_REMOVAL_ANCHORS entry ${JSON.stringify(anchor)} no longer matches any ` +
        "paragraph of the prompt the installed pi builds. The paragraph it targeted would " +
        "survive into shaped OAuth requests. Re-verify the anchor.",
    );
  }
});

test("shaping the installed pi's prompt takes the terminator path", () => {
  // The latch is module-global, so a warning tripped earlier in this file would
  // suppress the one this test is watching for.
  _resetShapingWarnings();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  onTestFinished(() => {
    warnSpy.mockRestore();
    _resetShapingWarnings();
  });

  const shaped = shapeAnthropicOAuthSystemPrompt(buildUpstreamPrompt());

  assert.equal(
    warnSpy.mock.calls.length,
    0,
    "shaping the prompt the installed pi builds degraded to the sanitize-fallback path. " +
      "This is the mid-session stderr warning, caught at build time instead.",
  );

  // Replaced: the Pi identity paragraph.
  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.doesNotMatch(shaped, /operating inside pi, a coding agent harness/);

  // Removed: the custom-tool filler and the whole Pi documentation block.
  assert.doesNotMatch(shaped, /In addition to the tools above/);
  assert.doesNotMatch(shaped, /Pi documentation \(read only/);

  // Retained: tool snippets and the extension-contributed guideline.
  assert.match(shaped, /- read: Read file contents/);
  assert.match(shaped, /- bash: Execute shell commands/);
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
  assert.match(shaped, /\nCurrent working directory: \/tmp\/project$/);
});
