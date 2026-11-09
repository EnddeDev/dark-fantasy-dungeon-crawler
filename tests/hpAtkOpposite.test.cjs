const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-hp-atk-opposite-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");
const monsters = load("src/game/monsters.ts", "monsters");

function lcg(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test("правило: при высоком здоровье удар из нижней половины диапазона рода, при низком — из верхней", () => {
  const rng = lcg(5);
  for (const race of Object.keys(monsters.RACE_ATK_RANGE)) {
    const [lo, hi] = monsters.RACE_ATK_RANGE[race];
    const mid = (lo + hi) / 2;
    for (let i = 0; i < 300; i++) {
      const high = monsters.rollRaceAtkMultOpposite(race, true, rng);
      const low = monsters.rollRaceAtkMultOpposite(race, false, rng);
      assert.ok(high >= lo && high <= mid + 1e-12, `${race}: высокое здоровье дало удар ${high}`);
      assert.ok(low >= mid - 1e-12 && low <= hi, `${race}: низкое здоровье дало удар ${low}`);
    }
  }
});

test("обычные монстры: здоровье выше медианы рода → удар ниже медианы, и наоборот", () => {
  const rng = lcg(42);
  let checked = 0;
  for (let i = 0; i < 6000; i++) {
    const floor = 1 + (i % 12);
    const s = battle.spawnEnemy(floor, false, rng);
    const race = s.def.race;
    const T = monsters.MONSTER_TYPE_META[s.mtype].hpMult;
    const str = s.stats.str;
    /* Из итоговых значений восстанавливаем R: ОЗ = 35·T·R + 10·СИЛ, удар = 10·T·R + 1·СИЛ. */
    const rHp = (s.baseHp - 10 * str) / (35 * T);
    const rAtk = (s.baseAtk - 1 * str) / (10 * T);
    const [hpLo, hpHi] = monsters.RACE_HP_RANGE[race];
    const [atkLo, atkHi] = monsters.RACE_ATK_RANGE[race];
    const hpHigh = rHp > (hpLo + hpHi) / 2;
    const atkMid = (atkLo + atkHi) / 2;
    if (hpHigh) assert.ok(rAtk <= atkMid + 1e-9, `${s.def.id}: ОЗ выше медианы, удар ${rAtk} выше медианы ${atkMid}`);
    else assert.ok(rAtk >= atkMid - 1e-9, `${s.def.id}: ОЗ ниже медианы, удар ${rAtk} ниже медианы ${atkMid}`);
    checked++;
  }
  assert.equal(checked, 6000);
});

test("боссы по-прежнему бросают удар независимо от здоровья", () => {
  const rng = lcg(7);
  const r = [];
  for (let i = 0; i < 40; i++) {
    const b = battle.spawnEnemy(3, true, rng);
    r.push(b.baseAtk);
  }
  assert.ok(new Set(r).size > 1, "у боссов разный удар");
});
