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

test("минимума удара нет: удар = (10 × T × R + СИЛ) × L × Угр с разбросом ±10%", () => {
  assert.equal(battle.NORMAL_MIN_ATK, undefined);
  for (let floor = 1; floor <= 12; floor++) {
    for (const threat of ["normal", "horror", "catastrophe"]) {
      for (const def of content.ENEMIES.filter((d) => d.minFloor <= floor)) {
        const s = battle.spawnEnemy(floor, false, rng, threat, def.id);
        const T = monsters.MONSTER_TYPE_META[s.mtype].hpMult;
        const [lo, hi] = monsters.RACE_ATK_RANGE[s.def.race];
        const str = monsterStats.monsterDamageBonus(s.stats.str);
        assert.ok(s.baseAtk >= 10 * T * lo + str - 1e-9 && s.baseAtk <= 10 * T * hi + str + 1e-9, `${def.id}: основа ${s.baseAtk}`);
        const center = s.baseAtk * scaling.enemyLevelMult(s.level) * content.THREAT_META[threat].atkMult;
        assert.equal(s.atk[0], Math.max(1, Math.round(center * 0.9)), `${def.id} этаж ${floor} ${threat}: нижняя ${s.atk[0]}`);
        assert.equal(s.atk[1], Math.max(1, Math.round(center * 1.1)), `${def.id} этаж ${floor} ${threat}: верхняя ${s.atk[1]}`);
      }
    }
  }
});

test("боссы: удар = (10 × T × R + СИЛ) × L × 1,75 с разбросом ±10%", () => {
  for (let floor = 1; floor <= 12; floor++) {
    const boss = battle.spawnEnemy(floor, true, rng);
    const center = boss.baseAtk * scaling.enemyLevelMult(boss.level) * content.BOSS_META.atkMult;
    assert.equal(boss.atk[0], Math.max(1, Math.round(center * 0.9)), `босс этаж ${floor}: нижняя`);
    assert.equal(boss.atk[1], Math.max(1, Math.round(center * 1.1)), `босс этаж ${floor}: верхняя`);
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
    const mult = scaling.enemyLevelMult(boss.level) * content.BOSS_META.hpMult;
    assert.equal(boss.hp, Math.max(1, Math.round(boss.baseHp * mult)), `босс этаж ${floor}: ОЗ`);
  }
});
