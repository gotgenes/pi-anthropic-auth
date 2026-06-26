import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";
import {
  createStatusCommandHandler,
  type ExtensionDiagnostics,
  formatDiagnosticsReport,
  type StatusCommandContext,
} from "#src/diagnostics";

const SAMPLE: ExtensionDiagnostics = {
  version: "1.2.3",
  modulePath:
    "/root/.pi/agent/node_modules/@gotgenes/pi-anthropic-auth/src/index.ts",
  transportResolved: true,
};

describe("createStatusCommandHandler", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    consoleSpy.mockClear();
  });

  test("calls ctx.ui.notify with the report and 'info' when hasUI is true", async () => {
    const notify = vi.fn();
    const ctx: StatusCommandContext = {
      hasUI: true,
      ui: { notify },
    };
    const handler = createStatusCommandHandler(SAMPLE);
    await handler("", ctx);
    assert.equal(notify.mock.calls.length, 1);
    const [message, type] = notify.mock.calls[0];
    assert.equal(type, "info");
    assert.match(message, /1\.2\.3/);
    assert.match(message, /resolved/i);
  });

  test("calls console.log with the report when hasUI is false", async () => {
    const ctx: StatusCommandContext = {
      hasUI: false,
      ui: { notify: vi.fn() },
    };
    const handler = createStatusCommandHandler(SAMPLE);
    await handler("", ctx);
    assert.equal(consoleSpy.mock.calls.length, 1);
    const [message] = consoleSpy.mock.calls[0];
    assert.match(message, /1\.2\.3/);
  });

  test("does not call ctx.ui.notify when hasUI is false", async () => {
    const notify = vi.fn();
    const ctx: StatusCommandContext = {
      hasUI: false,
      ui: { notify },
    };
    const handler = createStatusCommandHandler(SAMPLE);
    await handler("", ctx);
    assert.equal(notify.mock.calls.length, 0);
  });
});

describe("formatDiagnosticsReport", () => {
  test("includes the extension version", () => {
    const report = formatDiagnosticsReport(SAMPLE);
    assert.match(report, /1\.2\.3/);
  });

  test("includes the module path", () => {
    const report = formatDiagnosticsReport(SAMPLE);
    assert.match(
      report,
      /\/root\/.pi\/agent\/node_modules\/@gotgenes\/pi-anthropic-auth\/src\/index\.ts/,
    );
  });

  test("includes a transport-resolved marker when resolved", () => {
    const report = formatDiagnosticsReport(SAMPLE);
    assert.match(report, /resolved/i);
  });

  test("reports transport as unresolved when false", () => {
    const report = formatDiagnosticsReport({
      ...SAMPLE,
      transportResolved: false,
    });
    // Should not say "resolved" in the affirmative sense; must mention not/un-resolved
    assert.match(report, /not resolved|unresolved/i);
  });
});
