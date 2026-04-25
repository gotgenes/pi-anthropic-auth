import {
  MINIMAL_ANTHROPIC_OAUTH_PROMPT,
  PARAGRAPH_REMOVAL_ANCHORS,
  PI_DEFAULT_PROMPT_PREFIX,
  TEXT_REPLACEMENTS,
} from "./constants.js";

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
export function sanitizeSystemText(text: string): string {
  const paragraphs = text.split(/\n\n+/);

  const filtered = paragraphs.filter((paragraph) => {
    for (const anchor of PARAGRAPH_REMOVAL_ANCHORS) {
      if (paragraph.includes(anchor)) return false;
    }
    return true;
  });

  let result = filtered.join("\n\n");

  for (const rule of TEXT_REPLACEMENTS) {
    result = result.replaceAll(rule.match, rule.replacement);
  }

  return result.trim();
}

/**
 * Shape a system prompt string for Anthropic OAuth compatibility.
 *
 * Uses an anchor-driven sanitizer to remove Pi-specific paragraphs
 * (identity, documentation references, filler) while preserving
 * extension-contributed content (tool snippets, guidelines, appended
 * content, project context, skills, and date/cwd footer).
 *
 * Prepends a minimal neutral prompt to replace the removed Pi identity.
 *
 * If the Pi default prompt prefix is not present, the prompt is returned
 * unchanged — this gates shaping so non-Pi prompts pass through.
 */
export function shapeAnthropicOAuthSystemPrompt(systemPrompt: string): string {
  if (!systemPrompt.includes(PI_DEFAULT_PROMPT_PREFIX)) {
    return systemPrompt;
  }

  const sanitized = sanitizeSystemText(systemPrompt);

  if (!sanitized) {
    return MINIMAL_ANTHROPIC_OAUTH_PROMPT;
  }

  return `${MINIMAL_ANTHROPIC_OAUTH_PROMPT}\n\n${sanitized}`;
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
