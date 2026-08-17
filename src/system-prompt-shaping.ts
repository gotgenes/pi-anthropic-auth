import {
  MINIMAL_ANTHROPIC_OAUTH_PROMPT,
  PARAGRAPH_REMOVAL_ANCHORS,
  PI_DEFAULT_PROMPT_PREFIX,
  PI_DEFAULT_PROMPT_TERMINATOR,
  TEXT_REPLACEMENTS,
} from "./constants";
import { debugLog, isToolUseOnlyDebugEnabled } from "./debug";

let warnedTerminatorMissing = false;

function warnTerminatorMissingOnce(): void {
  if (warnedTerminatorMissing) {
    return;
  }
  warnedTerminatorMissing = true;
  console.warn(
    "[pi-anthropic-auth] Pi default preamble terminator not found; falling back to anchor-based sanitization of the full prompt. " +
      "Upstream Pi may have reworded its preamble — update PI_DEFAULT_PROMPT_TERMINATOR.",
  );
}

/**
 * Reset the one-time terminator-missing warning latch. Exposed for tests.
 */
export function _resetShapingWarnings(): void {
  warnedTerminatorMissing = false;
}

export type SanitizedSystemTextReport = {
  text: string;
  removedParagraphs: Array<{
    anchor: string;
    preview: string;
  }>;
  replacementMatches: string[];
};

function previewParagraph(paragraph: string): string {
  return paragraph.replace(/\s+/g, " ").trim().slice(0, 140);
}

function shouldLogPromptDebug(report: SanitizedSystemTextReport): boolean {
  if (!isToolUseOnlyDebugEnabled()) {
    return true;
  }

  return (
    report.removedParagraphs.length === 0 &&
    report.replacementMatches.length > 0
  );
}

/**
 * Sanitize system prompt text by removing paragraphs containing known
 * Pi-specific anchor strings and applying inline text replacements for
 * known Anthropic classifier trigger phrases.
 *
 * A paragraph is any text between blank lines (`\n\n`).
 *
 * This approach is resilient to upstream rewording — as long as the anchor
 * string still appears somewhere in the paragraph, removal works regardless
 * of how the surrounding text changes.
 */
export function sanitizeSystemTextWithReport(
  text: string,
): SanitizedSystemTextReport {
  const paragraphs = text.split(/\n\n+/);
  const removedParagraphs: SanitizedSystemTextReport["removedParagraphs"] = [];

  const filtered = paragraphs.filter((paragraph) => {
    for (const anchor of PARAGRAPH_REMOVAL_ANCHORS) {
      if (!paragraph.includes(anchor)) {
        continue;
      }

      removedParagraphs.push({
        anchor,
        preview: previewParagraph(paragraph),
      });
      return false;
    }
    return true;
  });

  let result = filtered.join("\n\n");
  const replacementMatches: string[] = [];

  for (const rule of TEXT_REPLACEMENTS) {
    if (result.includes(rule.match)) {
      replacementMatches.push(rule.match);
    }
    result = result.replaceAll(rule.match, rule.replacement);
  }

  return {
    text: result.trim(),
    removedParagraphs,
    replacementMatches,
  };
}

export function sanitizeSystemText(text: string): string {
  return sanitizeSystemTextWithReport(text).text;
}

/**
 * Shape a system prompt string for Anthropic OAuth compatibility.
 *
 * For the normal upstream Pi prompt shape, sanitize only the known preamble
 * span and replace its identity paragraph with the minimal neutral prompt.
 * This preserves downstream configuration/extension points embedded in the
 * preamble (tool snippets and guideline bullets) while still stripping the
 * Pi-specific identity, filler, and documentation paragraphs.
 *
 * If Pi's known preamble terminator drifts upstream, the span end is unknown,
 * so we sanitize from the preamble prefix to the end of the prompt instead.
 * That removes the same Pi-specific paragraphs wherever they sit and leaves
 * everything Pi appended after the preamble in place.  It trades the span
 * restriction for content preservation, and only on this degraded path.
 */
export function shapeAnthropicOAuthSystemPrompt(systemPrompt: string): string {
  const prefixIdx = systemPrompt.indexOf(PI_DEFAULT_PROMPT_PREFIX);
  if (prefixIdx === -1) {
    return systemPrompt;
  }

  const terminatorIdx = systemPrompt.indexOf(
    PI_DEFAULT_PROMPT_TERMINATOR,
    prefixIdx,
  );
  if (terminatorIdx !== -1) {
    const spanEnd = terminatorIdx + PI_DEFAULT_PROMPT_TERMINATOR.length;
    return shapePreambleSpan(systemPrompt, prefixIdx, spanEnd, "terminator");
  }

  warnTerminatorMissingOnce();
  return shapePreambleSpan(
    systemPrompt,
    prefixIdx,
    systemPrompt.length,
    "sanitize-fallback",
  );
}

/**
 * Replace the span `[prefixIdx, spanEnd)` with the minimal neutral prompt
 * followed by the sanitized span, leaving the text on either side untouched.
 *
 * @param mode - which boundary the caller resolved `spanEnd` from, recorded in
 *   the debug log: the matched preamble terminator, or the end of the prompt
 *   when that terminator drifted.
 */
function shapePreambleSpan(
  systemPrompt: string,
  prefixIdx: number,
  spanEnd: number,
  mode: "terminator" | "sanitize-fallback",
): string {
  const span = systemPrompt.slice(prefixIdx, spanEnd);
  const report = sanitizeSystemTextWithReport(span);
  const shapedSpan = report.text
    ? `${MINIMAL_ANTHROPIC_OAUTH_PROMPT}\n\n${report.text}`
    : MINIMAL_ANTHROPIC_OAUTH_PROMPT;

  if (shouldLogPromptDebug(report)) {
    debugLog("system-prompt-shaping", {
      mode,
      originalLength: systemPrompt.length,
      spanLength: span.length,
      sanitizedSpanLength: report.text.length,
      removedParagraphCount: report.removedParagraphs.length,
      removedAnchors: report.removedParagraphs.map((entry) => entry.anchor),
      removedParagraphPreviews: report.removedParagraphs.map(
        (entry) => entry.preview,
      ),
      replacementMatches: report.replacementMatches,
    });
  }

  return (
    systemPrompt.slice(0, prefixIdx) + shapedSpan + systemPrompt.slice(spanEnd)
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
 * Finds the first block containing Pi's default prompt preamble and replaces
 * its text in-place (returning a new array).  Blocks without the preamble are
 * passed through unchanged.
 */
export function shapeSystemBlocks(blocks: TextBlock[]): TextBlock[] {
  return blocks.map((block) => {
    if (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive runtime guard
      block.type !== "text" ||
      !block.text.includes(PI_DEFAULT_PROMPT_PREFIX)
    ) {
      return block;
    }
    return { ...block, text: shapeAnthropicOAuthSystemPrompt(block.text) };
  });
}
