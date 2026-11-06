import { $ } from "bun";

/** Points git at `.githooks`. CI and tarball installs have no hooks to set. */
export const setHooksPath = async (): Promise<number> => {
	const insideRepo = await $`git rev-parse --is-inside-work-tree`
		.nothrow()
		.quiet();
	if (Bun.env["CI"] !== undefined || insideRepo.exitCode !== 0) {
		return 0;
	}
	const { exitCode } = await $`git config core.hooksPath .githooks`.nothrow();
	return exitCode;
};
