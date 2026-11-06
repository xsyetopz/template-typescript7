import { afterAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { planAdoption } from "./adopt.ts";
import { asRecord, exists } from "./json.ts";
import { applySteps } from "./steps.ts";

const roots: string[] = [];
const tempDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), "adopt-test-"));
	roots.push(dir);
	return dir;
};
const put = async (
	root: string,
	files: Record<string, string>,
): Promise<void> => {
	await Promise.all(
		Object.entries(files).map(async ([path, content]) => {
			await mkdir(dirname(join(root, path)), { recursive: true });
			await Bun.write(join(root, path), content);
		}),
	);
};
const json = (value: unknown): string => JSON.stringify(value);

const packageFiles: Record<string, string> = {
	"package.json": json({
		name: "bun-bedrock",
		version: "0.1.0",
		peerDependencies: { oxlint: "1.0.0" },
		engines: { bun: ">=1.4.4" },
	}),
	"tsconfig.base.json": json({
		compilerOptions: { strict: true, types: ["bun"] },
	}),
	"files/tsconfig.json": json({
		extends: "bun-bedrock/tsconfig.base.json",
		exclude: ["**/dist"],
	}),
	"files/.oxlintrc.json.template": json({
		extends: ["./node_modules/bun-bedrock/oxlintrc.json"],
	}),
	"files/bunfig.toml.template":
		'[test]\nx = 1\n\n[fmt]\nuseTabs = true\nignorePatterns = ["**/*.md"]\n',
	"files/.bun-version": "1.4.4\n",
	"files/.githooks/pre-commit": "hook",
};
for (const path of [
	".githooks/commit-msg",
	".markdownlint-cli2.jsonc.template",
	".editorconfig",
	".gitattributes",
	".gitignore.template",
	".github/dependabot.yml",
	".github/workflows/ci.yml",
	".vscode/extensions.json",
	".vscode/settings.json",
	"AGENTS.md",
]) {
	packageFiles[`files/${path}`] = path;
}

const packageRoot = await tempDir();
await put(packageRoot, packageFiles);
await chmod(join(packageRoot, "files/.githooks/pre-commit"), 0o755);
const readJson = async (path: string): Promise<Record<string, unknown>> =>
	asRecord(await Bun.file(path).json());

afterAll(async () => {
	await Promise.all(
		roots.map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe("planAdoption and applySteps", () => {
	test("refuses to adopt the package itself", async () => {
		const [result] = await Promise.allSettled([
			planAdoption(packageRoot, packageRoot, { restyle: false }),
		]);
		expect(result).toEqual({
			status: "rejected",
			reason: new Error(
				"The target is bun-bedrock itself. Pass the path of the repo to adopt.",
			),
		});
	});

	test("the template repo is already adopted", async () => {
		const realPackage = join(import.meta.dir, "../..");
		const repoRoot = join(realPackage, "../..");
		const plan = await planAdoption(realPackage, repoRoot, {
			restyle: false,
		});
		expect(plan.steps).toEqual([]);
		// Starter files are only written when missing, so compare them directly.
		const files = join(realPackage, "files");
		for await (const path of new Bun.Glob("**").scan({
			cwd: files,
			dot: true,
		})) {
			const written = join(repoRoot, path.replace(/\.template$/u, ""));
			expect([path, await Bun.file(written).text()]).toEqual([
				path,
				await Bun.file(join(files, path)).text(),
			]);
		}
	});

	test("pins bun-bedrock in the catalog, or keeps a --package spec", async () => {
		const target = await tempDir();
		const plan = await planAdoption(packageRoot, target, { restyle: false });
		await applySteps(target, plan.steps);
		const pinned = await readJson(join(target, "package.json"));
		expect(asRecord(pinned["devDependencies"])["bun-bedrock"]).toBe("catalog:");
		expect(asRecord(asRecord(pinned["workspaces"])["catalog"])).toEqual({
			"bun-bedrock": "0.1.0",
			oxlint: "1.0.0",
		});

		const local = await tempDir();
		const localPlan = await planAdoption(packageRoot, local, {
			restyle: false,
			packageSpec: "file:../bun-bedrock",
		});
		await applySteps(local, localPlan.steps);
		const rerun = await planAdoption(packageRoot, local, { restyle: false });
		expect(rerun.steps).toEqual([]);
		const manifest = await readJson(join(local, "package.json"));
		expect(asRecord(manifest["devDependencies"])["bun-bedrock"]).toBe(
			"file:../bun-bedrock",
		);
		expect(manifest["packageManager"]).toBe("bun@1.4.4");
	});

	test("migrates a Prettier, ESLint, and pnpm repo, keeping backups", async () => {
		const target = await tempDir();
		await put(target, {
			"package.json": json({
				name: "app",
				prettier: { semi: false },
				devDependencies: { eslint: "9" },
			}),
			".prettierrc": "{}",
			"eslint.config.js": "",
			"pnpm-workspace.yaml": "packages:\n  - apps/*\n",
			"pnpm-lock.yaml": "",
			"tsconfig.json": json({ compilerOptions: { esModuleInterop: true } }),
			".gitattributes": "mine",
		});
		const plan = await planAdoption(packageRoot, target, {
			restyle: false,
		});
		expect(plan.lockfiles).toEqual(["pnpm-lock.yaml"]);
		expect(plan.notes.join("\n")).toContain("Kept .prettierrc");
		await applySteps(target, plan.steps);

		expect(await Bun.file(join(target, ".gitattributes")).text()).toBe("mine");
		expect(await exists(join(target, "eslint.config.js"))).toBe(false);
		expect(await exists(join(target, "eslint.config.js.bak"))).toBe(true);
		expect(await exists(join(target, "pnpm-workspace.yaml.bak"))).toBe(true);
		const bunfig = await Bun.file(join(target, "bunfig.toml")).text();
		expect(bunfig).not.toContain("useTabs");
		expect(bunfig).toContain('[fmt]\nignorePatterns = ["**/*.md"]\n');
		const manifest = asRecord(
			await Bun.file(join(target, "package.json")).json(),
		);
		expect(asRecord(manifest["workspaces"])["packages"]).toEqual(["apps/*"]);
		const tsconfig = asRecord(
			await Bun.file(join(target, "tsconfig.json")).json(),
		);
		expect(tsconfig["extends"]).toBe("bun-bedrock/tsconfig.base.json");
		const oxlint = await readJson(join(target, ".oxlintrc.json"));
		expect(oxlint["extends"]).toEqual([
			"./node_modules/bun-bedrock/oxlintrc.json",
		]);
		const hook = await stat(join(target, ".githooks/pre-commit"));
		expect(hook.mode & 0o111).not.toBe(0);

		await applySteps(target, plan.steps);
		expect(await Bun.file(join(target, "package.json.bak")).exists()).toBe(
			true,
		);
	});

	test("starts an empty directory from the template and --restyle swaps the formatter", async () => {
		const target = await tempDir();
		await put(target, {
			".prettierrc": "{}",
			"package.json": json({ prettier: {} }),
		});
		const plan = await planAdoption(packageRoot, target, {
			restyle: true,
		});
		await applySteps(target, plan.steps);
		expect(await exists(join(target, ".prettierrc"))).toBe(false);
		expect(await Bun.file(join(target, "bunfig.toml")).text()).toContain(
			"[fmt]",
		);
		expect(
			asRecord(await Bun.file(join(target, "package.json")).json())["prettier"],
		).toBeUndefined();

		const empty = await tempDir();
		const fresh = await planAdoption(packageRoot, empty, {
			restyle: false,
		});
		expect(fresh.steps.some((step) => step.kind === "remove")).toBe(false);
	});

	test("leaves a tsconfig alone when only its layout differs", async () => {
		const target = await tempDir();
		await put(target, {
			"tsconfig.json":
				'{\n\t"$schema": "https://json.schemastore.org/tsconfig.json",\n\t// mine\n\t"extends": "bun-bedrock/tsconfig.base.json", "compilerOptions": {}\n}\n',
		});
		const plan = await planAdoption(packageRoot, target, {
			restyle: false,
		});
		expect(plan.steps.map((step) => step.path)).not.toContain("tsconfig.json");
	});
});
