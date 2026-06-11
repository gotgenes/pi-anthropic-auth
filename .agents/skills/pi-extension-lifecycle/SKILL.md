---
name: pi-extension-lifecycle
description: >-
  Reference for the Pi coding agent's turn/tool execution model and extension
  event lifecycle. Use when designing extension timing (when to flush, notify,
  or intercept), understanding event sequencing, or reasoning about what the
  agent sees between turns. Includes the verified lifecycle diagram, event
  handler capabilities, message delivery mechanics, and empirical session-data
  patterns.
---

# Pi Extension Lifecycle Reference

## Agent loop structure (from source)

Source: `packages/agent/src/agent-loop.ts` in `pi-mono`.

```text
agent_start
│
▼
OUTER LOOP ─────────────────────────────────────────────────
│ INNER LOOP (while hasMoreToolCalls || pendingMessages)
│ │
│ │  turn_start
│ │      │
│ │      ▼
│ │  Process pendingMessages
│ │  (steering messages from previous turn are injected
│ │   as user/custom messages BEFORE the LLM call)
│ │      │
│ │      ▼
│ │  context event (extensions can modify messages)
│ │  before_provider_request
│ │      │
│ │      ▼
│ │  ┄┄┄ LLM generates response ┄┄┄
│ │      │
│ │      ▼
│ │  after_provider_response
│ │  message_start → message_update(s) → message_end
│ │      │
│ │      ▼
│ │  Extract tool calls from assistant message
│ │      │
│ │      ▼
│ │  Execute tool calls SEQUENTIALLY:
│ │  ┌──────────────────────────────────────────────┐
│ │  │ For each tool call:                          │
│ │  │   tool_execution_start                       │
│ │  │   tool_call (beforeToolCall)                  │
│ │  │     → can BLOCK (returns error to agent)     │
│ │  │     → can MODIFY input (mutate event.input)  │
│ │  │     → handler is AWAITED before tool runs    │
│ │  │   ┄┄┄ tool executes ┄┄┄                      │
│ │  │   tool_execution_end                         │
│ │  │   tool_result (afterToolCall)                 │
│ │  │     → can MODIFY result content/details      │
│ │  │     → handler is AWAITED                     │
│ │  └──────────────────────────────────────────────┘
│ │      │
│ │      ▼
│ │  turn_end  ← AWAITED before next turn_start
│ │      │
│ │      ▼
│ │  shouldStopAfterTurn? (not used by coding-agent)
│ │      │
│ │      ▼
│ │  pendingMessages = getSteeringMessages()
│ │      │
│ │  └── loop back if hasMoreToolCalls || pendingMessages
│ │
│ ▼
│ followUpMessages = getFollowUpMessages()
│ if followUp messages → pendingMessages = followUp, continue outer loop
│ else → break
│
└───────────────────────────────────────────────────────────
│
▼
agent_end
```

## Event handler capabilities

| Event                     | Awaited? | Can return result? | Result capabilities                    |
| ------------------------- | -------- | ------------------ | -------------------------------------- |
| `session_start`           | yes      | no                 | —                                      |
| `turn_start`              | yes      | no                 | —                                      |
| `context`                 | yes      | yes                | inject/modify messages before LLM call |
| `before_provider_request` | yes      | yes                | inspect or replace API payload         |
| `after_provider_response` | yes      | no                 | —                                      |
| `message_start`           | yes      | no                 | —                                      |
| `message_end`             | yes      | yes                | replace message content                |
| `tool_call`               | yes      | yes                | `{ block?: boolean, reason?: string }` |
| `tool_execution_start`    | yes      | no                 | notification only                      |
| `tool_execution_update`   | yes      | no                 | notification only                      |
| `tool_execution_end`      | yes      | no                 | notification only                      |
| `tool_result`             | yes      | yes                | `{ content?, details?, isError? }`     |
| `turn_end`                | yes      | no                 | —                                      |
| `agent_end`               | yes      | no                 | —                                      |
| `session_shutdown`        | yes      | no                 | —                                      |

## Tool call sequencing within a turn

When the LLM generates multiple tool calls in one response, they execute **sequentially** (not in parallel) when any tool has `executionMode: "sequential"` or the agent config sets `toolExecution: "sequential"`.
Pi's built-in coding tools (bash, edit, write, read, grep, find, ls) use sequential execution.

Each tool call follows the full lifecycle: `tool_call` → execute → `tool_result` before the next tool's `tool_call` fires.
This means an extension's `tool_result` handler for tool N runs before `tool_call` for tool N+1.

## Message delivery via `pi.sendMessage()`

During the agent loop, `isStreaming` is `true` (set at start, cleared in `finishRun` after `agent_end`).
This affects `sendMessage` behavior:

| State                           | `sendMessage()` default | `deliverAs: "steer"` | `deliverAs: "followUp"` | `triggerTurn: true`                |
| ------------------------------- | ----------------------- | -------------------- | ----------------------- | ---------------------------------- |
| Streaming (during turns)        | `agent.steer()`         | `agent.steer()`      | `agent.followUp()`      | N/A (streaming)                    |
| Not streaming (between prompts) | append to session       | —                    | —                       | `agent.prompt()` — starts new turn |

### Steering messages

- Enqueued via `agent.steer()`.
- Consumed by `getSteeringMessages()` after `turn_end` and `shouldStopAfterTurn`.
- Injected as `pendingMessages` at the start of the next turn, **before the LLM call**.
- If the inner loop exits (no more tool calls, no pending messages), steering messages are NOT consumed — they remain for the next prompt.

### Follow-up messages

- Enqueued via `agent.followUp()`.
- Consumed after the inner loop exits (when the agent would normally stop).
- If follow-up messages exist, they become `pendingMessages` and the outer loop continues — the agent gets another turn.

### Key implication for `turn_end` handlers

If an extension calls `pi.sendMessage()` at `turn_end` (while streaming), the message is steered.
After `turn_end`, the loop checks `getSteeringMessages()` and picks up the message.
The agent sees it before its next LLM call.

If the agent's last turn had no tool calls (text-only "Done!"
turn), the inner loop exits because `hasMoreToolCalls` is false.
But if a steering message was injected at `turn_end`, `pendingMessages.length > 0` keeps the loop going for one more turn.

## `tool_call` event input structure

```typescript
interface BashToolCallEvent {
  type: "tool_call";
  toolCallId: string;
  toolName: "bash";
  input: { command: string; timeout?: number };
}

interface EditToolCallEvent {
  type: "tool_call";
  toolCallId: string;
  toolName: "edit";
  input: { path: string; edits: Array<{ oldText: string; newText: string }> };
}

interface WriteToolCallEvent {
  type: "tool_call";
  toolCallId: string;
  toolName: "write";
  input: { path: string; content: string };
}

interface ReadToolCallEvent {
  type: "tool_call";
  toolCallId: string;
  toolName: "read";
  input: { path: string; offset?: number; limit?: number };
}
```

## `tool_result` event structure

```typescript
interface ToolResultEvent {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  content: (TextContent | ImageContent)[];
  details?: unknown;
  isError: boolean;
}
```

## `turn_end` event structure

```typescript
interface TurnEndEvent {
  type: "turn_end";
  turnIndex: number;
  message: AgentMessage;       // the assistant message from this turn
  toolResults: ToolResultMessage[];  // all tool results from this turn
}
```

## Blocking a tool call

Returning `{ block: true, reason: "..." }` from a `tool_call` handler:

1. The tool is **not executed**.
2. A tool error result is created: `"Tool execution was blocked: <reason>"`.
3. The agent sees this as a failed tool call and can decide what to do.
4. The `tool_result` event still fires (with `isError: true`).

## Empirical session data patterns

Analysis of 4,925 tool-using turns across multiple projects (pi-autoformat, pi-permission-system, and others):

| Pattern                                   | Count | %     |
| ----------------------------------------- | ----- | ----- |
| Single-tool turns                         | 4,515 | 91.7% |
| Multi-tool turns                          | 410   | 8.3%  |
| Same-file edits within one turn           | 0     | 0%    |
| Read-after-write to same file in one turn | 0     | 0%    |
| Write + git commit in same turn           | 0     | 0%    |
| Average mutation-turn streak length       | 4.6   | —     |

### What multi-tool turns look like

Multi-tool turns are almost exclusively non-conflicting combinations:

- `read + read` (reading multiple files)
- `bash + bash` (running multiple commands)
- `read + bash` (read a file, then run a test)
- `bash + read` (check output, then read a file)

The LLM does not generate two edits to the same file in one response.
It does not write a file and then read it back in the same response.
It does not write a file and commit it in the same response.

### What commit patterns look like

The typical commit flow across turns:

```text
Turn N:   edit src/foo.ts              (single tool)
Turn N+1: edit src/bar.ts              (single tool)
Turn N+2: bash("vitest run")           (single tool)
Turn N+3: bash("git add ... \n git commit -m '...'")  (single tool)
```

`git add` and `git commit` are always in the same bash command (newline or `&&` separated).
They never appear in the same turn as a write/edit tool call.

### Design implications

1. **Formatting at `turn_end` is safe** — no risk of corrupting a pending edit's `oldText` or a read's `offset`, because there are zero instances of same-file read/edit-after-write within a turn.
2. **`turn_end` flush catches the pre-commit case** — writes and commits are always in different turns, so files are formatted before any subsequent commit.
3. **Steering messages at `turn_end`** are the natural notification channel — the agent sees them before its next LLM call.
4. **`agent_end` is too late for intra-loop formatting** but serves as a safety net for files added outside the turn loop (e.g. via EventBus).
5. **`tool_call` interception for git commit** is unnecessary given `turn_end` formatting — the intra-turn write+commit pattern does not occur in practice.
