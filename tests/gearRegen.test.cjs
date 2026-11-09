const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-regen-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function bundle(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const gearEffects = bundle("src/game/gearEffects.ts", "gearEffects");
const content = bundle("src/game/content.ts", "content");
const battle = bundle("src/game/battle.ts", "battle");
const { PlayerFactory } = bundle("src/model/PlayerFactory.ts", "PlayerFactory");

test("регенерация больше не выпадает как свойство: ни в пулах оружия, брони и аксессуаров", () => {
  assert.ok(!gearEffects.ACTIVE_GEAR_EFFECTS.includes("regen"));
  for (const pool of Object.values(gearEffects.WEAPON_EFFECT_POOLS)) assert.ok(!pool.includes("regen"));
  for (const byStat of Object.values(gearEffects.ARMOR_EFFECT_POOLS)) {
    for (const pool of Object.values(byStat)) assert.ok(!pool.includes("regen"));
  }
  for (const pool of Object.values(gearEffects.ACCESSORY_EFFECT_POOLS)) assert.ok(!pool.includes("regen"));
});

test("параметр регенерации: (1 + 0,2 × уровень) × износ × разброс, не меньше 1; без параметра 0", () => {
  assert.equal(content.gearRegenValue(1, 1, undefined), 0);
  assert.equal(content.gearRegenValue(1, 1, 100), 1, "1 уровень: 1.2 → 1");
  assert.equal(content.gearRegenValue(10, 1.325, 110), 4, "10 уровень, новое, +10%: 3 × 1.325 × 1.1 ≈ 4.4 → 4");
  assert.equal(content.gearRegenValue(10, 0.75, 90), 2, "10 уровень, изношенное, −10%: 3 × 0.75 × 0.9 ≈ 2.0 → 2");
  assert.ok(content.gearRegenValue(10, 1, 100) > content.gearRegenValue(1, 1, 100), "растёт с уровнем");
});

test("выпадение: броня и аксессуары СИЛ/ИНТ получают параметр, ЛОВ и оружие — нет", () => {
  const rnd = Math.random;
  let strOrIntWithRegen = 0;
  let agiWithRegen = 0;
  let weaponWithRegen = 0;
  try {
    for (let i = 0; i < 1500; i++) {
      const bases = Object.values(content.GEAR_BASES);
      const base = bases[i % bases.length];
      const item = content.createGearItem({ baseId: base.id, rarity: "rare", identified: true, level: 5 });
      const kind = content.gearKindOfBase(base);
      const has = item.statRolls && item.statRolls.regen !== undefined;
      if (kind === "weapon" && has) weaponWithRegen++;
      if ((kind === "armor" || kind === "accessory") && has) {
        if (content.gearAffinity(item) === "agi") agiWithRegen++;
        else strOrIntWithRegen++;
      }
    }
  } finally {
    Math.random = rnd;
  }
  assert.equal(weaponWithRegen, 0, "оружие регенерацию не получает");
  assert.equal(agiWithRegen, 0, "ЛОВ-предметы регенерацию не получают");
  assert.ok(strOrIntWithRegen > 0, "у брони и аксессуаров СИЛ/ИНТ параметр выпадает");
});

test("суммарная регенерация героя — сумма параметров надетой брони и аксессуаров", () => {
  const hero = PlayerFactory.createInitial();
  const base = Object.values(content.GEAR_BASES).find((b) => content.gearKindOfBase(b) === "armor" && b.stat === "str");
  assert.ok(base, "есть тяжёлая броня СИЛ");
  const item = content.createGearItem({ baseId: base.id, rarity: "common", identified: true, level: 10 });
  item.statRolls = { ...item.statRolls, regen: 100 };
  const pl = { ...hero, level: 10, armory: [item], equip: { ...hero.equip, [base.slot]: item.uid } };
  const expected = content.gearRegenValue(item.level, item.wearMult, 100);
  assert.equal(battle.derived(pl).regenPerTurn, expected);
  assert.equal(content.scaledGearStats(item).regen, expected);
});

test("регенерация срабатывает в начале каждого хода героя полным значением", () => {
  const rnd = Math.random;
  Math.random = () => 0.99;
  try {
    const b = battle.newBattle(PlayerFactory.createInitial(), 2, false, "classic", 0, 0);
    b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong", moves: ["guard"] };
    b.enemy.mtype = "strong";
    b.enemy.stats = { str: 0, agi: 0, int: 0 };
    b.enemy.moves = ["guard"];
    b.enemy.atk = [0, 0];
    b.enemy.statuses.blight = 0;
    b.enemy.statuses.curse = 0;
    b.enemy.hp = 500;
    b.enemy.maxHp = 500;
    b.enemy.statuses.regen = 0;
    b.p.maxHp = 300;
    b.p.hp = 100;
    b.p.regenTurn = 3;
    b.p.statuses.noHeal = 0;
    b.p.statuses.wither = 0;
    b.queue = ["p", "e", "p", "e"];
    b.idx = 0;

    /* Первый ход боя уже прошёл до установки параметра: лечения нет. Дальше — по очереди, три хода героя. */
    const heroTurnHp = [b.p.hp];
    let state = b;
    for (let turn = 0; turn < 2; turn++) {
      state = battle.playerAct(state, { type: "end_turn" });
      while (state.queue[state.idx] !== "p" && !state.over) state = battle.enemyStep(state);
      heroTurnHp.push(state.p.hp);
    }
    assert.deepEqual(heroTurnHp, [100, 103, 106], "каждый ход героя лечит 3 здоровья");
  } finally {
    Math.random = rnd;
  }
});

test("старые предметы со свойством «Регенерация» работают как раньше и складываются с параметром", () => {
  const hero = PlayerFactory.createInitial();
  const base = Object.values(content.GEAR_BASES).find((b) => content.gearKindOfBase(b) === "armor" && b.stat === "str");
  const legacy = content.createGearItem({ baseId: base.id, rarity: "common", identified: true, level: 5 });
  legacy.effects = ["regen"];
  legacy.effectRolls = { regen: 2 };
  legacy.statRolls = { hp: 0, armor: 0, evade: 0, regen: 100 };
  const pl = { ...hero, level: 5, armory: [legacy], equip: { ...hero.equip, [base.slot]: legacy.uid } };
  const d = battle.derived(pl);
  assert.ok((d.effectPower.regen ?? 0) > 0, "свойство regen учитывается в эффектах");
  assert.equal(d.regenPerTurn, content.gearRegenValue(5, legacy.wearMult, 100), "параметр складывается отдельно");
});

test("сохранение: параметр регенерации обрезается до 0–200 и не теряется", () => {
  const save = bundle("server/save.ts", "save");
  const hero = PlayerFactory.createInitial();
  const base = Object.values(content.GEAR_BASES).find((b) => content.gearKindOfBase(b) === "armor" && b.stat === "str");
  const item = content.createGearItem({ baseId: base.id, rarity: "common", identified: true, level: 5 });
  item.statRolls = { hp: 0, armor: 0, evade: 0, regen: 500 };
  const raw = JSON.parse(JSON.stringify({ ...hero, armory: [item], equip: { ...hero.equip, [base.slot]: item.uid } }));
  const cleaned = save.sanitizePlayer(raw, 1);
  assert.equal(cleaned.armory[0].statRolls.regen, 200);
});
