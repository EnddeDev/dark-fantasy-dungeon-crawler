const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-elem-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: ["react", "react-dom", "react/jsx-runtime"] });
  return require(outfile);
}
const battle = load("src/game/battle.ts", "battle");
const content = load("src/game/content.ts", "content");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

/* Свойства предмета фиксированы: иначе бонусы к магии меняются от запуска к запуску. */
const fixedRng = () => 0.5;

function withRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = real; }
}

/** Бой героя с приёмом. Враг без защит, нужного рода и id. */
function fixture(skillId, baseId = "wand_ash", stats = {}) {
  const g = content.createGearItem({ baseId, rarity: "rare", wear: "new", identified: true, level: 5, skillId, rng: fixedRng });
  g.skillId = skillId;
  const p = PlayerFactory.createInitial();
  for (const k of Object.keys(p.equip)) p.equip[k] = null;
  p.armory = [g];
  p.equip = { ...p.equip, mainHand: g.uid };
  p.stats = { ...p.stats, str: 8, agi: 8, int: 8, ...stats };
  p.hp = battle.derived(p).maxHp;
  /* Случайность при создании боя фиксирована: монстр один и тот же во всех сравнениях. */
  const b = withRandom(0.5, () => battle.newBattle(p, 1, false, "classic", 0, 0));
  b.queue = ["p", "e"]; b.idx = 0;
  b.p.concentration = 5;
  b.p.weaponCd = 0;
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0;
  b.enemy.effects = []; b.enemy.effectPower = {};
  b.enemy.statuses.poison = 0; b.enemy.statuses.bleed = 0;
  b.p.hp = battle.derived(p).maxHp;
  return b;
}
function setRace(b, race, id = "fixture") {
  b.enemy.def = { ...b.enemy.def, id, race, type: "strong" };
  return b;
}

/* Урон самого удара: мгновенный первый тик наложенного на врага эффекта (v2) идёт отдельно и не входит. */
function hitDealt(after, hp0) {
  const s = after.enemy.statuses;
  let tick = 0;
  if (s.burn > 0) tick += s.burnTick;
  if (s.chill > 0) tick += s.chillTick;
  if (s.curse > 0) tick += s.curseTick;
  if (s.bleed > 0) tick += s.bleedTick;
  if (s.poison > 0) tick += s.poisonTick;
  return hp0 - after.enemy.hp - tick;
}

test("данные: Искра и Выброс — огонь, Холодная искра — лёд, Дыхание склепа — без стихии", () => {
  const w = load("src/game/weaponTechniques.ts", "wt");
  const byId = Object.fromEntries(w.NEW_WEAPON_TECHNIQUES.map((t) => [t.id, t]));
  assert.equal(byId.spark.element, "fire");
  assert.equal(byId.eruption.element, "fire");
  assert.equal(byId.life_draw.element, undefined, "иссушение — не стихия");
  assert.equal(content.ARMOR_SKILLS.light_spark.dmg.element, "ice");
  assert.equal(content.EPIC_SKILLS.frost_nova.id, "frost_nova");
  assert.ok(!("element" in content.EPIC_SKILLS.frost_nova), "намеренно без стихии");
});

test("Искра: урон по роду с уязвимостью к огню ×1,5 относительно обычного", () => {
  const plain = withRandom(0.99, () => battle.playerAct(setRace(fixture("spark"), "none"), { type: "weapon_skill" }));
  const construct = withRandom(0.99, () => battle.playerAct(setRace(fixture("spark"), "construct"), { type: "weapon_skill" }));
  const dPlain = hitDealt(plain, 5000);
  const dConstruct = hitDealt(construct, 5000);
  assert.ok(dPlain > 0);
  assert.ok(Math.abs(dConstruct / dPlain - 1.5) < 0.02, `ratio ${dConstruct / dPlain}`);
});

test("Искра: голем получает огонь ×0,5 (правило голема сохранено)", () => {
  const plain = withRandom(0.99, () => battle.playerAct(setRace(fixture("spark"), "none"), { type: "weapon_skill" }));
  const golem = withRandom(0.99, () => battle.playerAct(setRace(fixture("spark"), "none", "golem"), { type: "weapon_skill" }));
  const ratio = (hitDealt(golem, 5000)) / (hitDealt(plain, 5000));
  assert.ok(Math.abs(ratio - 0.5) < 0.02, `ratio ${ratio}`);
});

test("Искра: превью показывает тот же урон, что бой", () => {
  const b = setRace(fixture("spark"), "construct");
  const readout = battle.combatReadout(b);
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  const dealt = hitDealt(after, b.enemy.hp);
  assert.equal(readout.techMin, dealt);
  assert.equal(readout.techMax, dealt);
});

test("Приём брони «Холодная искра»: лёд по роду с уязвимостью ×1,5", () => {
  const base = Object.values(content.GEAR_BASES).find((x) => x.slot === "body" && x.gearClass === "light");
  assert.ok(base, "есть лёгкая броня");
  const item = { ...content.createGearItem({ baseId: base.id, rarity: "legendary", level: 3, identified: true, wear: "new", rng: fixedRng }), armorSkill: "light_spark" };
  const pl = (race) => {
    const p = PlayerFactory.createInitial();
    for (const k of Object.keys(p.equip)) p.equip[k] = null;
    p.armory = [item];
    p.equip = { ...p.equip, body: item.uid };
    p.stats = { ...p.stats, str: 1, agi: 1, int: 8 };
    const b = setRace(withRandom(0.5, () => battle.newBattle(p, 1, false, "classic", 0, 0)), race);
    b.queue = ["p", "e"]; b.idx = 0; b.p.concentration = 5;
    b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0; b.enemy.effects = []; b.enemy.effectPower = {};
    return b;
  };
  const plain = withRandom(0.99, () => battle.playerAct(pl("none"), { type: "armor_skill", id: "light_spark" }));
  const construct = withRandom(0.99, () => battle.playerAct(pl("construct"), { type: "armor_skill", id: "light_spark" }));
  const dPlain = hitDealt(plain, 5000);
  const dConstruct = hitDealt(construct, 5000);
  assert.ok(dPlain > 0, "обычный враг получает урон");
  assert.ok(Math.abs(dConstruct / dPlain - 1.5) < 0.05, `ratio ${dConstruct / dPlain}`);
});
