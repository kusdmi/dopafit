import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier';
import ts from 'typescript-eslint';

const MODULES = ['auth', 'commerce', 'messaging', 'training'];

/**
 * The patterns that stop a file inside module `self` from importing any of its siblings.
 *
 * `no-restricted-imports` matches the import specifier as written, and its globs have no way
 * to say "a path segment other than this one" — so "any module but mine" can only be spelled
 * out as an explicit list of the other three. That is why this is a function of `self` and
 * why the blocks below are generated per module rather than written once.
 *
 * Every module lives at exactly `src/modules/<name>/`, so a sibling import always names the
 * sibling: from `auth/http/endpoints.ts` the shortest spelling of commerce is
 * `../../commerce/...`. The three groups cover the three ways to write that same target:
 * a path from the package root, one that climbs out of the current module with `../`, and a
 * bare `modules/<other>/...`. Each is listed twice, once for the directory itself and once
 * for everything under it, because `foo/*` does not match `foo/bar/baz`.
 *
 * Type-only imports are matched too, which is intended: `import type` across modules still
 * couples their shapes together. Nothing in the tree does this today.
 */
const crossModuleBan = (self) => {
  const others = MODULES.filter((name) => name !== self);
  return {
    group: others.flatMap((other) => [
      `src/modules/${other}`,
      `src/modules/${other}/**`,
      `**/../${other}`,
      `**/../${other}/**`,
      `**/modules/${other}`,
      `**/modules/${other}/**`,
    ]),
    message:
      'A module may not import another module. Cross-module wiring belongs in src/runtime.ts, which composes all four.',
  };
};

export default ts.config(
  { ignores: ['dist/**', 'drizzle/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  // Every `no-restricted-imports` block below must stay mutually exclusive. A flat config
  // REPLACES a rule's options when a later block sets the same rule — it does not merge the
  // two option objects. An earlier version of this file relied on merging: the module-wide
  // block matched every domain/** and application/** file too, so its single `**/http/**`
  // pattern silently replaced the full ban and hono/zod/drizzle imports linted clean. Hence
  // the `ignores` on the later blocks.
  //
  // That trap is also why the cross-module ban is not a set of blocks of its own. "Not my
  // sibling" depends on which module the file is in, so it needs one block per module — and
  // four blocks layered on top of the two below would have matched the same files and
  // replaced their options, re-opening exactly the hole `7c92e60` opened. Instead each
  // existing block is expanded into one block per module, and `crossModuleBan(name)` is
  // carried alongside the patterns that block already had. Nothing overlaps, and every file
  // is matched by exactly one block.
  //
  // If you need a further restriction: add it to the `patterns` array of the blocks that
  // already cover the files, or carve those files out of both groups — do not add a block
  // that overlaps them.
  //
  // Every module keeps its layers in directories, so these two patterns cover them all.
  // Flat `domain.ts` / `application.ts` / `ports.ts` files no longer exist — adding one back
  // would place it outside this rule, so don't.
  ...MODULES.map((name) => ({
    files: [
      `src/modules/${name}/domain/**/*.ts`,
      `src/modules/${name}/application/**/*.ts`,
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'hono',
                'hono/*',
                'zod',
                '@hono/*',
                'drizzle-orm',
                'drizzle-orm/*',
                '**/infrastructure/**',
                '**/platform/**',
                '**/http/**',
              ],
              message: 'Domain/application depend on their own types and ports only.',
            },
            crossModuleBan(name),
          ],
        },
      ],
    },
  })),
  {
    // `src/domain/**` is the shared domain, not a module, so it has no sibling to be banned
    // from — it carries the layer ban alone. It stays a separate block for that reason, and
    // matches no file the per-module blocks above match.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'hono',
                'hono/*',
                'zod',
                '@hono/*',
                'drizzle-orm',
                'drizzle-orm/*',
                '**/infrastructure/**',
                '**/platform/**',
                '**/http/**',
              ],
              message: 'Domain/application depend on their own types and ports only.',
            },
          ],
        },
      ],
    },
  },
  ...MODULES.map((name) => ({
    // A module may not reach into the shared HTTP layer at all — not even from its index.ts.
    // That file was the gap: domain/** and application/** were already covered above, so
    // the rule looked complete while all four modules quietly imported http/types,
    // http/principal and http/schemas from their entry point, pointing the dependency
    // from the inside out.
    //
    // Every module now declares its own operations and DTOs under `<module>/http/`, and that
    // directory is covered by this rule too — deliberately. What it may not touch is
    // `src/http/`, which is the dispatcher and nothing else. The vocabulary a declaration is
    // written in lives in `src/endpoint.ts`, outside the http directory, so a module reaches
    // it without an exception here — and none of the four needed one.
    //
    // infrastructure/** is exempt from the wider restrictions above but not from this one:
    // a repository has no business knowing about HTTP either.
    //
    // The `ignores` leave domain/** and application/** to the block above, which already bans
    // the http directory among everything else. Without it this block would match those files
    // too and replace their full ban with this single pattern.
    //
    // Split per module for the cross-module ban, which needs to know which module the file
    // belongs to. The `ignores` still leave domain/** and application/** to the blocks above.
    files: [`src/modules/${name}/**/*.ts`],
    ignores: [
      `src/modules/${name}/domain/**/*.ts`,
      `src/modules/${name}/application/**/*.ts`,
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            crossModuleBan(name),
            {
              // Anchored at the top-level `src/http/`, not at any path segment named `http`,
              // so a module's own `<module>/http/` declarations stay reachable from its
              // siblings while the shared layer stays off limits. Every module sits at
              // `src/modules/<name>/...`, so reaching `src/http/` from one always spells the
              // ascent out in `../`; the leading `**/` catches it at any nesting depth, and
              // the first pattern catches a path written from the package root.
              group: ['src/http/*', 'src/http/**', '**/../http/*', '**/../http/**'],
              message:
                'Modules expose application services and declare their own endpoints; src/http is the dispatcher.',
            },
          ],
        },
      ],
    },
  })),
  // Switches off everything Prettier already decides.
  prettier,
  {
    // Re-enabled after `prettier`, which switches it off as "formatting". Prettier does
    // unpack `{ const b = parse(x); return use(b); }` once the line exceeds printWidth, but
    // nothing stops a short one from being written that way again — this rule does.
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
    },
  },
  {
    // Warnings, not errors. A dozen functions in the codebase are over these thresholds and
    // several earn it — `guard` applies four rate limits, `loadConfig` validates every
    // variable. The point is to notice the next one while it is being written, not to fail
    // the build over the ones that already exist.
    //
    // Deliberately not applied to the endpoint declarations or the DTO modules, all of which
    // now live in their own module: those are declarations of 93 endpoints and 150 DTOs, where
    // length is the subject matter rather than a smell. Each endpoint factory is one array
    // literal pairing a route with its handler, so its length counts the operations the module
    // serves, not the complexity of any one of them. Nothing under src/http/ needs the
    // exemption any more — what is left there is the dispatcher, plus the one-operation
    // liveness probe — so the paths that named it are gone.
    files: ['src/**/*.ts'],
    ignores: ['src/modules/*/http/**'],
    rules: {
      complexity: ['warn', 12],
      'max-lines-per-function': ['warn', { max: 60, skipComments: true }],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 5],
    },
  },
);
