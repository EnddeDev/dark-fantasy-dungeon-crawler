const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-ritual-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function bundle(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const gearEffects = bundle("src/game/gearEffects.ts", "gearEffects");
const content = bundle("src/game/content.ts", "content");
const battle = bundle("src/game/battle.ts", "battle");
const quests = bundle("src/game/quests.ts", "quests");
const ritual = bundle("src/game/ritual.ts", "ritual");
const save = bundle("server/save.ts", "save");
const { PlayerFactory } = bundle("src/model/PlayerFactory.ts", "PlayerFactory");

const { GEAR_EFFECTS } = gearEffects;
const EMPTY_EQUIP = { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null };

/** Детерминированный генератор mulberry32. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Герой с доверием волшебника; по умолчанию 3 — ритуал открыт. */
function hero({ trust = 3, gold = 1000, ink = 20, armory = [], equip = {} } = {}) {
  const base = PlayerFactory.createInitial();
  const log = quests.emptyQuestLog();
  return {
    ...base,
    gold,
    bag: { ...base.bag, magic_ink: ink },
    armory,
    equip: { ...EMPTY_EQUIP, ...equip },
    questLog: { ...log, trust: { ...log.trust, wizard: trust } },
  };
}

/** Исследованный предмет с заданными свойствами. */
function itemWith(effects, { level = 3, baseId = "shroud", rarity = "rare" } = {}) {
  const item = content.createGearItem({ baseId, level, rarity, identified: true, wear: "new", rng: seeded(11) });
  item.effects = [...effects];
  item.effectRolls = Object.fromEntries(effects.map((id) => [id, GEAR_EFFECTS[id] ? 10 : 0]));
  return item;
}

test("ритуал открыт с доверием 3: при 2 ни одно действие не проводится", () => {
  const item = itemWith(["rage"]);
  assert.equal(ritual.ritualUnlocked(hero({ trust: 2, armory: [item] })), false);
  assert.equal(ritual.ritualUnlocked(hero({ trust: 3, armory: [item] })), true);
  assert.equal(ritual.ritualReplace(hero({ trust: 2, armory: [item] }), item.uid, "rage", "replace"), null);
  assert.equal(ritual.ritualStrip(hero({ trust: 2, armory: [item] }), item.uid, "rage"), null);
});

test("замена: 150 золота и 5 чернил, новое свойство той же характеристики", () => {
  const item = itemWith(["rage"]);
  const p = hero({ armory: [item] });
  const res = ritual.ritualReplace(p, item.uid, "rage", "replace", seeded(5));
  assert.ok(res, "замена проходит");
  assert.equal(res.player.gold, 1000 - 150);
  assert.equal(res.player.bag.magic_ink, 20 - 5);
  const next = res.player.armory.find((g) => g.uid === item.uid);
  assert.equal(next.effects.length, 1);
  const added = next.effects[0];
  assert.notEqual(added, "rage", "свойство заменено");
  assert.equal(GEAR_EFFECTS[added].stat, "str", "та же характеристика, что у ярости (СИЛ)");
  assert.ok(next.effectRolls[added] !== undefined, "у нового свойства есть бросок");
  assert.equal(next.effectRolls.rage, undefined, "у старого свойства броска больше нет");
});

test("замена не проходит без чернил, и ничего не списывается", () => {
  const item = itemWith(["rage"]);
  const p = hero({ armory: [item], ink: 4 });
  assert.equal(ritual.ritualReplace(p, item.uid, "rage", "replace", seeded(5)), null);
  assert.equal(p.gold, 1000);
  assert.equal(p.bag.magic_ink, 4);
});

test("хаос замены: 200 золота и 7 чернил; выпадают свойства разных характеристик", () => {
  const item = itemWith(["rage"]);
  const p = hero({ armory: [item] });
  const res = ritual.ritualReplace(p, item.uid, "rage", "chaos", seeded(9));
  assert.ok(res);
  assert.equal(res.player.gold, 1000 - 200);
  assert.equal(res.player.bag.magic_ink, 20 - 7);

  const stats = new Set();
  for (let s = 1; s <= 80; s++) {
    const r = ritual.ritualReplace(p, item.uid, "rage", "chaos", seeded(s));
    const added = r.player.armory.find((g) => g.uid === item.uid).effects[0];
    stats.add(GEAR_EFFECTS[added].stat);
  }
  assert.ok(stats.size >= 2, `хаос не привязан к характеристике: ${[...stats].join(", ")}`);
});

test("замена не повторяет свойства предмета и «Ускорение» без 5 уровня", () => {
  const item = itemWith(["rage", "fortify"], { level: 1, rarity: "common" });
  const p = hero({ armory: [item] });
  for (let s = 1; s <= 60; s++) {
    const r = ritual.ritualReplace(p, item.uid, "rage", "chaos", seeded(s));
    if (!r) continue;
    const next = r.player.armory.find((g) => g.uid === item.uid);
    const added = next.effects.find((id) => !item.effects.includes(id));
    assert.ok(added, "появилось новое свойство");
    assert.notEqual(added, "fortify", "свойство не дублируется");
    assert.notEqual(added, "ap", "ускорение не выпадает с 1 уровня");
  }
});

test("снятие: 100 золота, свойство пропадает, реагент уровня предмета", () => {
  const item = itemWith(["rage", "fortify"], { level: 4 });
  const p = hero({ armory: [item] });
  const res = ritual.ritualStrip(p, item.uid, "rage", seeded(3));
  assert.ok(res);
  assert.equal(res.player.gold, 1000 - 100);
  const next = res.player.armory.find((g) => g.uid === item.uid);
  assert.deepEqual(next.effects, ["fortify"]);
  assert.equal(next.effectRolls.rage, undefined);
  const gained = Object.entries(res.player.bag).filter(([id]) => id !== "magic_ink" && (p.bag[id] ?? 0) !== res.player.bag[id]);
  assert.equal(gained.length, 1, "получен один вид реагента");
  const [reagent, count] = gained[0];
  assert.equal(count - (p.bag[reagent] ?? 0), ritual.stripReagentCount(4));
  assert.ok(content.reagentPoolForFloor(4).includes(reagent), "реагент не выше уровня предмета");
});

test("снятие: таблица количества 1–2 → 1, 3–4 → 2, … 9–10 → 5", () => {
  const expected = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
  expected.forEach((want, i) => assert.equal(ritual.stripReagentCount(i + 1), want, `уровень ${i + 1}`));
});

test("снятие без золота не проходит", () => {
  const item = itemWith(["rage"]);
  const p = hero({ armory: [item], gold: 50 });
  assert.equal(ritual.ritualStrip(p, item.uid, "rage", seeded(3)), null);
});

test("маг. барьер: броня на ИНТ даёт барьер вместо уклонения, без капа", () => {
  const armor = content.createGearItem({ baseId: "shroud", level: 5, rarity: "common", identified: true, wear: "new", rng: seeded(21) });
  const st = content.scaledGearStats(armor);
  assert.ok(st.barrier > 0, "барьер есть");
  assert.equal(st.evade, 0, "уклонения у брони на ИНТ нет");
  assert.equal(content.gearAffinity(armor), "int");
});

test("маг. барьер: броня на СИЛ барьера не имеет", () => {
  const base = Object.values(content.GEAR_BASES).find((b) => content.gearKindOfBase(b) === "armor" && b.stat === "str");
  const armor = content.createGearItem({ baseId: base.id, level: 5, rarity: "common", identified: true, wear: "new", rng: seeded(4) });
  assert.equal(content.scaledGearStats(armor).barrier, 0);
});

test("маг. барьер стоит как здоровье по цене", () => {
  const armor = content.createGearItem({ baseId: "shroud", level: 5, rarity: "common", identified: true, wear: "new", rng: seeded(21) });
  const st = content.scaledGearStats(armor);
  const parts = content.gearPointParts(armor);
  assert.ok(Math.abs(parts.barrier - content.GEAR_POINT_WEIGHTS.hp * st.barrier) < 1e-9, "вес барьера = вес здоровья");
  assert.equal(parts.evade, 0, "уклонение не стоит очков у брони на ИНТ");
});

test("бой: барьер героя — сумма брони на ИНТ, восстанавливается в каждом бою", () => {
  const armor = content.createGearItem({ baseId: "shroud", level: 5, rarity: "common", identified: true, wear: "new", rng: seeded(21) });
  const pl = hero({ armory: [armor], equip: { body: armor.uid } });
  const want = content.scaledGearStats(armor).barrier;
  assert.equal(battle.derived(pl).barrierBonus, want);
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  assert.equal(b.p.barrierMax, want);
  assert.equal(b.p.barrier, want, "в начале боя барьер полный");
  b.p.barrier = 0;
  const next = battle.newBattle({ ...pl, barrier: 0 }, 1, false, "classic", 0, 0);
  assert.equal(next.p.barrier, want, "новый бой снова даёт полный барьер");
});

test("бой: барьер поглощает урон первым, остаток идёт в ОЗ", () => {
  const pl = hero();
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.p.barrier = 10;
  b.p.barrierMax = 10;
  assert.equal(battle.absorbBarrier(b, 25), 15, "остаток 15 дойдёт до здоровья");
  assert.equal(b.p.barrier, 0, "барьер разрушен");
  assert.equal(battle.absorbBarrier(b, 7), 7, "без барьера урон не меняется");
  b.p.barrier = 5;
  assert.equal(battle.absorbBarrier(b, 3), 0, "мелкий удар целиком в барьер");
  assert.equal(b.p.barrier, 2);
});

test("сохранение: барьер и уклонение брони не обрезаются", () => {
  const armor = content.createGearItem({ baseId: "shroud", level: 5, rarity: "common", identified: true, wear: "new", rng: seeded(21) });
  armor.statRolls = { hp: 5, armor: 0, evade: 7, regen: 0, barrier: 9 };
  const raw = JSON.parse(JSON.stringify({ ...hero(), armory: [armor], equip: { ...EMPTY_EQUIP, body: armor.uid } }));
  const cleaned = save.sanitizePlayer(raw, 1);
  assert.equal(cleaned.armory[0].statRolls.barrier, 9);
  assert.equal(cleaned.armory[0].statRolls.evade, 7, "уклонение больше не обрезается до 1");
});

test("бой: яд и кровотечение обходят барьер, горение — нет", () => {
  const armor = content.createGearItem({ baseId: "shroud", level: 5, rarity: "common", identified: true, wear: "new", rng: seeded(21) });
  const pl = hero({ armory: [armor], equip: { body: armor.uid } });
  /* Конец раунда: героя стоит пропустить ход (оглушён), очередь — только он. */
  const round = (status) => {
    const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
    b.queue = ["p"];
    b.idx = 0;
    b.p.statuses.stunAp = 1;
    b.p.statuses.invulnerable = 0;
    Object.assign(b.p.statuses, status);
    b.p.barrier = 50;
    b.p.barrierMax = 50;
    b.p.hp = 100;
    return battle.skipStunnedTurn(b);
  };

  const poisoned = round({ poison: 3, poisonTick: 5 });
  assert.equal(poisoned.p.barrier, 50, "яд не трогает барьер");
  assert.ok(poisoned.p.hp < 100, "яд снимает ОЗ напрямую");

  const bleeding = round({ wound: 3, woundTick: 5 });
  assert.equal(bleeding.p.barrier, 50, "кровотечение не трогает барьер");
  assert.ok(bleeding.p.hp < 100, "кровотечение снимает ОЗ напрямую");

  const burning = round({ burn: 3, burnTick: 5 });
  assert.equal(burning.p.barrier, 45, "горение поглощено барьером");
  assert.equal(burning.p.hp, 100, "горение в барьер — ОЗ не тронуты");
});

test("старая броня на ИНТ без барьера в статах: барьер берётся из прежнего уклонения", () => {
  const old = content.createGearItem({ baseId: "shroud", level: 5, rarity: "common", identified: true, wear: "new", rng: seeded(21) });
  old.statRolls = { hp: 5, armor: 0, evade: 40, regen: 0 };
  const st = content.scaledGearStats(old);
  assert.ok(st.barrier > 0, "барьер есть у старого предмета");
  assert.equal(st.evade, 0, "уклонение у брони на ИНТ заменено барьером");
});
