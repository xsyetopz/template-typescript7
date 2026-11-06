import { expect, test } from "bun:test";

import { $ } from "bun";

test("greets the first argument", async () => {
	expect(await $`bun ${import.meta.dir}/main.ts Ada`.text()).toBe(
		"Hello, Ada!\n",
	);
});
