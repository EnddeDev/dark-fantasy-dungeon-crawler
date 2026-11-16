const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-events-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
const outfile = path.join(temp, "mapEvents.cjs");
buildSync({ entryPoints: ["src/game/mapEvents.ts"], outfile, bundle: true, platform: "node", format: "cjs" });
const events = require(outfile);

test("события на карте не повышают характеристики: награда только опытом и золотом", () => {
  const list = Object.values(events).find((v) => Array.isArray(v) && v.length > 0 && v[0].choices) ?? [];
  assert.ok(list.length > 0, "список событий не найден");
  for (const ev of list) {
    for (const choice of ev.choices) {
      for (const e of [...(choice.good ?? []), ...(choice.bad ?? [])]) {
        assert.notEqual(e.k, "stat", `${ev.id}/${choice.id} даёт характеристику`);
      }
    }
  }
});
