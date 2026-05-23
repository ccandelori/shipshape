// ShipShape ESLint configuration (flat config — ESLint 9+).
//
// This is the merge of two designs:
//
//   1. A narrow, Cat-1-focused config that turned on the typed-lint
//      no-unsafe-* family + no-unnecessary-type-assertion. Those rules
//      catch HIDDEN type-bypass flows (typed `any` propagating through a
//      chain into a typed sink) that the explicit `: any` rule misses —
//      exactly the surface PRD Cat 1 cares about.
//
//   2. A broader config covering Cats 6 (runtime errors) + 7 (a11y) +
//      React correctness. The React-hooks/rules-of-hooks rule alone
//      caught 9 real bugs in the codebase on first pass (conditional
//      hook calls — production crash class); jsx-a11y rules guard the
//      0/0 axe Critical+Serious baseline Phase 2 established.
//
// Design intent:
//
//   - Cat 1 type-safety rules apply to ALL .ts/.tsx files (untyped lint).
//     Per-package overrides (api/web/shared) add the typed-lint
//     no-unsafe-* family on top — these need a tsconfig to work.
//
//   - Cat 7 (jsx-a11y) + React correctness rules apply to web/src only;
//     ERROR severity because Phase 2 brought these to clean state and a
//     regression should fail.
//
//   - Cat 6 (no-floating-promises, no-misused-promises) is OFF BY DEFAULT.
//     ~400 hits on the current baseline that overwhelm the Cat 1 signal;
//     enable as an opt-in pass once Cat 1 noise is reduced. See the
//     commented-out block near the bottom.
//
//   - Cats 2 (bundle), 3 (API perf), 4 (DB), 5 (tests) aren't lintable —
//     they're measurement-based and live under `pnpm shipshape`.
//
// Severity strategy:
//
//   - Type-safety rules: WARN. The Phase 2 baseline is 548 (ripgrep) /
//     869 (ESLint AST count) violations; ratchet down over time via
//     shipshape Cat 1, not via lint errors. New code can be cleaned
//     incrementally without breaking the existing tree.
//
//   - A11y + React-hooks rules: ERROR. Phase 2 brought these to clean
//     state; a regression here should fail CI.
//
// Install (already done):
//   pnpm add -Dw eslint @eslint/js typescript-eslint \
//                eslint-plugin-react eslint-plugin-react-hooks \
//                eslint-plugin-jsx-a11y globals
//
// Run:
//   pnpm lint            # check
//   pnpm lint:fix        # auto-fix
//   pnpm exec eslint web/src/components/Editor.tsx   # single file
//
// See: scripts/shipshape/checks/typecheck.ts — shipshape's Cat 1 count
// remains the PRD-comparable gate. Lint is the editor-time complement.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

// ── Cat 1 base rules (untyped — work without a tsconfig) ───────────────
const typeSafetyRules = {
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-non-null-assertion': 'warn',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true, // const { foo, ...rest } = props — rest is intentional
    },
  ],
  '@typescript-eslint/consistent-type-assertions': [
    'warn',
    {
      assertionStyle: 'as',
      objectLiteralTypeAssertions: 'never', // forbid `{} as Foo` (use a typed const instead)
    },
  ],
  '@typescript-eslint/ban-ts-comment': [
    'warn',
    {
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': true, // forbid outright — use ts-expect-error instead
      'ts-nocheck': true,
      'ts-check': false,
      minimumDescriptionLength: 8,
    },
  ],
  '@typescript-eslint/prefer-as-const': 'warn',
  'no-unused-vars': 'off', // covered by @typescript-eslint/no-unused-vars
  'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
};

// ── Cat 1 typed rules (require a tsconfig — catch hidden `any` flows) ──
// This is the family that catches typed-bypass behavior the explicit-any
// rule misses: `any` flowing through a chain into a typed sink, redundant
// `as` casts that can be dropped, etc. WARN-level because the current
// baseline will surface a non-trivial count; ratchet down incrementally.
const typedTypeSafetyRules = {
  ...typeSafetyRules,
  '@typescript-eslint/no-unsafe-assignment': 'warn',
  '@typescript-eslint/no-unsafe-member-access': 'warn',
  '@typescript-eslint/no-unsafe-call': 'warn',
  '@typescript-eslint/no-unsafe-argument': 'warn',
  '@typescript-eslint/no-unsafe-return': 'warn',
  '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
  // Notoriously noisy on real codebases — explicit off so future
  // contributors don't wonder why it's not in the typed-lint default.
  '@typescript-eslint/strict-boolean-expressions': 'off',
};

export default tseslint.config(
  // ── Ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dev-dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/.turbo/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.deploy/**',
      '**/*.d.ts',
      // Generated artifacts:
      'api/src/openapi/**/*.generated.ts',
      // The shipshape report is auto-generated:
      'orientation/shipshape-report.md',
      // ESLint should not lint itself:
      'eslint.config.mjs',
    ],
  },

  // ── JS base ──────────────────────────────────────────────────────────
  js.configs.recommended,

  // ── no-undef off everywhere ─────────────────────────────────────────
  // TypeScript catches undeclared variables at compile time for .ts/.tsx;
  // for .js/.mjs scripts the globals overrides below set process/console/
  // document/etc. ESLint's no-undef adds noise without catching anything
  // tsc + a globals list don't already catch.
  { rules: { 'no-undef': 'off' } },

  // ── TS base (untyped — fast, applies to every .ts/.tsx file) ────────
  ...tseslint.configs.recommended,

  // ── Cat 1 (untyped) — applied to ALL TS source ───────────────────────
  // The shared type-safety rule set fires on every .ts/.tsx file in the
  // tree (including e2e, tests, scripts) without needing a tsconfig.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: typeSafetyRules,
  },

  // ── Cat 1 (typed) — per-package overrides ────────────────────────────
  // Each package has its own tsconfig; typescript-eslint's projectService
  // auto-discovers the right one per file. These overrides add the
  // no-unsafe-* family + no-unnecessary-type-assertion on top of the
  // shared typeSafetyRules — i.e. they catch typed-bypass FLOWS, not just
  // explicit `: any` annotations.

  {
    files: ['api/src/**/*.ts'],
    ignores: ['api/src/test/**', 'api/src/test-utils/**', '**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    rules: typedTypeSafetyRules,
  },

  {
    files: ['web/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: typedTypeSafetyRules,
  },

  {
    files: ['shared/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    rules: typedTypeSafetyRules,
  },

  // ── Cat 7 (Accessibility) + React correctness — web only ─────────────
  // Phase 2 brought axe Critical+Serious to 0/0 across all 8 routes; the
  // jsx-a11y rules below are the lint-time guards keeping it there.
  // React-hooks/rules-of-hooks is ERROR because conditional hook calls
  // are a real bug class (caught 9 in the first lint pass).
  {
    files: ['web/src/**/*.{ts,tsx,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // React correctness — most of these catch genuine bugs.
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // not needed with the new JSX transform
      'react/prop-types': 'off', // TypeScript covers prop typing
      'react/jsx-key': 'error',
      'react/jsx-no-useless-fragment': 'warn',

      // React hooks — almost always real bugs when violated.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // jsx-a11y — Cat 7 guards.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/click-events-have-key-events': 'error', // A11Y-2 — kanban + accountability
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/interactive-supports-focus': 'error',
      'jsx-a11y/label-has-associated-control': 'error', // A11Y-6 — workspace settings selects
      'jsx-a11y/no-access-key': 'error',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-tabindex': 'warn',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/no-static-element-interactions': 'warn', // A11Y-2 — divs that act like buttons
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
    },
  },

  // ── Node globals for .mjs/.js helpers ────────────────────────────────
  {
    files: [
      'scripts/**/*.{js,mjs}',
      'orientation/**/*.{js,mjs}', // axe-scan-after.mjs, keyboard-walks.mjs, etc.
      '*.mjs',
      '*.js',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }, // playwright scripts use both
    },
  },

  // ── Tests: relaxed rules ─────────────────────────────────────────────
  // Mock setup legitimately uses `: any` and `!`; tests log; etc.
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/__tests__/**',
      'api/src/test-utils/**',
      'api/src/test/**',
      'e2e/**',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'no-console': 'off',
    },
  },

  // ── Shipshape orchestrator (execSync + console output by design) ────
  {
    files: ['scripts/shipshape/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // ── Cat 6 (Runtime Errors) — OPT-IN ──────────────────────────────────
  // ~400 hits on the current baseline; enabling these alongside the Cat 1
  // typed-lint rules overwhelms the Cat 1 signal. Enable as a separate
  // dedicated pass once Cat 1 noise is reduced. To turn on, change `off`
  // to `error`:
  //
  // {
  //   files: ['api/src/**/*.ts', 'web/src/**/*.{ts,tsx}', 'shared/src/**/*.ts'],
  //   ignores: ['**/*.test.ts', '**/*.test.tsx', 'api/src/test/**', 'api/src/test-utils/**'],
  //   rules: {
  //     '@typescript-eslint/no-floating-promises': 'error',  // ERR-1 adjacent
  //     '@typescript-eslint/no-misused-promises': 'error',
  //     '@typescript-eslint/await-thenable': 'error',
  //     'no-throw-literal': 'error',
  //     'prefer-promise-reject-errors': 'error',
  //   },
  // },
);
