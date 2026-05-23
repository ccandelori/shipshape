// ShipShape ESLint configuration (flat config — ESLint 9+).
//
// Scope: the rules below are the lintable subset of the Phase 2 PRD's seven
// categories. Cats 2 (bundle), 3 (API perf), 4 (DB), 5 (tests) are
// measurement-based and live under `pnpm shipshape`; lint can't catch them.
//
// What lint catches:
//   Cat 1 (Type Safety)       — no-explicit-any, no-non-null-assertion,
//                                consistent-type-assertions, ban-ts-comment,
//                                no-unsafe-* family (typed lint).
//   Cat 6 (Runtime Errors)    — no-floating-promises, no-misused-promises,
//                                no-throw-literal, prefer-promise-reject-errors.
//                                ERR-1 (yjsToJson silent NULL persist) was a
//                                `: any` returning undefined — Cat 1 rules
//                                catch this class at the source.
//   Cat 7 (Accessibility)     — eslint-plugin-jsx-a11y mirroring the axe
//                                findings Phase 2 fixed (focus traps, missing
//                                labels, keyboard handlers on click targets).
//   React correctness         — react-hooks/rules-of-hooks +
//                                exhaustive-deps + react/jsx-key etc.
//
// Severity strategy:
//   - A11y + React-hooks + runtime-error rules: ERROR (Phase 2 brought
//     these to clean state; a regression should fail CI).
//   - Type-safety rules: WARN (the Phase 2 baseline is 548 violations
//     under the shipshape methodology; ratchet down over time via the
//     shipshape Cat 1 count, not lint errors). New code can be cleaned up
//     incrementally without breaking the existing tree.
//
// To install the required dev deps at the workspace root:
//   pnpm add -Dw eslint @eslint/js typescript-eslint \
//                eslint-plugin-react eslint-plugin-react-hooks \
//                eslint-plugin-jsx-a11y globals
//
// To run:
//   pnpm lint            # check
//   pnpm lint:fix        # auto-fix what's autofixable
//   pnpm exec eslint web/src/components/Editor.tsx   # single file
//
// See: scripts/shipshape/checks/typecheck.ts — shipshape's Cat 1 count is the
// authoritative gate. Lint is the editor-time complement.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default tseslint.config(
  // ── Ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/.turbo/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.deploy/**',
      // Generated docs / artifacts:
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
  // tsc + a 30-line globals list don't already catch.
  {
    rules: { 'no-undef': 'off' },
  },

  // ── TS base (without type-checking — fast, runs on every file) ──────
  // The type-checked rules below run as a second pass against tsconfigs.
  ...tseslint.configs.recommended,

  // ── TS strict + typed-lint rules on api/web/shared source ────────────
  // Skips e2e/* and api/src/test/* (both excluded from their package
  // tsconfigs, can't run typed-lint without parse errors). Those still
  // get the base TS rules from `tseslint.configs.recommended` above.
  {
    files: ['api/src/**/*.ts', 'web/src/**/*.{ts,tsx}', 'shared/src/**/*.ts'],
    ignores: ['api/src/test/**', 'api/src/test-utils/**', '**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      parserOptions: {
        // projectService autodiscovers the right tsconfig for each file
        // (typescript-eslint v8+). Avoids the maintenance burden of listing
        // every project + the EXCLUDE-mismatch trap (api/src/test was
        // excluded from api/tsconfig and would error here without projectService).
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript's own compiler catches undeclared variables at build time;
      // ESLint's no-undef is unreliable on TS source (misses ambient types,
      // doesn't understand declaration merging, fights with DOM/Node globals).
      // Disable across all TS source. tsc --noEmit is the gate.
      'no-undef': 'off',
      // ── Cat 1 — Type Safety ──────────────────────────────────────────
      // WARN-level so the existing 548-violation baseline doesn't block;
      // shipshape Cat 1 is the authoritative count gate.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-assertions': [
        'warn',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never', // forbid `{} as Foo` (use a typed const)
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
      // ERROR — these are stronger statements; if any code crosses the line,
      // it's signaling intent.
      '@typescript-eslint/no-unsafe-assignment': 'off', // too noisy at the current baseline
      '@typescript-eslint/no-unsafe-member-access': 'off', // same
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // ── Cat 6 — Runtime Errors ───────────────────────────────────────
      // ERR-1 (yjsToJson silent NULL persist) was: a function typed `: any`
      // returned undefined; JSON.stringify(undefined) = undefined; pg coerced
      // to NULL. no-explicit-any (above) is the root-cause guard; the rules
      // below catch the adjacent class of unhandled-promise bugs.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',

      // ── General hygiene ──────────────────────────────────────────────
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': 'off', // covered by @typescript-eslint/no-unused-vars
      '@typescript-eslint/prefer-as-const': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },

  // ── Web: React + a11y ────────────────────────────────────────────────
  {
    files: ['web/src/**/*.{ts,tsx,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React correctness (catches genuine bugs).
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // not needed with the new JSX transform
      'react/prop-types': 'off', // TypeScript covers prop typing
      'react/jsx-key': 'error',
      'react/jsx-no-useless-fragment': 'warn',

      // React hooks — almost always real bugs when violated.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── Cat 7 — Accessibility ────────────────────────────────────────
      // Phase 2 brought axe Critical+Serious to 0/0 across all 8 routes;
      // these rules are the lint-time guards keeping it there. ERROR
      // severity — a regression here should fail.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/click-events-have-key-events': 'error', // A11Y-2 (kanban + accountability)
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/interactive-supports-focus': 'error',
      'jsx-a11y/label-has-associated-control': 'error', // A11Y-6 (workspace settings selects)
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

  // ── Node globals for api + shared + scripts + .mjs helpers ──────────
  {
    files: [
      'api/src/**/*.ts',
      'shared/src/**/*.ts',
      'scripts/**/*.{ts,js,mjs}',
      'e2e/**/*.ts',
      'orientation/**/*.{js,mjs}', // axe-scan-after.mjs, keyboard-walks.mjs, etc.
      '*.mjs',
      '*.js',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }, // .mjs scripts use both (playwright opens a browser)
    },
    rules: {
      // TypeScript handles undeclared-variable checking for .ts files; for
      // plain .js/.mjs scripts we rely on globals (set above) + no-undef.
      // Disable no-undef on .ts (typescript-eslint convention) but keep it
      // on .js/.mjs where TS isn't involved.
    },
  },

  // ── Tests: relaxed rules ─────────────────────────────────────────────
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
      // Tests legitimately use `: any` for mock setup; don't fight it.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Floating promises in test setup are usually safe (vitest awaits all
      // top-level hooks); but keep no-misused-promises ON.
      '@typescript-eslint/no-floating-promises': 'off',
      'no-console': 'off', // tests legitimately log
    },
  },

  // ── Shipshape orchestrator (uses dynamic imports of .ts files) ───────
  {
    files: ['scripts/shipshape/**/*.ts'],
    rules: {
      // The shipshape scripts use execSync heavily; that's intentional.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off', // shipshape prints progress directly
    },
  },
);
