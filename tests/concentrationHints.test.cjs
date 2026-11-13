const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-conc-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

const outfile = path.join(temp, "battle.cjs");
buildSync({ entryPoints: ["src/game/battle.ts"], outfile, bundle: true, platform: "node", format: "cjs" });
const battle = require(outfile);

test("подсказка концентрации: атаки, приёмы, предметы, защита, спец-приём", () => {
  assert.equal(battle.concentrationDelta("attack", "risky"), -1);
  assert.equal(battle.concentrationDelta("attack", "normal"), 0);
  assert.equal(battle.concentrationDelta("attack", "safe"), 1);
  assert.equal(battle.concentrationDelta("weapon_skill"), -1);
  assert.equal(battle.concentrationDelta("epic_skill"), -1);
  assert.equal(battle.concentrationDelta("armor_skill"), -1);
  assert.equal(battle.concentrationDelta("item"), 1);
  assert.equal(battle.concentrationDelta("guard"), 2);
  assert.equal(battle.concentrationDelta("archetype_skill"), -battle.SPECIAL_CONCENTRATION);
  assert.equal(battle.concentrationDelta("end_turn"), 0);
});
