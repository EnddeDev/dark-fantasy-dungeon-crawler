const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-warlock-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("battle");
const content = load("content");

const EMPTY_EQUIP = { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null };

function withRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Бой с неубиваемым врагом; герой — Колдун с заданными рубежами, ветками и приёмом curse_brand. */
function warlockFight(passives = [], extra = {}) {
  const pl = {
    name: "Герой", level: 10, xp: 0, statPoints: 0,
    stats: { str: 5, agi: 5, int: 10 }, hp: 200, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [...passives], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { ...EMPTY_EQUIP }, archetype: "warlock", ...extra,
  };
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
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
  /* Приём без лечения и без собственных эффектов врага: только урон. */
  b.p.weaponSkill = { ...content.WEAPON_TECHNIQUES.warding_word };
  b.p.weaponCd = 0;
  b.p.concentration = 5;
  return b;
}

/** Проходит до следующего раунда: ходы героя завершаются, враг действует. */
function endRound(s) {
  let cur = s;
  const start = s.round;
  for (let i = 0; i < 60 && cur.round === start; i++) {
    cur = cur.queue[cur.idx] === "p" ? battle.playerAct(cur, { type: "end_turn" }) : battle.enemyStep(cur);
  }
  assert.equal(cur.round, start + 1, "раунд должен смениться");
  return cur;
}

test("Колдун: каждый приём платит 3% макс. ОЗ, не меньше 1", () => {
  const b = warlockFight();
  b.p.hp = b.p.maxHp;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "weapon_skill" }));
  /* Плату читаем из журнала: мгновенный тик иссушения в этом же ходе лечит героя (v2). */
  const want = Math.max(1, Math.round(b.p.maxHp * 0.03));
  assert.ok(next.log.some((l) => l.text.includes(`Плата пакта: −${want} ОЗ.`)), `плата ${want}`);
});

test("Плата пакта не убивает героя: ОЗ остаётся не ниже 1", () => {
  const b = warlockFight();
  b.enemy.atk = [0, 0];
  b.p.hp = 1;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "weapon_skill" }));
  /* Плата держит ОЗ на 1; дальше мгновенный тик иссушения лечит героя, поэтому проверяем «не ниже 1». */
  assert.ok(next.p.hp >= 1, "ОЗ не ниже 1");
  assert.ok(!next.over, "бой не закончен");
});

test("не-Колдун не платит кровью за приём", () => {
  const b = warlockFight([], { archetype: "duelist" });
  b.p.hp = b.p.maxHp;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(next.p.hp, b.p.maxHp);
});

test("удачный приём накладывает иссушение на 2 раунда; тик — 6% макс. ОЗ врага", () => {
  const b = warlockFight();
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(next.enemy.statuses.drainRounds, 1, "2 хода: первый тик сразу, осталось 1");
  assert.equal(next.enemy.statuses.drainTick, Math.round(next.enemy.maxHp * 0.06));
});

test("рубеж 10 «Владыка пакта»: иссушение на 2 раунда дольше", () => {
  const b = warlockFight(["arch_warlock_10"]);
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(next.enemy.statuses.drainRounds, 3, "4 хода: первый тик сразу, осталось 3");
});

test("Печать пакта: лечение только у приёмов с иссушением и только при уроне", () => {
  const b = warlockFight();
  b.p.gearPassives = ["warlock_pact"];
  b.p.passivePower = { warlock_pact: { skillDamage: 25, cd: 1, vamp: 12 } };
  /* Враг маленький: мгновенный тик иссушения лечит мало, и герой не упирается в максимум (v2). */
  b.enemy.hp = 1000; b.enemy.maxHp = 1000;
  b.p.hp = Math.floor(b.p.maxHp * 0.2);
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.ok(next.log.some((l) => l.text.includes("Печать пакта: +")), "лечение от печати");
  const plain = warlockFight();
  plain.enemy.hp = 1000; plain.enemy.maxHp = 1000;
  plain.p.hp = Math.floor(plain.p.maxHp * 0.2);
  const noPact = withRandom(0.45, () => battle.playerAct(plain, { type: "weapon_skill" }));
  assert.ok(!noPact.log.some((l) => l.text.includes("Печать пакта")), "без печати лечения нет");
});

test("рубеж 5 «Тёмный пакт»: живучесть +10% от базы здоровья", () => {
  const pl = {
    name: "Герой", level: 10, xp: 0, statPoints: 0,
    stats: { str: 5, agi: 5, int: 10 }, hp: 100, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 }, equip: { ...EMPTY_EQUIP }, archetype: "warlock",
  };
  const base = battle.derived(pl).maxHp;
  const pact = battle.derived({ ...pl, passives: ["arch_warlock_5"] }).maxHp;
  assert.equal(pact, base + Math.round(base * 0.1));
});

test("Владыка пакта: урон приёмов +30%, пока ОЗ героя ниже 50%", () => {
  const healthy = warlockFight(["arch_warlock_10"]);
  healthy.p.hp = healthy.p.maxHp;
  const hurt = warlockFight(["arch_warlock_10"]);
  hurt.p.hp = Math.floor(hurt.p.maxHp * 0.4);
  const plain = warlockFight();
  plain.p.hp = plain.p.maxHp;
  const dmg = (s) => 99999 - withRandom(0.45, () => battle.playerAct(s, { type: "weapon_skill" })).enemy.hp;
  const dmgHurt = dmg(hurt);
  const dmgHealthy = dmg(healthy);
  assert.ok(dmgHurt > dmgHealthy, "при низком ОЗ приём сильнее");
  assert.ok(dmgHurt >= dmg(plain), "без Владыки раненый герой бьёт слабее");
});

test("Жертвенный пакт: иссушение на 3 раунда, концентрация списана", () => {
  const b = warlockFight();
  b.p.concentration = 5;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.enemy.statuses.drainRounds, 2, "3 хода: первый тик сразу, осталось 2");
  assert.equal(next.p.concentration, 0);
});

test("ветка «Обряд» A «Ритуал»: Жертвенный пакт возвращает 2 концентрации", () => {
  const b = warlockFight(["skill_rite_a"]);
  b.p.concentration = 5;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.p.concentration, 2);
});

test("ветка «Обряд» B «Кровь пакта»: Жертвенный пакт снимает негативные эффекты", () => {
  const b = warlockFight(["skill_rite_b"]);
  b.p.concentration = 5;
  b.p.statuses.wound = 3;
  b.p.statuses.poison = 2;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.p.statuses.wound, 0);
  assert.equal(next.p.statuses.poison, 0);
  assert.ok(next.log.some((l) => l.text.includes("Кровь пакта")));
});

test("ветка «Порча» A: приём накладывает проклятие с −10% урона врага", () => {
  const b = warlockFight(["skill_curse_a"]);
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(next.enemy.statuses.curse, 1, "2 хода: первый тик сразу, осталось 1");
  assert.equal(next.enemy.statuses.cursePower, 10);
});

test("ветка «Порча» B «Долгая порча»: проклятие от приёма держится на 2 раунда дольше", () => {
  const b = warlockFight(["skill_curse_a", "skill_curse_b"]);
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(next.enemy.statuses.curse, 3, "4 хода: первый тик сразу, осталось 3");
});

test("ветка «Обет» A «Обет крови»: приём, который довёл ОЗ ниже 30%, не тратит перезарядку", () => {
  const b = warlockFight(["skill_vow_a"]);
  b.p.hp = Math.round(b.p.maxHp * 0.31);
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "weapon_skill" }));
  /* ОЗ ниже 30% после приёма (до мгновенного лечения иссушением): перезарядки нет. */
  assert.equal(next.p.weaponCd, 0, "перезарядки нет");
});

test("ветка «Обет» A: если ОЗ уже была ниже 30%, перезарядка идёт как обычно", () => {
  const b = warlockFight(["skill_vow_a"]);
  b.p.hp = Math.round(b.p.maxHp * 0.2);
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.ok(next.p.weaponCd > 0, "перезарядка тратится");
});

test("ветка «Обет» B «Жизнь пакта»: ниже 30% ОЗ лечит 2% в начале хода", () => {
  const b = warlockFight(["skill_vow_b"]);
  /* Макс. ОЗ 300: лечение 2% (6) больше удара врага (минимум 1), прирост виден. */
  b.p.maxHp = 300;
  b.p.hp = 60;
  const before = b.p.hp;
  const next = endRound(b);
  assert.ok(next.log.some((l) => l.text.includes("Жизнь пакта: +")), "лечение в начале хода");
  assert.ok(next.p.hp > before, "ОЗ выросли");
});

test("старая ветка «Ржавчина» не действует: проклятие не снимает броню врага", () => {
  const b = warlockFight(["skill_curse_b"]);
  b.enemy.armor = 10;
  b.enemy.statuses.curse = 3;
  const next = endRound(b);
  assert.equal(next.enemy.armor, 10);
});

test("ветки Колдуна: «Порча», «Обет», «Обряд» вместо «Плата» и «Откат»", () => {
  const skills = load("archetypeSkills");
  const ids = skills.skillBranchesOf("warlock").map((x) => x.id);
  assert.deepEqual(ids, ["curse", "vow", "rite"]);
});
