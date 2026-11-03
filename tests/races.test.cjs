const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-race-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("battle");
const monsters = load("monsters");
const content = load("content");
const scaling = load("enemyScaling");

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

/** Нейтральный бой: как в остальных тестах, но тип врага совпадает с mtype. */
function fight(race, mtype = "strong", extra = {}) {
  const b = battle.newBattle(player(extra), 3, false, "classic");
  b.enemy.def = { ...b.enemy.def, race, type: mtype };
  b.enemy.mtype = mtype;
  b.enemy.hp = 500; b.enemy.maxHp = 500; b.enemy.armor = 0;
  b.enemy.moves = ["attack"]; b.enemy.passive = null; b.enemy.effects = []; b.enemy.effectPower = {};
  b.enemy.statuses.chill = 0; b.enemy.statuses.curse = 0;
  b.p.hp = 500; b.p.maxHp = 500; b.p.armor = 0; b.p.evade = 0;
  b.queue = ["p", "e"]; b.idx = 0;
  return b;
}

function withRandom(value, fn) {
  const old = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = old; }
}

/* ───────── Конструкт: броня ×2 ───────── */

test("конструкт: броня считается с множителем ×2 поверх уровня, угрозы и типа", () => {
  assert.equal(monsters.raceArmorMult("construct"), 2);
  assert.equal(monsters.raceArmorMult("undead"), 1);
  let seen = 0;
  let seed = 7;
  const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 4000; i++) {
    const floor = 1 + (i % 10);
    const s = battle.spawnEnemy(floor, false, rng);
    if (s.def.race !== "construct") continue;
    seen++;
    const expected = Math.max(
      0,
      Math.round(s.def.armor * scaling.enemyLevelMult(s.level) * content.THREAT_META[s.threat].armorMult * 2) +
        monsters.MONSTER_TYPE_META[s.mtype].armorDelta,
    );
    assert.equal(s.armor, expected, `${s.def.name}: броня ${s.armor}, ожидалось ${expected}`);
  }
  assert.ok(seen > 0, "конструкты выпадают в выборке");
});

/* ───────── Нежить: −1 ход и воскрешение ───────── */

test("нежить: −1 ход поверх типа, ход не ниже 1", () => {
  assert.equal(monsters.raceApDelta("undead"), -1);
  let seed = 3;
  const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let seen = 0;
  for (let i = 0; i < 4000; i++) {
    const s = battle.spawnEnemy(1 + (i % 10), false, rng);
    if (s.def.race !== "undead" || s.effects.includes("ap")) continue;
    seen++;
    const frenzy = s.passive?.id === "frenzy" ? 1 : 0;
    const expected = Math.max(1, Math.min(10, s.def.ap + monsters.MONSTER_TYPE_META[s.mtype].apDelta - 1 + frenzy));
    assert.equal(s.ap, expected, `${s.def.name}: ходов ${s.ap}, ожидалось ${expected}`);
  }
  assert.ok(seen > 0, "нежить попадается");
});

test("нежить: падая до 0 ОЗ, воскресает полностью — один раз за бой", () => {
  const b = fight("undead", "strong");
  b.enemy.hp = 0;
  const after = battle.playerAct(b, { type: "guard" });
  assert.equal(after.over, null, "бой не окончен — нежить поднялась");
  assert.equal(after.enemy.hp, after.enemy.maxHp, "здоровье восстановлено полностью");
  assert.equal(after.enemy.revived, true);
  assert.ok(after.log.some((l) => l.text.includes("поднимается из праха")), "в журнале есть воскрешение");

  after.enemy.hp = 0;
  after.queue = ["p", "e"]; after.idx = 0;
  const finished = battle.playerAct(after, { type: "guard" });
  assert.equal(finished.over, "win", "второй раз нежить уже не поднимается");
});

test("после воскрешения нежить теряет половину урона и брони", () => {
  assert.equal(battle.enemyArmorNow({ armor: 5, revived: true }), 3);
  assert.equal(battle.enemyArmorNow({ armor: 5 }), 5);

  const b = fight("undead", "strong");
  b.enemy.armor = 4;
  const before = battle.damageAfterEnemyDefense(b, 20, "phys");
  b.enemy.revived = true;
  const after = battle.damageAfterEnemyDefense(b, 20, "phys");
  assert.equal(before, 16, "до воскрешения броня режет 4");
  assert.equal(after, 18, "после воскрешения броня 2");

  /* Один и тот же враг до и после воскрешения: иначе сравниваем разных случайных тварей. */
  const rev = fight("undead", "strong");
  const normal = battle.enemyExpectedMoveDamage(rev, "attack");
  rev.enemy.revived = true;
  const halved = battle.enemyExpectedMoveDamage(rev, "attack");
  assert.ok(halved < normal && Math.abs(halved - normal / 2) <= 1.5, `урон вполсилы: ${halved} против ${normal}`);
});

/* ───────── Вампир: слабость ───────── */

test("вампир: каждое попадание накладывает слабость, она копится весь бой", () => {
  const b = fight("vampire", "smart");
  b.enemy.moves = ["attack"];
  b.enemy.def = { ...b.enemy.def, type: "smart" };
  const once = withRandom(0.5, () => battle.enemyStep({ ...b, queue: ["e", "p"], idx: 0 }));
  assert.equal(once.p.statuses.weakness, 1);
  const twice = withRandom(0.5, () => battle.enemyStep({ ...once, queue: ["e", "p"], idx: 0 }));
  assert.equal(twice.p.statuses.weakness, 2);
  assert.ok(twice.log.some((l) => l.text.includes("слабость ×2")), "в журнале видно наложение");
});

test("слабость режет урон герою от обычных атак, но не приёмы", () => {
  const clean = fight("none", "strong");
  const weakened = fight("none", "strong");
  weakened.p.statuses.weakness = 3;
  const r0 = battle.combatReadout(clean);
  const r3 = battle.combatReadout(weakened);
  assert.ok(r3.dmgMin < r0.dmgMin, "атака слабее");
  assert.ok(Math.abs(r3.dmgMin - r0.dmgMin * (1 - 0.21)) <= 1, `ожидалось около −21%: ${r3.dmgMin} из ${r0.dmgMin}`);
  assert.ok(r3.dmgMods.some((m) => m.id === "weakness"), "слабость показана модификатором");
  assert.equal(r3.techMin, r0.techMin, "приёмы не затронуты");
});

test("вампир: слабость снижает урон, но не ниже нуля", () => {
  assert.equal(battle.weaknessMult(0), 1);
  assert.ok(Math.abs(battle.weaknessMult(5) - 0.65) < 1e-9);
  assert.equal(battle.weaknessMult(20), 0);
});

/* ───────── Без рода: эффект зависит от типа ───────── */

test("без рода, сильный: регенерация в конце своего хода", () => {
  const b = fight("none", "strong");
  b.enemy.level = 4;
  b.enemy.hp = 300;
  b.enemy.moves = ["guard"];
  b.queue = ["e", "p"]; b.idx = 0;
  const after = withRandom(0.5, () => battle.enemyStep(b));
  assert.equal(after.enemy.hp, 300 + 10, "уровень 4: 4 + 4 × 1.5 = 10 ОЗ за ход");
  assert.equal(monsters.noneStrongRegen(1), 3, "уровень 1: 1 + 1.5 → 3");
  assert.equal(monsters.noneStrongRegen(6), 15, "уровень 6: 6 + 9 = 15");
  assert.ok(after.log.some((l) => l.text.includes("регенерирует")), "в журнале регенерация");
});

test("без рода, ловкий: 20% шанс уйти от удара и контратаковать без урона", () => {
  const b = fight("none", "agile");
  const hitOnce = withRandom(0.99, () => battle.playerAct(b, { type: "attack" }));
  assert.ok(hitOnce.enemy.hp < b.enemy.hp, "без срабатывания удар проходит");

  const countered = withRandom(0, () => battle.playerAct(b, { type: "attack" }));
  assert.equal(countered.enemy.hp, b.enemy.hp, "при срабатывании ловкий не получает урона");
  assert.ok(countered.log.some((l) => l.text.includes("сам контратакует")), "в журнале контратака");
});

test("без рода, умный: один лишний приём сверх набора", () => {
  let seed = 11;
  const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let seen = 0;
  for (let i = 0; i < 4000; i++) {
    const s = battle.spawnEnemy(1 + (i % 10), false, rng);
    if (s.def.race !== "none" || s.mtype !== "smart") continue;
    seen++;
    const own = new Set([...s.def.moves]);
    const extra = s.moves.filter((m) => !own.has(m) && !["seal_items", "seal_skills", "seal_attack"].includes(m));
    assert.ok(extra.length >= 1, `${s.def.name}: лишний приём есть`);
  }
  assert.ok(seen > 0, "умные «без рода» попадаются");
});

test("свойства рода показываются в бестиарии с учётом типа", () => {
  assert.ok(monsters.raceTraits("construct").includes("броня ×2"));
  assert.ok(monsters.raceTraits("undead").some((t) => t.includes("воскресает")));
  assert.ok(monsters.raceTraits("undead").some((t) => t.includes("ходов −1")));
  assert.ok(monsters.raceTraits("vampire").some((t) => t.includes("слабость")));
  assert.ok(monsters.raceTraits("none", "agile").some((t) => t.includes("контратак")));
  assert.ok(monsters.raceTraits("none", "strong").some((t) => t.includes("регенерация")));
  assert.ok(monsters.raceTraits("none", "smart").some((t) => t.includes("приём")));
  assert.ok(!monsters.raceTraits("none").some((t) => t.includes("регенерация")), "без типа тип не подставляется");
});

test("защита врага в стойке режет урон ровно вдвое у всех родов, конструкт без добавки", () => {
  for (const race of ["none", "construct", "undead", "dragon"]) {
    const b = battle.newBattle(player(), 3, false, "classic");
    b.enemy.def = { ...b.enemy.def, race };
    b.enemy.guard = false;
    const open = battle.damageAfterEnemyDefense(b, 40, "phys");
    b.enemy.guard = true;
    const guarded = battle.damageAfterEnemyDefense(b, 40, "phys");
    assert.equal(guarded, Math.floor(open / 2), `${race}: в стойке ${guarded}, без неё ${open}`);
  }
});
