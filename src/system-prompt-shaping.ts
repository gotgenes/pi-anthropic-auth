import {
  MINIMAL_ANTHROPIC_OAUTH_PROMPT,
  PI_DEFAULT_PROMPT_PREFIXES,
  PI_DOCS_SECTION_ANCHORS,
  PI_OWNED_SECTIONS,
  PI_TOOLS_FILLER_ANCHORS,
  TEXT_REPLACEMENTS,
} from "./constants";
import { debugLog, isToolUseOnlyDebugEnabled } from "./debug";
import {
  namedSection,
  type PromptChunk,
  parseSystemPromptChunks,
  renderSystemPromptChunks,
} from "./system-prompt-sections";

let warnedPromptUnstructured = false;
let warnedPreambleUnrecognized = false;

/**
 * Reset the one-time shaping warning latches. Exposed for tests.
 */
export function _resetShapingWarnings(): void {
  warnedPromptUnstructured = false;
  warnedPreambleUnrecognized = false;
}

/**
 * The name under which the untagged leading text is offered to the rule table.
 *
 * Upstream keys the preamble this way too — `buildSystemPromptSections`
 * returns it as `preamble`, and a mid-conversation update naming that section
 * frames it with the same string.
 */
const PREAMBLE_SECTION = "preamble";

/**
 * The one section shaping removes outright rather than rewriting.
 *
 * Named once because two paths act on it: the leading prompt drops the
 * section itself, and a mid-conversation update drops both the section and
 * the notice announcing its removal.
 */
const DOCS_SECTION = "docs";

/** What shaping does with one section of the prompt. */
type SectionDecision =
  | { kind: "keep" }
  | { kind: "drop" }
  | { kind: "replace"; body: string };

type StructuredShapingReport = {
  droppedSections: string[];
  replacedSections: string[];
  replacementMatches: string[];
};

/**
 * Shape Pi's system prompt for Anthropic OAuth.
 *
 * Pi renders the prompt as an untagged preamble followed by `<name>` sections.
 * Shaping decides section by section — replacing the Pi identity, dropping
 * Pi's documentation block, and stripping the custom-tool filler — so the
 * surrounding structure stays well-formed and every section Pi appends
 * survives byte-identically.
 *
 * A prompt with none of Pi's own sections is passed through untouched, with a
 * one-time warning: it means upstream restructured again, and the section
 * names this module keys on are no more trustworthy than any other guess.
 * Replacing the single untagged chunk in that case would discard the project
 * context, skills, and cwd along with the preamble.
 */
export function shapeAnthropicOAuthSystemPrompt(systemPrompt: string): string {
  const chunks = parseSystemPromptChunks(systemPrompt);
  if (!chunks.some(isPiOwnedSection)) {
    warnPromptUnstructuredOnce();
    return systemPrompt;
  }

  const report: StructuredShapingReport = {
    droppedSections: [],
    replacedSections: [],
    replacementMatches: [],
  };
  const shaped = chunks.flatMap((chunk, index) =>
    shapeChunk(chunk, index === 0, report),
  );

  if (shouldLogStructuredDebug(report)) {
    debugLog("system-prompt-shaping", {
      mode: "sections",
      originalLength: systemPrompt.length,
      sectionNames: chunks.map((chunk) => chunk.name),
      ...report,
    });
  }

  return renderSystemPromptChunks(shaped);
}

function isPiOwnedSection(chunk: PromptChunk): boolean {
  return chunk.name !== null && PI_OWNED_SECTIONS.includes(chunk.name);
}

/**
 * Apply the rule table to one chunk.
 *
 * @param isLeading - whether this is the prompt's first chunk, which is the
 *   only untagged text the table treats as the preamble.
 * @returns the chunks to emit in its place: none when dropped.
 */
function shapeChunk(
  chunk: PromptChunk,
  isLeading: boolean,
  report: StructuredShapingReport,
): PromptChunk[] {
  const name = chunk.name ?? (isLeading ? PREAMBLE_SECTION : undefined);
  if (name === undefined) {
    return [chunk];
  }

  const decision = decideSection(name, chunk.body, report);
  if (decision.kind === "drop") {
    report.droppedSections.push(name);
    return [];
  }
  if (decision.kind === "replace") {
    report.replacedSections.push(name);
    return [withBody(chunk, decision.body)];
  }
  return [chunk];
}

/**
 * Decide what to do with one named section of Pi's prompt.
 *
 * Shared by the leading prompt and by mid-conversation section updates, which
 * carry the same section names in a different envelope.
 */
function decideSection(
  name: string,
  body: string,
  report: StructuredShapingReport,
): SectionDecision {
  if (!isPiGeneratedSection(name)) {
    return { kind: "keep" };
  }

  const text = applyTextReplacements(body, report);

  if (
    name === PREAMBLE_SECTION &&
    PI_DEFAULT_PROMPT_PREFIXES.some((prefix) => text.startsWith(prefix))
  ) {
    return { kind: "replace", body: MINIMAL_ANTHROPIC_OAUTH_PROMPT };
  }
  if (
    name === DOCS_SECTION &&
    PI_DOCS_SECTION_ANCHORS.some((anchor) => text.includes(anchor))
  ) {
    return { kind: "drop" };
  }
  if (name === "tools") {
    const stripped = removeParagraphContaining(text, PI_TOOLS_FILLER_ANCHORS);
    if (stripped !== text) {
      return { kind: "replace", body: stripped };
    }
  }

  return text === body ? { kind: "keep" } : { kind: "replace", body: text };
}

function isPiGeneratedSection(name: string): boolean {
  return name === PREAMBLE_SECTION || PI_OWNED_SECTIONS.includes(name);
}

/** Rebuild a chunk around a new body, preserving whether it was tagged. */
function withBody(chunk: PromptChunk, body: string): PromptChunk {
  return chunk.name === null
    ? { name: null, raw: body, body }
    : namedSection(chunk.name, body);
}

function removeParagraphContaining(
  text: string,
  anchors: readonly string[],
): string {
  const paragraphs = text.split(/\n\n+/);
  const kept = paragraphs.filter(
    (paragraph) => !anchors.some((anchor) => paragraph.includes(anchor)),
  );
  return kept.length === paragraphs.length ? text : kept.join("\n\n").trim();
}

function applyTextReplacements(
  text: string,
  report: StructuredShapingReport,
): string {
  let result = text;
  for (const rule of TEXT_REPLACEMENTS) {
    if (result.includes(rule.match)) {
      report.replacementMatches.push(rule.match);
    }
    result = result.replaceAll(rule.match, rule.replacement);
  }
  return result;
}

function shouldLogStructuredDebug(report: StructuredShapingReport): boolean {
  if (!isToolUseOnlyDebugEnabled()) {
    return true;
  }

  return (
    report.droppedSections.length === 0 && report.replacementMatches.length > 0
  );
}

// ---------------------------------------------------------------------------
// Mid-conversation section updates (Issue #69)
//
// On models that accept mid-conversation system messages, Pi re-sends changed
// sections as `role: "system"` messages rather than rebuilding `system[]`.
// `renderSystemMessageUpdate` frames each changed section by name, so the same
// Pi content the sanitizer strips from the leading prompt arrives by a second
// route.  These run the identical rule table over that envelope.
// ---------------------------------------------------------------------------

/**
 * Matches the framing `renderSystemMessageUpdate` puts on each changed section.
 *
 * Group 1 names an updated section (its rendered value follows); group 2 names
 * a removed one (the notice is the whole part).
 */
const SECTION_UPDATE_FRAME =
  /^(?:Updated system prompt section "([a-z][a-z0-9_-]*)":\n\n|Removed system prompt section "([a-z][a-z0-9_-]*)"\.$)/gm;

/**
 * Shape the text of a mid-conversation system message.
 *
 * @returns the shaped text, or undefined when every framed part was dropped
 *   and the block should not be sent at all.
 */
export function shapeSystemUpdateText(text: string): string | undefined {
  const frames = [...text.matchAll(SECTION_UPDATE_FRAME)];
  if (frames.length === 0) {
    return text;
  }

  const parts: string[] = [];
  const leading = text.slice(0, frames[0].index).trim();
  if (leading) {
    parts.push(leading);
  }

  for (const [index, frame] of frames.entries()) {
    const partEnd = frames[index + 1]?.index ?? text.length;
    const shaped = shapeUpdatePart(frame, text.slice(0, partEnd));
    if (shaped !== undefined) {
      parts.push(shaped);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/**
 * Apply the rule table to one framed part of a system message.
 *
 * @param frame - the framing match, whose groups name the section.
 * @param through - the message text up to the end of this part; the part's own
 *   value is what follows the framing.
 * @returns the part's replacement text, or undefined when it is dropped.
 */
function shapeUpdatePart(
  frame: RegExpExecArray,
  through: string,
): string | undefined {
  const framing = frame[0];
  // Only one of the two alternatives captures, so these are genuinely
  // optional even though the array type does not say so.
  const updatedSection = frame[1] as string | undefined;
  const removedSection = frame[2] as string | undefined;

  if (removedSection !== undefined) {
    // We never forwarded pi's own docs section, so a notice retracting it
    // names nothing the model was given.
    return removedSection === DOCS_SECTION ? undefined : framing;
  }
  if (updatedSection === undefined) {
    return framing;
  }

  const name = updatedSection;
  const value = through.slice(frame.index + framing.length).trimEnd();
  const section = parseSystemPromptChunks(value);
  const tagged = section.length === 1 && section[0].name === name;
  const body = tagged ? section[0].body : value;

  const decision = decideSection(name, body, {
    droppedSections: [],
    replacedSections: [],
    replacementMatches: [],
  });
  if (decision.kind === "drop") {
    return undefined;
  }

  const shapedBody = decision.kind === "replace" ? decision.body : body;
  return `${framing}${tagged ? namedSection(name, shapedBody).raw : shapedBody}`;
}

function warnPromptUnstructuredOnce(): void {
  if (warnedPromptUnstructured) {
    return;
  }
  warnedPromptUnstructured = true;
  console.warn(
    "[pi-anthropic-auth] Pi's system prompt carries none of its own sections; passing it through unshaped. " +
      "Upstream Pi may have restructured its prompt — re-verify PI_OWNED_SECTIONS.",
  );
}

type TextBlock = {
  type: "text";
  text: string;
  [key: string]: unknown;
};

/**
 * Apply system prompt shaping to an array of Anthropic system text blocks.
 *
 * Shapes each block containing Pi's default prompt preamble, in any known
 * wording, and returns a new array.  Blocks without the preamble are passed
 * through unchanged.
 *
 * A block that carries every one of Pi's own sections but no known preamble
 * is passed through too, with a one-time warning: Pi emits those sections only
 * alongside its default preamble, so the preamble has most likely been
 * reworded upstream, and the whole prompt is reaching Anthropic unshaped.
 */
export function shapeSystemBlocks(blocks: TextBlock[]): TextBlock[] {
  return blocks.map((block) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive runtime guard
    if (block.type !== "text") {
      return block;
    }
    if (!containsPiPreamble(block.text)) {
      warnIfPiPromptUnrecognized(block.text);
      return block;
    }
    return { ...block, text: shapeAnthropicOAuthSystemPrompt(block.text) };
  });
}

/** Whether a system block carries Pi's default preamble, in any known wording. */
function containsPiPreamble(text: string): boolean {
  return PI_DEFAULT_PROMPT_PREFIXES.some((prefix) => text.includes(prefix));
}

/**
 * Warn once when a block that failed the preamble gate is nonetheless Pi's own
 * default prompt.
 *
 * Every one of {@link PI_OWNED_SECTIONS} is required, not just one: an
 * extension may write some of those names under a custom prompt
 * (pi-permission-system writes `tools` and `rules` for subagents), which is
 * not drift and must not warn.
 */
function warnIfPiPromptUnrecognized(text: string): void {
  if (warnedPreambleUnrecognized) {
    return;
  }
  const names = new Set(
    parseSystemPromptChunks(text).map((chunk) => chunk.name),
  );
  if (!PI_OWNED_SECTIONS.every((section) => names.has(section))) {
    return;
  }
  warnedPreambleUnrecognized = true;
  console.warn(
    "[pi-anthropic-auth] Pi's system prompt carries its own sections but opens with a preamble this extension does not recognize; passing it through unshaped. " +
      "Upstream Pi may have reworded its prompt — re-verify PI_DEFAULT_PROMPT_PREFIXES.",
  );
}
