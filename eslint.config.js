import globals from "globals";
import tseslint from "typescript-eslint";

/** Files that receive full type-aware linting. */
const TS_FILES = ["src/**/*.ts", "test/**/*.ts"];

export default tseslint.config(
  // Global ignores
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", ".pi/**"],
  },

  // Always report unused disable directives as errors so they don't
  // silently pile up when violations are fixed.
  { linterOptions: { reportUnusedDisableDirectives: "error" } },

  // Type-aware rules only — no overlap with Biome's non-type-aware lint.
  {
    files: TS_FILES,
    extends: [
      tseslint.configs.recommendedTypeCheckedOnly,
      tseslint.configs.stylisticTypeCheckedOnly,
    ],
    rules: {
      // --- Cherry-picked strictTypeChecked rules ---
      // High-value: catches real bugs
      "@typescript-eslint/no-deprecated": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-misused-spread": "error",
      "@typescript-eslint/no-mixed-enums": "error",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "error",
      "no-return-await": "off",
      "@typescript-eslint/return-await": [
        "error",
        "error-handling-correctness-only",
      ],
      "@typescript-eslint/no-unnecessary-type-conversion": "error",
      // Medium-value: enforces good patterns
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],
      "@typescript-eslint/no-invalid-void-type": [
        "error",
        { allowInGenericTypeArguments: true },
      ],
      "@typescript-eslint/no-non-null-asserted-nullish-coalescing": "error",
      "@typescript-eslint/prefer-literal-enum-member": "error",
      "@typescript-eslint/related-getter-setter-pairs": "error",
      "@typescript-eslint/no-dynamic-delete": "error",
      "@typescript-eslint/no-extraneous-class": "error",
      // Low-value but zero-cost
      "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
      "@typescript-eslint/no-unnecessary-template-expression": "error",
      "@typescript-eslint/no-unnecessary-type-arguments": "error",
      "@typescript-eslint/no-meaningless-void-operator": "error",
      "no-useless-constructor": "off",
      "@typescript-eslint/no-useless-constructor": "error",
      "@typescript-eslint/no-useless-default-assignment": "error",
      "@typescript-eslint/prefer-reduce-type-parameter": "error",
      "@typescript-eslint/prefer-return-this-type": "error",
      "@typescript-eslint/unified-signatures": "error",
    },
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Test file overrides:
  // - Relax unsafe-any rules to match Biome's relaxation for test mocks
  // - unbound-method: vi.fn() stubs are designed to be passed by reference
  // - require-await: mock implementations are async to satisfy async interfaces
  //   but return synchronously
  {
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
);
