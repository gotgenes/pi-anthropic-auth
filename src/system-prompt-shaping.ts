const PI_DEFAULT_PROMPT_PREFIX =
  "You are an expert coding assistant operating inside pi, a coding agent harness.";

const MINIMAL_ANTHROPIC_OAUTH_PROMPT = [
  "You are an expert coding assistant.",
  "Be concise and helpful.",
  "Use the available tools to answer the user's request.",
  "Show file paths clearly when working with files.",
].join("\n");

function findProjectContextStart(systemPrompt: string): number {
  const marker = "\n\n# Project Context\n\n";
  return systemPrompt.indexOf(marker);
}

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
