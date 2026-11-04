const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-immunity-"));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = loadGameModule("battle");
const effects = loadGameModule("effects");
const content = loadGameModule("content");
const monsters = loadGameModule("monsters");
const statusEffects = loadGameModule("statusEffects");

function withRandom(fn, value = 0.99) {
  const rnd = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = rnd;
  }
}

/** Бой с врагом заданного рода и набором приёмов; очередь начинается с врага. */
function fight(race, moves, bag = {}) {
  const gear = content.createGearItem({ baseId: "sword", rarity: "rare", wear: "new", identified: true, level: 4 });
  const pl = {
    name: "П", level: 4, xp: 0, statPoints: 0, stats: { str: 4, agi: 3, int: 3 }, hp: 400, gold: 0,
    bag, knownRecipes: [], armory: [gear],
    equip: { mainHand: gear.uid, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    passives: [], statuses: { wound: 0, curse: 0, poison: 0 }, kills: 0, shopLevel: 1,
  };
  const b = battle.newBattle(pl, 1, false, undefined, 20, false);
  b.enemy.def = { ...b.enemy.def, race, type: "strong", moves };
  b.enemy.moves = moves;
  b.enemy.mtype = monsters.coerceMonsterType(race, "strong");
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  b.p.hp = 400;
  b.p.maxHp = 400;
  b.p.armor = 0;
  b.queue = ["e"];
  b.idx = 0;
  return b;
}

const endRound = (st) => withRandom(() => battle.playerAct({ ...st, queue: ["p"], idx: 0 }, { type: "guard" }));

test("зелье иммунитета тратит ход и защищает ровно от одного эффекта на 3 хода", () => {
  const b = fight("none", ["guard"], { immune_bleed: 1 });
  b.queue = ["p", "e"];
  b.idx = 0;
  const after = battle.playerAct(b, { type: "item", id: "immune_bleed" });
  assert.equal(after.p.statuses.immune.bleed, 3, "кровотечение: 3 хода");
  assert.equal(after.p.statuses.immune.poison ?? 0, 0, "другие эффекты не защищены");
  assert.equal(after.bag.immune_bleed ?? 0, 0, "зелье израсходовано");
  assert.equal(after.queue[after.idx], "e", "ход потрачен: очередь дошла до врага");
});

test("иммунитет к кровотечению: удар вампира не накладывает рану", () => {
  const plain = fight("vampire", ["attack"]);
  const wounded = withRandom(() => battle.enemyStep(plain));
  assert.ok(wounded.p.statuses.wound > 0, "без иммунитета кровотечение накладывается");

  const shielded = fight("vampire", ["attack"]);
  shielded.p.statuses.immune.bleed = 3;
  const safe = withRandom(() => battle.enemyStep(shielded));
  assert.equal(safe.p.statuses.wound, 0, "под иммунитетом раны нет");
  assert.ok(safe.log.some((l) => l.text.includes("Иммунитет: кровотечение не накладывается")), "в журнале видно, почему");
});

test("иммунитет к страху: призрак не сеет страх, пока зелье действует", () => {
  const shielded = fight("ghost", ["attack"]);
  shielded.p.statuses.immune.fear = 3;
  const safe = withRandom(() => battle.enemyStep(shielded));
  assert.equal(safe.p.statuses.fear, 0, "страха нет");

  const plain = fight("ghost", ["attack"]);
  const feared = withRandom(() => battle.enemyStep(plain));
  assert.equal(feared.p.statuses.fear, 2, "без иммунитета страх на 2 раунда");
});

test("иммунитет к печатям: интимидация не запрещает атаку и приёмы", () => {
  const shielded = fight("undead", ["intimidate"]);
  shielded.p.statuses.immune.sealAttack = 3;
  shielded.p.statuses.immune.sealSkills = 3;
  const safe = withRandom(() => battle.enemyStep(shielded));
  assert.equal(safe.p.statuses.sealAttack, 0);
  assert.equal(safe.p.statuses.sealSkills, 0);

  const plain = fight("undead", ["intimidate"]);
  const sealed = withRandom(() => battle.enemyStep(plain));
  assert.equal(sealed.p.statuses.sealAttack, 1, "без иммунитета атака запрещена");
  assert.equal(sealed.p.statuses.sealSkills, 1, "без иммунитета приёмы запрещены");
});

test("иммунитет тает по раундам: через 3 раунда эффект снова накладывается", () => {
  const b = fight("vampire", ["attack"]);
  b.p.statuses.immune.bleed = 3;
  let st = b;
  for (let i = 0; i < 3; i++) st = endRound(st);
  assert.equal(st.p.statuses.immune.bleed ?? 0, 0, "срок вышел");
  assert.ok(st.log.some((l) => l.text.includes("снова может накладываться")), "в журнале сказано, что срок вышел");
  const again = withRandom(() => battle.enemyStep({ ...st, queue: ["e"], idx: 0 }));
  assert.ok(again.p.statuses.wound > 0, "кровотечение накладывается снова");
});

test("иммунитет виден в полосе эффектов: щит, срок в ходах", () => {
  const b = fight("none", ["guard"]);
  b.p.statuses.immune.bleed = 3;
  const chip = effects.playerEffectChips(b).find((c) => c.id === "bleed" && c.immune);
  assert.ok(chip, "есть иконка иммунитета");
  assert.equal(chip.polarity, "good");
  assert.equal(chip.color, effects.EFFECT_COLORS.immunity);
  assert.equal(effects.durationLabel(chip), "3 хода");
});

test("масло на клинке видно герою синим, масло на враге — дебаффом со своим значком", () => {
  const hero = fight("none", ["guard"]);
  hero.p.statuses.oilType = "fire";
  hero.p.statuses.oilRounds = 2;
  const blade = effects.playerEffectChips(hero).find((c) => c.id === "oil");
  assert.ok(blade, "клинок смазан — иконка есть");
  assert.equal(blade.polarity, "good");
  assert.equal(blade.color, effects.EFFECT_COLORS.buff, "синяя рамка");

  const frost = fight("none", ["guard"], {});
  frost.p.stats.int = 10;
  frost.enemy.statuses.oilType = "ice";
  frost.enemy.statuses.oilRounds = 3;
  frost.enemy.statuses.oilTick = 3;
  const ice = effects.enemyEffectChips(frost).find((c) => c.id === "frost");
  assert.ok(ice, "лёд на враге — иконка льда");
  assert.equal(ice.polarity, "bad");
  assert.equal(ice.boosts[0].value, "−50%", "5% за очко ИНТ при ИНТ 10");
  assert.equal(ice.dot.perTick, 3, "лёд: тик из удара, 3 урона за раунд");

  const fire = fight("none", ["guard"]);
  fire.enemy.statuses.oilType = "fire";
  fire.enemy.statuses.oilRounds = 3;
  fire.enemy.statuses.oilTick = 6;
  const flame = effects.enemyEffectChips(fire).find((c) => c.name === "Огонь масла");
  assert.ok(flame, "огонь на враге — иконка огня");
  assert.equal(flame.dot.perTick, 6, "огонь масла: тик из удара, 6 урона за раунд");
  assert.equal(flame.dot.ticks, 3);
});

test("иконки масел и иммунитета есть в наборе глифов", () => {
  for (const id of ["oil", "frost", "acid", "blind"]) {
    assert.ok(effects.EFFECT_ICON_IDS.includes(id), `${id}: глиф существует`);
  }
});

test("зелья иммунитета: по одному на эффект, есть в припасах и описаны", () => {
  const potions = Object.values(content.ITEMS).filter((i) => i.use?.type === "immunity");
  assert.equal(potions.length, statusEffects.IMMUNITY_EFFECTS.length, "по одному зелью на каждый эффект");
  const effectsCovered = potions.map((i) => i.use.effect).sort();
  assert.deepEqual(effectsCovered, [...statusEffects.IMMUNITY_EFFECTS].sort());
  for (const i of potions) {
    assert.equal(i.use.rounds, 3, `${i.id}: 3 хода`);
    assert.ok(i.id in content.SUPPLY_LEVELS, `${i.id}: есть уровень припаса`);
    assert.ok(i.desc.length > 0, `${i.id}: есть описание`);
  }
});
