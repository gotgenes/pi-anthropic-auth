import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { withBillingBlockOnContinuation } from "#src/thread-continuation";

const HEADER =
  "x-anthropic-billing-header: cc_version=2.1.323.abc; cc_entrypoint=sdk-cli; cch=12345;";

const TOOL_RESULT_MESSAGE = {
  role: "user",
  content: [{ type: "tool_result", tool_use_id: "toolu_01", content: "hi" }],
};

/** A user message whose text serializes as the `"continue"` token. */
const CONTINUE_TEXT_MESSAGE = {
  role: "user",
  content: [{ type: "text", text: "continue" }],
};

/** What pi-ai >=1.5.0 serializes for a message-thread continuation. */
function continuationBody(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    model: "claude-haiku-4-5",
    stream: true,
    messages: [TOOL_RESULT_MESSAGE],
    thread: { type: "continue", previous_message_id: "msg_01" },
    ...extra,
  });
}

describe("withBillingBlockOnContinuation", () => {
  describe("on a continuation without system", () => {
    test("splices the billing block in without re-serializing the body", () => {
      const body = continuationBody();

      assert.equal(
        withBillingBlockOnContinuation(body, HEADER),
        `{"system":[{"type":"text","text":${JSON.stringify(HEADER)}}],${body.slice(1)}`,
      );
    });

    test("adds system as the body's only change", () => {
      const body = continuationBody();

      const spliced = withBillingBlockOnContinuation(body, HEADER);

      assert.ok(spliced !== undefined);
      assert.deepEqual(JSON.parse(spliced), {
        system: [{ type: "text", text: HEADER }],
        ...(JSON.parse(body) as Record<string, unknown>),
      });
    });

    // A tool_use input is a JSON object, so a "system" key can appear in the
    // body without being the request's own system.
    test("splices a body whose only system key is nested in a tool input", () => {
      const body = continuationBody({
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_01",
                name: "configure",
                input: { system: "linux" },
              },
            ],
          },
          TOOL_RESULT_MESSAGE,
        ],
      });

      const spliced = withBillingBlockOnContinuation(body, HEADER);

      assert.ok(spliced !== undefined);
      assert.deepEqual((JSON.parse(spliced) as { system: unknown }).system, [
        { type: "text", text: HEADER },
      ]);
    });
  });

  describe("leaves every other body alone", () => {
    // Neither body carries system, and both contain a "continue" token, so
    // only the thread itself can tell them from a continuation.
    test("a thread create", () => {
      const body = JSON.stringify({
        messages: [CONTINUE_TEXT_MESSAGE],
        thread: { type: "create" },
      });

      assert.equal(withBillingBlockOnContinuation(body, HEADER), undefined);
    });

    test("a request with no thread", () => {
      const body = JSON.stringify({ messages: [CONTINUE_TEXT_MESSAGE] });

      assert.equal(withBillingBlockOnContinuation(body, HEADER), undefined);
    });

    test("a continuation that already carries system", () => {
      const body = continuationBody({
        system: [{ type: "text", text: "Already here." }],
      });

      assert.equal(withBillingBlockOnContinuation(body, HEADER), undefined);
    });

    test("a body that is not JSON", () => {
      assert.equal(
        withBillingBlockOnContinuation('{"thread":"continue"', HEADER),
        undefined,
      );
    });

    test("a JSON array", () => {
      assert.equal(
        withBillingBlockOnContinuation(
          '[{"thread":{"type":"continue"}}]',
          HEADER,
        ),
        undefined,
      );
    });
  });
});
