import assert from "node:assert/strict";
import type { FetchFunction } from "@earendil-works/pi-ai";
import { describe, test, vi } from "vitest";
import { createBillingVersionSync } from "#src/billing-version-sync";
import {
  CLAUDE_CODE_VERSION,
  createLearnedClaudeCodeFloor,
} from "#src/claude-code-version";
import {
  describeRecoveryHint,
  type RecoveryHintReason,
} from "#src/version-rejection";
import {
  buildExpectedBillingHeader,
  withVersionOverride,
} from "#test/billing-header-fixtures";
import {
  claudeCodeVersionTooOldResponse,
  okResponse,
  REJECTION_REQUEST_ID,
} from "#test/version-rejection-fixtures";

const USER_TEXT = "Summarize the repository status.";
const PI_AHEAD = "2.9.9";
const PI_BEHIND = "1.0.0";

const RESPONSE_STUB = new Response(null, { status: 200 });

type CapturingFetch = {
  fetch: FetchFunction;
  calls: Array<{ input: unknown; init: RequestInit | undefined }>;
};

/**
 * A base fetch that records each call and answers with `responses` in call
 * order, repeating the last one once the queue is exhausted.
 */
function createCapturingFetch(
  responses: Response[] = [RESPONSE_STUB],
): CapturingFetch {
  const calls: CapturingFetch["calls"] = [];
  const fetch = ((input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    const response = responses[Math.min(calls.length, responses.length) - 1];
    return Promise.resolve(response);
  }) as unknown as FetchFunction;
  return { fetch, calls };
}

/**
 * Builds the payload our shaping produces, with the billing header already
 * prepended at `version`.
 */
function shapedPayload(version: string = CLAUDE_CODE_VERSION) {
  return {
    model: "claude-haiku-4-5",
    stream: true,
    system: [
      { type: "text", text: buildExpectedBillingHeader(USER_TEXT, version) },
      { type: "text", text: "You are an expert coding assistant." },
    ],
    messages: [{ role: "user", content: [{ type: "text", text: USER_TEXT }] }],
  };
}

function requestInit(
  userAgent: string | undefined,
  body: BodyInit | undefined = JSON.stringify(shapedPayload()),
): RequestInit {
  return {
    method: "POST",
    headers: userAgent
      ? { "content-type": "application/json", "user-agent": userAgent }
      : { "content-type": "application/json" },
    body,
  };
}

/** Returns the single string body the capturing fetch received. */
function sentBody(base: CapturingFetch): string {
  assert.equal(base.calls.length, 1);
  const body = base.calls[0].init?.body;
  assert.ok(typeof body === "string");
  return body;
}

/** Runs one request through the sync and returns the body the delegate saw. */
async function dispatch(
  init: RequestInit,
  { record = true }: { record?: boolean } = {},
): Promise<string> {
  const base = createCapturingFetch();
  const sync = createBillingVersionSync(
    createLearnedClaudeCodeFloor(),
    base.fetch,
  );
  if (record) {
    sync.recordRequest(shapedPayload());
  }
  await sync.fetch("https://api.anthropic.com/v1/messages", init);

  return sentBody(base);
}

describe("createBillingVersionSync", () => {
  test("leaves the body untouched when Pi reports no claude-cli version", async () => {
    const original = JSON.stringify(shapedPayload());
    assert.equal(await dispatch(requestInit(undefined, original)), original);
  });

  test("leaves the body untouched when Pi's version is lower", async () => {
    const original = JSON.stringify(shapedPayload());
    assert.equal(
      await dispatch(requestInit(`claude-cli/${PI_BEHIND}`, original)),
      original,
    );
  });

  test("leaves the body untouched when Pi's version matches the pin", async () => {
    const original = JSON.stringify(shapedPayload());
    assert.equal(
      await dispatch(
        requestInit(`claude-cli/${CLAUDE_CODE_VERSION}`, original),
      ),
      original,
    );
  });

  test("rewrites cc_version and its suffix when Pi's version is higher", async () => {
    const sent = await dispatch(requestInit(`claude-cli/${PI_AHEAD}`));

    assert.equal(sent, JSON.stringify(shapedPayload(PI_AHEAD)));
    assert.ok(sent.includes(buildExpectedBillingHeader(USER_TEXT, PI_AHEAD)));
    assert.ok(
      !sent.includes(
        buildExpectedBillingHeader(USER_TEXT, CLAUDE_CODE_VERSION),
      ),
    );
  });

  test("changes nothing outside the billing header block", async () => {
    const original = JSON.stringify(shapedPayload());
    const sent = await dispatch(
      requestInit(`claude-cli/${PI_AHEAD}`, original),
    );

    const excise = (body: string) =>
      body.replace(/x-anthropic-billing-header:[^"]*/, "<billing>");

    assert.equal(excise(sent), excise(original));
    assert.notEqual(sent, original);
  });

  test("honors an explicit version override instead of raising it", async () => {
    withVersionOverride("2.1.300");

    const base = createCapturingFetch();
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());
    const original = JSON.stringify(shapedPayload("2.1.300"));
    await sync.fetch(
      "https://api.anthropic.com/v1/messages",
      requestInit(`claude-cli/${PI_AHEAD}`, original),
    );

    assert.equal(sentBody(base), original);
  });

  test("leaves a non-string body untouched", async () => {
    const base = createCapturingFetch();
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());
    const body = new Uint8Array([1, 2, 3]);
    await sync.fetch(
      "https://api.anthropic.com/v1/messages",
      requestInit(`claude-cli/${PI_AHEAD}`, body),
    );

    assert.equal(base.calls[0].init?.body, body);
  });

  test("leaves the body untouched when no request was recorded", async () => {
    const original = JSON.stringify(shapedPayload());
    assert.equal(
      await dispatch(requestInit(`claude-cli/${PI_AHEAD}`, original), {
        record: false,
      }),
      original,
    );
  });

  test("leaves the body untouched when it carries no billing header", async () => {
    const original = JSON.stringify({
      model: "claude-haiku-4-5",
      stream: true,
    });
    assert.equal(
      await dispatch(requestInit(`claude-cli/${PI_AHEAD}`, original)),
      original,
    );
  });

  test("forwards the request URL and other init fields to the base fetch", async () => {
    const base = createCapturingFetch();
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());
    await sync.fetch(
      "https://api.anthropic.com/v1/messages",
      requestInit(`claude-cli/${PI_AHEAD}`),
    );

    const call = base.calls[0];
    assert.equal(call.input, "https://api.anthropic.com/v1/messages");
    assert.equal(call.init?.method, "POST");
  });

  test("returns the base fetch's response", async () => {
    const base = createCapturingFetch();
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());
    const response = await sync.fetch(
      "https://api.anthropic.com/v1/messages",
      requestInit(`claude-cli/${PI_AHEAD}`),
    );

    assert.equal(response, RESPONSE_STUB);
  });
});

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const REQUIRED = "2.9.0";

/** Returns the string body the base fetch received on call `index`. */
function bodyOfCall(base: CapturingFetch, index: number): string {
  const body = base.calls[index]?.init?.body;
  assert.ok(typeof body === "string");
  return body;
}

describe("recovery from claude_code_version_too_old", () => {
  test("retries once with the billing header at the required version", async () => {
    const recovered = okResponse();
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
      recovered,
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    assert.equal(base.calls.length, 2);
    assert.equal(bodyOfCall(base, 1), JSON.stringify(shapedPayload(REQUIRED)));
    assert.equal(response, recovered);
  });

  test("changes nothing outside the billing header block on retry", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
      okResponse(),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    await sync.fetch(MESSAGES_URL, requestInit(undefined));

    const excise = (body: string) =>
      body.replace(/x-anthropic-billing-header:[^"]*/, "<billing>");
    assert.equal(excise(bodyOfCall(base, 1)), excise(bodyOfCall(base, 0)));
    assert.notEqual(bodyOfCall(base, 1), bodyOfCall(base, 0));
  });

  test("reuses the original URL and init fields on retry", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
      okResponse(),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());
    const signal = new AbortController().signal;

    await sync.fetch(MESSAGES_URL, { ...requestInit(undefined), signal });

    assert.equal(base.calls[1]?.input, MESSAGES_URL);
    assert.equal(base.calls[1]?.init?.method, "POST");
    assert.equal(base.calls[1]?.init?.signal, signal);
  });

  test("sends later requests at the learned floor without a rejection", async () => {
    const floor = createLearnedClaudeCodeFloor();
    const first = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
      okResponse(),
    ]);
    const firstSync = createBillingVersionSync(floor, first.fetch);
    firstSync.recordRequest(shapedPayload());
    await firstSync.fetch(MESSAGES_URL, requestInit(undefined));

    const second = createCapturingFetch([okResponse()]);
    const secondSync = createBillingVersionSync(floor, second.fetch);
    secondSync.recordRequest(shapedPayload());
    await secondSync.fetch(MESSAGES_URL, requestInit(undefined));

    assert.equal(second.calls.length, 1);
    assert.equal(
      bodyOfCall(second, 0),
      JSON.stringify(shapedPayload(REQUIRED)),
    );
  });

  test("returns a success response untouched without reading its body", async () => {
    const success = okResponse();
    const clone = vi.spyOn(success, "clone");
    const base = createCapturingFetch([success]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    assert.equal(response, success);
    assert.equal(response.bodyUsed, false);
    assert.equal(clone.mock.calls.length, 0);
    assert.equal(base.calls.length, 1);
  });

  test("returns another 400 untouched with its body still readable", async () => {
    const text = '{"type":"error","error":{"type":"invalid_request_error"}}';
    const rejection = new Response(text, { status: 400 });
    const base = createCapturingFetch([rejection]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    assert.equal(response, rejection);
    assert.equal(await response.text(), text);
    assert.equal(base.calls.length, 1);
  });

  test("does not retry when an explicit version override is set", async () => {
    withVersionOverride("2.1.260");
    const floor = createLearnedClaudeCodeFloor();
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
      okResponse(),
    ]);
    const sync = createBillingVersionSync(floor, base.fetch);
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(
      MESSAGES_URL,
      requestInit(undefined, JSON.stringify(shapedPayload("2.1.260"))),
    );

    assert.equal(base.calls.length, 1);
    assert.equal(response.status, 400);
    assert.equal(floor.applyTo("1.0.0"), "1.0.0");
  });

  test("does not apply a learned floor over an explicit version override", async () => {
    withVersionOverride("2.1.260");
    const floor = createLearnedClaudeCodeFloor();
    floor.learn(REQUIRED);
    const base = createCapturingFetch();
    const sync = createBillingVersionSync(floor, base.fetch);
    sync.recordRequest(shapedPayload());
    const original = JSON.stringify(shapedPayload("2.1.260"));

    await sync.fetch(MESSAGES_URL, requestInit(undefined, original));

    assert.equal(sentBody(base), original);
  });

  test("does not retry when the required version is not above the one sent", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse("2.1.200"),
      okResponse(),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    assert.equal(base.calls.length, 1);
    assert.equal(response.status, 400);
  });

  test("does not retry when the rejection names no required version", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(undefined),
      okResponse(),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    assert.equal(base.calls.length, 1);
    assert.equal(response.status, 400);
  });

  test("does not retry a body it cannot rebuild", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
      okResponse(),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    assert.equal(base.calls.length, 1);
    assert.equal(response.status, 400);
  });

  test("retries at most once when the retry is rejected too", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
      claudeCodeVersionTooOldResponse("2.9.5", REQUIRED),
      okResponse(),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    assert.equal(base.calls.length, 2);
    assert.equal(response.status, 400);
  });
});

/**
 * Asserts `response` is the rejection with `reason`'s hint appended, and that
 * everything a consumer might key on survived the rewrite.
 */
async function assertHinted(
  response: Response,
  reason: RecoveryHintReason,
): Promise<void> {
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("request-id"), REJECTION_REQUEST_ID);
  assert.equal(response.headers.get("content-length"), null);

  const body = (await response.json()) as {
    type: string;
    request_id: string;
    error: { type: string; message: string; details: { error_code: string } };
  };
  assert.equal(body.type, "error");
  assert.equal(body.request_id, REJECTION_REQUEST_ID);
  assert.equal(body.error.type, "invalid_request_error");
  assert.equal(body.error.details.error_code, "claude_code_version_too_old");
  assert.ok(
    body.error.message.endsWith(` ${describeRecoveryHint(reason)}`),
    body.error.message,
  );
}

describe("hints on unrecovered claude_code_version_too_old rejections", () => {
  test("tells an override user to raise or unset the override", async () => {
    withVersionOverride("2.1.260");
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(
      MESSAGES_URL,
      requestInit(undefined, JSON.stringify(shapedPayload("2.1.260"))),
    );

    await assertHinted(response, {
      kind: "override",
      overrideVersion: "2.1.260",
      requiredVersion: REQUIRED,
    });
  });

  test("blames Pi when the billing header already met the floor", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse("2.1.200"),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    await assertHinted(response, {
      kind: "upgrade-pi",
      sentVersion: CLAUDE_CODE_VERSION,
    });
  });

  test("points at the override when the floor is not named", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(undefined),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    await assertHinted(response, {
      kind: "set-override",
      requiredVersion: undefined,
    });
  });

  test("points at the override when the body cannot be rebuilt", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    await assertHinted(response, {
      kind: "set-override",
      requiredVersion: REQUIRED,
    });
  });

  test("hints the retry's rejection when the retry is rejected too", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
      claudeCodeVersionTooOldResponse("2.9.5", REQUIRED),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    await assertHinted(response, {
      kind: "set-override",
      requiredVersion: "2.9.5",
    });
  });

  test("blames Pi when the retry at the named floor is rejected at that floor", async () => {
    const base = createCapturingFetch([
      claudeCodeVersionTooOldResponse(REQUIRED),
      claudeCodeVersionTooOldResponse(REQUIRED, REQUIRED),
    ]);
    const sync = createBillingVersionSync(
      createLearnedClaudeCodeFloor(),
      base.fetch,
    );
    sync.recordRequest(shapedPayload());

    const response = await sync.fetch(MESSAGES_URL, requestInit(undefined));

    await assertHinted(response, {
      kind: "upgrade-pi",
      sentVersion: REQUIRED,
    });
  });

  // A request without our billing header is gated on Pi's own `claude-cli`
  // user-agent, which neither the pin nor the override can change.
  describe("when the rejected request carried no billing header", () => {
    test("blames Pi's own claude-cli version", async () => {
      const base = createCapturingFetch([
        claudeCodeVersionTooOldResponse(REQUIRED),
        okResponse(),
      ]);
      const sync = createBillingVersionSync(
        createLearnedClaudeCodeFloor(),
        base.fetch,
      );
      sync.recordRequest(shapedPayload());

      const response = await sync.fetch(
        MESSAGES_URL,
        requestInit("claude-cli/2.1.280", headerlessBody()),
      );

      await assertHinted(response, {
        kind: "no-billing-header",
        userAgentVersion: "2.1.280",
      });
      assert.equal(base.calls.length, 1);
    });

    test("blames Pi rather than an override that was never sent", async () => {
      withVersionOverride("2.1.260");
      const base = createCapturingFetch([
        claudeCodeVersionTooOldResponse(REQUIRED),
      ]);
      const sync = createBillingVersionSync(
        createLearnedClaudeCodeFloor(),
        base.fetch,
      );
      sync.recordRequest(shapedPayload());

      const response = await sync.fetch(
        MESSAGES_URL,
        requestInit("claude-cli/2.1.280", headerlessBody()),
      );

      await assertHinted(response, {
        kind: "no-billing-header",
        userAgentVersion: "2.1.280",
      });
    });

    test("omits Pi's version when the request had no user-agent", async () => {
      const base = createCapturingFetch([
        claudeCodeVersionTooOldResponse(REQUIRED),
      ]);
      const sync = createBillingVersionSync(
        createLearnedClaudeCodeFloor(),
        base.fetch,
      );
      sync.recordRequest(shapedPayload());

      const response = await sync.fetch(
        MESSAGES_URL,
        requestInit(undefined, headerlessBody()),
      );

      await assertHinted(response, {
        kind: "no-billing-header",
        userAgentVersion: undefined,
      });
    });

    // The named floor rejected Pi's user-agent, not our header, so later
    // requests must not have their headers raised on its account.
    test("does not learn the floor it names", async () => {
      const floor = createLearnedClaudeCodeFloor();
      const base = createCapturingFetch([
        claudeCodeVersionTooOldResponse(REQUIRED),
      ]);
      const sync = createBillingVersionSync(floor, base.fetch);
      sync.recordRequest(shapedPayload());

      await sync.fetch(
        MESSAGES_URL,
        requestInit("claude-cli/2.1.280", headerlessBody()),
      );

      assert.equal(floor.applyTo("1.0.0"), "1.0.0");
    });
  });
});

/**
 * What pi-ai >=1.5.0 sends on a message-thread continuation: only the new
 * messages, and no `system`, so no billing header.
 */
function headerlessBody(): string {
  return JSON.stringify({
    model: "claude-haiku-4-5",
    stream: true,
    messages: [
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_01", content: "hi" },
        ],
      },
    ],
    thread: { type: "continue", previous_message_id: "msg_01" },
  });
}
