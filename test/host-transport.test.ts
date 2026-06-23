import assert from "node:assert/strict";
import { describe, test } from "vitest";
import type { AnthropicTransportCandidate } from "#src/host-transport";
import {
  resolveBuiltinAnthropicStreamSimple,
  selectAnthropicStreamSimple,
} from "#src/host-transport";

// This exercises the real resolution path against the installed
// `@earendil-works/pi-ai` (not a mock): `import.meta.resolve` of the root
// package, package-directory derivation, and the dynamic import of whichever
// candidate path matches the installed layout.  The registration regression
// test mocks this module out, so this is the only automated guard that the
// candidate list still lands on a module exporting the expected function for
// the installed version — a future pi-ai layout change fails here at test
// time instead of only at runtime under the live loader (Issue #28, Issue #33).
test("resolveBuiltinAnthropicStreamSimple resolves the built-in transport", async () => {
  const transport = await resolveBuiltinAnthropicStreamSimple();

  assert.equal(typeof transport, "function");
});

describe("selectAnthropicStreamSimple (candidate resolution)", () => {
  const FAKE_PKG_DIR = "/fake/pkg";

  function urlFor(relativePath: string): string {
    return `file://${FAKE_PKG_DIR}/${relativePath}`;
  }

  const newLayoutCandidate: AnthropicTransportCandidate = {
    relativePath: "dist/api/anthropic-messages.js",
    exportName: "streamSimple",
  };

  const legacyCandidate: AnthropicTransportCandidate = {
    relativePath: "dist/providers/anthropic.js",
    exportName: "streamSimpleAnthropic",
  };

  const bothCandidates = [newLayoutCandidate, legacyCandidate] as const;

  function fakeTransport(): void {
    /* placeholder function used as a stand-in for the real streamSimple */
  }

  test("returns the export from the new-layout candidate when it resolves", async () => {
    const importer = async (url: string) => {
      if (url === urlFor(newLayoutCandidate.relativePath)) {
        return { streamSimple: fakeTransport };
      }
      throw new Error("should not reach legacy candidate");
    };

    const result = await selectAnthropicStreamSimple(
      FAKE_PKG_DIR,
      bothCandidates,
      importer,
    );

    assert.equal(result, fakeTransport);
  });

  test("falls back to the legacy candidate when the new-layout import fails", async () => {
    const importer = async (url: string) => {
      if (url === urlFor(newLayoutCandidate.relativePath)) {
        throw new Error("ERR_MODULE_NOT_FOUND");
      }
      if (url === urlFor(legacyCandidate.relativePath)) {
        return { streamSimpleAnthropic: fakeTransport };
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const result = await selectAnthropicStreamSimple(
      FAKE_PKG_DIR,
      bothCandidates,
      importer,
    );

    assert.equal(result, fakeTransport);
  });

  test("skips a candidate whose module loads but does not export the named function", async () => {
    // Simulates the legacy provider file under the new layout: the file exists
    // but exports anthropicProvider, not streamSimpleAnthropic.
    const importer = async (url: string) => {
      if (url === urlFor(newLayoutCandidate.relativePath)) {
        // new-layout file absent on an old install
        throw new Error("ERR_MODULE_NOT_FOUND");
      }
      if (url === urlFor(legacyCandidate.relativePath)) {
        // file present but wrong export (provider factory, not transport)
        return { anthropicProvider: fakeTransport };
      }
      throw new Error(`unexpected url: ${url}`);
    };

    await assert.rejects(
      () => selectAnthropicStreamSimple(FAKE_PKG_DIR, bothCandidates, importer),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("dist/providers/anthropic.js"),
          `expected message to mention legacy path, got: ${err.message}`,
        );
        assert.ok(
          err.message.includes("no streamSimpleAnthropic export"),
          `expected message to mention missing export, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  test("new-layout candidate takes precedence when both paths would succeed", async () => {
    const newTransport = function newTransport() {};
    const legacyTransport = function legacyTransport() {};

    const importer = async (url: string) => {
      if (url === urlFor(newLayoutCandidate.relativePath)) {
        return { streamSimple: newTransport };
      }
      if (url === urlFor(legacyCandidate.relativePath)) {
        return { streamSimpleAnthropic: legacyTransport };
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const result = await selectAnthropicStreamSimple(
      FAKE_PKG_DIR,
      bothCandidates,
      importer,
    );

    assert.equal(result, newTransport);
  });

  test("throws an aggregated error naming every attempted candidate when none match", async () => {
    const importer = async (_url: string): Promise<Record<string, unknown>> => {
      throw new Error("ERR_MODULE_NOT_FOUND");
    };

    await assert.rejects(
      () => selectAnthropicStreamSimple(FAKE_PKG_DIR, bothCandidates, importer),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("dist/api/anthropic-messages.js"),
          `expected new-layout path in message, got: ${err.message}`,
        );
        assert.ok(
          err.message.includes("dist/providers/anthropic.js"),
          `expected legacy path in message, got: ${err.message}`,
        );
        return true;
      },
    );
  });
});
