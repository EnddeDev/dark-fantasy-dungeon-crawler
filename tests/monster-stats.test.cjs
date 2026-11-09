const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

/** Характеристики монстров: раскладка СИЛ/ЛОВ/ИНТ и то, как она действует в бою. */
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-monster-stats-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const stats = load("monsterStats");
const battle = load("battle");
const monsters = load("monsters");
const statFormulas = load("statFormulas");

const KEYS = ["str", "agi", "int"];
const MAIN = { strong: "str", agile: "agi", smart: "int" };

function lcg(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function player(extra = {}) {
  return {
    name: "Герой", level: 3, xp: 0, statPoints: 0,
    stats: { str: 1, agi: 1, int: 4 }, hp: 100, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

/** Бой с квиетом: без эффектов и пассивок врага, фиксированный тип и род. */
function quietBattle(race, type, extraStats = {}) {
  const b = battle.newBattle(player(), 3, false, "classic");
  b.enemy.def = { ...b.enemy.def, id: "fixture", race, type };
  b.enemy.mtype = type;
  b.enemy.stats = { str: 0, agi: 0, int: 0, ...extraStats };
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.moves = ["attack"];
  b.enemy.hp = 500;
  b.enemy.maxHp = 500;
  b.enemy.armor = 0;
  /* Удар фиксирован: newBattle подбирает случайного монстра, а сравниваем только характеристику. */
  b.enemy.atk = [10, 10];
  b.p.hp = 500;
  b.p.maxHp = 500;
  return b;
}

test("сумма характеристик: 1 уровень — 2–3, дальше от (уровня+1) до (уровня+3)", () => {
  assert.deepEqual(stats.monsterStatTotalRange(1), [2, 3]);
  assert.deepEqual(stats.monsterStatTotalRange(2), [3, 5]);
  assert.deepEqual(stats.monsterStatTotalRange(5), [6, 8]);
  assert.deepEqual(stats.monsterStatTotalRange(12), [13, 15]);
});

test("каждая раскладка: главная строго больше двух других, те не ниже главной минус 2, сумма верная", () => {
  for (const [type, main] of Object.entries(MAIN)) {
    for (let total = 2; total <= 20; total++) {
      const layouts = stats.monsterStatLayouts(main, total);
      assert.ok(layouts.length > 0, `${type}, сумма ${total}: раскладок нет`);
      for (const s of layouts) {
        const others = KEYS.filter((k) => k !== main).map((k) => s[k]);
        assert.equal(s.str + s.agi + s.int, total);
        for (const v of [s.str, s.agi, s.int]) assert.ok(Number.isInteger(v) && v >= 0);
        for (const o of others) {
          assert.ok(s[main] > o, `${type}, сумма ${total}: главная ${s[main]} не больше ${o}`);
          assert.ok(s[main] - o <= 2, `${type}, сумма ${total}: разница ${s[main] - o} больше 2`);
        }
      }
    }
  }
});

test("жребий раскладки: главная характеристика по типу, сумма по уровню, раскладка всегда допустима", () => {
  for (const type of Object.keys(MAIN)) {
    for (let level = 1; level <= 15; level++) {
      const [lo, hi] = stats.monsterStatTotalRange(level);
      const rng = lcg(level * 7 + type.length);
      for (let i = 0; i < 300; i++) {
        const s = stats.rollMonsterStats(type, level, rng);
        const total = s.str + s.agi + s.int;
        assert.ok(total >= lo && total <= hi, `${type} ур. ${level}: сумма ${total} вне ${lo}–${hi}`);
        const main = MAIN[type];
        for (const k of KEYS) {
          if (k === main) continue;
          assert.ok(s[main] > s[k] && s[main] - s[k] <= 2, `${type} ур. ${level}: ${JSON.stringify(s)}`);
        }
      }
    }
  }
});

test("жребий перебирает все допустимые раскладки, а не одну", () => {
  /* Уровень 3: сумма 4–6. Ловкий главный: при 4 — (2,1,1); при 5 — (3,1,1); при 6 — (3,1,2) и (3,2,1). */
  const expected = new Set();
  for (let total = 4; total <= 6; total++) {
    for (const s of stats.monsterStatLayouts("agi", total)) expected.add(JSON.stringify(s));
  }
  assert.equal(expected.size, 4, "раскладок четыре");
  const seen = new Set();
  const rng = lcg(42);
  for (let i = 0; i < 4000; i++) seen.add(JSON.stringify(stats.rollMonsterStats("agile", 3, rng)));
  for (const key of expected) assert.ok(seen.has(key), `не выпала раскладка ${key}`);
});

test("обычные монстры и боссы получают характеристики; минимумы ОЗ и удара держатся", () => {
  const content = load("content");
  for (let floor = 1; floor <= 12; floor++) {
    for (const def of content.ENEMIES.filter((d) => d.minFloor <= floor)) {
      const s = battle.spawnEnemy(floor, false, lcg(floor * 31 + def.id.length), "normal", def.id);
      const total = s.stats.str + s.stats.agi + s.stats.int;
      const [lo, hi] = stats.monsterStatTotalRange(s.level);
      assert.ok(total >= lo && total <= hi, `${def.id} этаж ${floor}: сумма ${total}`);
      assert.ok(s.hp >= battle.NORMAL_MIN_HP, `${def.id}: минимум ОЗ ${s.hp}`);
      assert.ok(s.atk[0] >= 1, `${def.id}: удар ${s.atk[0]}`);
    }
    const boss = battle.spawnEnemy(floor, true, lcg(floor));
    const total = boss.stats.str + boss.stats.agi + boss.stats.int;
    const [lo, hi] = stats.monsterStatTotalRange(boss.level);
    assert.ok(total >= lo && total <= hi, `босс этаж ${floor}: сумма ${total}`);
    assert.equal(boss.level, floor, "уровень босса — этаж");
  }
});

test("угроза не меняет раскладку: у одного монстра одни характеристики на любой угрозе", () => {
  const content = load("content");
  for (let seed = 1; seed <= 40; seed++) {
    const def = content.ENEMIES[seed % content.ENEMIES.length];
    const floor = Math.max(def.minFloor, 2 + (seed % 6));
    const n = battle.spawnEnemy(floor, false, lcg(seed), "normal", def.id);
    const h = battle.spawnEnemy(floor, false, lcg(seed), "horror", def.id);
    const c = battle.spawnEnemy(floor, false, lcg(seed), "catastrophe", def.id);
    assert.deepEqual(h.stats, n.stats, `ужас, сид ${seed}`);
    assert.deepEqual(c.stats, n.stats, `катастрофа, сид ${seed}`);
  }
});

test("бонусы характеристик совпадают с формулами героя", () => {
  for (let x = 0; x <= 12; x++) {
    assert.equal(stats.monsterHealthBonus(x), statFormulas.STAT_FORMULAS.str.healthPerPoint * x);
    assert.equal(stats.monsterDamageBonus(x), statFormulas.STAT_FORMULAS.str.damagePerPoint * x);
    assert.equal(stats.monsterActionsBonus(x), statFormulas.statActions(x));
    assert.ok(Math.abs(stats.monsterEvasionBonus(x) - statFormulas.statEvasion(x)) < 1e-12);
    assert.ok(Math.abs(stats.monsterCritChance(x) - statFormulas.statCritChance(x)) < 1e-12);
    assert.ok(Math.abs(stats.monsterCritDamageBonus(x) - statFormulas.statCritDamage(x)) < 1e-12);
    assert.ok(Math.abs(stats.monsterTenacity(x) - statFormulas.statTenacity(x)) < 1e-12);
    assert.ok(Math.abs(stats.monsterMagicResist(x) - statFormulas.statMagicResist(x)) < 1e-12);
    assert.equal(stats.monsterTechniqueBonus(x), statFormulas.STAT_FORMULAS.int.techniquePerPoint * x);
  }
});

test("ЛОВ: уклонение врага растёт с очками поверх типа и рода", () => {
  const low = quietBattle("none", "agile", { agi: 0 });
  const high = quietBattle("none", "agile", { agi: 4 });
  const e0 = battle.enemyReadout(low).evade;
  const e4 = battle.enemyReadout(high).evade;
  assert.ok(e4 > e0, `уклонение ${e0} → ${e4}`);
  assert.ok(Math.abs(e4 - (1 - (1 - e0) * (1 - 0.2))) < 1e-9, `комбинация: ${e4}`);
});

test("СИЛ: сопротивление эффектам врага растёт с очками", () => {
  const low = quietBattle("none", "strong", { str: 0 });
  const high = quietBattle("none", "strong", { str: 6 });
  const r0 = battle.enemyReadout(low).resist;
  const r6 = battle.enemyReadout(high).resist;
  assert.ok(r6 > r0, `сопротивление ${r0} → ${r6}`);
  assert.ok(Math.abs(r6 - 0.3) < 1e-9, `6 очков СИЛ дают 30%: ${r6}`);
});

test("ИНТ: магическое сопротивление врага — 5% за очко", () => {
  const b = quietBattle("none", "smart", { int: 4 });
  assert.ok(Math.abs(battle.enemyReadout(b).magicResist - 0.2) < 1e-9);
  const none = quietBattle("none", "smart", { int: 0 });
  assert.equal(battle.enemyReadout(none).magicResist, 0);
});

test("ЛОВ: крит врага растёт, а множитель крита добавляет 10% за очко", () => {
  const plain = quietBattle("none", "agile", { agi: 0 });
  const quick = quietBattle("none", "agile", { agi: 5 });
  const a = battle.enemyMoveBreakdown(plain, "attack");
  const q = battle.enemyMoveBreakdown(quick, "attack");
  assert.ok(q.expected > a.expected, `ожидание ${a.expected} → ${q.expected}`);
  const critLine = q.lines.find((l) => l.label === "Критический удар (среднее)");
  assert.ok(critLine, "у врага с ЛОВ есть строка крита в расчёте");
  assert.match(critLine.note, /7%/, "2% + 5% = 7%");
  assert.match(critLine.note, /×2\.50/, "базовый ×2 + 0.5 от ЛОВ");
});

test("ИНТ: прибавка к урону приёмов за очко, обычный удар её не получает", () => {
  const b = quietBattle("none", "smart", { int: 5 });
  b.enemy.moves = ["wound"];
  const wound = battle.enemyMoveBreakdown(b, "wound");
  const tech = wound.lines.find((l) => l.label === "Ум врага");
  assert.ok(tech, "приём получает прибавку ИНТ");
  assert.match(tech.note, /\+10/, "5 очков ИНТ = +10");
  const attack = battle.enemyMoveBreakdown(b, "attack");
  assert.equal(attack.lines.some((l) => l.label === "Ум врага"), false, "обычный удар без прибавки");
});

test("сводка врага показывает СИЛ/ЛОВ/ИНТ", () => {
  const b = quietBattle("none", "smart", { str: 1, agi: 2, int: 4 });
  const readout = battle.enemyReadout(b);
  assert.deepEqual(readout.stats, { str: 1, agi: 2, int: 4 });
});

test("старый бой без характеристик считается нулевым и не падает", () => {
  const b = quietBattle("none", "strong");
  delete b.enemy.stats;
  const readout = battle.enemyReadout(b);
  assert.deepEqual(readout.stats, { str: 0, agi: 0, int: 0 });
  assert.ok(Number.isFinite(battle.enemyMoveBreakdown(b, "attack").expected));
});


test("ходы монстра: 1 всегда, +1 у ловкого типа, плюс ЛОВ; видовые поправки не действуют", () => {
  const content = load("content");
  let checked = 0;
  for (let floor = 1; floor <= 10; floor++) {
    for (let i = 0; i < 300; i++) {
      const s = battle.spawnEnemy(floor, false, lcg(floor * 1000 + i));
      if (s.effects.includes("ap") || s.passive?.id === "frenzy") continue;
      const typeBonus = s.mtype === "agile" ? 1 : 0;
      assert.equal(s.ap, 1 + typeBonus + s.stats.agi, `${s.def.id} ${s.mtype} ур. ${s.level}: ходов ${s.ap}, статы ${JSON.stringify(s.stats)}`);
      checked++;
    }
  }
  assert.ok(checked > 1000, `проверено ${checked}`);
  assert.ok(content.ENEMIES.length > 0);
});

test("здоровье: H = 35 × T × R + 10 × СИЛ, ОЗ = max(35, H × L × Ут) для обычных и H × L × 2,275 для боссов", () => {
  const monsters = load("monsters");
  const scaling = load("enemyScaling");
  const content = load("content");
  const RANGES = { undead: [0.75, 1.25], construct: [2, 3], vampire: [1, 1.25], ghost: [0.7, 1], beast: [1.25, 1.75], demon: [1.5, 1.75], dragon: [1.5, 2], none: [0.9, 1.1] };
  for (const [race, range] of Object.entries(RANGES)) {
    assert.deepEqual(monsters.RACE_HP_RANGE[race], range, `диапазон рода ${race}`);
  }
  assert.equal(monsters.BASE_HP, 35);
  let seen = 0;
  for (let i = 0; i < 1500; i++) {
    const floor = 1 + (i % 10);
    const s = battle.spawnEnemy(floor, false, lcg(i + 17));
    const [lo, hi] = RANGES[s.def.race];
    const T = monsters.MONSTER_TYPE_META[s.mtype].hpMult;
    const R = (s.baseHp - 10 * s.stats.str) / (35 * T);
    assert.ok(R >= lo - 1e-9 && R <= hi + 1e-9, `${s.def.id}: R ${R} вне ${lo}–${hi}`);
    const L = scaling.enemyLevelMult(s.level);
    const threatMult = { normal: 1.3, horror: 1.625, catastrophe: 1.95 }[s.threat];
    const expAt = Math.max(battle.NORMAL_MIN_HP, Math.round(s.baseHp * L * threatMult));
    assert.equal(s.hp, expAt, `${s.def.id} ${s.threat}: ОЗ ${s.hp}`);
    seen++;
  }
  assert.ok(seen > 1000);
  for (let floor = 1; floor <= 10; floor++) {
    const b = battle.spawnEnemy(floor, true, lcg(floor * 3));
    const L = scaling.enemyLevelMult(b.level);
    assert.equal(b.hp, Math.max(1, Math.round(b.baseHp * L * content.BOSS_META.hpMult)), `босс этаж ${floor}`);
  }
});
