# Bun Bedrock

Shared tooling for strict Bun and TypeScript 7 repos. It holds the configs each repo extends, the commands its hooks and scripts run, and the `adopt` command that sets a repo up. It isn't on npm yet.

| File | Used by |
| --- | --- |
| `tsconfig.base.json` | `tsconfig.json`: `"extends": "bun-bedrock/tsconfig.base.json"` |
| `oxlintrc.json` | `.oxlintrc.json`: `"extends": ["./node_modules/bun-bedrock/oxlintrc.json"]` |
| `markdownlint.jsonc` | `.markdownlint-cli2.jsonc`: `"config": { "extends": "./node_modules/bun-bedrock/markdownlint.jsonc" }` |
| `files/` | The files `adopt` writes into a repo |

## Commands

| Command | Does |
| --- | --- |
| `bun-bedrock adopt <target>` | Set up a repo. `--help` lists the options. |
| `bun-bedrock guard` | Fail on suppression comments, other package managers, TypeScript drift, and unsorted catalogs |
| `bun-bedrock commit-msg <file>` | Check a commit message against Conventional Commits |
| `bun-bedrock pre-commit` | `bun fmt --staged`, then the `typecheck`, `lint`, and `guard` scripts |
| `bun-bedrock hooks` | Set `core.hooksPath` to `.githooks`. Does nothing in CI. |

The tools it configures are peer dependencies. `adopt` adds them to the repo's catalog, so editors and `bun run lint` find them in the repo.

`files/` stores `.gitignore`, `bunfig.toml`, `.oxlintrc.json`, and `.markdownlint-cli2.jsonc` with a `.template` suffix: `bun pm pack` leaves out the first two, and oxlint and markdownlint-cli2 would read the last two as configs for `files/`.
