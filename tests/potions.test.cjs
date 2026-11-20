const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-potions-"));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = loadGameModule("battle");
const content = loadGameModule("content");
const monsters = loadGameModule("monsters");

function withRandom(fn, value = 0.99) {
  const rnd = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = rnd;
  }
}

function player(over = {}) {
  const gear = content.createGearItem({ baseId: "sword", rarity: "rare", wear: "new", identified: true, level: 4 });
  return {
    name: "П", level: 4, xp: 0, statPoints: 0, stats: { str: 4, agi: 3, int: 3 }, hp: 400, gold: 0,
    bag: {}, knownRecipes: [], armory: [gear],
    equip: { mainHand: gear.uid, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    passives: [], statuses: { wound: 0, curse: 0, poison: 0 }, kills: 0, shopLevel: 1, ...over,
  };
}

/** Герой ходит первым против безобидной мишени. */
function heroBattle(over = {}) {
  const b = battle.newBattle(player(over), 1, false, undefined, 20, false);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0; b.enemy.passive = null;
  b.enemy.effects = []; b.enemy.effectPower = {};
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile", moves: ["attack"] };
  b.enemy.moves = ["attack"];
  b.enemy.stats = { str: 0, agi: 0, int: 0 };
  b.p.hp = 50; b.p.maxHp = 400;
  return b;
}

/** Бой с врагом заданного рода; очередь начинается с врага. */
function enemyFight(race, moves) {
  const b = heroBattle();
  b.enemy.def = { ...b.enemy.def, id: "fixture", race, type: "strong", moves };
  b.enemy.moves = moves;
  b.enemy.mtype = monsters.coerceMonsterType(race, "strong");
  b.enemy.hp = 9999; b.enemy.maxHp = 9999;
  b.p.hp = 400; b.p.maxHp = 400;
  b.queue = ["e"]; b.idx = 0;
  return b;
}

test("зелья лечения: четыре ступени, ОЗ, уровни и цены по списку", () => {
  const rows = [["potion_s", 1, 30, 30], ["potion_m", 3, 80, 65], ["potion_l", 6, 160, 100], ["potion_xl", 9, 320, 135]];
  const stats = { str: 1, agi: 1, int: 1 };
  for (const [id, level, hp, price] of rows) {
    assert.equal(content.supplyLevel(id), level, `${id}: уровень`);
    assert.equal(content.consumablePower(content.ITEMS[id], stats), hp, `${id}: ОЗ`);
    assert.equal(content.ITEMS[id].price, price, `${id}: цена`);
    assert.equal(content.ITEMS[id].kind, "potion", `${id}: зелье`);
  }
});

test("зелья выносливости: три ступени, ОВ, уровни и цены по списку", () => {
  const rows = [["stamina_s", 2, 30, 60], ["stamina_m", 4, 60, 90], ["stamina_l", 9, 90, 120]];
  for (const [id, level, pts, price] of rows) {
    assert.equal(content.supplyLevel(id), level, `${id}: уровень`);
    assert.equal(content.ITEMS[id].use.type, "stamina", `${id}: тип`);
    assert.equal(content.ITEMS[id].use.power, pts, `${id}: выносливость`);
    assert.equal(content.ITEMS[id].price, price, `${id}: цена`);
  }
});

test("антидоты: пять позиций, уровни и цены по списку", () => {
  const rows = [["antidote", 1, 30], ["antidote_poison", 3, 50], ["antidote_fear", 3, 50], ["antidote_curse", 3, 50], ["antidote_full", 6, 150]];
  for (const [id, level, price] of rows) {
    assert.equal(content.supplyLevel(id), level, `${id}: уровень`);
    assert.equal(content.ITEMS[id].price, price, `${id}: цена`);
  }
  assert.equal(content.ITEMS.antidote.use.power, 5, "Горечь полыни: 5 ОЗ");
  assert.deepEqual(content.ITEMS.antidote.use.effects, ["poison", "curse"]);
  assert.equal(content.ITEMS.antidote_full.use.cleanseAll, true);
});

test("снятые зелья нет в каталоге и отмечены для миграции сохранений", () => {
  for (const id of ["heal_elixir", "nectar", "salt", "phoenix", "immune_bleed", "immune_sealAttack"]) {
    assert.equal(content.ITEMS[id], undefined, `${id} снят`);
    assert.ok(content.REMOVED_ITEM_IDS.has(id), `${id} помечен для миграции`);
    assert.equal(content.SUPPLY_LEVELS[id], undefined, `${id} без уровня`);
  }
});

test("зелье выносливости восстанавливает запас и работает только раз в ход", () => {
  const b = heroBattle({ bag: { stamina_s: 2 } });
  b.p.staminaMax = 100;
  b.p.stamina = 10;
  const first = battle.playerAct(b, { type: "item", id: "stamina_s" });
  assert.equal(first.p.stamina, 10 + 30 - 5, "+30, из рюкзака списано 5");
  assert.equal(first.bag.stamina_s, 1, "одно зелье израсходовано");

  const second = battle.playerAct(first, { type: "item", id: "stamina_s" });
  assert.equal(second.bag.stamina_s, 1, "во втором действии в этом же ходу зелье не тратится");
  assert.equal(second.p.stamina, first.p.stamina, "выносливость не меняется");

  const nextTurn = { ...first, queue: ["p", "e", "p", "e"], idx: 2 };
  const third = battle.playerAct(nextTurn, { type: "item", id: "stamina_s" });
  assert.equal(third.bag.stamina_s, undefined, "в следующем ходу зелье снова работает");
  assert.ok(third.p.stamina > first.p.stamina, "выносливость выросла");
});

test("выносливость не превышает максимума", () => {
  const b = heroBattle({ bag: { stamina_l: 1 }, pouch: ["stamina_l", null, null] });
  b.p.staminaMax = 100;
  b.p.stamina = 95;
  const after = battle.playerAct(b, { type: "item", id: "stamina_l" });
  assert.equal(after.p.stamina, 100);
});

test("зелье от яда: снимает яд и на 1 раунд даёт 30% сопротивления, которое потом тает", () => {
  const b = heroBattle({ bag: { antidote_poison: 1 } });
  b.p.statuses.poison = 2;
  const after = battle.playerAct(b, { type: "item", id: "antidote_poison" });
  assert.equal(after.p.statuses.poison, 0, "яд снят");
  assert.deepEqual(after.p.statuses.resistFx.poison, { chance: 0.3, rounds: 1 });

  const ended = withRandom(() => battle.playerAct({ ...after, queue: ["p"], idx: 0 }, { type: "end_turn" }));
  assert.equal(ended.p.statuses.resistFx?.poison, undefined, "через раунд сопротивление кончилось");
});

test("сопротивление страху: при шансе 100% эффект отражён, при 0% накладывается", () => {
  const guarded = enemyFight("ghost", ["attack"]);
  guarded.p.statuses.resistFx = { fear: { chance: 1, rounds: 1 } };
  const safe = withRandom(() => battle.enemyStep(guarded), 0.99);
  assert.equal(safe.p.statuses.fear, 0, "страха нет");
  assert.ok(safe.log.some((l) => l.text.includes("Сопротивление: страх")), "в журнале видно, почему");

  const open = enemyFight("ghost", ["attack"]);
  open.p.statuses.resistFx = { fear: { chance: 0, rounds: 1 } };
  const feared = withRandom(() => battle.enemyStep(open), 0.99);
  assert.ok(feared.p.statuses.fear > 0, "без шанса сопротивления страх есть");
});

test("зелье очищения снимает все негативные эффекты героя", () => {
  const b = heroBattle({ bag: { antidote_full: 1 } });
  Object.assign(b.p.statuses, { wound: 2, curse: 2, poison: 2, fear: 2, noHeal: 2, sealAttack: 1 });
  const after = battle.playerAct(b, { type: "item", id: "antidote_full" });
  for (const k of ["wound", "curse", "poison", "fear", "noHeal", "sealAttack"]) {
    assert.equal(after.p.statuses[k] ?? 0, 0, `${k} снят`);
  }
  assert.equal(after.bag.antidote_full, undefined);
});

/* Сохранение со снятыми зельями открывается: лишние id молча выбрасываются. */
const saveTemp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-potion-save-"));
process.on("exit", () => fs.rmSync(saveTemp, { recursive: true, force: true }));
function bundleSave(entry, name) {
  const outfile = path.join(saveTemp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}
const save = bundleSave("server/save.ts", "save");
const { PlayerFactory } = bundleSave("src/model/PlayerFactory.ts", "PlayerFactory");

test("сохранение со снятыми зельями открывается, старые зелья пропадают, остальное сохраняется", () => {
  const hero = { ...PlayerFactory.createInitial(), bag: { immune_bleed: 2, heal_elixir: 1, potion_s: 2, antidote: 1 } };
  const player = save.sanitizePlayer(hero);
  assert.deepEqual(player.bag, { potion_s: 2, antidote: 1 });
});

test("сохранение со всеми старыми расходниками открывается: каждый id из прежнего каталога снят", () => {
  const oldIds = [
    "heal_elixir", "nectar", "salt", "phoenix",
    "immune_bleed", "immune_poison", "immune_burn", "immune_curse", "immune_fear", "immune_stun",
    "immune_sunder", "immune_noHeal", "immune_darkness", "immune_sealItems", "immune_sealSkills", "immune_sealAttack",
    "rage", "iron_tonic", "blood_rage", "quickblade_oil", "pact_elixir", "oil_acid", "oil_light", "oil_poison",
    "potion_haste", "potion_stone", "regen_potion", "resist_potion", "vamp_potion", "weaken",
  ];
  const bag = Object.fromEntries(oldIds.map((id) => [id, 1]));
  bag.potion_s = 3;
  const player = save.sanitizePlayer({ ...PlayerFactory.createInitial(), bag });
  assert.deepEqual(player.bag, { potion_s: 3 });
});

test("сумка принимает эликсиры, масла, свитки и факел, но не реагенты и прочие спец. предметы", () => {
  const pouch = loadGameModule("pouch");
  const player = { pouch: [null, null, null, null, null], bag: { elixir_fire: 1, oil_magic: 1, scroll_fire: 1, powder: 1, field_torch: 1, lockpicks: 1 } };
  assert.equal(pouch.setPouchSlot(player, 0, "elixir_fire").ok, true, "эликсир в сумку");
  player.pouch = [null, null, null, null, null];
  assert.equal(pouch.setPouchSlot(player, 1, "oil_magic").ok, true, "масло в сумку");
  assert.equal(pouch.setPouchSlot(player, 2, "scroll_fire").ok, true, "свиток в сумку");
  assert.equal(pouch.setPouchSlot(player, 3, "powder").ok, false, "реагент не кладётся");
  assert.equal(pouch.setPouchSlot(player, 3, "field_torch").ok, true, "факел кладётся");
  assert.equal(pouch.setPouchSlot(player, 4, "lockpicks").ok, false, "отмычки не кладутся");
});
