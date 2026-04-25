import {
  MINIMAL_ANTHROPIC_OAUTH_PROMPT,
  PI_DEFAULT_PROMPT_PREFIX,
  PI_DEFAULT_PROMPT_TERMINATOR,
} from "./constants.js";

let warnedTerminatorMissing = false;

function warnTerminatorMissingOnce(): void {
  if (warnedTerminatorMissing) {
    return;
  }
  warnedTerminatorMissing = true;
  console.warn(
    "[pi-anthropic-auth] Pi default preamble terminator not found; falling back to '# Project Context' anchor. " +
      "Upstream Pi may have reworded its preamble — update PI_DEFAULT_PROMPT_TERMINATOR.",
  );
}

/**
 * Reset the one-time terminator-missing warning latch.  Exposed for tests.
 */
export function _resetShapingWarnings(): void {
  warnedTerminatorMissing = false;
}

function findProjectContextStart(systemPrompt: string): number {
  const marker = "\n\n# Project Context\n\n";
  return systemPrompt.indexOf(marker);
}

/**
 * Fallback shaping: slice from the start of the `# Project Context` section.
 *
 * Used when Pi's preamble terminator line cannot be located (e.g. upstream
 * reworded it).  Preserves the historical behavior so we degrade rather
 * than regressing.  Note: this loses any text Pi or other extensions appended
 * between the preamble and `# Project Context` (the issue #9 case) — the
 * tradeoff is that we still produce a valid OAuth-shaped prompt instead of
 * leaking Pi's verbose preamble.
 */
function shapeByProjectContextFallback(systemPrompt: string): string {
  const projectContextStart = findProjectContextStart(systemPrompt);
  if (projectContextStart === -1) {
    return MINIMAL_ANTHROPIC_OAUTH_PROMPT;
  }
  return `${MINIMAL_ANTHROPIC_OAUTH_PROMPT}${systemPrompt.slice(projectContextStart)}`;
}

/**
 * Shape a system prompt string for Anthropic OAuth compatibility.
 *
 * Replaces Pi's verbose default preamble with a minimal neutral prompt while
 * preserving everything Pi or other extensions emit *after* the preamble:
 * `appendSystemPrompt` content, `# Project Context`, `# Available Skills`,
 * and the `Current date` / `Current working directory` footer.
 *
 * Implementation: we locate the preamble span by its known start anchor
 * (`PI_DEFAULT_PROMPT_PREFIX`) and end anchor (`PI_DEFAULT_PROMPT_TERMINATOR`)
 * and replace just that span in-place.  Anything before the start anchor
 * (currently always empty in upstream Pi) and everything after the end
 * anchor is preserved verbatim.
 *
 * If the preamble prefix is not present, the prompt is returned unchanged.
 * If the prefix is present but the terminator is not (upstream reworded
 * the final bullet), we fall back to slicing from `# Project Context`
 * and emit a one-time warning.
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
  if (terminatorIdx === -1) {
    warnTerminatorMissingOnce();
    return shapeByProjectContextFallback(systemPrompt);
  }

  const terminatorEnd = terminatorIdx + PI_DEFAULT_PROMPT_TERMINATOR.length;
  return (
    systemPrompt.slice(0, prefixIdx) +
    MINIMAL_ANTHROPIC_OAUTH_PROMPT +
    systemPrompt.slice(terminatorEnd)
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
      block.type !== "text" ||
      !block.text.includes(PI_DEFAULT_PROMPT_PREFIX)
    ) {
      return block;
    }
    return { ...block, text: shapeAnthropicOAuthSystemPrompt(block.text) };
  });
}
