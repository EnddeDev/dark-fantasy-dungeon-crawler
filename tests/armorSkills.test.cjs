const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-armor-skill-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("battle");
const content = load("content");

const { ARMOR_SKILLS, ARMOR_SKILL_IDS } = content;

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function player(extra = {}) {
  return {
    name: "Герой", level: 3, xp: 0, statPoints: 0,
    stats: { str: 1, agi: 1, int: 4 }, hp: 1, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

/** Надетая броня с заданным приёмом (предмет опознан, чтобы приём попал в бой). */
function wornArmor(baseId, skillId, level = 3) {
  const item = content.createGearItem({ baseId, rarity: "legendary", level, identified: true, wear: "new", rng: seeded(7) });
  return { ...item, armorSkill: skillId };
}

/** Случайность фиксирована: промахи и уклонения не мешают проверять эффект. */
function withFixedRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Бой с предсказуемой очередью: герой ходит первым, враг — следом. */
function battleFor(pl) {
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.hp = b.p.maxHp;
  /* Приём тратит концентрацию: тесты приёмов стартуют с полной шкалой. */
  b.p.concentration = 5;
  return b;
}

function withArmor(item, stats = {}) {
  return player({
    armory: [item],
    equip: { ...player().equip, body: item.uid },
    stats: { str: 1, agi: 1, int: 4, ...stats },
  });
}

/* Тип брони — это класс и характеристика: у каждого свой набор из 2 атакующих и 5 защитных. */
const ARMOR_TYPES = [
  ["heavy", "str"],
  ["medium", "agi"],
  ["medium", "str"],
  ["light", "int"],
  ["light", "agi"],
  ["light", "str"],
];

test("у каждого типа брони по 2 атакующих и 5 защитных приёмов", () => {
  for (const [cls, stat] of ARMOR_TYPES) {
    const ids = ARMOR_SKILL_IDS.filter((id) => ARMOR_SKILLS[id].gearClass === cls && ARMOR_SKILLS[id].scaleStat === stat);
    const label = `${cls}/${stat}`;
    assert.equal(ids.filter((id) => ARMOR_SKILLS[id].kind === "attack").length, 2, `${label}: атакующих 2`);
    assert.equal(ids.filter((id) => ARMOR_SKILLS[id].kind === "defense").length, 5, `${label}: защитных 5`);
  }
  assert.equal(ARMOR_SKILL_IDS.length, 42, "6 типов по 7 приёмов");
});

test("все приёмы относятся к одному из шести типов и у каждого приёма есть свой id", () => {
  const known = new Set(ARMOR_TYPES.map(([c, s]) => `${c}/${s}`));
  for (const id of ARMOR_SKILL_IDS) {
    assert.ok(known.has(`${ARMOR_SKILLS[id].gearClass}/${ARMOR_SKILLS[id].scaleStat}`), `${id} не входит в типы`);
    assert.equal(ARMOR_SKILLS[id].id, id);
  }
});

test("пул приёмов: с требованием только свои, без требования — любой приём класса", () => {
  const intLight = content.armorSkillPool("light", "int", false);
  assert.ok(intLight.length > 0 && intLight.every((id) => ARMOR_SKILLS[id].scaleStat === "int"));
  assert.equal(content.armorSkillPool("light", "agi", true).length, 21, "без требования — любой приём лёгкой брони");
  assert.ok(content.armorSkillPool("medium", "str", false).every((id) => ARMOR_SKILLS[id].scaleStat === "str"));
  /* Лёгкая броня на СИЛ получает только свою линейку, без приёмов ИНТ и ЛОВ. */
  const lightStr = content.armorSkillPool("light", "str", false);
  assert.equal(lightStr.length, 7);
  assert.ok(lightStr.every((id) => ARMOR_SKILLS[id].scaleStat === "str"));
});

test("выпадение: обычная и редкая броня без приёма, легендарная — всегда, эпическая — в половине случаев", () => {
  const rng = () => 0.1;
  assert.equal(content.rollArmorSkill("common", "heavy", "str", false, rng), undefined);
  assert.equal(content.rollArmorSkill("rare", "heavy", "str", false, rng), undefined);
  assert.ok(content.rollArmorSkill("legendary", "heavy", "str", false, () => 0.99));
  assert.ok(content.rollArmorSkill("epic", "heavy", "str", false, () => 0.1), "epic: удача, приём выпал");
  assert.equal(content.rollArmorSkill("epic", "heavy", "str", false, () => 0.9), undefined, "epic: неудача, приёма нет");
});

test("оружие не получает приём брони, эпическая и легендарная броня — получает", () => {
  for (let i = 0; i < 20; i++) {
    const sword = content.createGearItem({ baseId: "sword", rarity: "legendary", identified: true, rng: seeded(i + 1) });
    assert.equal(sword.armorSkill, undefined, "у оружия приёма брони нет");
  }
  let plateWithSkill = 0;
  for (let i = 0; i < 40; i++) {
    const plate = content.createGearItem({ baseId: "plate", rarity: "legendary", identified: true, rng: seeded(i + 1) });
    assert.ok(plate.armorSkill, "легендарная тяжёлая броня получает приём");
    assert.equal(ARMOR_SKILLS[plate.armorSkill].gearClass, "heavy");
    assert.equal(ARMOR_SKILLS[plate.armorSkill].scaleStat, "str");
    plateWithSkill++;
  }
  assert.equal(plateWithSkill, 40);
});

test("описание приёма собирается из его формул", () => {
  const text = content.armorSkillDesc(ARMOR_SKILLS.heavy_bash);
  assert.match(text, /Урон 6 \+ 1×СИЛ \+ 0\.75×брони/);
  assert.match(text, /враг теряет 1 ход/);
  assert.match(content.armorSkillDesc(ARMOR_SKILLS.light_ward), /Полная защита от урона на 1 раунд/);
});

test("бой: приём брони видно в сводке героя, требование и откат работают", () => {
  const item = wornArmor("plate", "heavy_fort");
  const strong = withArmor(item, { str: 10 });
  const d = battle.derived(strong);
  assert.deepEqual(d.armorSkills.map((s) => s.id), ["heavy_fort"]);

  let b = battleFor(strong);
  b.p.hp = 50;
  b = battle.playerAct(b, { type: "armor_skill", id: "heavy_fort" });
  assert.equal(b.p.statuses.stone, 2, "каменная кожа на 2 раунда");
  assert.ok(b.p.hp > 50, "лечение сработало");
  assert.equal(b.p.armorCds.heavy_fort, 3, "откат 3 раунда");

  /* Враг ходит после героя: до следующего хода героя он в очереди не должен мешать. */
  b.queue = ["p", "e"];
  b.idx = 0;
  const again = battle.playerAct(b, { type: "armor_skill", id: "heavy_fort" });
  assert.match(again.log.map((l) => l.text).join("\n"), /перезаряжается/);
});

test("бой: без нужной характеристики приём не срабатывает", () => {
  /* На 10 уровне брони требование СИЛ выше одного, герой с СИЛ 1 его не выполняет. */
  const weak = withArmor(wornArmor("plate", "heavy_fort", 10), { str: 1 });
  let b = battleFor(weak);
  const req = battle.derived(weak).armorSkills[0].intReq;
  assert.ok(req > 1, `требование СИЛ ${req} выше 1`);
  const before = b.p.statuses.stone;
  b = battle.playerAct(b, { type: "armor_skill", id: "heavy_fort" });
  assert.equal(b.p.statuses.stone, before);
  assert.equal(b.p.armorCds.heavy_fort ?? 0, 0);
  assert.match(b.log.map((l) => l.text).join("\n"), /требуется СИЛ/);
});

test("бой: приём без требования работает при любой характеристике", () => {
  const noReqItem = wornArmor("boots", "light_evade");
  const d = battle.derived(withArmor(noReqItem, { agi: 1 }));
  assert.equal(d.armorSkills[0].intReq, 0);
});

test("бой: неуловимость отводит физические атаки врага", () => {
  const strong = withArmor(wornArmor("plate", "light_evade"), { agi: 10 });
  let b = battleFor(strong);
  b = battle.playerAct(b, { type: "armor_skill", id: "light_evade" });
  assert.equal(b.p.statuses.evadeTurn, 1);
  b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong" };
  b.enemy.moves = ["attack"];
  b.enemy.statuses.stunAp = 0;
  b.queue = ["e"];
  b.idx = 0;
  const after = battle.enemyStep(b);
  const text = after.log.map((l) => l.text).join("\n");
  assert.match(text, /проходит мимо/, "атака врага ушла мимо");
  assert.doesNotMatch(text, /тебе \d+ урона/, "урона по герою нет");
});

test("бой: ответный замах отвечает на каждый удар врага, который прошёл", () => withFixedRandom(0.99, () => {
  const strong = withArmor(wornArmor("plate", "medium_riposte"), { str: 10 });
  let b = battleFor(strong);
  b.p.statuses.counterTurn = 1;
  b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong" };
  b.enemy.moves = ["attack"];
  b.enemy.statuses.stunAp = 0;
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  b.queue = ["e"];
  b.idx = 0;
  const enemyHp = b.enemy.hp;
  const after = battle.enemyStep(b);
  assert.ok(after.enemy.hp < enemyHp, "ответный удар снял здоровье врага");
  assert.match(after.log.map((l) => l.text).join("\n"), /Ответный замах/);
}));

test("бой: полная защита и иммунитет на раунд от оберега", () => {
  const strong = withArmor(wornArmor("plate", "light_ward"), { int: 10 });
  let b = battleFor(strong);
  b = battle.playerAct(b, { type: "armor_skill", id: "light_ward" });
  assert.equal(b.p.statuses.fullGuard, 1);
  assert.equal(b.p.statuses.immune.poison, 1);
  assert.equal(b.p.statuses.immune.curse, 1);
});

test("бой: приём брони-атака наносит урон от брони и характеристики", () => withFixedRandom(0.45, () => {
  const strong = withArmor(wornArmor("plate", "heavy_bash"), { str: 10 });
  let b = battleFor(strong);
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  b.enemy.statuses.stunAp = 0;
  const hp = b.enemy.hp;
  b = battle.playerAct(b, { type: "armor_skill", id: "heavy_bash" });
  assert.ok(b.enemy.hp < hp, "урон прошёл");
  assert.ok(b.enemy.statuses.stunAp >= 0);
}));
