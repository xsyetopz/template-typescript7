# Contributing

## Setup

You need Bun 1.4.4 or newer.

```bash
bun install
```

The install sets up the git hooks in `.githooks`.

## Before You Open a Pull Request

```bash
bun run verify
```

This runs, in order: `bun fmt --check`, `bun check`, `oxlint`, `markdownlint-cli2`, the guard, and `bun test`.

## Rules

- Use `bun` for packages and scripts, and `bunx` for one-off tools.
- Fix the cause of each lint or type error. The guard rejects suppression comments.
- Pin dependency versions in the `catalog` of `package.json`.
- Add or update a test for each behavior change. Coverage must stay at or above 90% for lines and functions.
- Update the docs in `docs/` when a config or CLI behavior changes.

## Commits

Use Conventional Commits. The `commit-msg` hook checks the subject, the blank line before a body, and `BREAKING CHANGE:` footers.

```text
feat(cli): add --dry-run
docs: explain legacy migration
```

Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.

## Agents

AI agents follow `AGENTS.md`.

## License

Contributions are licensed under the MIT license in `LICENSE`.
