import { join } from "node:path";

import { $, Glob } from "bun";

// Written as alternations so this file does not match itself.
const SUPPRESSION =
	/(?:eslint|oxlint)-disable|biome-(?:ignore)|@ts-(?:ignore|expect-error|nocheck)/u;
const OTHER_PACKAGE_MANAGER = /\b(?:npm|npx|pnpm|pnpx|yarn)\b/u;
const SOURCE = new Glob(
	"**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,vue,svelte,astro}",
);
// `.npmrc` is absent on purpose: Bun reads it for registry auth.
const FOREIGN_FILES = [
	".pnpmfile.cjs",
	".yarnrc",
	".yarnrc.yml",
	"bun.lockb",
	"npm-shrinkwrap.json",
	"package-lock.json",
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
	"yarn.lock",
];

export const listSourceFiles = async (cwd: string): Promise<string[]> => {
	const git = await $`git ls-files --cached --others --exclude-standard`
		.cwd(cwd)
		.nothrow()
		.quiet();
	if (git.exitCode === 0) {
		return git.stdout
			.toString()
			.split("\n")
			.filter((path) => SOURCE.match(path));
	}
	const paths: string[] = [];
	for await (const path of SOURCE.scan({ cwd })) {
		if (!path.split("/").includes("node_modules")) {
			paths.push(path);
		}
	}
	return paths;
};

export const findSuppressions = async (
	cwd: string,
	paths: readonly string[],
): Promise<string[]> => {
	const texts = await Promise.all(
		paths.map((path) => Bun.file(join(cwd, path)).text()),
	);
	return paths.flatMap((path, index) =>
		(texts[index] ?? "")
			.split("\n")
			.flatMap((line, row) =>
				SUPPRESSION.test(line)
					? [`${path}:${row + 1}: suppression comment`]
					: [],
			),
	);
};

const findForeignFiles = async (cwd: string): Promise<string[]> => {
	const present = await Promise.all(
		FOREIGN_FILES.map((path) => Bun.file(join(cwd, path)).exists()),
	);
	return FOREIGN_FILES.filter((_, index) => present[index] === true).map(
		(path) => `${path}: not used in a Bun-only repo`,
	);
};

const findForeignScripts = async (cwd: string): Promise<string[]> => {
	const manifest: unknown = await Bun.file(join(cwd, "package.json")).json();
	const scripts =
		typeof manifest === "object" &&
		manifest !== null &&
		"scripts" in manifest &&
		typeof manifest.scripts === "object" &&
		manifest.scripts !== null
			? manifest.scripts
			: {};
	return Object.entries(scripts)
		.filter(
			([, command]) =>
				typeof command === "string" && OTHER_PACKAGE_MANAGER.test(command),
		)
		.map(
			([name]) =>
				`package.json: script "${name}" calls another package manager`,
		);
};

/** `bun fmt` sorts dependencies but not catalogs, so the guard checks them. */
export const findUnsortedCatalogs = (manifest: unknown): string[] => {
	const workspaces =
		typeof manifest === "object" &&
		manifest !== null &&
		"workspaces" in manifest
			? manifest.workspaces
			: undefined;
	if (typeof workspaces !== "object" || workspaces === null) {
		return [];
	}
	const named =
		"catalogs" in workspaces &&
		typeof workspaces.catalogs === "object" &&
		workspaces.catalogs !== null
			? Object.entries(workspaces.catalogs)
			: [];
	const catalogs: [string, unknown][] = [
		["catalog", "catalog" in workspaces ? workspaces.catalog : undefined],
		...named.map(([name, value]): [string, unknown] => [
			`catalogs.${name}`,
			value,
		]),
	];
	return catalogs.flatMap(([name, catalog]) => {
		if (typeof catalog !== "object" || catalog === null) {
			return [];
		}
		const keys = Object.keys(catalog);
		return keys.every(
			(key, index) => index === 0 || (keys[index - 1] ?? "") < key,
		)
			? []
			: [`package.json: sort workspaces.${name} by package name`];
	});
};

// The editor runs this package while `bun check` runs the TypeScript built into Bun.
const findTypescriptDrift = async (cwd: string): Promise<string[]> => {
	const file = Bun.file(join(cwd, "node_modules/typescript/package.json"));
	if (!(await file.exists())) {
		return [];
	}
	const manifest: unknown = await file.json();
	const installed =
		typeof manifest === "object" && manifest !== null && "version" in manifest
			? manifest.version
			: undefined;
	const builtIn = process.versions["typescript"];
	return installed === builtIn
		? []
		: [
				`typescript: ${String(installed)} is installed but \`bun check\` runs ${String(builtIn)}; set the catalog to ${String(builtIn)}`,
			];
};

export const findProblems = async (cwd: string): Promise<string[]> => [
	...(await findSuppressions(cwd, await listSourceFiles(cwd))),
	...(await findForeignFiles(cwd)),
	...(await findForeignScripts(cwd)),
	...(await findTypescriptDrift(cwd)),
	...findUnsortedCatalogs(await Bun.file(join(cwd, "package.json")).json()),
];

export const guard = async (cwd: string): Promise<number> => {
	const problems = await findProblems(cwd);
	for (const problem of problems) {
		console.error(problem);
	}
	if (problems.length === 0) {
		return 0;
	}
	console.error("Fix the cause instead of suppressing it. See AGENTS.md.");
	return 1;
};
