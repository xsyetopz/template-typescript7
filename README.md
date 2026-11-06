# Bun and TypeScript 7 Template

A strict starting point for TypeScript 7 on Bun. Use it to start a repo, or point its `adopt` command at an existing or legacy repo, by hand or through an AI agent.

| Job | Tool |
| --- | --- |
| Runtime and packages | Bun 1.4.4 or newer, with `bun` and `bunx` |
| Type check | `bun check`, the TypeScript 7 built into Bun |
| Format | `bun fmt`, set up in `bunfig.toml` |
| Lint | oxlint with type-aware rules, and markdownlint-cli2 for Markdown |
| Test | `bun test`, failing below 90% line or function coverage |
| Versions | One Bun catalog in `package.json` |
| Git hooks | `.githooks`, turned on by `bun install` |

## How the Tooling Is Shared

The configs and commands live in one workspace package, [`bun-bedrock`](packages/bun-bedrock). Each repo keeps short files that point at it, so updating the package updates every repo:

| Repo file | Points at |
| --- | --- |
| `tsconfig.json` | `bun-bedrock/tsconfig.base.json` |
| `.oxlintrc.json` | the package's `oxlintrc.json`, plus the repo's own `ignorePatterns` |
| `.markdownlint-cli2.jsonc` | the package's `markdownlint.jsonc` |
| `.githooks/*` | `bun run bun-bedrock pre-commit` and `commit-msg` |
| `package.json` scripts | `bun-bedrock guard` and `bun-bedrock hooks` |

The repo still lists oxlint, markdownlint-cli2, TypeScript, and the type packages in its own catalog, so editors find them. `bunfig.toml` can't extend another file, so each repo has a full copy.

`bun-bedrock` isn't on npm yet. Until it is, an adopted repo installs it from a local folder with `--package file:<path>`.

## Start a New Repo

```bash
bun create xsyetopz/template-typescript7 my-app
cd my-app
bun run verify
```

## Adopt an Existing Repo

```bash
git clone --depth 1 https://github.com/xsyetopz/template-typescript7 /tmp/tt7
bun /tmp/tt7/packages/bun-bedrock/src/cli.ts adopt <target> --package file:/tmp/tt7/packages/bun-bedrock --dry-run
bun /tmp/tt7/packages/bun-bedrock/src/cli.ts adopt <target> --package file:/tmp/tt7/packages/bun-bedrock
```

The first command prints the plan. The second asks before it changes anything and keeps each replaced file as `<file>.bak`. Keep the `/tmp/tt7` folder until `bun-bedrock` is published, because the repo installs it from there.

| Flag | Effect |
| --- | --- |
| `--package <spec>` | Install `bun-bedrock` from this spec, such as `file:<path>`. Without it, the catalog pins the published version. |
| `--restyle` | Replace the repo's Prettier or oxfmt style with the template's. |
| `--dry-run` | Print the plan and stop. |
| `--yes` | Apply without asking, for agents and CI. |
| `--no-install` | Skip `bun install` and the steps that need it. |

Then run `bun run verify` in the target, fix what it reports, and delete the `*.bak` files once you've compared them. [docs/adopting.md](docs/adopting.md) lists every change and the order to fix errors in, which matters most for legacy code.

## Commands

```bash
bun fmt              # format
bun fmt --check      # check formatting
bun check            # type check
bun run lint         # oxlint, then markdownlint-cli2
bun run guard        # repo rules
bun test             # tests
bun run verify       # all of the above, in order
```

`bun run guard` fails on:

- a suppression comment (`eslint-disable`, `oxlint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`);
- a lockfile or config from another package manager;
- a package script that calls npm, npx, pnpm, pnpx, or yarn;
- an installed `typescript` whose version differs from the one in Bun;
- a catalog out of name order, since `bun fmt` sorts dependencies but not catalogs.

## Claude Code Plugin

[`plugins/bun-bedrock`](plugins/bun-bedrock) keeps Claude on Bun:

- it blocks Bash commands that run npm, npx, pnpm, pnpx, or yarn, and tells Claude to use `bun` or `bunx`;
- `/adopt <target>` prints the adopt plan, and `/adopt <target> --yes` applies it.

This repo is also a plugin marketplace, listed in `.claude-plugin/marketplace.json`. Install the plugin from a Claude Code session:

```text
/plugin install bun-bedrock --marketplace xsyetopz/template-typescript7
```

To try local changes for one session, run `claude --plugin-dir plugins/bun-bedrock`. The repo's type check, lint, and tests cover the plugin, and `bun run plugin:validate` checks the marketplace file and the plugin against Claude Code's plugin API.

## Docs

| File | Content |
| --- | --- |
| [docs/adopting.md](docs/adopting.md) | What `adopt` changes, and how to fix the errors that follow |
| [docs/tsconfig.md](docs/tsconfig.md) | Every compiler option and why it's set |
| [docs/lint-rules.md](docs/lint-rules.md) | How oxlint and markdownlint are set up |
| [docs/node-apis.md](docs/node-apis.md) | When to use a Bun API and when a `node:` module |
| [AGENTS.md](AGENTS.md) | Instructions for AI agents |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |

## License

MIT. See [LICENSE](LICENSE).

`packages/bun-bedrock/src/commit-msg.ts` is ported from [compilerla/conventional-pre-commit](https://github.com/compilerla/conventional-pre-commit) v4.5.0, licensed under [Apache-2.0](https://github.com/compilerla/conventional-pre-commit/blob/v4.5.0/LICENSE). The file header lists the changes.
