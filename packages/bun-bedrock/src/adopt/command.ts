import { extname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { $ } from "bun";

import { type Plan, planAdoption } from "./adopt.ts";
import { applySteps, type Step } from "./steps.ts";

const USAGE = `Usage: bun-bedrock adopt <target> [options]

Sets up a new, existing, or legacy repo with bun-bedrock: Bun only,
TypeScript 7, bun fmt, bun check, bun test, and oxlint, all at full strictness.

Options:
  --package <spec>  Install bun-bedrock from <spec>, such as file:/path/to/bun-bedrock.
  --restyle         Replace the repo's Prettier/oxfmt style with the bun-bedrock style.
  --dry-run         Print the plan. Change nothing.
  --yes             Apply without asking (agents, CI).
  --no-install      Skip bun install and the steps that need it.
  -h, --help        Show this help.`;

const describe = (step: Step): string =>
	step.kind === "write"
		? `write   ${step.path}`
		: `remove  ${step.path} (kept as ${step.path}.bak)`;

const confirm = async (yes: boolean): Promise<boolean> => {
	if (yes) {
		return true;
	}
	if (!process.stdin.isTTY) {
		console.error(
			"No terminal to confirm. Pass --yes to apply, or --dry-run to preview.",
		);
		return false;
	}
	process.stdout.write("Apply these changes? [y/N] ");
	for await (const line of console) {
		return line.trim().toLowerCase() === "y";
	}
	return false;
};

/** `bun fmt --doctor` knows which formatter packages no file needs anymore. */
const removeUnusedFormatters = async (target: string): Promise<void> => {
	const doctor = await $`bun fmt --doctor`.cwd(target).nothrow().quiet();
	const line = /^You can remove:\s*(.+)$/mu.exec(doctor.stdout.toString())?.[1];
	const packages = line?.split(",").map((name) => name.trim()) ?? [];
	if (packages.length > 0) {
		await $`bun remove ${packages}`.cwd(target);
	}
};

const printPlan = (plan: Plan, target: string): void => {
	console.info(`Plan for ${target}:`);
	for (const step of plan.steps) {
		console.info(`  ${describe(step)}`);
	}
	for (const lockfile of plan.lockfiles) {
		console.info(`  migrate ${lockfile} into bun.lock, then remove it`);
	}
	for (const note of plan.notes) {
		console.info(`  note    ${note}`);
	}
};

const install = async (target: string, plan: Plan): Promise<void> => {
	await $`bun install`.cwd(target);
	await applySteps(
		target,
		plan.lockfiles.map((path): Step => ({ kind: "remove", path })),
	);
	await removeUnusedFormatters(target);
	// Copied files must follow the project's kept Prettier style too. `bun fmt`
	// has no parser for extensionless files such as hooks and `.bun-version`.
	const formattable = plan.steps.flatMap((step) =>
		step.kind === "write" && extname(step.path) !== "" ? [step.path] : [],
	);
	await $`bun fmt ${formattable}`.cwd(target).nothrow().quiet();
};

export const adopt = async (args: string[]): Promise<number> => {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: {
			"dry-run": { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
			"no-install": { type: "boolean", default: false },
			package: { type: "string" },
			restyle: { type: "boolean", default: false },
			yes: { type: "boolean", default: false },
		},
	});
	const [targetArg] = positionals;
	if (values.help || targetArg === undefined) {
		console.info(USAGE);
		return values.help ? 0 : 2;
	}
	const target = resolve(targetArg);
	const plan = await planAdoption(resolve(import.meta.dir, "../.."), target, {
		restyle: values.restyle,
		packageSpec: values.package,
	});

	printPlan(plan, target);
	if (values["dry-run"]) {
		return 0;
	}
	if (!(await confirm(values.yes))) {
		return 1;
	}

	await applySteps(target, plan.steps);
	if (values["no-install"]) {
		console.info("Skipped bun install. Run it, then `bun run verify`.");
		return 0;
	}
	await install(target, plan);
	console.info(
		"Done. Run `bun run verify` and fix what it reports, in the order https://github.com/xsyetopz/template-typescript7/blob/main/docs/adopting.md gives. Then compare each *.bak file with its replacement and delete it.",
	);
	return 0;
};
