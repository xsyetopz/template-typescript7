import { describe, expect, test } from "bun:test";

import { greet } from "./index.ts";

describe("greet", () => {
	test("uses an exclamation mark by default", () => {
		expect(greet({ name: "Bun" })).toBe("Hello, Bun!");
	});

	test("uses the given punctuation", () => {
		expect(greet({ name: "Bun", punctuation: "." })).toBe("Hello, Bun.");
	});
});
