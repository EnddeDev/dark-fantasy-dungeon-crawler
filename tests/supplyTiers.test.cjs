const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-tiers-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = loadGameModule("battle");
const content = loadGameModule("content");

/* Эликсиры и масла нового списка магазина: 21 + 13. */
const NEW_IDS = Object.keys(content.ITEMS).filter((id) => /^(elixir_|oil_)/.test(id));

function player(over = {}) {
  const gear = content.createGearItem({ baseId: "sword", rarity: "rare", wear: "new", identified: true, level: 4 });
  return {
    name: "П", level: 4, xp: 0, statPoints: 0, stats: { str: 4, agi: 5, int: 3 }, hp: 400, gold: 0,
    bag: {}, knownRecipes: [], armory: [gear],
    equip: { mainHand: gear.uid, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    passives: [], statuses: { wound: 0, curse: 0, poison: 0 }, kills: 0, shopLevel: 1, ...over,
  };
}

function freshBattle(pl, floor = 5) {
  return battle.newBattle(pl, floor, false, undefined, 20, false);
}

/** Очередь начинается с героя; враг — безобидная мишень с фиксированной атакой. */
/** Сумка по умолчанию: предметы из bag лежат в сумке. Правило «в бой только сумка» — в tests/pouchExit.test.cjs. */
function withAutoPouch(pl) {
  if (pl.pouch !== undefined) return pl;
  const ids = Object.keys(pl.bag ?? {}).filter((id) => (pl.bag[id] ?? 0) > 0).slice(0, 5);
  return { ...pl, pouch: [...ids, ...Array(5 - ids.length).fill(null)] };
}

function dummyFight(pl, id, floor = 5) {
  const b = freshBattle(withAutoPouch(pl), floor);
  b.queue = ["p", "e"]; b.idx = 0;
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0; b.enemy.passive = null;
  b.enemy.effects = []; b.enemy.effectPower = {};
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile", moves: ["attack"] };
  b.enemy.moves = ["attack"];
  b.enemy.stats = { str: 0, agi: 0, int: 0 };
  return b;
}

test("расходники: эликсиры и масла на месте, уровни 1–10, все попадают в добычу", () => {
  assert.equal(NEW_IDS.length, 34, "21 эликсир и 13 масел");
  for (const id of NEW_IDS) {
    assert.ok(content.ITEMS[id], `нет предмета ${id}`);
    const L = content.supplyLevel(id);
    assert.ok(L >= 1 && L <= 10, `${id}: уровень ${L}`);
    assert.ok((content.ITEMS[id].price ?? 0) > 0, `${id}: нет цены`);
  }
  const pool = content.questSupplyPool(10);
  for (const id of NEW_IDS) assert.ok(pool.includes(id), `${id} не попадает в добычу`);
  assert.ok(!content.questSupplyPool(4).includes("potion_xl"), "ур. 9 не должен выпадать с 4 этажа");
});

test("иммунитеты и архетипные зелья остались на прежних уровнях", () => {
  assert.equal(content.supplyLevel("antidote_poison"), 3);
  assert.equal(content.supplyLevel("antidote_full"), 6);
  assert.equal(content.supplyLevel("elixir_antidote_weak"), 1);
  assert.equal(content.supplyLevel("oil_exhaust"), 10);
});

test("урон расходников растёт на 10% за уровень, на 10-м ×1,9", () => {
  const stats = { str: 1, agi: 5, int: 1 };
  const base = 15 + 2 * 5;
  assert.equal(content.consumableLevelMult(1), 1);
  assert.equal(content.consumableLevelMult(10), 1.9);
  assert.equal(content.consumablePower(content.ITEMS.throwing_knife, stats), base);
  assert.equal(content.consumablePower(content.ITEMS.frost_crystal, stats), Math.round(base * 1.9));
  assert.equal(content.consumablePower(content.ITEMS.dragon_powder, stats), Math.round(base * 1.8));
});

test("свитки и лечение не получают бонус уровня", () => {
  const stats = { str: 1, agi: 5, int: 5 };
  assert.equal(content.consumablePower(content.ITEMS.scroll_spark, stats), 20);
  assert.equal(content.consumablePower(content.ITEMS.potion_xl, stats), 320);
  assert.equal(content.consumablePower(content.ITEMS.potion_m, stats), 80);
  assert.equal(content.consumablePower(content.ITEMS.potion_l, stats), 160);
});

test("Эликсир вампира: 25% урона оружием возвращается здоровьем три раунда, духа — магическим", () => {
  const pl = player({ hp: 500, bag: { elixir_vamp: 1, elixir_spirit: 1 } });
  const b = dummyFight(pl, "elixir_vamp");
  b.p.hp = 100; b.p.maxHp = 500;
  const after = battle.playerAct(b, { type: "item", id: "elixir_vamp" });
  assert.equal(after.p.statuses.buffs.vamp.rounds, 3);
  assert.equal(after.p.statuses.buffs.vamp.value, 0.25);
  const copy = () => ({ ...after, p: { ...after.p, hp: 100, statuses: { ...after.p.statuses } } });
  const hit = copy();
  battle.applyVamp(hit, 200, 0, "weapon", "phys");
  assert.equal(hit.p.hp, 150, "25% от 200");
  const magic = copy();
  battle.applyVamp(magic, 200, 0, "scroll", "magic");
  assert.equal(magic.p.hp, 100, "духа у вампира нет: магия не лечит");
});

test("Эликсир от холода и большой противоядия: сопротивление на раунд", () => {
  const pl = player({ hp: 500, bag: { elixir_cold: 1, elixir_antidote_great: 1 } });
  const cold = battle.playerAct(dummyFight(pl, "elixir_cold"), { type: "item", id: "elixir_cold" });
  assert.equal(cold.p.statuses.resistFx.chill.chance, 0.5);
  assert.equal(cold.p.statuses.resistFx.chill.rounds, 1);
  const poison = battle.playerAct(dummyFight(pl, "elixir_antidote_great"), { type: "item", id: "elixir_antidote_great" });
  assert.equal(poison.p.statuses.resistFx.poison.chance, 1);
});

test("Масло слабости и раскола: броня врага ниже на 3 раунда", () => {
  const pl = player({ hp: 500, bag: { oil_weak: 1 } });
  const oiled = battle.playerAct(dummyFight(pl, "oil_weak"), { type: "item", id: "oil_weak" });
  assert.equal(oiled.p.statuses.oilType, "weak");
  assert.equal(oiled.p.statuses.oilRounds, 4, "смазка 3 раунда и остаток текущего");
});

test("Печать тишины: враг два раунда выбирает только атаку или стойку", () => {
  const pl = player({ hp: 500, bag: { seal_silence: 1 } });
  const b = dummyFight(pl, "seal_silence");
  b.enemy.moves = ["attack", "heavy", "curse"];
  b.enemy.def = { ...b.enemy.def, moves: ["attack", "heavy", "curse"] };
  const after = battle.playerAct(b, { type: "item", id: "seal_silence" });
  assert.equal(after.enemy.statuses.sealMoves, 2);
  for (let i = 0; i < 30; i++) {
    const move = battle.chooseEnemyMove({ ...after, enemy: { ...after.enemy, moves: ["attack", "heavy", "curse"] } });
    assert.ok(move === "attack" || move === "guard", `приём ${move} при печати`);
  }
});

test("Адский вар поджигает врага, Кристалл заморозки оглушает и обмораживает", () => {
  const pl = player({ hp: 500, bag: { hell_var: 1, frost_crystal: 1 } });
  const fire = battle.playerAct(dummyFight(pl, "hell_var"), { type: "item", id: "hell_var" });
  assert.equal(fire.enemy.statuses.burn, 4);
  assert.ok(fire.enemy.hp < 5000, "огонь должен наносить урон");

  const ice = battle.playerAct(dummyFight(pl, "frost_crystal"), { type: "item", id: "frost_crystal" });
  assert.equal(ice.enemy.statuses.chill, 3);
  assert.equal(ice.enemy.statuses.stunAp, 1);
  assert.ok(ice.enemy.hp < 5000, "лёд должен наносить урон");
});
