const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-effects-"));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = loadGameModule("battle");
const effects = loadGameModule("effects");
const content = loadGameModule("content");

/** Нейтральный бой: род «никакой» не даёт ни иммунитетов, ни уклонения. */
function plainBattle(extra = {}) {
  const gear = content.createGearItem({ baseId: "sword", rarity: "rare", wear: "new", identified: true, level: 4 });
  const pl = {
    name: "П",
    level: 4,
    xp: 0,
    statPoints: 0,
    stats: { str: 4, agi: 3, int: 3 },
    hp: 200,
    gold: 0,
    bag: {},
    knownRecipes: [],
    armory: [gear],
    equip: { mainHand: gear.uid, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    passives: [],
    statuses: { wound: 0, curse: 0, poison: 0 },
    kills: 0,
    shopLevel: 1,
    ...extra,
  };
  const b = battle.newBattle(pl, 1, false, undefined, 20, false);
  b.enemy.def = { ...b.enemy.def, race: "none", type: "strong" };
  b.enemy.mtype = "strong";
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.maxHp = 200;
  b.enemy.hp = 200;
  b.p.maxHp = 200;
  b.p.hp = 200;
  return b;
}

const byId = (chips, id) => chips.find((c) => c.id === id);

test("эффекты: положительные в синей рамке, дебаффы — в своём цвете", () => {
  const buff = byId(effects.playerEffectChips({ ...plainBattle(), p: { ...plainBattle().p, statuses: { ...plainBattle().p.statuses, haste: 3 } } }), "haste");
  assert.equal(buff.polarity, "good");
  assert.equal(buff.color, effects.EFFECT_COLORS.buff, "усиление всегда синее");
  assert.equal(buff.rounds, 3);
  assert.equal(effects.durationLabel(buff), "3 раунда");
  assert.ok(buff.boosts.some((b) => b.stat === "Ходы"), "усиленный показатель подсвечивается");
  assert.equal(buff.highlight, "ap");

  const b = plainBattle();
  b.p.statuses.poison = 3;
  const poison = byId(effects.playerEffectChips(b), "poison");
  assert.equal(poison.polarity, "bad");
  assert.equal(poison.color, effects.EFFECT_COLORS.poison);
  assert.notEqual(poison.color, effects.EFFECT_COLORS.buff, "дебафф не в синей рамке");
  assert.equal(poison.highlight, undefined);
});

test("эффекты: периодический урон считается за тик и за весь срок", () => {
  const b = plainBattle();
  b.p.maxHp = 100;
  b.p.hp = 100;
  b.p.statuses.poison = 3;
  const poison = byId(effects.playerEffectChips(b), "poison");
  assert.equal(poison.dot.perTick, 4, "яд — 4% макс. ОЗ за тик");
  assert.equal(poison.dot.ticks, 3);
  assert.equal(poison.dot.total, 12, "4 × 3 раунда");
  assert.match(effects.dotSummary(poison.dot), /всего 12 ОЗ/);

  b.p.statuses.wound = 2;
  const bleed = byId(effects.playerEffectChips(b), "bleed");
  assert.equal(bleed.dot.perTick, 5, "кровотечение — 5% макс. ОЗ");
  assert.equal(bleed.dot.total, 10);
});

test("эффекты: магический тик режется сопротивлением магии", () => {
  const b = plainBattle();
  b.p.maxHp = 200;
  b.p.hp = 200;
  b.p.statuses.chill = 2;
  /* Половина сопротивления: 200 × 3% = 6 → 3 после среза. */
  b.p.chanceLayers.magicResist = { stats: [], items: [0.5], effects: [] };
  const chill = byId(effects.playerEffectChips(b), "chill");
  assert.equal(chill.dot.type, "магический");
  assert.equal(chill.dot.perTick, 3, "6 магического урона минус 50% сопротивления");
  assert.equal(chill.dot.total, 6);
  assert.ok(chill.boosts.some((x) => x.stat === "Лечение" && x.value === "−50%"));
});

test("эффекты: монстр с иммунитетом показывает щит с глифом эффекта", () => {
  const b = plainBattle();
  b.enemy.def = { ...b.enemy.def, race: "undead" };
  const chips = effects.enemyEffectChips(b);
  const immunity = chips.filter((c) => c.immune);
  const ids = immunity.map((c) => c.id).sort();
  assert.deepEqual(ids, ["bleed", "fear", "poison"], "нежить иммунна к яду, крови и страху");
  for (const chip of immunity) {
    assert.match(chip.name, /Иммунитет/);
    assert.equal(chip.color, effects.EFFECT_COLORS.immunity);
    assert.equal(chip.rounds, null, "иммунитет не имеет срока");
  }

  /* Конструкт вдобавок не лечится. */
  const construct = plainBattle();
  construct.enemy.def = { ...construct.enemy.def, race: "construct" };
  const cIds = effects.enemyEffectChips(construct).filter((c) => c.immune).map((c) => c.id);
  assert.ok(cIds.includes("noHeal"), "конструкт не лечится");
});

test("эффекты: у героя с сердцем колосса иммунитет к кровотечению", () => {
  const b = plainBattle();
  b.p.legendaryPassives = ["titan_heart"];
  const chip = effects.playerEffectChips(b).find((c) => c.immune);
  assert.ok(chip, "иммунитет должен быть виден");
  assert.equal(chip.id, "bleed");
  assert.equal(effects.durationLabel(chip), "постоянно");
});

test("эффекты: дебаффы монстра считают урон от его собственного запаса ОЗ", () => {
  const b = plainBattle();
  b.enemy.maxHp = 400;
  b.enemy.hp = 400;
  b.enemy.statuses.bleed = 4;
  const bleed = byId(effects.enemyEffectChips(b), "bleed");
  assert.equal(bleed.dot.perTick, 20, "5% от 400");
  assert.equal(bleed.dot.total, 80);
});

test("эффекты: горение в огненных недрах растёт слоями и не имеет срока", () => {
  const b = plainBattle();
  b.biome = "fire";
  b.p.statuses.burning = 3;
  const burn = effects.playerEffectChips(b).find((c) => c.badge === "×3");
  assert.ok(burn, "слои горения показываются значком");
  assert.equal(burn.dot.perTick, 6, "3 слоя × 2 ОЗ");
  assert.equal(burn.dot.total, null, "срок не ограничен");
  assert.equal(effects.durationLabel(burn), "слои растут");
});

test("эффекты: истёкшие и нулевые эффекты не показываются", () => {
  const b = plainBattle();
  b.p.statuses.rage = 0;
  b.p.statuses.haste = 0;
  b.p.statuses.poison = 0;
  b.enemy.statuses.bleed = 0;
  assert.deepEqual(effects.playerEffectChips(b), []);
  assert.deepEqual(effects.enemyEffectChips(b), []);
});

test("эффекты: у каждого статуса героя и монстра есть глиф и описание", () => {
  const b = plainBattle();
  /* Все числовые статусы героя разом. */
  for (const key of Object.keys(b.p.statuses)) b.p.statuses[key] = 2;
  const player = effects.playerEffectChips(b);
  assert.deepEqual(
    Object.keys(b.p.statuses).filter((k) => k !== "cursePower").map((k) => k).sort(),
    Object.keys(b.p.statuses).filter((k) => k !== "cursePower").sort(),
    "состав статусов не менялся",
  );
  for (const chip of player) {
    assert.ok(effects.EFFECT_ICON_IDS.includes(chip.id), `${chip.name}: глиф существует`);
    assert.ok(chip.details.length > 0, `${chip.name}: есть описание`);
    assert.ok(["good", "bad"].includes(chip.polarity), `${chip.name}: полярность задана`);
    assert.ok(chip.color.startsWith("#"), `${chip.name}: цвет задан`);
    assert.ok(effects.durationLabel(chip).length > 0, `${chip.name}: срок читается`);
  }
  /* Печати, мрак, страх и лечение перекрыто — тоже иконки, а не пусто. */
  const playerIds = new Set(player.map((c) => c.id));
  for (const id of ["curse", "wither", "noHeal", "darkness", "stun", "fear", "sealItems", "sealSkills", "sealAttack", "sunder"]) {
    assert.ok(playerIds.has(id), `у эффекта ${id} должна быть иконка`);
  }

  /* Все статусы монстра. */
  for (const key of Object.keys(b.enemy.statuses)) b.enemy.statuses[key] = 2;
  b.enemy.guard = true;
  b.enemy.fury = 2;
  b.enemy.depleted = 2;
  const enemy = effects.enemyEffectChips(b);
  const enemyIds = new Set(enemy.map((c) => c.id));
  for (const id of ["bleed", "poison", "burn", "chill", "curse", "blight", "wither", "fear", "sunder", "stun", "guard", "fury", "depleted"]) {
    assert.ok(enemyIds.has(id), `у эффекта монстра ${id} должна быть иконка`);
  }
  for (const chip of enemy) {
    assert.ok(effects.EFFECT_ICON_IDS.includes(chip.id), `${chip.name}: глиф существует`);
    assert.ok(chip.details.length > 0, `${chip.name}: есть описание`);
  }
});

test("эффекты: иконки глифов описаны для всех id", () => {
  const src = fs.readFileSync("src/components/EffectIcon.tsx", "utf8");
  for (const id of effects.EFFECT_ICON_IDS) {
    assert.ok(new RegExp(`^\\s+${id}:`, "m").test(src), `в EffectIcon нет глифа ${id}`);
  }
});

test("эффекты: боевая панель показывает иконки герою и монстру", () => {
  const view = fs.readFileSync("src/components/BattleView.tsx", "utf8");
  assert.match(view, /playerEffectChips\(b\)/, "эффекты героя считаются в бою");
  assert.match(view, /enemyEffectChips\(b\)/, "эффекты монстра считаются в бою");
  assert.match(view, /EffectChips chips=\{playerChips\}/, "иконки героя вставлены");
  assert.match(view, /EffectChips chips=\{enemyChips\}/, "иконки монстра вставлены");
  assert.match(view, /boon-row/, "усиленная характеристика подсвечивается");
});
