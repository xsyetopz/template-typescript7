// Claude Code writes its plugin API types only beside a loaded plugin, so this module declares the part it uses, and `claude plugin validate` checks the calls against the real API.
export interface ProcessResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface Engine {
	readonly plugin: { readonly name: string };
	readonly command: {
		readonly register: (command: {
			readonly name: string;
			readonly description: string;
		}) => Promise<unknown>;
	};
	readonly process: {
		readonly run: (
			argv: readonly string[],
			init: { readonly timeoutMs: number },
		) => Promise<ProcessResult>;
	};
}

export type Next<E> = (e: E) => Promise<unknown>;
export type Hook<E> = ($: Engine, e: E, next: Next<E>) => unknown;
export interface BashCall {
	readonly command: string;
}

export interface On {
	(event: "session.start", hook: Hook<unknown>): unknown;
	(
		event: "command.run",
		matcher: { readonly command: "adopt" },
		hook: Hook<{ readonly args: string }>,
	): unknown;
	(
		event: "tool.call",
		matcher: { readonly tool: "Bash" },
		hook: Hook<BashCall>,
	): unknown;
}

// A package manager in command position: at a line start or after ; & | ( $( or `, past env assignments and sudo, exec, or command.
const FOREIGN =
	/(?:^|[;&|(`]|\$\()\s*(?:\w+=\S*\s+)*(?:(?:sudo|exec|command)\s+)?(npm|npx|pnpm|pnpx|yarn)(?=\s|$)/mu;

const USAGE =
	"Usage: /adopt <target> [--restyle] [--package <spec>] [--yes]. Without --yes, it prints the plan and changes nothing.";

export const foreignPackageManager = (command: string): string | undefined =>
	FOREIGN.exec(command)?.[1];

export const runAdopt = async (
	$: Engine,
	input: string,
): Promise<{ text: string; context: string[] }> => {
	const args = input.split(/\s+/u).filter((arg) => arg !== "");
	if (args.length === 0) {
		return { text: USAGE, context: [] };
	}
	const apply = args.includes("--yes");
	// `bun run` finds only an installed bin; bunx would fetch the unpublished name from the registry.
	const { exitCode, stdout, stderr } = await $.process.run(
		[
			"bun",
			"run",
			"bun-bedrock",
			"adopt",
			...args,
			...(apply ? [] : ["--dry-run"]),
		],
		{ timeoutMs: 600_000 },
	);
	const output = `${stdout}${stderr}`.trim();
	const text =
		exitCode === 0 && !apply
			? `${output}\n\nTo apply this plan, run /adopt ${args.join(" ")} --yes`
			: output;
	return { text, context: [`/adopt ${input} exited ${exitCode}:\n${text}`] };
};

export const announce: Hook<unknown> = async ($, e, next) => {
	await $.command.register({
		name: "adopt",
		description:
			"Set a repo up with bun-bedrock. Prints the plan; --yes applies it.",
	});
	return next(e);
};

export const answerAdopt: Hook<{ readonly args: string }> = ($, e) =>
	runAdopt($, e.args);

export const blockForeign: Hook<BashCall> = ($, e, next) => {
	const manager = foreignPackageManager(e.command);
	return manager === undefined
		? next(e)
		: {
				deny: `${$.plugin.name}: this repo uses Bun. Run bun in place of ${manager}, or bunx for a one-off package.`,
			};
};

export const register = (on: On): void => {
	on("session.start", announce);
	on("command.run", { command: "adopt" }, answerAdopt);
	on("tool.call", { tool: "Bash" }, blockForeign);
};
