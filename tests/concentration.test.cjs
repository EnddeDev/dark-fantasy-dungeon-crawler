const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-concentration-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("battle");
const archetypes = load("archetypes");

/** Случайность фиксирована высоко: промахи, уклонения и криты не мешают проверять эффект. */
function withRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

function player(extra = {}) {
  return {
    name: "Герой", level: 3, xp: 0, statPoints: 0,
    stats: { str: 3, agi: 3, int: 6 }, hp: 30, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

/** Бой с очередью «герой, затем враг», герой на полном здоровье. */
function fightFor(extra = {}) {
  const b = battle.newBattle(player(extra), 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.hp = b.p.maxHp;
  b.enemy.hp = b.enemy.maxHp = 500;
  b.enemy.armor = 0;
  /* Раса и тип врага задаются явно: от них зависит урон физического удара. */
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none" };
  b.enemy.mtype = "strong";
  /* Редкие свойства врага (каменная шкура −25% урона) случайны: снимаем их. */
  b.enemy.passive = null;
  b.enemy.effects = [];
  return b;
}

test("концентрация начинается с нуля в каждом бою", () => {
  const b = fightFor({ archetype: "warlock" });
  assert.equal(b.p.concentration, 0);
  assert.equal(battle.persistentBag(b).potion_l, undefined);
});

test("атака даёт +1, защита +2, расходник +1; значение не выходит за 0–5", () => {
  const b = fightFor();
  const afterAttack = withRandom(0.99, () => battle.playerAct(b, { type: "attack" }));
  assert.equal(afterAttack.p.concentration, 1);

  const guarded = withRandom(0.99, () => battle.playerAct(b, { type: "guard" }));
  assert.equal(guarded.p.concentration, 2);

  const withPotion = fightFor({ bag: { potion_l: 2 } });
  const drank = withRandom(0.99, () => battle.playerAct(withPotion, { type: "item", id: "potion_l" }));
  assert.equal(drank.p.concentration, 1);

  let c = b;
  for (let i = 0; i < 4; i++) {
    c = withRandom(0.99, () => battle.playerAct({ ...c, idx: 0, queue: ["p", "e"] }, { type: "guard" }));
  }
  assert.equal(c.p.concentration, 5, "концентрация не растёт выше 5");
});

test("спец-приём без 5 концентрации отклоняется и ничего не тратит", () => {
  const b = fightFor({ archetype: "barbarian" });
  b.p.concentration = 4;
  b.p.hp = b.p.maxHp - 10;
  const next = battle.playerAct(b, { type: "archetype_skill" });
  assert.equal(next.p.concentration, 4);
  assert.equal(next.enemy.hp, b.enemy.hp);
  assert.ok(next.log.some((l) => l.text.includes("концентрации 5")));
});

test("спец-приём блокирует страх и печать забвения, концентрация сохраняется", () => {
  const feared = fightFor({ archetype: "sage" });
  feared.p.concentration = 5;
  feared.p.statuses.fear = 1;
  assert.equal(battle.playerAct(feared, { type: "archetype_skill" }).p.concentration, 5);

  const sealed = fightFor({ archetype: "sage" });
  sealed.p.concentration = 5;
  sealed.p.statuses.sealSkills = 1;
  assert.equal(battle.playerAct(sealed, { type: "archetype_skill" }).p.concentration, 5);
});

test("варвар: удар равен недостающему здоровью и тратит всю концентрацию", () => {
  const b = fightFor({ archetype: "barbarian" });
  b.p.concentration = 5;
  b.p.hp = b.p.maxHp - 12;
  const next = withRandom(0.99, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.p.concentration, 0);
  assert.equal(b.enemy.hp - next.enemy.hp, 12);
});

test("варвар при полном здоровье не тратит концентрацию", () => {
  const b = fightFor({ archetype: "barbarian" });
  b.p.concentration = 5;
  const next = battle.playerAct(b, { type: "archetype_skill" });
  assert.equal(next.p.concentration, 5);
  assert.equal(next.enemy.hp, b.enemy.hp);
});

test("бастион: стойка лечит на броню, следующая атака получает её как урон, потом сбрасывается", () => {
  const b = fightFor({ archetype: "bulwark" });
  b.p.concentration = 5;
  b.p.armor = 10;
  b.p.hp = b.p.maxHp - 20;
  const stance = withRandom(0.99, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(stance.p.concentration, 0);
  assert.equal(stance.p.guard, true);
  assert.ok(stance.p.statuses.bulwarkStrike > 0, "стойка запоминает броню для следующей атаки");
  assert.ok(stance.p.hp > b.p.hp, "стойка лечит");

  const strike = withRandom(0.99, () => battle.playerAct({ ...stance, idx: 0, queue: ["p", "e"] }, { type: "attack" }));
  assert.equal(strike.p.statuses.bulwarkStrike, 0, "бонус тратится на одну атаку");
  assert.ok(strike.log.some((l) => l.text.includes("Стойка: +")));
});

test("ассасин: удар всегда крит и даёт вампиризм 20% от нанесённого", () => {
  const b = fightFor({ archetype: "assassin" });
  b.p.concentration = 5;
  b.p.hp = b.p.maxHp - 50;
  const next = withRandom(0.99, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.p.concentration, 0);
  assert.ok(next.log.some((l) => l.text.includes("КРИТ")), "удар критует");
  assert.ok(next.p.hp > b.p.hp, "вампиризм возвращает здоровье");
});

test("ниндзя: 5 расходников, 2 брошены, 3 остаются временными; приём бесплатный, ход не заканчивает", () => {
  const b = fightFor({ archetype: "ninja" });
  b.p.concentration = 5;
  const bagBefore = { ...battle.persistentBag(b) };
  const next = withRandom(0.99, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.p.concentration, 0);
  const conjuredLeft = Object.values(next.conjured).reduce((s, n) => s + n, 0);
  assert.equal(conjuredLeft, 3, "5 созданы, 2 брошены");
  assert.deepEqual(battle.persistentBag(next), bagBefore, "личный запас не меняется");
  assert.equal(next.idx, 0, "приём бесплатный: ход героя продолжается");
  assert.equal(next.p.stamina, b.p.stamina, "выносливость не тратится");
  assert.equal(next.round, 1);
  assert.ok(next.log.some((l) => l.text.includes("Град снарядов")));
});

test("колдун: здоровье становится ровно 50% и герой неуязвим на 1 ход", () => {
  const b = fightFor({ archetype: "warlock" });
  b.p.concentration = 5;
  b.p.hp = b.p.maxHp;
  const next = battle.playerAct(b, { type: "archetype_skill" });
  assert.equal(next.p.hp, Math.round(b.p.maxHp / 2));
  assert.equal(next.p.statuses.invulnerable, 1);
  assert.equal(next.p.concentration, 0);

  const hitBefore = next.p.hp;
  const enemyTurn = withRandom(0.99, () => battle.enemyStep({ ...next, idx: 1, queue: ["p", "e"] }));
  assert.equal(enemyTurn.p.hp, hitBefore, "удар врага не проходит");
});

test("мудрец: 2 временных свитка, один сразу применён, второй остаётся временным", () => {
  const b = fightFor({ archetype: "sage" });
  b.p.concentration = 5;
  const next = withRandom(0.99, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.p.concentration, 0);
  const conjuredLeft = Object.values(next.conjured).reduce((s, n) => s + n, 0);
  assert.equal(conjuredLeft, 1, "2 созданы, 1 сразу применён");
  assert.deepEqual(battle.persistentBag(next), battle.persistentBag(b), "личный запас не меняется");
});

test("созданное в бою не переходит герою: расход созданного не трогает личный запас", () => {
  const b = fightFor({ bag: { potion_l: 2 } });
  b.conjured = { potion_l: 1 };
  assert.deepEqual(battle.persistentBag(b), { potion_l: 1 });
  const used = withRandom(0.99, () => battle.playerAct(b, { type: "item", id: "potion_l" }));
  assert.equal(used.bag.potion_l, 1);
  assert.equal(used.conjured.potion_l, undefined, "созданное тратится первым");
  assert.deepEqual(battle.persistentBag(used), { potion_l: 1 }, "личный запас остаётся одной штукой");
});

test("состояние боя не меняется: спец-приём не трогает исходный рюкзак", () => {
  const b = fightFor({ archetype: "sage", bag: {} });
  b.p.concentration = 5;
  const snapshotBag = JSON.stringify(b.bag);
  const snapshotConj = JSON.stringify(b.conjured);
  withRandom(0.99, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(JSON.stringify(b.bag), snapshotBag);
  assert.equal(JSON.stringify(b.conjured), snapshotConj);
});

test("у каждого архетипа есть спец-приём с названием и описанием", () => {
  for (const id of Object.keys(archetypes.ARCHETYPES)) {
    const sp = archetypes.ARCHETYPES[id].special;
    assert.ok(sp && sp.name && sp.desc, `${id}: спец-приём описан`);
  }
});

/* Приём требует 1 концентрации и тратит её на использование. */
function swordFor(extra = {}) {
  const item = load("content").createGearItem({ baseId: "sword", level: 5, wear: "worn", rarity: "common", identified: true, rng: () => 0.5 });
  item.effects = [];
  item.effectRolls = {};
  item.passive = undefined;
  item.legendaryPassive = undefined;
  return fightFor({
    armory: [item],
    equip: { mainHand: item.uid, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    stats: { str: 14, agi: 1, int: 6 },
    ...extra,
  });
}

test("приём оружия без концентрации не применяется и ничего не тратит", () => {
  const b = swordFor();
  assert.ok(b.p.weaponSkill, "у меча есть приём");
  b.p.concentration = 0;
  const next = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(next.p.concentration, 0);
  assert.equal(next.p.weaponCd, 0, "перезарядка не запущена");
  assert.equal(next.enemy.hp, b.enemy.hp, "удара не было");
  assert.ok(next.log.some((l) => l.text.includes("требует 1 концентрации")));
});

test("приём оружия с 1 концентрацией применяется и тратит её", () => {
  const b = swordFor();
  b.p.concentration = 1;
  const next = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.ok(next.enemy.hp < b.enemy.hp, "приём ударил");
  assert.equal(next.p.concentration, 0, "−1 за приём");
});

test("приём брони без концентрации отклоняется, с 1 — срабатывает", () => {
  const content = load("content");
  const item = content.createGearItem({ baseId: "plate", level: 3, rarity: "legendary", identified: true, wear: "new", rng: () => 0.5 });
  const worn = { ...item, armorSkill: "heavy_fort" };
  const hero = player({
    armory: [worn],
    equip: { mainHand: null, offHand: null, head: null, body: worn.uid, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    stats: { str: 10, agi: 1, int: 6 },
  });
  assert.deepEqual(battle.derived(hero).armorSkills.map((s) => s.id), ["heavy_fort"]);
  const pl = fightFor(hero);
  pl.p.hp = 50;
  pl.p.concentration = 0;
  const refused = battle.playerAct(pl, { type: "armor_skill", id: "heavy_fort" });
  assert.equal(refused.p.hp, 50, "лечения нет");
  assert.equal(refused.p.concentration, 0);
  assert.equal(refused.p.armorCds.heavy_fort ?? 0, 0, "откат не запущен");

  pl.p.concentration = 1;
  const used = battle.playerAct(pl, { type: "armor_skill", id: "heavy_fort" });
  assert.ok(used.p.hp > 50, "приём сработал");
  assert.equal(used.p.concentration, 0);
});
