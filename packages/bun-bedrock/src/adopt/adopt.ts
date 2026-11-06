import { realpath, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import {
	asRecord,
	exists,
	type Json,
	readJsonc,
	toJson,
	withoutKey,
} from "./json.ts";
import { migrateManifest } from "./manifest.ts";
import type { Step } from "./steps.ts";
import { templateManifest } from "./template.ts";
import { migrateTsconfig } from "./tsconfig.ts";

export interface AdoptOptions {
	readonly restyle: boolean;
	/** Where the repo gets bun-bedrock from, such as `file:../bun-bedrock`. */
	readonly packageSpec?: string | undefined;
}

export interface Plan {
	readonly steps: readonly Step[];
	/** Removed after `bun install` has migrated them into `bun.lock`. */
	readonly lockfiles: readonly string[];
	readonly notes: readonly string[];
}

const FORMATTER_CONFIGS = [
	".oxfmtrc.json",
	".oxfmtrc.jsonc",
	".prettierrc",
	".prettierrc.cjs",
	".prettierrc.js",
	".prettierrc.json",
	".prettierrc.json5",
	".prettierrc.mjs",
	".prettierrc.toml",
	".prettierrc.ts",
	".prettierrc.yaml",
	".prettierrc.yml",
	"prettier.config.cjs",
	"prettier.config.js",
	"prettier.config.mjs",
	"prettier.config.ts",
];
const REPLACED_CONFIGS = [
	".eslintignore",
	".eslintrc",
	".eslintrc.cjs",
	".eslintrc.js",
	".eslintrc.json",
	".eslintrc.yaml",
	".eslintrc.yml",
	".husky",
	".lefthook.yml",
	".lintstagedrc",
	".lintstagedrc.json",
	".lintstagedrc.js",
	".pnpmfile.cjs",
	".simple-git-hooks.json",
	".yarnrc",
	".yarnrc.yml",
	"biome.json",
	"biome.jsonc",
	"eslint.config.cjs",
	"eslint.config.js",
	"eslint.config.mjs",
	"eslint.config.mts",
	"eslint.config.ts",
	"lefthook.yaml",
	"lefthook.yml",
	"lint-staged.config.js",
	"lint-staged.config.mjs",
	"pnpm-workspace.yaml",
];
const LOCKFILES = [
	"bun.lockb",
	"npm-shrinkwrap.json",
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
];
/** Thin files that point at bun-bedrock. A changed copy is backed up, then replaced. */
const TOOL_FILES = [
	".bun-version",
	".githooks/commit-msg",
	".githooks/pre-commit",
	".markdownlint-cli2.jsonc",
	".oxlintrc.json",
];
/** Project files a repo may have tuned. They are written only if missing. */
const STARTER_FILES = [
	".gitattributes",
	".gitignore",
	".github/dependabot.yml",
	".github/workflows/ci.yml",
	".vscode/extensions.json",
	".vscode/settings.json",
	"AGENTS.md",
];

const existing = async (
	root: string,
	paths: readonly string[],
): Promise<string[]> => {
	const found = await Promise.all(
		paths.map((path) => exists(join(root, path))),
	);
	return paths.filter((_, index) => found[index] === true);
};

/** npm packs drop `.gitignore` and `bunfig.toml`, and linters read nested configs, so these keep a suffix. */
const STORED_WITH_SUFFIX = new Set([
	".gitignore",
	".markdownlint-cli2.jsonc",
	".oxlintrc.json",
	"bunfig.toml",
]);
const storedPath = (path: string): string =>
	STORED_WITH_SUFFIX.has(path) ? `${path}.template` : path;

const copyFile = async (filesRoot: string, path: string): Promise<Step> => {
	const source = join(filesRoot, storedPath(path));
	const [content, { mode }] = await Promise.all([
		Bun.file(source).text(),
		stat(source),
	]);
	return { kind: "write", path, content, executable: (mode & 0o111) !== 0 };
};

const copies = async (
	filesRoot: string,
	target: string,
	paths: readonly string[],
	overwrite: boolean,
): Promise<Step[]> => {
	const present = new Set(overwrite ? [] : await existing(target, paths));
	return Promise.all(
		paths
			.filter((path) => !present.has(path))
			.map((path) => copyFile(filesRoot, path)),
	);
};

const planFormatter = async (
	filesRoot: string,
	target: string,
	restyle: boolean,
	formatterConfigs: readonly string[],
): Promise<{ steps: Step[]; notes: string[] }> => {
	const bunfig = await Bun.file(
		join(filesRoot, storedPath("bunfig.toml")),
	).text();
	const keep = formatterConfigs.length > 0 && !restyle;
	// A kept Prettier style still needs the ignores, so Markdown stays with markdownlint.
	const ignores = /^ignorePatterns = \[[^\]]*\]\n/mu.exec(bunfig)?.[0] ?? "";
	const steps: Step[] = [
		{
			kind: "write",
			path: "bunfig.toml",
			content: keep
				? `${bunfig.slice(0, bunfig.indexOf("\n[fmt]") + 1)}\n[fmt]\n${ignores}`
				: bunfig,
		},
		...(restyle
			? formatterConfigs.map((path): Step => ({ kind: "remove", path }))
			: []),
		...(await copies(filesRoot, target, [".editorconfig"], restyle)),
	];
	const notes = keep
		? [
				`Kept ${formatterConfigs.join(", ")}: \`bun fmt\` reads it and prints the same code. Run again with --restyle to use the template style.`,
			]
		: [];
	return { steps, notes };
};

const planManifest = async (
	packageRoot: string,
	target: string,
	{ restyle, packageSpec }: AdoptOptions,
): Promise<{ manifest: Json; notes: string[] }> => {
	const manifest = (await readJsonc(join(target, "package.json"))) ?? {
		name: basename(target),
		version: "0.0.0",
		private: true,
		type: "module",
	};
	const pnpmFile = Bun.file(join(target, "pnpm-workspace.yaml"));
	const pnpm = (await pnpmFile.exists())
		? asRecord(Bun.YAML.parse(await pnpmFile.text()))
		: undefined;
	return migrateManifest(
		restyle ? withoutKey(manifest, "prettier") : manifest,
		await templateManifest(packageRoot, manifest, packageSpec),
		pnpm,
	);
};

const planTsconfig = async (
	packageRoot: string,
	target: string,
): Promise<{ tsconfig: Json; notes: string[] }> => {
	const tsconfig =
		(await readJsonc(join(target, "tsconfig.json"))) ??
		(await readJsonc(join(packageRoot, "files/tsconfig.json"))) ??
		{};
	const base = (await readJsonc(join(packageRoot, "tsconfig.base.json"))) ?? {};
	return migrateTsconfig(tsconfig, base);
};

/** Rewrites a JSON file only when its data changes, so its layout and comments stay. */
const jsonWrite = async (
	target: string,
	path: string,
	next: Json,
): Promise<Step[]> =>
	Bun.deepEquals(await readJsonc(join(target, path)), next)
		? []
		: [{ kind: "write", path, content: toJson(next) }];

const changes = async (target: string, step: Step): Promise<boolean> => {
	const file = Bun.file(join(target, step.path));
	return (
		step.kind === "remove" ||
		!(await file.exists()) ||
		(await file.text()) !== step.content
	);
};

export const planAdoption = async (
	packageRoot: string,
	target: string,
	options: AdoptOptions,
): Promise<Plan> => {
	if ((await realpath(packageRoot)) === (await realpath(target))) {
		throw new Error(
			"The target is bun-bedrock itself. Pass the path of the repo to adopt.",
		);
	}
	const filesRoot = join(packageRoot, "files");
	const migrated = await planManifest(packageRoot, target, options);
	const ts = await planTsconfig(packageRoot, target);
	const formatter = await planFormatter(
		filesRoot,
		target,
		options.restyle,
		await existing(target, FORMATTER_CONFIGS),
	);
	const replaced = await existing(target, REPLACED_CONFIGS);
	const steps: Step[] = [
		...(await jsonWrite(target, "package.json", migrated.manifest)),
		...(await jsonWrite(target, "tsconfig.json", ts.tsconfig)),
		...formatter.steps,
		...(await copies(filesRoot, target, TOOL_FILES, true)),
		...(await copies(filesRoot, target, STARTER_FILES, false)),
		...replaced.map((path): Step => ({ kind: "remove", path })),
	];
	const changed = await Promise.all(steps.map((step) => changes(target, step)));
	return {
		steps: steps.filter((_, index) => changed[index] === true),
		lockfiles: await existing(target, LOCKFILES),
		notes: [...migrated.notes, ...ts.notes, ...formatter.notes],
	};
};
