# Adopting an Existing Repo

`bun-bedrock adopt` moves a repo onto Bun and the template's strict setup. It works the same way for a fresh folder, an active project, or a legacy codebase. It edits `package.json` and the config files, and leaves your source code as it is.

## Run It

`bun-bedrock` is not on npm yet, so run it from a clone of this template:

```bash
git clone --depth 1 https://github.com/xsyetopz/template-typescript7 /tmp/tt7
bun /tmp/tt7/packages/bun-bedrock/src/cli.ts adopt <target> --package file:/tmp/tt7/packages/bun-bedrock --dry-run
bun /tmp/tt7/packages/bun-bedrock/src/cli.ts adopt <target> --package file:/tmp/tt7/packages/bun-bedrock
```

The first command prints the plan. The second prints it again and asks `Apply these changes? [y/N]`. An agent or CI job, which has no terminal to answer in, passes `--yes`.

Keep the clone afterwards. The adopted repo installs `bun-bedrock` from that folder until the package is published.

| Flag | Effect |
| --- | --- |
| `--package <spec>` | Install `bun-bedrock` from `<spec>`, such as `file:<path>`. A version or range goes in the catalog; any other spec goes straight into `devDependencies`. |
| `--restyle` | Switch the repo from its Prettier or oxfmt style to the template style. |
| `--dry-run` | Print the plan and stop. |
| `--yes` | Apply the plan without asking. |
| `--no-install` | Skip `bun install` and the steps that run after it. |

Without `--package`, adopt keeps the repo's current `bun-bedrock` spec, or pins the version it ships with. The target is the repo to change; adopt stops with an error when you point it at the `bun-bedrock` folder.

When it finishes, run `bun run verify` in the target. Each file adopt changed or removed is saved next to it as `<file>.bak`. Delete the backups once you are happy with the result; `.gitignore` already ignores them.

## What Changes

### Package Manager

`bun install` imports `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `npm-shrinkwrap.json`, or `bun.lockb` into `bun.lock`, and adopt then deletes the old file. `package.json` gets `packageManager` and `engines.bun`, and loses any `npm`, `pnpm`, or `yarn` pin in `engines`.

### Scripts

Every adopted repo ends up with the same script names: `format`, `format:check`, `guard`, `lint`, `lint:fix`, `prepare`, `typecheck`, `verify`, and `test`. Your own `test` script stays. When one of the other names already ran something else, adopt prints the old command so you can move a step it still needs, such as a build or `cargo test`, into the new script.

Commands inside your other scripts are rewritten:

| Before | After |
| --- | --- |
| `npm`, `pnpm`, `yarn` | `bun` |
| `npx`, `pnpx` | `bunx` |
| `node`, `tsx`, `ts-node`, `ts-node-dev`, `esno` | `bun` |
| `tsc --noEmit` | `bun check` |
| `prettier`, `oxfmt` | `bun fmt` |
| `eslint`, `biome` | `oxlint` |
| `rimraf` | `rm -rf` |
| `cross-env A=1 cmd` | `A=1 cmd` |

Scripts named `check` or `fmt` become `check:project` and `fmt:project`, so `bun check` and `bun fmt` keep running Bun's own commands. Adopt prints a note for each script that calls Jest or Vitest; move those tests to `bun:test` by hand.

### Dependencies

Adopt removes the packages that Bun and `bun-bedrock` replace: Biome, ESLint and its plugins, typescript-eslint, husky, lefthook, lint-staged, simple-git-hooks, cross-env, esno, npm-run-all, rimraf, ts-node, and tsx. It also removes their config files and their `package.json` fields, plus `.eslintignore`, `.yarnrc*`, and `pnpm-workspace.yaml`.

It adds `bun-bedrock` and the tools it configures: oxlint, oxlint-tsgolint, markdownlint-cli2 with its title case rule, TypeScript, `@types/bun`, and `@types/node`. Their versions go in `workspaces.catalog`, merged with yours and sorted by name. Where both pin a package, the template version wins. A `pnpm-workspace.yaml` has its `packages`, `catalog`, and `catalogs` moved into `workspaces`, and its `onlyBuiltDependencies` into `trustedDependencies`.

### TypeScript

`tsconfig.json` extends `bun-bedrock/tsconfig.base.json`, after any `extends` you already had. Adopt then:

- removes the options TypeScript 7 rejects or always turns on, such as `esModuleInterop`, `downlevelIteration`, `alwaysStrict`, and `outFile`;
- turns `baseUrl` into `paths`;
- removes the options the base config sets, so a weaker setting of yours gives way to the strict one;
- keeps `jsx`, `lib`, and `types`, and adds `bun` to `types`;
- sets `noEmit: false` when the project emits with `tsc` (`composite`, `declaration`, `emitDeclarationOnly`, or `outDir`). Check `module` and `target` yourself in that case.

### Lint, Format, and Hooks

`.oxlintrc.json` and `.markdownlint-cli2.jsonc` extend the configs in `bun-bedrock`, and `.githooks/` runs its `pre-commit` and `commit-msg` commands. Adopt replaces these thin files whenever they differ from the template, along with `.bun-version`.

`bunfig.toml` cannot extend another file, so adopt writes a full copy. If the repo has a Prettier or oxfmt config, adopt keeps it and leaves out the template's `[fmt]` style: `bun fmt` reads the existing config and formats the code the same way. Pass `--restyle` to remove that config and use the template style. After install, adopt runs `bun fmt --doctor` and removes the packages it lists.

These files are written only when the repo has none, so a tuned copy stays: `tsconfig.json`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.vscode/extensions.json`, `.vscode/settings.json`, and `AGENTS.md`.

## Fixing the Errors

A legacy repo goes straight to the full strict config, so the first `bun run verify` usually reports many errors. The common ones:

- implicit `any`, values that can be `null` or `undefined`, and unchecked index access;
- types imported without `import type`;
- enums, namespaces, and constructor parameter properties;
- a caught `error` used as an `Error`;
- `obj.key` on a type with an index signature;
- CommonJS `require` and `module.exports`.

Work through them on a branch, in this order:

1. Run `bun fmt`, then `bun run lint:fix`. Both rewrite files, so review the diff.
2. Run `bun check` and fix one flag at a time:
   - `strict`: add the missing types, and narrow `null`, `undefined`, and caught values (`instanceof Error`).
   - `noUncheckedIndexedAccess`: an indexed read can be `undefined`, so check it before use.
   - `exactOptionalPropertyTypes`: write `x?: T | undefined` where an explicit `undefined` is meant, or stop passing one.
   - `noPropertyAccessFromIndexSignature`: write `obj["key"]`, or declare the property.
   - `verbatimModuleSyntax`: import types with `import type { T }` or `import { type T }`.
   - `erasableSyntaxOnly`: use `as const` objects and unions for enums, modules for namespaces, and plain fields assigned in the constructor for parameter properties.
   - `noImplicitReturns`, `noImplicitOverride`, `noUnused*`, `noFallthroughCasesInSwitch`: finish or remove what the error names.
   - `checkJs`: `.js` files are type checked too.
3. Convert CommonJS to ESM: `require` to `import`, `module.exports` to named exports, `__dirname` to `import.meta.dir`.
4. Run `bun run lint` and fix the rest one rule at a time. [lint-rules.md](lint-rules.md) explains the setup.
5. Repeat `bun run verify` until it passes.

The pre-commit hook checks the whole repo, so it accepts a commit once every error is fixed. Plan the migration as one branch that you commit when `verify` passes.

When an agent does the work, have it fix each error at its cause and keep every rule, `tsconfig` flag, and severity as the template sets them. The guard rejects suppression comments.
