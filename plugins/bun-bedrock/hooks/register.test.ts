import { describe, expect, test } from "bun:test";

import {
	announce,
	answerAdopt,
	blockForeign,
	type Engine,
	foreignPackageManager,
	type Next,
	type On,
	type ProcessResult,
	register,
	runAdopt,
} from "./register.ts";

const engine = (result: ProcessResult, calls: string[][] = []): Engine => ({
	plugin: { name: "bun-bedrock" },
	command: { register: () => Promise.resolve({}) },
	process: {
		run: (argv) => {
			calls.push([...argv]);
			return Promise.resolve(result);
		},
	},
});

const next =
	<E>(): Next<E> =>
	() =>
		Promise.resolve("ran");

const OK: ProcessResult = { exitCode: 0, stdout: "plan\n", stderr: "" };

describe("foreignPackageManager", () => {
	test.each([
		["npm install", "npm"],
		["cd app && npx tsc", "npx"],
		["FOO=1 pnpm i", "pnpm"],
		["sudo yarn add x", "yarn"],
		["echo $(pnpx x)", "pnpx"],
		["ls\nyarn", "yarn"],
	])("finds the manager in %j", (command, manager) => {
		expect(foreignPackageManager(command)).toBe(manager);
	});

	test.each([
		"bun add npm-run-all",
		"bunx tsc",
		"grep yarn README.md",
		"cat package-lock.json",
	])("passes %j", (command) => {
		expect(foreignPackageManager(command)).toBeUndefined();
	});
});

describe("runAdopt", () => {
	test("prints usage without a target", async () => {
		const calls: string[][] = [];
		const result = await runAdopt(engine(OK, calls), "  ");
		expect(result.text).toStartWith("Usage: /adopt");
		expect(calls).toEqual([]);
	});

	test("runs a dry run and says how to apply it", async () => {
		const calls: string[][] = [];
		const result = await runAdopt(engine(OK, calls), "../app --restyle");
		expect(calls).toEqual([
			[
				"bun",
				"run",
				"bun-bedrock",
				"adopt",
				"../app",
				"--restyle",
				"--dry-run",
			],
		]);
		expect(result.text).toBe(
			"plan\n\nTo apply this plan, run /adopt ../app --restyle --yes",
		);
	});

	test("applies with --yes and reports a failure as is", async () => {
		const calls: string[][] = [];
		const failed = { exitCode: 1, stdout: "", stderr: "no package.json\n" };
		const result = await runAdopt(engine(failed, calls), "../app --yes");
		expect(calls).toEqual([
			["bun", "run", "bun-bedrock", "adopt", "../app", "--yes"],
		]);
		expect(result).toEqual({
			text: "no package.json",
			context: ["/adopt ../app --yes exited 1:\nno package.json"],
		});
	});
});

describe("hooks", () => {
	test("announce registers /adopt, then continues", async () => {
		const registered: unknown[] = [];
		const $: Engine = {
			...engine(OK),
			command: {
				register: (command) => {
					registered.push(command);
					return Promise.resolve({});
				},
			},
		};
		expect(await announce($, {}, next())).toBe("ran");
		expect(registered).toEqual([expect.objectContaining({ name: "adopt" })]);
	});

	test("answerAdopt runs adopt with the typed arguments", async () => {
		const calls: string[][] = [];
		await answerAdopt(engine(OK, calls), { args: "../app" }, next());
		expect(calls).toEqual([
			["bun", "run", "bun-bedrock", "adopt", "../app", "--dry-run"],
		]);
	});

	test("blockForeign denies npm and passes bun on", async () => {
		expect(
			await blockForeign(engine(OK), { command: "npm ci" }, next()),
		).toEqual({
			deny: "bun-bedrock: this repo uses Bun. Run bun in place of npm, or bunx for a one-off package.",
		});
		expect(await blockForeign(engine(OK), { command: "bun ci" }, next())).toBe(
			"ran",
		);
	});

	test("register wires each hook to its event", () => {
		const wired: unknown[][] = [];
		const on: On = (...args: unknown[]) => {
			wired.push(args);
		};
		register(on);
		expect(wired.map(([event]) => event)).toEqual([
			"session.start",
			"command.run",
			"tool.call",
		]);
		expect(wired).toContainEqual(["session.start", announce]);
		expect(wired).toContainEqual([
			"command.run",
			{ command: "adopt" },
			answerAdopt,
		]);
		expect(wired).toContainEqual(["tool.call", { tool: "Bash" }, blockForeign]);
	});
});
