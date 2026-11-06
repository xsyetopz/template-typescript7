#!/usr/bin/env bun
import { $ } from "bun";

import { adopt } from "./adopt/command.ts";
import { checkFile } from "./commit-msg.ts";
import { guard } from "./guard.ts";
import { setHooksPath } from "./hooks.ts";

const USAGE = `Usage: bun-bedrock <command> [args]

Commands:
  adopt <target>     Set up a repo with bun-bedrock. See \`adopt --help\`.
  commit-msg <file>  Check a commit message against Conventional Commits.
  guard              Report suppression comments, foreign lockfiles and scripts,
                     TypeScript drift, and unsorted catalogs.
  hooks              Point git at .githooks. Does nothing in CI.
  pre-commit         Format staged files, then run typecheck, lint, and guard.`;

const preCommit = async (): Promise<number> => {
	const format = await $`bun fmt --staged`.nothrow();
	if (format.exitCode !== 0) {
		return format.exitCode;
	}
	const checks = await $`bun run --sequential typecheck lint guard`.nothrow();
	return checks.exitCode;
};

const COMMANDS: Record<string, (args: string[]) => Promise<number>> = {
	adopt,
	"commit-msg": ([file]) => checkFile(file),
	guard: () => guard(process.cwd()),
	hooks: setHooksPath,
	"pre-commit": preCommit,
};

const [name = "", ...args] = Bun.argv.slice(2);
const command = COMMANDS[name];
if (command === undefined) {
	console.info(USAGE);
	process.exitCode = ["-h", "--help"].includes(name) ? 0 : 2;
} else {
	try {
		process.exitCode = await command(args);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
