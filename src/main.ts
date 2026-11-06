import { greet } from "./index.ts";

console.info(greet({ name: Bun.argv[2] ?? "Bun" }));
