import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { EntrypointSetting } from "#src/entrypoint-setting";

describe("EntrypointSetting", () => {
  describe("current", () => {
    test("is the default label when no layer sets one", () => {
      const setting = new EntrypointSetting();

      assert.deepEqual(setting.current(), {
        label: "sdk-cli",
        source: "default",
      });
    });

    test("is the global label when only the global layer sets one", () => {
      const setting = new EntrypointSetting();
      setting.apply({ entrypoint: "pi-agent" }, "global");

      assert.deepEqual(setting.current(), {
        label: "pi-agent",
        source: "global",
      });
    });

    test("is the project label over a global one, in either order", () => {
      const projectLast = new EntrypointSetting();
      projectLast.apply({ entrypoint: "global-label" }, "global");
      projectLast.apply({ entrypoint: "project-label" }, "project");

      const projectFirst = new EntrypointSetting();
      projectFirst.apply({ entrypoint: "project-label" }, "project");
      projectFirst.apply({ entrypoint: "global-label" }, "global");

      const expected = { label: "project-label", source: "project" };
      assert.deepEqual(projectLast.current(), expected);
      assert.deepEqual(projectFirst.current(), expected);
    });

    test("falls back to the global label when the project sets none", () => {
      const setting = new EntrypointSetting();
      setting.apply({ entrypoint: "pi-agent" }, "global");
      setting.apply({}, "project");

      assert.deepEqual(setting.current(), {
        label: "pi-agent",
        source: "global",
      });
    });
  });

  describe("apply", () => {
    test("replaces the layer's label, clearing it when the config sets none", () => {
      const setting = new EntrypointSetting();
      setting.apply({ entrypoint: "pi-agent" }, "global");
      setting.apply({}, "global");

      assert.deepEqual(setting.current(), {
        label: "sdk-cli",
        source: "default",
      });
    });
  });
});
