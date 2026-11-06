import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { $ } from "bun";

import { checkFile, isConventional } from "./commit-msg.ts";

// Cases from compilerla/conventional-pre-commit v4.5.0 tests/test_format.py.
describe("isConventional", () => {
	test.each([
		["feat: subject", true],
		["FIX: message", true],
		["fix!: message", true],
		["feat(scope): subject", true],
		["feat(#scope): message", true],
		["feat: message with `&#", true],
		["feat(scope): subject\n\nextended body\n", true],
		["feat(scope): subject\n\nBREAKING CHANGE: description\n", true],
		["feat(scope): subject\n\nBREAKING-CHANGE: description\n", true],
		["feat(scope): message\n# Please enter the commit message.\n", true],
		["feat", false],
		["feat subject", false],
		["feat(scope): ", false],
		[": subject", false],
		["(scope): subject", false],
		["wrong: message", false],
		["feat(%&*@()): message", false],
		["feat (scope): message", false],
		["feat(scope) : message", false],
		["feat(scope): subject\nextended body no newline\n", false],
		["feat(scope): subject\n\nBreaking change: description\n", false],
	])("%p is %p", (message, expected) => {
		expect(isConventional(message)).toBe(expected);
	});

	test.each([
		["amend! ", true],
		["squash! whatever .. $12 #", true],
		["squash!", false],
		[" squash! ", false],
		["Merge pull request #123 from user/feature-branch", true],
		["merge branch 'dev' into 'main'", true],
		["MergeSort implemented and tested", false],
		["chore: merged upstream changes", true],
	])("skips autosquash and merge commits: %p is %p", (message, expected) => {
		expect(isConventional(message)).toBe(expected);
	});

	test("ignores the diff below the scissors line of a verbose commit", () => {
		const scissors = `# ${"-".repeat(24)} >8 ${"-".repeat(24)}`;
		expect(isConventional(`fix: x\n${scissors}\ndiff --git a b\n`)).toBe(true);
	});

	test("checkFile passes a conventional message and rejects others", async () => {
		const file = join(tmpdir(), `commit-msg-${crypto.randomUUID()}`);
		await Bun.write(file, "feat: add x\n");
		expect(await checkFile(file)).toBe(0);
		await Bun.write(file, "added x\n");
		expect(await checkFile(file)).toBe(1);
		expect(await checkFile()).toBe(1);
		await Bun.file(file).delete();
	});

	test("the git hook runs the check", async () => {
		const hook = join(import.meta.dir, "../files/.githooks/commit-msg");
		const file = join(tmpdir(), `commit-msg-${crypto.randomUUID()}`);
		await Bun.write(file, "added x\n");
		const result = await $`${hook} ${file}`.nothrow().quiet();
		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain("Conventional Commits");
		await Bun.file(file).delete();
	});
});
