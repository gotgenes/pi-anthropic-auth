import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  globalConfigPath,
  loadExtensionConfig,
  parseExtensionConfig,
  projectConfigPath,
} from "#src/extension-config";

const PATH = "/home/me/.pi/agent/extensions/pi-anthropic-auth/config.json";

describe("config paths", () => {
  test("the global file lives under the agent dir's extensions directory", () => {
    assert.equal(
      globalConfigPath("/home/me/.pi/agent"),
      "/home/me/.pi/agent/extensions/pi-anthropic-auth/config.json",
    );
  });

  test("the project file lives under the project's .pi/extensions directory", () => {
    assert.equal(
      projectConfigPath("/work/repo"),
      "/work/repo/.pi/extensions/pi-anthropic-auth/config.json",
    );
  });
});

describe("parseExtensionConfig", () => {
  describe("well-formed files", () => {
    test("returns the named providers in order", () => {
      assert.deepEqual(
        parseExtensionConfig(
          '{ "providers": ["anthropic-2", "anthropic-3"] }',
          PATH,
        ),
        { providers: ["anthropic-2", "anthropic-3"], warnings: [] },
      );
    });

    test("an object without providers names none and warns about nothing", () => {
      assert.deepEqual(parseExtensionConfig("{}", PATH), {
        providers: [],
        warnings: [],
      });
    });

    test("ignores unknown top-level keys", () => {
      assert.deepEqual(
        parseExtensionConfig(
          '{ "providers": ["anthropic-2"], "future": true }',
          PATH,
        ),
        { providers: ["anthropic-2"], warnings: [] },
      );
    });

    test("drops anthropic silently, because it is always shaped", () => {
      assert.deepEqual(
        parseExtensionConfig(
          '{ "providers": ["anthropic", "anthropic-2"] }',
          PATH,
        ),
        { providers: ["anthropic-2"], warnings: [] },
      );
    });

    test("drops duplicate entries silently", () => {
      assert.deepEqual(
        parseExtensionConfig(
          '{ "providers": ["anthropic-2", "anthropic-2"] }',
          PATH,
        ),
        { providers: ["anthropic-2"], warnings: [] },
      );
    });
  });

  describe("malformed files", () => {
    test("warns and names no providers when the text is not JSON", () => {
      const result = parseExtensionConfig("{ providers: ", PATH);
      assert.deepEqual(result.providers, []);
      assert.equal(result.warnings.length, 1);
      assert.match(
        result.warnings[0],
        /^\/home\/me\/.*config\.json: is not valid JSON/,
      );
    });

    test("warns when the top level is not an object", () => {
      assert.deepEqual(parseExtensionConfig('["anthropic-2"]', PATH), {
        providers: [],
        warnings: [`${PATH}: must contain a JSON object`],
      });
    });

    test("warns when providers is not an array", () => {
      assert.deepEqual(
        parseExtensionConfig('{ "providers": "anthropic-2" }', PATH),
        {
          providers: [],
          warnings: [`${PATH}: "providers" must be an array of provider names`],
        },
      );
    });

    test("drops and warns about each entry that is not a provider name, keeping the rest", () => {
      assert.deepEqual(
        parseExtensionConfig(
          '{ "providers": ["anthropic-2", "anthropic 3", 4, "anthropic-5"] }',
          PATH,
        ),
        {
          providers: ["anthropic-2", "anthropic-5"],
          warnings: [
            `${PATH}: providers[1] must be a provider name, received "anthropic 3"`,
            `${PATH}: providers[2] must be a provider name, received 4`,
          ],
        },
      );
    });
  });

  describe("the entrypoint key", () => {
    const entrypointWarning = (received: string) =>
      `${PATH}: "entrypoint" must be a label of letters, digits, ".", "_", and "-" that starts with a letter or digit, received ${received}`;

    test("returns a label set without providers", () => {
      assert.deepEqual(
        parseExtensionConfig('{ "entrypoint": "pi-agent" }', PATH),
        {
          providers: [],
          entrypoint: "pi-agent",
          warnings: [],
        },
      );
    });

    test("returns a label set beside providers", () => {
      assert.deepEqual(
        parseExtensionConfig(
          '{ "providers": ["anthropic-2"], "entrypoint": "pi-agent" }',
          PATH,
        ),
        { providers: ["anthropic-2"], entrypoint: "pi-agent", warnings: [] },
      );
    });

    test.each([
      "sdk-cli",
      "cli",
      "pi-agent",
      "Paseo",
      "t3-code",
      "xmatrix",
      "remote_baku",
      "claude-desktop-3p",
      "pi.1",
    ])("accepts %j", (label) => {
      assert.deepEqual(
        parseExtensionConfig(JSON.stringify({ entrypoint: label }), PATH),
        { providers: [], entrypoint: label, warnings: [] },
      );
    });

    test.each([
      "",
      null,
      3,
      ["pi"],
      "a b",
      " pi",
      "pi\n",
      "a;b",
      'a"b',
      "a\\b",
      "-pi",
      "pi/agent",
      "pï",
    ])("drops %j with a warning", (value) => {
      assert.deepEqual(
        parseExtensionConfig(JSON.stringify({ entrypoint: value }), PATH),
        { providers: [], warnings: [entrypointWarning(JSON.stringify(value))] },
      );
    });

    test("an invalid label keeps valid providers", () => {
      assert.deepEqual(
        parseExtensionConfig(
          '{ "providers": ["anthropic-2"], "entrypoint": "a b" }',
          PATH,
        ),
        {
          providers: ["anthropic-2"],
          warnings: [entrypointWarning('"a b"')],
        },
      );
    });

    test("invalid providers keep a valid label", () => {
      assert.deepEqual(
        parseExtensionConfig(
          '{ "providers": "anthropic-2", "entrypoint": "pi-agent" }',
          PATH,
        ),
        {
          providers: [],
          entrypoint: "pi-agent",
          warnings: [`${PATH}: "providers" must be an array of provider names`],
        },
      );
    });
  });
});

describe("loadExtensionConfig", () => {
  test("parses what the reader returns", () => {
    assert.deepEqual(
      loadExtensionConfig(PATH, () => '{ "providers": ["anthropic-2"] }'),
      { providers: ["anthropic-2"], warnings: [] },
    );
  });

  test("a missing file names no providers and warns about nothing", () => {
    const missing = () => {
      throw Object.assign(new Error("ENOENT: no such file"), {
        code: "ENOENT",
      });
    };
    assert.deepEqual(loadExtensionConfig(PATH, missing), {
      providers: [],
      warnings: [],
    });
  });

  test("an unreadable file warns with the read error", () => {
    const denied = () => {
      throw Object.assign(new Error("EACCES: permission denied"), {
        code: "EACCES",
      });
    };
    assert.deepEqual(loadExtensionConfig(PATH, denied), {
      providers: [],
      warnings: [`${PATH}: could not be read (EACCES: permission denied)`],
    });
  });
});
