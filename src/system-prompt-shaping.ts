import {
  MINIMAL_ANTHROPIC_OAUTH_PROMPT,
  PI_DEFAULT_PROMPT_PREFIX,
} from "./constants.js";

function findProjectContextStart(systemPrompt: string): number {
  const marker = "\n\n# Project Context\n\n";
  return systemPrompt.indexOf(marker);
}

/**
 * Shape a system prompt string for Anthropic OAuth compatibility.
 *
 * Replaces Pi's verbose default preamble with a minimal neutral prompt while
 * preserving any project context that follows.  Returns the original string
 * unchanged when Pi's default preamble is not detected.
 */
export function shapeAnthropicOAuthSystemPrompt(systemPrompt: string): string {
  if (!systemPrompt.includes(PI_DEFAULT_PROMPT_PREFIX)) {
    return systemPrompt;
  }

  const projectContextStart = findProjectContextStart(systemPrompt);
  if (projectContextStart === -1) {
    return MINIMAL_ANTHROPIC_OAUTH_PROMPT;
  }

  return `${MINIMAL_ANTHROPIC_OAUTH_PROMPT}${systemPrompt.slice(projectContextStart)}`;
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
