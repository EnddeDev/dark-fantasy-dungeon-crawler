import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("server/.build", { recursive: true });
await build({
  entryPoints: ["server/index.ts"],
  outfile: "server/.build/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["node:sqlite", "node:http", "node:crypto", "node:fs", "node:path", "node:os", "node:url"],
  logLevel: "info",
});
