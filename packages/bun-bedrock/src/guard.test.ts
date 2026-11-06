import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { $ } from "bun";

import { findProblems, findUnsortedCatalogs } from "./guard.ts";

// Built at runtime so the guard does not flag this file.
const SUPPRESSION = `// ${["eslint", "disable"].join("-")}`;

const roots: string[] = [];
const repo = async (files: Record<string, string>): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), "guard-test-"));
	roots.push(root);
	await Promise.all(
		Object.entries(files).map(([path, content]) =>
			Bun.write(join(root, path), content),
		),
	);
	return root;
};

const brokenRepo = {
	"package.json": JSON.stringify({
		scripts: { build: "npx tsc" },
		workspaces: { catalog: { b: "1", a: "1" } },
	}),
	"src/index.ts": `${SUPPRESSION}\n`,
	"node_modules/dep/index.ts": `${SUPPRESSION}\n`,
	"node_modules/typescript/package.json": JSON.stringify({ version: "0.0.0" }),
	"yarn.lock": "",
};

afterAll(async () => {
	await Promise.all(
		roots.map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe("findProblems", () => {
	test("passes a clean repo", async () => {
		const root = await repo({
			"package.json": JSON.stringify({ scripts: { test: "bun test" } }),
			"src/index.ts": "export const one = 1;\n",
		});
		expect(await findProblems(root)).toEqual([]);
	});

	test("reports each problem, skipping node_modules", async () => {
		const root = await repo(brokenRepo);
		expect(await findProblems(root)).toEqual([
			"src/index.ts:1: suppression comment",
			"yarn.lock: not used in a Bun-only repo",
			'package.json: script "build" calls another package manager',
			`typescript: 0.0.0 is installed but \`bun check\` runs ${String(process.versions["typescript"])}; set the catalog to ${String(process.versions["typescript"])}`,
			"package.json: sort workspaces.catalog by package name",
		]);
	});

	test("lists source files through git when the repo has one", async () => {
		const root = await repo({ ...brokenRepo, ".gitignore": "node_modules/\n" });
		await $`git init -q`.cwd(root);
		expect(await findProblems(root)).toContain(
			"src/index.ts:1: suppression comment",
		);
	});
});

describe("findUnsortedCatalogs", () => {
	test("passes sorted catalogs and manifests without one", () => {
		expect(findUnsortedCatalogs({})).toEqual([]);
		expect(
			findUnsortedCatalogs({
				workspaces: {
					catalog: { "@types/bun": "1", oxlint: "1" },
					catalogs: { old: { a: "1", b: "1" } },
				},
			}),
		).toEqual([]);
	});

	test("names each unsorted catalog", () => {
		expect(
			findUnsortedCatalogs({
				workspaces: {
					catalog: { oxlint: "1", "@types/bun": "1" },
					catalogs: { old: { b: "1", a: "1" } },
				},
			}),
		).toEqual([
			"package.json: sort workspaces.catalog by package name",
			"package.json: sort workspaces.catalogs.old by package name",
		]);
	});
});
