// ---------------------------------------------------------------------------
// Shared literals for system-prompt fixtures.
//
// `test/system-prompt-shaping.test.ts` writes its Pi-prompt fixtures by hand,
// while `test/upstream-prompt-drift.test.ts` builds the equivalent prompt with
// Pi's own `buildSystemPrompt`.  The two must agree on the content Pi treats as
// caller-supplied, or the hand-written fixture stops standing in for the real
// prompt and the drift check loses its subject.
//
// Only plain literals live here.  `buildSystemPrompt` stays imported solely by
// `upstream-prompt-drift.test.ts` — that file is the suite's one sanctioned
// door into a Pi internal (see AGENTS.md, Testing Guidance), and this module
// must not become a second one.
// ---------------------------------------------------------------------------

/** Heading of the `--append-system-prompt` content both fixtures append. */
export const APPENDED_NOTE = "## Custom Note (from another extension)";

/** Body line following {@link APPENDED_NOTE}. */
export const APPENDED_NOTE_BODY = "- Some critical project instruction.";

/** Full `--append-system-prompt` value: {@link APPENDED_NOTE} plus its body. */
export const APPENDED_SYSTEM_PROMPT = `${APPENDED_NOTE}\n${APPENDED_NOTE_BODY}`;

/** Working directory both fixtures report. */
export const FIXTURE_CWD = "/tmp/project";

/** Path of the context file both fixtures load project instructions from. */
export const FIXTURE_CONTEXT_FILE_PATH = `${FIXTURE_CWD}/AGENTS.md`;

/** Sole line of that context file, asserted to survive shaping. */
export const PROJECT_INSTRUCTION =
  "Preserve built-in Anthropic behavior by default.";

/** Extension-contributed `promptGuidelines` bullet, asserted to survive shaping. */
export const EXTRA_GUIDELINE = "Always check the frobnicator before deploying";

/**
 * Tool snippets both fixtures render.
 *
 * A tool appears in the prompt only when `toolSnippets` supplies a one-line
 * snippet for it *and* its name is in `selectedTools`, so the two must be kept
 * consistent — {@link FIXTURE_SELECTED_TOOLS} lists exactly these keys.
 */
export const FIXTURE_TOOL_SNIPPETS: Record<string, string> = {
  read: "Read file contents",
  bash: "Execute shell commands",
};

/** Tools selected for both fixtures; matches {@link FIXTURE_TOOL_SNIPPETS}. */
export const FIXTURE_SELECTED_TOOLS = Object.keys(FIXTURE_TOOL_SNIPPETS);

/**
 * The Pi-authored text shaping keys on, in one Pi release's wording.
 *
 * Pi has reworded these strings across releases while the peer range still
 * spans them, so the hand-built fixtures render each wording and the shaping
 * tests run against every one.
 */
export type PiPromptWording = {
  /** Label for `describe` blocks. */
  label: string;
  /** The default preamble, the prompt's untagged first chunk. */
  preamble: string;
  /** The trailing filler paragraph of the `tools` section. */
  toolsFiller: string;
  /** First line of Pi's own `docs` section. */
  docsIntro: string;
};

/** Pi 0.86.0 through 1.4.x. */
export const PI_WORDING_1_4: PiPromptWording = {
  label: "pi <=1.4 wording",
  preamble:
    "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.",
  toolsFiller:
    "In addition to the tools above, you may have access to other custom tools depending on the project.",
  docsIntro:
    "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
};

/** Pi 1.5.0 and later ("tighten system prompt", earendil-works/pi@705d047). */
export const PI_WORDING_1_5: PiPromptWording = {
  label: "pi >=1.5 wording",
  preamble:
    "You are a coding assistant running inside pi, a coding agent harness. Help users inspect files, run commands, and modify code.",
  toolsFiller: "Additional tools may be available.",
  docsIntro:
    "Pi documentation (read only when the user asks about the harness itself, its SDK, extensions, themes, skills, or TUI):",
};
