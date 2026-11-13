import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  describeRecoveryHint,
  readClaudeCodeVersionRejection,
} from "#src/version-rejection";

// Captured verbatim from Anthropic on 2026-09-23 (pi 0.87.1, claude-opus-5-5,
// billing header forced to 2.1.260).
const REJECTION_BODY =
  '{"type":"error","error":{"type":"invalid_request_error","message":"Claude Code 2.1.260 does not support this model; version 2.1.280 or newer is required. Run \'claude update\', or update the Claude desktop app, then try again.","details":{"error_code":"claude_code_version_too_old"}},"request_id":"req_011CfKRGHAVWntoFsg5yexPS"}';

const ORIGINAL_MESSAGE =
  "Claude Code 2.1.260 does not support this model; version 2.1.280 or newer is required. Run 'claude update', or update the Claude desktop app, then try again.";

function rejectionBody(message: unknown, errorCode: unknown): string {
  return JSON.stringify({
    type: "error",
    error: {
      type: "invalid_request_error",
      message,
      details: { error_code: errorCode },
    },
    request_id: "req_test",
  });
}

describe("readClaudeCodeVersionRejection", () => {
  test("reads the required version from a real rejection body", () => {
    const rejection = readClaudeCodeVersionRejection(REJECTION_BODY);

    assert.ok(rejection);
    assert.equal(rejection.requiredVersion, "2.1.280");
  });

  test("returns undefined for a non-JSON body", () => {
    assert.equal(readClaudeCodeVersionRejection("Bad Request"), undefined);
  });

  test("returns undefined for another error code", () => {
    assert.equal(
      readClaudeCodeVersionRejection(
        rejectionBody(ORIGINAL_MESSAGE, "some_other_error"),
      ),
      undefined,
    );
  });

  test("returns undefined for a body with no error object", () => {
    assert.equal(readClaudeCodeVersionRejection('{"type":"error"}'), undefined);
    assert.equal(readClaudeCodeVersionRejection("[]"), undefined);
    assert.equal(readClaudeCodeVersionRejection("null"), undefined);
  });

  test("leaves the required version undefined when the message names none", () => {
    const rejection = readClaudeCodeVersionRejection(
      rejectionBody(
        "Claude Code 2.1.260 does not support this model.",
        "claude_code_version_too_old",
      ),
    );

    assert.ok(rejection);
    assert.equal(rejection.requiredVersion, undefined);
  });

  test("leaves the required version undefined when the message is not a string", () => {
    const rejection = readClaudeCodeVersionRejection(
      rejectionBody(42, "claude_code_version_too_old"),
    );

    assert.ok(rejection);
    assert.equal(rejection.requiredVersion, undefined);
  });
});

describe("ClaudeCodeVersionRejection.withHint", () => {
  test("appends the hint to error.message and preserves every other field", () => {
    const rejection = readClaudeCodeVersionRejection(REJECTION_BODY);
    assert.ok(rejection);

    const hinted: unknown = JSON.parse(rejection.withHint("HINT"));

    assert.deepEqual(hinted, {
      type: "error",
      error: {
        type: "invalid_request_error",
        message: `${ORIGINAL_MESSAGE} HINT`,
        details: { error_code: "claude_code_version_too_old" },
      },
      request_id: "req_011CfKRGHAVWntoFsg5yexPS",
    });
  });

  test("uses the hint as the message when the original has none", () => {
    const rejection = readClaudeCodeVersionRejection(
      rejectionBody(undefined, "claude_code_version_too_old"),
    );
    assert.ok(rejection);

    const hinted = JSON.parse(rejection.withHint("HINT")) as {
      error: { message: string };
    };

    assert.equal(hinted.error.message, "HINT");
  });
});

describe("describeRecoveryHint", () => {
  test("tells an override user to raise or unset it", () => {
    assert.equal(
      describeRecoveryHint({
        kind: "override",
        overrideVersion: "2.1.260",
        requiredVersion: "2.1.280",
      }),
      "[pi-anthropic-auth] PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION=2.1.260 is sent verbatim; raise it to 2.1.280 or newer, or unset it to let pi-anthropic-auth recover automatically.",
    );
  });

  test("points an override user at the current release when the floor is unknown", () => {
    assert.equal(
      describeRecoveryHint({
        kind: "override",
        overrideVersion: "2.1.260",
        requiredVersion: undefined,
      }),
      "[pi-anthropic-auth] PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION=2.1.260 is sent verbatim; raise it to the current Claude Code release (npm view @anthropic-ai/claude-code dist-tags), or unset it to let pi-anthropic-auth recover automatically.",
    );
  });

  test("blames Pi's own version when the billing header already met the floor", () => {
    assert.equal(
      describeRecoveryHint({ kind: "upgrade-pi", sentVersion: "2.1.280" }),
      "[pi-anthropic-auth] The billing header already reported 2.1.280; this rejection likely comes from Pi's own claude-cli version. Upgrade Pi.",
    );
  });

  test("blames Pi's own version when the request carried no billing header", () => {
    assert.equal(
      describeRecoveryHint({
        kind: "no-billing-header",
        userAgentVersion: "2.1.280",
      }),
      "[pi-anthropic-auth] This request carried no billing header, so Anthropic checked Pi's own claude-cli version (2.1.280). Upgrade Pi.",
    );
  });

  test("omits Pi's version from the header-less hint when the user-agent did not name one", () => {
    assert.equal(
      describeRecoveryHint({
        kind: "no-billing-header",
        userAgentVersion: undefined,
      }),
      "[pi-anthropic-auth] This request carried no billing header, so Anthropic checked Pi's own claude-cli version. Upgrade Pi.",
    );
  });

  test("names the override to set when recovery did not succeed", () => {
    assert.equal(
      describeRecoveryHint({
        kind: "set-override",
        requiredVersion: "2.1.280",
      }),
      "[pi-anthropic-auth] Automatic recovery did not succeed; set PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION=2.1.280 and retry.",
    );
  });

  test("points at the current release when recovery failed on an unknown floor", () => {
    assert.equal(
      describeRecoveryHint({
        kind: "set-override",
        requiredVersion: undefined,
      }),
      "[pi-anthropic-auth] Automatic recovery did not succeed; set PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION to the current Claude Code release (npm view @anthropic-ai/claude-code dist-tags) and retry.",
    );
  });
});
