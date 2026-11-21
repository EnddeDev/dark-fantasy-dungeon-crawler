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

test("параметр регенерации: по таблице типа и слота, не ниже 0; без параметра 0", () => {
  const mail = content.GEAR_BASES.plate;
  const heavyBody = content.createGearItem({ baseId: "plate", rarity: "common", identified: true, level: 1, wear: "worn", rng: () => 0.5 });
  assert.equal(content.scaledGearStats({ ...heavyBody, level: 1, wearMult: 1, statRolls: { ...heavyBody.statRolls, regen: 0 } }).regen, 2, "тело тяжёлой брони 1 уровня: 2");
  const heavy10 = content.scaledGearStats({ ...heavyBody, level: 10, wearMult: 1, statRolls: { ...heavyBody.statRolls, regen: 0 } });
  assert.equal(heavy10.regen, 2 + 9, "тело тяжёлой брони 10 уровня: 2 + 1·9");
  const helmet = content.createGearItem({ baseId: "start_hood", rarity: "common", identified: true, level: 1, wear: "worn", rng: () => 0.5 });
  assert.ok(content.scaledGearStats({ ...helmet, wearMult: 1, statRolls: { hp: 0, armor: 0, evade: 0, regen: 0, barrier: 0 } }).regen >= 0);
  assert.ok(mail);
  assert.equal(content.scaledGearStats(content.createGearItem({ baseId: "sword", rarity: "common", identified: true, level: 5, wear: "worn", rng: () => 0.5 })).regen, 0, "оружие без регенерации");
});

test("выпадение: броня и аксессуары получают параметр регенерации, оружие — нет; ботинки не дают", () => {
  const rnd = Math.random;
  let weaponWithRegen = 0;
  let feetWithRegen = 0;
  let armorOrAccessoryWithRoll = 0;
  let armorOrAccessory = 0;
  try {
    for (let i = 0; i < 600; i++) {
      const bases = Object.values(content.GEAR_BASES);
      const base = bases[i % bases.length];
      const item = content.createGearItem({ baseId: base.id, rarity: "rare", identified: true, level: 5 });
      const kind = content.gearKindOfBase(base);
      if (kind === "weapon" && item.statRolls.regen !== undefined) weaponWithRegen++;
      if (kind === "armor" || kind === "accessory") {
        armorOrAccessory++;
        if (item.statRolls.regen !== undefined && Math.abs(item.statRolls.regen) <= 1) armorOrAccessoryWithRoll++;
        if (base.slot === "feet" && content.scaledGearStats(item).regen > 0) feetWithRegen++;
      }
    }
  } finally {
    Math.random = rnd;
  }
  assert.equal(weaponWithRegen, 0, "оружие регенерацию не получает");
  assert.equal(feetWithRegen, 0, "ботинки регенерацию не дают");
  assert.equal(armorOrAccessoryWithRoll, armorOrAccessory, "у брони и аксессуаров есть бросок регенерации −1…+1");
});

test("суммарная регенерация героя — сумма параметров надетой брони и аксессуаров", () => {
  const hero = PlayerFactory.createInitial();
  const base = content.GEAR_BASES.plate;
  const item = content.createGearItem({ baseId: base.id, rarity: "common", identified: true, level: 10 });
  item.statRolls = { ...item.statRolls, regen: 0 };
  const pl = { ...hero, level: 10, armory: [item], equip: { ...hero.equip, [base.slot]: item.uid } };
  const expected = content.scaledGearStats(item).regen;
  assert.equal(battle.derived(pl).regenPerTurn, expected);
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
  const base = content.GEAR_BASES.plate;
  const legacy = content.createGearItem({ baseId: base.id, rarity: "common", identified: true, level: 5 });
  legacy.effects = ["regen"];
  legacy.effectRolls = { regen: 2 };
  legacy.statRolls = { hp: 0, armor: 0, evade: 0, regen: 100 };
  const pl = { ...hero, level: 5, armory: [legacy], equip: { ...hero.equip, [base.slot]: legacy.uid } };
  const d = battle.derived(pl);
  assert.ok((d.effectPower.regen ?? 0) > 0, "свойство regen учитывается в эффектах");
  assert.equal(d.regenPerTurn, content.scaledGearStats(legacy).regen, "параметр складывается отдельно");
  assert.equal(content.scaledGearStats(legacy).regen, content.scaledGearStats({ ...legacy, statRolls: { hp: 0, armor: 0, evade: 0, regen: 0 } }).regen, "старый бросок 100 не меняет параметр");
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
