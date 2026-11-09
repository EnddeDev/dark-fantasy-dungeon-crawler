const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-stamina-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("battle");
const content = load("content");
const stamina = load("stamina");

const COST = { light: 10, medium: 15, heavy: 25 };

function withRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

const EMPTY_EQUIP = { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null };

function hero(extra = {}) {
  return {
    name: "Герой", level: 3, xp: 0, statPoints: 0,
    stats: { str: 5, agi: 5, int: 5 }, hp: 200, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { ...EMPTY_EQUIP },
    ...extra,
  };
}

function gear(baseId, extra = {}) {
  return content.createGearItem({ baseId, level: 1, wear: "new", rarity: "common", identified: true, ...extra });
}

function withWeapons(items, slots = ["mainHand"]) {
  const equip = { ...EMPTY_EQUIP };
  slots.forEach((slot, i) => (equip[slot] = items[i].uid));
  return hero({ armory: items, equip });
}

/** Бой с предсказуемым врагом: не бьёт, не уклоняется, герой не промахивается. Ход героя первый. */
function fight(pl) {
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e", "p", "e"];
  b.idx = 0;
  b.enemy.hp = 99999;
  b.enemy.maxHp = 99999;
  b.enemy.armor = 0;
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong", moves: ["attack"] };
  b.enemy.moves = ["attack"];
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.atk = [1, 1];
  b.p.evade = 0;
  b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
  return b;
}

test("выносливость: 90 + 10·ЛОВ + 5·СИЛ, полная в начале боя", () => {
  assert.equal(stamina.staminaMax({ str: 3, agi: 7, int: 1 }), 90 + 70 + 15);
  const pl = hero({ stats: { str: 3, agi: 7, int: 1 } });
  assert.equal(battle.derived(pl).staminaMax, 175);
  const b = fight(pl);
  assert.equal(b.p.staminaMax, 175);
  assert.equal(b.p.stamina, 175);
});

test("стоимость удара по весу оружия: лёгкое 10, среднее 15, тяжёлое 25; кулаки 10", () => {
  assert.equal(battle.attackStaminaCost(fight(hero())), 10, "кулаки");
  for (const [baseId, cls] of [["dagger", "light"], ["sword", "medium"], ["greatsword", "heavy"]]) {
    const w = gear(baseId);
    assert.equal(content.gearClassFor(w), cls, baseId);
    const b = fight(withWeapons([w]));
    assert.equal(battle.attackStaminaCost(b), COST[cls], `${baseId} → ${COST[cls]}`);
    const after = withRandom(0.99, () => battle.playerAct(b, { type: "attack" }));
    assert.equal(after.p.stamina, b.p.stamina - COST[cls], `${baseId}: удар списывает ${COST[cls]}`);
    assert.equal(after.idx, 0, "ход героя продолжается, пока есть выносливость");
  }
});

test("две руки: каждое оружие — свой удар и своя стоимость", () => {
  const main = gear("sword");
  const off = gear("dagger");
  const b = fight(withWeapons([main, off], ["mainHand", "offHand"]));
  assert.equal(b.p.hands.length, 2, "два удара");
  assert.equal(battle.attackStaminaCost(b), COST.medium + COST.light, "сумма ударов");
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "attack" }));
  assert.equal(after.p.stamina, b.p.stamina - (COST.medium + COST.light));
  assert.ok(after.enemy.hp < b.enemy.hp);
});

test("приём = вес оружия + 10; эпический приём — так же; приём брони — вес брони + 10", () => {
  const b = fight(withWeapons([gear("sword")]));
  assert.equal(battle.techniqueStaminaCost(b), COST.medium + 10);
  assert.equal(battle.actionStaminaCost(b, { type: "weapon_skill" }), COST.medium + 10);
  assert.equal(battle.actionStaminaCost(b, { type: "epic_skill", id: "x" }), COST.medium + 10);

  const unarmed = fight(hero());
  assert.equal(battle.techniqueStaminaCost(unarmed), COST.light + 10, "кулаки: 10 + 10");

  const plate = content.createGearItem({ baseId: "plate", rarity: "legendary", level: 3, identified: true, wear: "new" });
  const armored = { ...plate, armorSkill: "heavy_fort" };
  const pa = fight(hero({ armory: [armored], equip: { ...EMPTY_EQUIP, body: armored.uid }, stats: { str: 10, agi: 5, int: 5 } }));
  const weight = COST[content.gearClassFor(plate)];
  assert.equal(battle.actionStaminaCost(pa, { type: "armor_skill", id: "heavy_fort" }), weight + 10);
});

test("спец-приём архетипа, побег и «Закончить ход» бесплатны; защита стоит 10 и заканчивает ход", () => {
  const b = fight(hero());
  assert.equal(battle.actionStaminaCost(b, { type: "archetype_skill" }), 0);
  assert.equal(battle.actionStaminaCost(b, { type: "flee" }), 0);
  assert.equal(battle.actionStaminaCost(b, { type: "end_turn" }), 0);
  assert.equal(battle.actionStaminaCost(b, { type: "guard" }), 10);

  const ended = battle.playerAct(b, { type: "end_turn" });
  assert.equal(ended.p.stamina, b.p.stamina, "конец хода бесплатен");
  assert.equal(ended.queue[ended.idx], "e", "ход передан врагу");

  const guarded = battle.playerAct(b, { type: "guard" });
  assert.equal(guarded.p.stamina, b.p.stamina - 10);
  assert.equal(guarded.p.guard, true);
  assert.equal(guarded.queue[guarded.idx], "e", "защита заканчивает ход");
});

test("рюкзак: предмет тратит 5 выносливости; из сумки — бесплатно", () => {
  const bag = fight(hero({ bag: { potion_s: 1 }, pouch: [null, null, null] }));
  bag.p.hp = bag.p.maxHp - 40;
  const fromBag = battle.playerAct(bag, { type: "item", id: "potion_s" });
  assert.equal(fromBag.p.stamina, bag.p.stamina - 5, "из рюкзака — 5");
  assert.equal(fromBag.idx, 0, "ход продолжается");

  const pouch = fight(hero({ bag: { potion_s: 2 }, pouch: ["potion_s", null, null] }));
  pouch.p.hp = pouch.p.maxHp - 40;
  const free = battle.playerAct(pouch, { type: "item", id: "potion_s" });
  assert.equal(free.p.stamina, pouch.p.stamina, "из сумки — бесплатно");
});

test("ход заканчивается сам, когда выносливости меньше 5 и нет бесплатного предмета", () => {
  const b = fight(withWeapons([gear("dagger")]));
  b.p.stamina = 12; // удар кинжалом стоит 10, останется 2
  const after = battle.playerAct(b, { type: "attack" });
  assert.equal(after.p.stamina, 2);
  assert.equal(after.queue[after.idx], "e", "выносливость иссякла — ход переходит врагу");
});

test("ход продолжается, если осталось меньше 5, но в сумке есть зелье", () => {
  const b = fight(hero({ armory: [gear("dagger")], bag: { potion_s: 1 }, pouch: ["potion_s", null, null], equip: { ...EMPTY_EQUIP, mainHand: null } }));
  b.p.stamina = 12;
  const after = battle.playerAct(b, { type: "attack" });
  assert.equal(after.p.stamina, 2);
  assert.equal(after.idx, 0, "бесплатное зелье из сумки ещё доступно");
});

test("не хватает на действие: действие отклоняется, выносливость и ход не меняются", () => {
  const b = fight(hero());
  b.p.stamina = 7;
  const after = battle.playerAct(b, { type: "attack" });
  assert.equal(after.p.stamina, 7);
  assert.equal(after.idx, 0);
  assert.ok(after.log.some((l) => l.text.includes("Не хватает выносливости")));
});

test("в начале каждого раунда выносливость восстанавливается полностью", () => {
  const b = fight(hero());
  b.p.stamina = 3;
  let s = battle.playerAct(b, { type: "end_turn" });
  let guard = 0;
  while (s.round === 1 && !s.over && guard++ < 50) {
    s = s.queue[s.idx] === "p" ? battle.playerAct(s, { type: "end_turn" }) : battle.enemyStep(s);
  }
  assert.equal(s.round, 2);
  assert.equal(s.p.stamina, s.p.staminaMax);
});

test("страх: удар и приёмы закрыты, рюкзак и защита открыты, выносливость по-прежнему списывается", () => {
  const b = fight(withWeapons([gear("sword")]));
  b.p.statuses.fear = 1;
  const blocked = battle.playerAct(b, { type: "attack" });
  assert.equal(blocked.p.stamina, b.p.stamina, "атака под страхом не тратит выносливость");
  assert.equal(blocked.idx, 0);

  const guarded = battle.playerAct(b, { type: "guard" });
  assert.equal(guarded.p.stamina, b.p.stamina - 10);
  assert.equal(guarded.queue[guarded.idx], "e");
});

test("сводка боя показывает выносливость героя", () => {
  const b = fight(hero());
  b.p.stamina = 80;
  const r = battle.combatReadout(b);
  assert.equal(r.stamina, 80);
  assert.equal(r.staminaMax, b.p.staminaMax);
});
