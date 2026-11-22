/* Дуэль в одном стиле с боем: масло, проки клинка, Единение стихий, тики v2, журнал по типам. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-duel-port-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}
const duel = load("src/game/duel.ts", "duel");
const content = load("src/game/content.ts", "content");

function player(extra = {}) {
  return {
    name: "Покоритель", level: 4, xp: 0, statPoints: 0,
    stats: { str: 5, agi: 5, int: 5 }, hp: 100, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}
/** Оба бойца без броска на крит и уклонение: удар попадает, урон предсказуем. */
function duelState({ a = {}, b = {}, pa = {}, pb = {} } = {}) {
  const weapon = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  const fa = duel.fighterFromPlayer("a", player({ armory: [weapon], equip: { ...player().equip, mainHand: weapon.uid }, ...pa }));
  const fb = duel.fighterFromPlayer("b", player({ name: "Боря", ...pb }));
  Object.assign(fa, { crit: 0, evade: 0, procs: {}, archmage: 0, magicMult: 1, coat: null, ...a });
  Object.assign(fb, { crit: 0, evade: 0, armor: 0, hp: 500, maxHp: 500, procs: {}, archmage: 0, magicMult: 1, coat: null, ...b });
  return {
    id: "d1", a: fa, b: fb, turn: "a", round: 1, apLeft: 4, winner: null,
    log: ["старт"], logTypes: [null], deadline: Date.now() + duel.DUEL_TURN_MS, seq: 0, hits: [],
  };
}
const withRandom = (value, fn) => {
  const rnd = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = rnd; }
};
const attack = (s, extra = {}) => withRandom(0.01, () => duel.duelAction(s, "a", { type: "attack", kind: "normal" }, Date.now()));

/* ───────── масло ───────── */

test("масло из сумки попадает в снимок боя; без масла действие отклоняется", () => {
  const s = duelState({ pa: { bag: { oil_fire_bad: 2 } } });
  assert.equal(s.a.oils.length, 1);
  assert.equal(s.a.oils[0].oil, "fire");
  assert.equal(s.a.oils[0].count, 2);
  assert.match(duel.duelActionError(s, "a", { type: "oil", id: "нет-такого" }), /нет в сумке/);
  assert.equal(duel.duelActionError(s, "a", { type: "oil", id: "oil_fire_bad" }), null);
});

test("смазка: масло расходуется из снимка и накладывает coat на клинок", () => {
  const s = duelState({ pa: { bag: { oil_fire_bad: 2 } } });
  const after = duel.duelAction(s, "a", { type: "oil", id: "oil_fire_bad" }, Date.now());
  assert.equal(after.a.coat.oil, "fire");
  assert.equal(after.a.coat.rounds, 3);
  assert.equal(after.a.oils[0].count, 1, "одна бутылка осталась");
  assert.equal(after.apLeft, 3, "смазка тратит действие");
  assert.ok(after.log.some((l) => l.includes("смазывает клинок")));
});

test("огненное масло на попадании: горение с первым тиком сразу", () => {
  const s = duelState({ a: { coat: { oil: "fire", power: 4, cut: 0, rounds: 3 } } });
  const after = attack(s);
  const burn = after.b.effects.find((e) => e.kind === "burn");
  assert.ok(burn, "горение наложено");
  assert.equal(burn.value, 4);
  assert.equal(burn.rounds, 2, "три тика: один сразу, два в начале ходов цели");
  assert.ok(after.hits.some((h) => h.target === "b" && h.type === "fire" && h.amount === 4), "первый тик виден числом");
});

test("ледяное масло: тик льда и −% урона цели", () => {
  const s = duelState({ a: { coat: { oil: "ice", power: 5, cut: 0.1, rounds: 3 } } });
  const after = attack(s);
  const ice = after.b.effects.find((e) => e.kind === "ice");
  assert.ok(ice, "лёд наложен");
  assert.equal(ice.pct, 10);
  assert.ok(after.hits.some((h) => h.type === "ice" && h.amount === 5));
});

test("масло раскола и слабости: броня цели падает", () => {
  const sunder = attack(duelState({ a: { coat: { oil: "sunder", power: 3, cut: 0, rounds: 3 } } }));
  assert.equal(sunder.b.effects.find((e) => e.kind === "break").value, 3);
  const weak = attack(duelState({ a: { coat: { oil: "weak", power: 0.05, cut: 0, rounds: 3 } } }));
  assert.equal(weak.b.effects.find((e) => e.kind === "weak").value, 5, "−5% брони");
});

test("масло магии: магический удар без брони", () => {
  const s = duelState({ a: { coat: { oil: "magic", power: 30, cut: 0, rounds: 3 } }, b: { armor: 50 } });
  const after = attack(s);
  assert.ok(after.hits.some((h) => h.target === "b" && h.kind === "dmg" && h.type === "magic" && h.amount === 30), "30 магического урона сквозь броню 50");
});

test("масло усталости снимает выносливость цели, масло иссушения запрещает лечение", () => {
  const fat = duelState({ a: { coat: { oil: "fatigue", power: 5, cut: 0, rounds: 3 } } });
  fat.b.stamina = 20;
  assert.equal(attack(fat).b.stamina, 15);
  const drain = attack(duelState({ a: { coat: { oil: "drain", power: 0, cut: 0, rounds: 3 } } }));
  assert.ok(drain.b.effects.some((e) => e.kind === "noheal"));
  /* Цель с запретом лечения не лечится зельем. */
  const blocked = duelState({ b: { hp: 100, potions: 2, effects: [{ kind: "noheal", name: "Иссушение", rounds: 2, value: 0, source: "a" }] } });
  blocked.b.potions = 2;
  const potion = duel.duelAction(blocked, "b", { type: "potion" }, Date.now());
  assert.equal(potion.b.hp, 100, "зелье не лечит под запретом");
});

test("смазка острота: урон удара героя растёт на процент масла", () => {
  /* Одно состояние (меч с случайными характеристиками) на оба удара. */
  const base = duelState({ b: { armor: 0 } });
  const plain = attack(base);
  const edged = attack({ ...base, a: { ...base.a, coat: { oil: "edge", power: 50, cut: 0, rounds: 3 } } });
  assert.ok(edged.b.hp < plain.b.hp, "с остротой цель теряет больше");
  assert.ok(500 - edged.b.hp >= Math.round((500 - plain.b.hp) * 1.4), "примерно +50%");
});

test("смазка кончается по срокам смены раунда", () => {
  const s = duelState({ a: { coat: { oil: "fire", power: 1, cut: 0, rounds: 1 } } });
  s.turn = "b"; s.apLeft = 1; s.round = 1;
  const after = duel.duelAction({ ...s, b: { ...s.b, procs: {} } }, "b", { type: "pass" }, Date.now());
  assert.equal(after.round, 2);
  assert.equal(after.a.coat, null, "смазка сошла на смене раунда");
});

/* ───────── проки клинка ───────── */

test("проки клинка: кровотечение, яд и жар с шансом 100% накладываются на попадание", () => {
  const s = duelState({ a: { procs: { bleed: { chance: 1, value: 2 }, poison: { chance: 1, value: 3 }, scorch: { chance: 1, value: 4 } } } });
  const after = attack(s);
  assert.ok(after.b.effects.some((e) => e.kind === "bleed" && e.value === 2));
  assert.ok(after.b.effects.some((e) => e.kind === "poison" && e.value === 3));
  assert.ok(after.b.effects.some((e) => e.kind === "burn" && e.value === 4));
  assert.ok(after.hits.some((h) => h.type === "bleed" && h.amount === 2), "кровотечение видно числом");
});

test("раскол клинка: броня цели падает навсегда", () => {
  const s = duelState({ a: { procs: { sunder: { chance: 1, value: 3 } } }, b: { armor: 10 } });
  const after = attack(s);
  assert.equal(after.b.armor, 7);
});

test("проки клинка не срабатывают при промахе", () => {
  const s = duelState({ a: { procs: { bleed: { chance: 1, value: 2 } } } });
  const after = withRandom(0.999, () => duel.duelAction(s, "a", { type: "attack", kind: "normal" }, Date.now()));
  assert.equal(after.b.effects.length, 0);
});

/* ───────── Единение стихий ───────── */

test("Единение стихий: на перезарядке приёма обычная атака магическая", () => {
  const s = duelState({ a: { archmage: 5, cooldown: 2, magicMult: 1.15 } });
  const after = attack(s);
  assert.ok(after.hits.some((h) => h.kind === "dmg" && h.type === "magic"), "удар магический");
  assert.ok(!after.hits.some((h) => h.kind === "dmg" && h.type === "phys"));
  const plain = attack(duelState({ a: { archmage: 5, cooldown: 0 } }));
  assert.ok(plain.hits.some((h) => h.type === "phys"), "без перезарядки удар физический");
});

test("Единение стихий: приём с шансом 25% накладывает горение с бонусом ×5 уровня", () => {
  /* Все броски 0.01: попадание, проки, 25% сработало, горение (< 0.5). */
  const s = duelState({ a: { archmage: 5 } });
  s.a.cooldown = 0;
  s.a.skill = { name: "Тест", intReq: 0, cooldown: 2, scaleMult: 1, scaleStat: "str" };
  s.a.concentration = 5;
  const after = withRandom(0.01, () => duel.duelAction(s, "a", { type: "technique" }, Date.now()));
  const burn = after.b.effects.find((e) => e.kind === "burn");
  assert.ok(burn, "горение от Единения стихий");
  assert.equal(burn.bonus, 4 * 5, "бонус ×5 уровня героя (уровень 4)");
  assert.equal(burn.rounds, 2, "три хода: один сразу");
});

test("Единение стихий 10: горение до конца дуэли", () => {
  const s = duelState({ a: { archmage: 10 } });
  s.a.skill = { name: "Тест", intReq: 0, cooldown: 2, scaleMult: 1, scaleStat: "str" };
  s.a.concentration = 5;
  const after = withRandom(0.01, () => duel.duelAction(s, "a", { type: "technique" }, Date.now()));
  const burn = after.b.effects.find((e) => e.kind === "burn");
  assert.ok(burn && burn.rounds > 100, "срок до конца дуэли");
});

/* ───────── тики v2 ───────── */

test("тики v2: N ходов = N тиков, в начале хода носителя, не при смене раунда", () => {
  const s = duelState({});
  s.b.effects = [{ kind: "bleed", name: "Кровотечение", rounds: 3, value: 2, source: "a" }];
  /* Наложение без тика (эффект уже на цели, проверяем срок и тики по ходам). */
  let state = { ...s, turn: "a", apLeft: 1 };
  let ticks = 0;
  for (let i = 0; i < 6; i += 1) {
    state = duel.duelAction(state, state.turn, { type: "pass" }, Date.now());
    ticks += state.hits.filter((h) => h.target === "b" && h.type === "bleed").length;
    state = { ...state, apLeft: 1 };
  }
  assert.equal(ticks, 3, "три хода носителя — три тика");
  assert.equal(state.b.effects.length, 0, "срок вышел");
});

test("тик горения срабатывает только в ход носителя", () => {
  const s = duelState({});
  s.b.effects = [{ kind: "burn", name: "Горение", rounds: 2, value: 3, source: "a" }];
  s.turn = "a"; s.apLeft = 1;
  const afterA = duel.duelAction(s, "a", { type: "pass" }, Date.now());
  assert.equal(afterA.turn, "b");
  assert.equal(afterA.hits.filter((h) => h.type === "fire").length, 1, "тик на ходе Бори");
  assert.equal(afterA.round, 1, "раунд не сменился");
});

/* ───────── журнал по типам ───────── */

test("журнал: строки с уроном получают тип, остальные — null; типы выровнены с журналом", () => {
  const s = duelState({ a: { coat: { oil: "fire", power: 4, cut: 0, rounds: 3 } } });
  const after = attack(s);
  assert.equal(after.logTypes.length, after.log.length);
  const idx = after.log.findIndex((l) => l.includes("горит") || l.includes("горение"));
  assert.ok(idx >= 0, "есть строка про горение");
  assert.equal(after.logTypes[idx], "fire");
  assert.equal(after.logTypes[0], null);
});

test("normalizeDuel: старое состояние получает пустые типы журнала и поля бойца", () => {
  const s = duelState({});
  const old = { ...s, log: ["a", "b", "c"] };
  delete old.logTypes;
  const fixed = duel.normalizeDuel(old);
  assert.deepEqual(fixed.logTypes, [null, null, null]);
  assert.deepEqual(fixed.a.oils, []);
  assert.equal(fixed.a.coat, null);
  assert.deepEqual(fixed.a.procs, {});
});

/* ───────── подсказки ───────── */

test("подсказка атаки: проки клинка с шансом и смазка как части урона", () => {
  const s = duelState({ a: { procs: { bleed: { chance: 0.4, value: 2 } }, coat: { oil: "fire", power: 4, cut: 0, rounds: 3 } } });
  const bd = duel.duelAttackBreakdown(s.a, s.b, "normal");
  const bleed = bd.procs.find((p) => p.type === "bleed");
  assert.ok(bleed && bleed.chance === 0.4 && bleed.min === 2);
  assert.ok(bd.procs.some((p) => p.type === "fire" && p.min === 4), "горение от смазки");
});

test("подсказка приёма: Единение стихий даёт части горения и обморожения с шансом 12,5%", () => {
  const s = duelState({ a: { archmage: 5 } });
  s.a.skill = { name: "Тест", intReq: 0, cooldown: 2, scaleMult: 1, scaleStat: "str" };
  const bd = duel.duelTechniqueBreakdown(s.a, s.b);
  const fire = bd.procs.find((p) => p.type === "fire" && p.chance === 0.125);
  const ice = bd.procs.find((p) => p.type === "ice" && p.chance === 0.125);
  assert.ok(fire && fire.min === 20, "горение ×5 уровня");
  assert.ok(ice && ice.min === 12, "обморожение ×3 уровня");
});

test("подсказка атаки на перезарядке архимага: тип прямого урона — магический", () => {
  const s = duelState({ a: { archmage: 5, cooldown: 1 } });
  const bd = duel.duelAttackBreakdown(s.a, s.b, "normal");
  assert.equal(bd.direct[0].type, "magic");
});
