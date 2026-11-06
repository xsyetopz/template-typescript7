import { chmod, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { exists } from "./json.ts";

export type Step =
	| { readonly kind: "remove"; readonly path: string }
	| {
			readonly kind: "write";
			readonly path: string;
			readonly content: string;
			readonly executable?: boolean;
	  };

/** Writes or removes each step. A file it changes is kept as `<file>.bak`. */
const applyStep = async (target: string, step: Step): Promise<void> => {
	const path = join(target, step.path);
	const backup = `${path}.bak`;
	const present = await exists(path);
	if (step.kind === "write" && present) {
		const current = await Bun.file(path).text();
		if (current === step.content) {
			return;
		}
	}
	if (present) {
		await rm(backup, { recursive: true, force: true });
		await rename(path, backup);
	}
	if (step.kind === "write") {
		await mkdir(dirname(path), { recursive: true });
		await Bun.write(path, step.content);
		if (step.executable === true) {
			await chmod(path, 0o755);
		}
	}
};

/** Writes or removes each step. A file it changes is kept as `<file>.bak`. */
export const applySteps = async (
	target: string,
	steps: readonly Step[],
): Promise<void> => {
	await Promise.all(steps.map((step) => applyStep(target, step)));
};
