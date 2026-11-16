const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-duel-rules-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const duel = load("src/game/duel.ts", "duelRules");
const content = load("src/game/content.ts", "contentRules");

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

const EMPTY_EQUIP = { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null };

function player(extra = {}) {
  return {
    name: "Покоритель", level: 4, xp: 0, statPoints: 0,
    stats: { str: 5, agi: 5, int: 5 }, hp: 100, gold: 0,
    bag: { potion_s: 2 }, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { ...EMPTY_EQUIP },
    ...extra,
  };
}

function freshState(pa = {}, pb = {}) {
  const a = duel.fighterFromPlayer("a", player({ name: "Аня", ...pa }));
  const b = duel.fighterFromPlayer("b", player({ name: "Боря", ...pb }));
  return { id: "r1", a, b, turn: "a", round: 1, apLeft: a.ap, winner: null, log: [], deadline: Date.now() + 20_000, seq: 0 };
}

test("выносливость: старт — половина максимума, удар тратит сумму ударов по рукам", () => {
  const s = freshState();
  assert.equal(s.a.stamina, Math.floor(s.a.staminaMax / 2), "старт — половина максимума");
  assert.equal(s.a.staminaMax, 90 + 10 * 5 + 5 * 5, "максимум 90 + 10·ЛОВ + 5·СИЛ");
  const cost = duel.duelAttackCost(s.a);
  assert.ok(cost > 0);
  const after = duel.duelAction(s, "a", { type: "attack" }, Date.now());
  assert.equal(after.a.stamina, s.a.stamina - cost);
});

test("выносливость: без её запаса действие отклоняется", () => {
  const s = freshState();
  s.a.stamina = 0;
  assert.match(duel.duelActionError(s, "a", { type: "attack" }), /выносливост/);
  assert.match(duel.duelActionError(s, "a", { type: "guard" }), /выносливост/);
  const same = duel.duelAction(s, "a", { type: "attack" }, Date.now());
  assert.equal(same.apLeft, s.apLeft, "отклонённое действие ход не меняет");
});

test("мощный удар требует концентрации 1 и тратит её; точный добавляет 1", () => {
  const s = freshState();
  assert.match(duel.duelActionError(s, "a", { type: "attack", kind: "risky" }), /концентрации/);
  const safe = duel.duelAction(s, "a", { type: "attack", kind: "safe" }, Date.now());
  assert.equal(safe.a.concentration, 1, "точный удар даёт +1");
  const risky = duel.duelAction({ ...s, a: { ...s.a, concentration: 1 } }, "a", { type: "attack", kind: "risky" }, Date.now());
  assert.equal(risky.a.concentration, 0, "мощный удар тратит 1");
});

test("приём требует концентрацию 1 и тратит её вместе с выносливостью", () => {
  const knife = content.createGearItem({ baseId: "knife", level: 1, wear: "worn", rarity: "common", identified: true });
  const pl = player({ level: 5, stats: { str: 2, agi: 9, int: 9 }, armory: [knife], equip: { ...EMPTY_EQUIP, mainHand: knife.uid } });
  const s = { ...freshState(), a: duel.fighterFromPlayer("a", pl) };
  s.a.concentration = 0;
  assert.ok(s.a.skill, "у ножа есть приём");
  assert.match(duel.duelActionError(s, "a", { type: "technique" }), /концентрации/);
  s.a.concentration = 1;
  const used = duel.duelAction(s, "a", { type: "technique" }, Date.now());
  assert.equal(used.a.concentration, 0);
  assert.equal(used.a.stamina, s.a.stamina - duel.duelTechniqueCost(s.a));
});

test("защита: +10 брони против того же удара; ход не заканчивается; повтор тратит выносливость", () => {
  const make = () => {
    const s = freshState();
    /* Обычный удар бьёт по каждому оружию (hands), поэтому задаём оружие там. */
    s.a.hands = [{ lo: 40, hi: 40, cost: 0, power: 40, cls: "light", name: "тест" }];
    s.a.strFlat = 0;
    s.a.crit = 0;
    s.b.armor = 0;
    s.b.evade = 0;
    s.b.hp = s.b.maxHp = 500;
    return s;
  };
  const plain = make();
  const guarded = make();
  /* Защищается сторона "b", её ход: в нём защита не заканчивает ход. */
  const onB = { ...guarded, turn: "b", apLeft: 2 };
  const g = withRandom(0.3, () => duel.duelAction(onB, "b", { type: "guard" }, Date.now()));
  assert.equal(g.turn, "b", "защита не заканчивает ход");
  assert.equal(g.apLeft, 2, "защита не тратит действие");
  assert.equal(g.b.stamina, onB.b.stamina - duel.DUEL_GUARD_ARMOR, "защита тратит выносливость");
  const again = withRandom(0.3, () => duel.duelAction(g, "b", { type: "guard" }, Date.now()));
  assert.equal(again.b.stamina, g.b.stamina - duel.DUEL_GUARD_ARMOR, "повтор тратит выносливость снова");

  const hitPlain = withRandom(0.3, () => duel.duelAction({ ...plain, turn: "a", apLeft: 1 }, "a", { type: "attack" }, Date.now()));
  const hitGuard = withRandom(0.3, () => duel.duelAction({ ...plain, turn: "a", apLeft: 1, b: { ...plain.b, guard: true } }, "a", { type: "attack" }, Date.now()));
  assert.equal(hitGuard.b.hp - hitPlain.b.hp, 10, "защита даёт +10 брони: урона на 10 меньше");
});

test("сдача: побег засчитывает поражение и не тратит выносливость", () => {
  const s = freshState();
  const out = duel.duelAction(s, "a", { type: "flee" }, Date.now());
  assert.equal(out.winner, "b");
  assert.equal(out.a.stamina, s.a.stamina, "сдача бесплатна");
  assert.match(out.log.join(" "), /сдаётся/);
  assert.equal(duel.duelAction(out, "b", { type: "pass" }, Date.now()).seq, out.seq, "после сдачи ходов нет");
});

test("пропуск хода заканчивает ход сразу", () => {
  const s = freshState();
  const out = duel.duelAction(s, "a", { type: "pass" }, Date.now());
  assert.equal(out.turn, "b");
  assert.equal(out.round, 1);
});

test("спец-приём архетипа: нужен архетип и концентрация 5, тратит 5", () => {
  const s = freshState();
  assert.match(duel.duelActionError(s, "a", { type: "archetype_skill" }), /архетип/);
  const duelist = { ...freshState(), a: duel.fighterFromPlayer("a", player({ archetype: "duelist" })) };
  assert.match(duel.duelActionError(duelist, "a", { type: "archetype_skill" }), /концентрации 5/);
  duelist.a.concentration = 5;
  const used = duel.duelAction(duelist, "a", { type: "archetype_skill" }, Date.now());
  assert.equal(used.a.concentration, 0);
  assert.ok(used.b.effects.some((e) => e.kind === "break"), "Ответный залп даёт раскол брони");
  assert.match(used.log.join(" "), /Ответный залп/);
});

test("Жертвенный пакт Колдуна: здоровье 50%, неуязвимость до своего хода, иссушение врага", () => {
  const base = freshState();
  const w = { ...base, a: duel.fighterFromPlayer("a", player({ archetype: "warlock" })) };
  w.a.concentration = 5;
  const out = duel.duelAction(w, "a", { type: "archetype_skill" }, Date.now());
  assert.equal(out.a.hp, Math.max(1, Math.round(out.a.maxHp * 0.5)));
  assert.equal(out.a.invulnerable, true);
  assert.ok(out.b.effects.some((e) => e.kind === "drain" && e.source === "a"));
  /* Ход соперника: неуязвимость держит урон. */
  const hit = withRandom(0.3, () => duel.duelAction({ ...out, turn: "b", apLeft: 1, b: { ...out.b, hit: [30, 30], strFlat: 0, crit: 0, evade: 0 } }, "b", { type: "attack" }, Date.now()));
  /* Тик иссушения на смене раунда лечит Колдуна на свой размер; урон удара при этом не проходит. */
  const tick = Math.ceil(out.b.maxHp * 0.06);
  assert.equal(hit.a.hp, Math.min(out.a.maxHp, out.a.hp + tick), "неуязвимость не пропускает урон удара");
  /* Начало хода Колдуна снимает неуязвимость. */
  const back = duel.duelAction({ ...hit, turn: "b", apLeft: 1 }, "b", { type: "pass" }, Date.now());
  assert.equal(back.turn, "a");
  assert.equal(back.a.invulnerable, false);
});

test("иссушение: тик 6% макс. ОЗ врага в раунд, лечит иссушающего целиком", () => {
  const s = freshState();
  s.round = 1;
  s.turn = "b";
  s.apLeft = 1;
  s.b.effects = [{ kind: "drain", name: "Иссушение", rounds: 2, value: 0, source: "a" }];
  s.a.hp = 40;
  s.a.maxHp = 200;
  s.b.hp = 200;
  s.b.maxHp = 200;
  const out = duel.duelAction(s, "b", { type: "pass" }, Date.now());
  assert.equal(out.round, 2, "переход на новый раунд");
  const tick = Math.ceil(200 * 0.06);
  assert.equal(out.b.hp, 200 - tick);
  assert.equal(out.a.hp, 40 + tick, "иссушающий получает столько же");
});

test("горение: тик в начале раунда, эффект заканчивается по сроку", () => {
  const s = freshState();
  s.turn = "b";
  s.apLeft = 1;
  s.a.effects = [{ kind: "burn", name: "Горение", rounds: 1, value: 7, source: "b" }];
  const hp = s.a.hp;
  const out = duel.duelAction(s, "b", { type: "pass" }, Date.now());
  assert.equal(out.a.hp, hp - 7);
  assert.equal(out.a.effects.length, 0, "горение на 1 раунд уходит после тика");
});

test("старые дуэли без выносливости и концентрации дополняются при загрузке", () => {
  const s = freshState();
  const old = JSON.parse(JSON.stringify(s));
  for (const f of [old.a, old.b]) {
    delete f.stamina;
    delete f.staminaMax;
    delete f.concentration;
    delete f.hands;
    delete f.effects;
  }
  const fixed = duel.normalizeDuel(old);
  assert.equal(fixed.a.concentration, 0);
  assert.ok(fixed.a.staminaMax > 0 && fixed.a.stamina > 0);
  assert.ok(fixed.a.hands.length >= 1);
  assert.deepEqual(fixed.a.effects, []);
  assert.equal(duel.duelActionError(fixed, "a", { type: "pass" }), null);
});
