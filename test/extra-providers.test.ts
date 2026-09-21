import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { EXTRA_PROVIDERS_ENV, resolveExtraProviderNames } from "#src/constants";

describe("resolveExtraProviderNames", () => {
  test("returns no extra providers when the variable is unset", () => {
    assert.deepEqual(resolveExtraProviderNames({}), []);
  });

  test("returns no extra providers when the variable is blank", () => {
    assert.deepEqual(
      resolveExtraProviderNames({ [EXTRA_PROVIDERS_ENV]: "   " }),
      [],
    );
  });

  test("parses a comma-separated list", () => {
    assert.deepEqual(
      resolveExtraProviderNames({
        [EXTRA_PROVIDERS_ENV]: "anthropic-2,anthropic-3",
      }),
      ["anthropic-2", "anthropic-3"],
    );
  });

  test("trims entries and ignores empty ones", () => {
    assert.deepEqual(
      resolveExtraProviderNames({
        [EXTRA_PROVIDERS_ENV]: " anthropic-2 , , anthropic-3 ,",
      }),
      ["anthropic-2", "anthropic-3"],
    );
  });

  test("de-duplicates repeated entries", () => {
    assert.deepEqual(
      resolveExtraProviderNames({
        [EXTRA_PROVIDERS_ENV]: "anthropic-2,anthropic-2",
      }),
      ["anthropic-2"],
    );
  });

  test("drops anthropic, which is always wrapped", () => {
    assert.deepEqual(
      resolveExtraProviderNames({
        [EXTRA_PROVIDERS_ENV]: "anthropic,anthropic-2",
      }),
      ["anthropic-2"],
    );
  });

  // A skipped typo would leave that provider silently unshaped, which surfaces
  // only as Anthropic's misleading "out of extra usage" 400 at request time.
  test("throws on an entry that is not a provider name", () => {
    assert.throws(
      () =>
        resolveExtraProviderNames({
          [EXTRA_PROVIDERS_ENV]: "anthropic-2,anthropic 3",
        }),
      /must be provider names, received "anthropic 3"/,
    );
  });
});
