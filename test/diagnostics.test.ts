import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  type ExtensionDiagnostics,
  formatDiagnosticsReport,
} from "#src/diagnostics";

const SAMPLE: ExtensionDiagnostics = {
  version: "1.2.3",
  modulePath:
    "/root/.pi/agent/node_modules/@gotgenes/pi-anthropic-auth/src/index.ts",
  transportResolved: true,
};

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
