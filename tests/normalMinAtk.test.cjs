const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-minatk-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("battle");
const content = load("content");
const monsters = load("monsters");
const scaling = load("enemyScaling");
const monsterStats = load("monsterStats");

const rng = () => 0.5; // уровень = этаж

test("обычные монстры бьют минимум на 10 на любом этаже и угрозе", () => {
  assert.equal(battle.NORMAL_MIN_ATK, 10);
  for (let floor = 1; floor <= 12; floor++) {
    for (const threat of ["normal", "horror", "catastrophe"]) {
      for (const def of content.ENEMIES.filter((d) => d.minFloor <= floor)) {
        const s = battle.spawnEnemy(floor, false, rng, threat, def.id);
        assert.ok(s.atk[0] >= 10, `${def.id} этаж ${floor} ${threat}: минимум ${s.atk[0]}`);
        assert.ok(s.atk[1] >= s.atk[0], `${def.id} этаж ${floor}: максимум ${s.atk[1]} ниже минимума`);
      }
    }
  }
});

test("боссы не затронуты: удар считается по прежней формуле без минимума 10 (плюс СИЛ)", () => {
  for (let floor = 1; floor <= 12; floor++) {
    const boss = battle.spawnEnemy(floor, true, rng);
    const typeMeta = monsters.MONSTER_TYPE_META[boss.mtype];
    const mult = scaling.enemyLevelMult(boss.level) * content.BOSS_META.atkMult * typeMeta.atkMult;
    const bonus = monsterStats.monsterDamageBonus(boss.stats.str);
    assert.equal(boss.atk[0], Math.max(1, Math.round(boss.def.atk[0] * mult)) + bonus, `босс этаж ${floor}: минимум`);
    assert.equal(boss.atk[1], Math.max(2, Math.round(boss.def.atk[1] * mult)) + bonus, `босс этаж ${floor}: максимум`);
  }
});

test("обычные монстры имеют минимум 35 ОЗ на любом этаже и угрозе", () => {
  assert.equal(battle.NORMAL_MIN_HP, 35);
  for (let floor = 1; floor <= 12; floor++) {
    for (const threat of ["normal", "horror", "catastrophe"]) {
      for (const def of content.ENEMIES.filter((d) => d.minFloor <= floor)) {
        const s = battle.spawnEnemy(floor, false, rng, threat, def.id);
        assert.ok(s.hp >= 35, `${def.id} этаж ${floor} ${threat}: ОЗ ${s.hp}`);
      }
    }
  }
});

test("боссы по ОЗ считаются по прежней формуле без минимума 35", () => {
  for (let floor = 1; floor <= 12; floor++) {
    const boss = battle.spawnEnemy(floor, true, rng);
    const typeMeta = monsters.MONSTER_TYPE_META[boss.mtype];
    const mult = scaling.enemyLevelMult(boss.level) * content.BOSS_META.hpMult * typeMeta.hpMult;
    assert.equal(boss.hp, Math.max(1, Math.round(boss.def.hp * mult)) + monsterStats.monsterHealthBonus(boss.stats.str), `босс этаж ${floor}: ОЗ`);
  }
});
