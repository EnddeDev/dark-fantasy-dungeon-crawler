const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-epic-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: ["react", "react-dom", "react/jsx-runtime"] });
  return require(outfile);
}
const battle = load("src/game/battle.ts", "battle");
const content = load("src/game/content.ts", "content");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

function withRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = real; }
}

/** Бой героя с одним эпическим навыком; враг без брони, защит и стихий. */
function fixture(skillId, stats = {}) {
  const p = PlayerFactory.createInitial();
  for (const k of Object.keys(p.equip)) p.equip[k] = null;
  p.stats = { ...p.stats, str: 8, agi: 8, int: 8, ...stats };
  p.hp = battle.derived(p).maxHp;
  const b = battle.newBattle(p, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"]; b.idx = 0;
  b.p.concentration = 5;
  b.p.weaponCd = 0;
  const sk = content.EPIC_SKILLS[skillId];
  b.p.epicSkills = [{ ...sk, intReq: 1 }];
  b.p.epicSkillLevels = { [skillId]: 1 };
  b.p.epicCds = {};
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0;
  b.enemy.effects = []; b.enemy.effectPower = {};
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong" };
  /* Без характеристик монстра: иначе его ИНТ даёт случайное сопротивление магии. */
  b.enemy.stats = undefined;
  b.enemy.passive = undefined;
  b.enemy.statuses.poison = 0; b.enemy.statuses.bleed = 0;
  return b;
}

const cast = (b, id) => withRandom(0.99, () => battle.playerAct(b, { type: "epic_skill", id }));

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

test("Огненный шар: урон = 20 + 3,5×ИНТ, огонь, поджог", () => {
  const lo = cast(fixture("fireball", { int: 4 }), "fireball");
  const hi = cast(fixture("fireball", { int: 8 }), "fireball");
  const dmgLo = hitDealt(lo, 5000);
  const dmgHi = hitDealt(hi, 5000);
  assert.ok(Math.abs(dmgHi - (20 + 3.5 * 8)) <= 2, `ИНТ 8: урон ${dmgHi}, ждём ≈48`);
  assert.ok(Math.abs(dmgLo - (20 + 3.5 * 4)) <= 2, `ИНТ 4: урон ${dmgLo}, ждём ≈34`);
  assert.ok(hi.enemy.statuses.burn > 0, "поджог наложен");
  assert.equal(hi.p.epicCds.fireball, 3, "перезарядка 3");
});

test("Кровавое копьё: урон от СИЛ, броня не режет, половина урона — лечение", () => {
  const b = fixture("blood_lance", { str: 8, int: 1 });
  b.enemy.armor = 50;
  b.p.hp = b.p.maxHp - 60;
  const hpBefore = b.p.hp;
  const after = cast(b, "blood_lance");
  const dmg = hitDealt(after, 5000);
  assert.ok(Math.abs(dmg - (16 + 2.5 * 8)) <= 2, `СИЛ 8: урон ${dmg}, ждём ≈36 (броня 50 не режет)`);
  const healed = after.p.hp - hpBefore;
  assert.ok(healed > 0 && Math.abs(healed - dmg * 0.5) <= 2, `лечение ${healed} ≈ половина урона`);
  assert.equal(after.p.epicCds.blood_lance, 3);
});

test("Эгида пепла: лечение 16 + 2,5×ИНТ, яд снят, Защита", () => {
  const b = fixture("ash_aegis", { int: 8 });
  b.p.hp = 1;
  b.p.statuses.poison = 3; b.p.statuses.poisonStacks = 2;
  b.p.statuses.curse = 2; b.p.statuses.cursePower = 1;
  const after = cast(b, "ash_aegis");
  const healed = after.p.hp - 1;
  assert.ok(Math.abs(healed - (16 + 2.5 * 8)) <= 2, `лечение ${healed}, ждём ≈36`);
  assert.equal(after.p.statuses.poison, 0, "яд снят");
  assert.equal(after.p.statuses.curse, 0, "проклятие снято");
  assert.equal(after.p.guard, true, "Защита включена");
});

test("Теневой росчерк: урон от ЛОВ сквозь броню, порча врага 2 раунда", () => {
  const b = fixture("shadow_volley", { agi: 8, int: 1 });
  b.enemy.armor = 50;
  const after = cast(b, "shadow_volley");
  const dmg = hitDealt(after, 5000);
  assert.ok(Math.abs(dmg - (16 + 3 * 8)) <= 2, `ЛОВ 8: урон ${dmg}, ждём ≈40 (броня 50 не режет)`);
  assert.equal(after.enemy.statuses.blight, 2, "порча (−20% урона врага) на 2 раунда");
  assert.equal(after.enemy.statuses.chill, 0, "холода нет — это Росчерк, а не Дыхание");
  assert.equal(after.p.epicCds.shadow_volley, 2, "перезарядка 2");
});

test("Дыхание склепа: урон 16 + 3×ИНТ, холод 3 раунда, −1 ход врага, без стихии", () => {
  const b = fixture("frost_nova", { int: 8 });
  b.enemy.statuses.stunAp = 0;
  const after = cast(b, "frost_nova");
  const dmg = hitDealt(after, 5000);
  assert.ok(Math.abs(dmg - (16 + 3 * 8)) <= 2, `ИНТ 8: урон ${dmg}, ждём ≈40`);
  assert.ok(after.enemy.statuses.chill > 0, "холод наложен");
  assert.equal(after.enemy.statuses.stunAp, 1, "враг теряет 1 ход");
  assert.equal(after.p.epicCds.frost_nova, 3, "перезарядка 3");
});

test("Описания эпиков без «×СТАТ»", () => {
  for (const id of Object.keys(content.EPIC_SKILLS)) {
    for (const text of [content.epicSkillDesc(id, 1), content.EPIC_SKILLS[id].desc]) {
      assert.ok(!/×(СИЛ|ИНТ|ЛОВ)/.test(text), `${id}: остался множитель «${text}»`);
    }
  }
});
