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

const ARCHETYPE = new Set(["iron_tonic", "blood_rage", "quickblade_oil", "pact_elixir"]);
const generic = (id) => {
  const def = content.ITEMS[id];
  return (def.kind === "potion" || def.kind === "throwable") && !id.startsWith("immune_") && !ARCHETYPE.has(id);
};
const NEW_IDS = [
  "heal_elixir", "regen_potion", "shard_bomb", "nectar", "resist_potion", "ice_gust", "vine_net",
  "weaken", "salt", "vamp_potion", "dragon_powder", "phoenix", "hell_var", "frost_crystal", "seal_silence",
];

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
function dummyFight(pl, id, floor = 5) {
  const b = freshBattle(pl, floor);
  b.queue = ["p", "e"]; b.idx = 0;
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0; b.enemy.passive = null;
  b.enemy.effects = []; b.enemy.effectPower = {};
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile", moves: ["attack"] };
  b.enemy.moves = ["attack"];
  b.enemy.stats = { str: 0, agi: 0, int: 0 };
  return b;
}

test("расходники: по четыре общих на каждом уровне от 1 до 10", () => {
  for (let L = 1; L <= 10; L++) {
    const ids = Object.keys(content.ITEMS).filter((id) => generic(id) && content.supplyLevel(id) === L);
    assert.equal(ids.length, 4, `уровень ${L}: ${ids.join(", ")}`);
  }
});

test("расходники: уровни 6–10 больше не пустые, новые предметы на месте", () => {
  for (const id of NEW_IDS) {
    assert.ok(content.ITEMS[id], `нет предмета ${id}`);
    const L = content.supplyLevel(id);
    assert.ok(L >= 5 && L <= 10, `${id}: уровень ${L}`);
    assert.ok((content.ITEMS[id].price ?? 0) > 0, `${id}: нет цены`);
  }
  const pool = content.questSupplyPool(10);
  for (const id of NEW_IDS) assert.ok(pool.includes(id), `${id} не попадает в добычу`);
  assert.ok(!content.questSupplyPool(4).includes("phoenix"), "ур. 10 не должен выпадать с 4 этажа");
});

test("иммунитеты и архетипные зелья остались на прежних уровнях", () => {
  assert.equal(content.supplyLevel("immune_bleed"), 2);
  assert.equal(content.supplyLevel("immune_sealAttack"), 4);
  assert.equal(content.supplyLevel("iron_tonic"), 4);
  assert.equal(content.supplyLevel("pact_elixir"), 5);
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
  assert.equal(content.consumablePower(content.ITEMS.heal_elixir, stats), 100);
  assert.equal(content.consumablePower(content.ITEMS.nectar, stats), 140);
  assert.equal(content.consumablePower(content.ITEMS.phoenix, stats), 200);
  assert.equal(content.consumablePower(content.ITEMS.potion_l, stats), 65);
});

test("Вампирская кровь: три удара оружием возвращают 25% урона, потом гаснет", () => {
  const pl = player({ hp: 500, bag: { vamp_potion: 1 } });
  const b = dummyFight(pl, "vamp_potion");
  b.p.hp = 100; b.p.maxHp = 500;
  const after = battle.playerAct(b, { type: "item", id: "vamp_potion" });
  assert.equal(after.p.statuses.vampHits, 3);
  /* удар оружием на 200 урона: 25% = 50 здоровья и один заряд */
  const copy = () => ({ ...after, p: { ...after.p, hp: 100, statuses: { ...after.p.statuses } } });
  const hitOnce = copy();
  battle.applyVamp(hitOnce, 200, 0, "weapon", "phys");
  assert.equal(hitOnce.p.statuses.vampHits, 2, "заряд тратится на удар");
  assert.equal(hitOnce.p.hp, 150);
  /* расходник заряд не тратит */
  const viaItem = copy();
  battle.applyVamp(viaItem, 200, 0, "consumable", "phys");
  assert.equal(viaItem.p.statuses.vampHits, 3);
});

test("Зелье стойкости и регенерация заводят статусы; стойкость поднимает шанс", () => {
  const pl = player({ hp: 500, bag: { resist_potion: 1, regen_potion: 1 } });
  const b = dummyFight(pl, "resist_potion");
  const before = battle.playerResistChance(b);
  const resisted = battle.playerAct(b, { type: "item", id: "resist_potion" });
  assert.equal(resisted.p.statuses.resistPotion, 3);
  assert.ok(battle.playerResistChance(resisted) > before, "стойкость должна расти");

  const regen = battle.playerAct(dummyFight(pl, "regen_potion"), { type: "item", id: "regen_potion" });
  assert.equal(regen.p.statuses.regenPotion, 4);
});

test("Отвар сокрушения: порча −20% без периодического урона", () => {
  const pl = player({ hp: 500, bag: { weaken: 1 } });
  const after = battle.playerAct(dummyFight(pl, "weaken"), { type: "item", id: "weaken" });
  assert.equal(after.enemy.statuses.blight, 3);
  assert.equal(after.enemy.statuses.blightTick, 0);
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
