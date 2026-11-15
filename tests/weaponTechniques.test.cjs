const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-techs-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
const out = path.join(temp, "wt.cjs");
buildSync({ entryPoints: ["src/game/weaponTechniques.ts"], outfile: out, bundle: true, platform: "node", format: "cjs", external: ["react"] });
const wt = require(out);

const ALL = wt.NEW_WEAPON_TECHNIQUES;
const TYPES = Object.keys(wt.TECHNIQUES_BY_WEAPON_TYPE);

test("34 обычных приёма, 11 типов оружия", () => {
  assert.equal(ALL.length, 34);
  assert.equal(TYPES.length, 11);
});

test("каждый приём назначен ровно одному типу, ID уникальны", () => {
  const ids = Object.values(wt.TECHNIQUES_BY_WEAPON_TYPE).flat();
  assert.equal(ids.length, 34);
  assert.equal(new Set(ids).size, 34);
  assert.deepEqual(new Set(ids), new Set(ALL.map((t) => t.id)));
});

test("по спецификации: 3 приёма на тип, меч — 4", () => {
  for (const t of TYPES) {
    const want = t === "sword" ? 4 : 3;
    assert.equal(wt.TECHNIQUES_BY_WEAPON_TYPE[t].length, want, t);
  }
});

test("перезарядка 3 раунда у всех приёмов, названия уникальны", () => {
  for (const t of ALL) assert.equal(t.cooldown, 3, t.id);
  assert.equal(new Set(ALL.map((t) => t.name)).size, 34);
});

test("характеристика приёма совпадает с типом оружия", () => {
  const stat = { dagger: "agi", rapier: "agi", spear: "agi", wand: "int", staff: "int" };
  const byId = Object.fromEntries(ALL.map((t) => [t.id, t]));
  for (const type of TYPES) {
    for (const id of wt.TECHNIQUES_BY_WEAPON_TYPE[type]) {
      const want = stat[type] ?? "str";
      assert.equal(byId[id].scaleStat, want, `${id} (${type})`);
    }
  }
});
