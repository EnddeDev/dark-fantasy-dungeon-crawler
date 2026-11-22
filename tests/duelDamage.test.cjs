/* Дуэли в стиле боя: события урона по типам (state.hits) и разбор действий (duel.ts). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-duel-damage-"));
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
    bag: { potion_s: 2 }, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}
function duelState(extraA = {}, extraB = {}) {
  const weapon = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  const pa = player({ armory: [weapon], equip: { ...player().equip, mainHand: weapon.uid } });
  const a = { ...duel.fighterFromPlayer("a", pa), ...extraA };
  const b = { ...duel.fighterFromPlayer("b", player({ name: "Боря" })), ...extraB };
  return {
    id: "d1", a, b, turn: "a", round: 1, apLeft: 4, winner: null, log: [],
    deadline: Date.now() + duel.DUEL_TURN_MS, seq: 0, hits: [],
  };
}
const withRandom = (value, fn) => {
  const rnd = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = rnd; }
};

test("состояние дуэли: новые дуэли получают пустой список событий, старые — дополняются", () => {
  const fresh = duel.createDuel("x", { userId: "a", player: player() }, { userId: "b", player: player({ name: "Б" }) }, 0);
  assert.deepEqual(fresh.hits, []);
  const old = { ...fresh };
  delete old.hits;
  assert.deepEqual(duel.normalizeDuel(old).hits, []);
});

test("попадание оружием: событие урона физического типа с суммой удара", () => {
  const s = duelState();
  const after = withRandom(0.01, () => duel.duelAction(s, "a", { type: "attack", kind: "normal" }, Date.now()));
  const dmgEvents = after.hits.filter((h) => h.kind === "dmg");
  assert.ok(dmgEvents.length >= 1, "есть событие урона");
  assert.equal(dmgEvents[0].target, "b");
  assert.equal(dmgEvents[0].type, "phys");
  assert.equal(dmgEvents.reduce((sum, h) => sum + h.amount, 0), s.b.hp - after.b.hp);
});

test("промах: событие «мимо» без урона", () => {
  const s = duelState();
  const after = withRandom(0.999, () => duel.duelAction(s, "a", { type: "attack", kind: "normal" }, Date.now()));
  assert.deepEqual(after.hits, [{ target: "b", kind: "miss", amount: 0 }]);
});

test("события сбрасываются перед каждым действием", () => {
  const s = duelState();
  const first = withRandom(0.01, () => duel.duelAction(s, "a", { type: "attack", kind: "normal" }, Date.now()));
  assert.ok(first.hits.length > 0);
  const next = duel.duelAction({ ...first, turn: "a", apLeft: 2 }, "a", { type: "guard" }, Date.now());
  assert.deepEqual(next.hits, [], "защита не наносит урона и не оставляет старых событий");
});

test("горение на ходу: тик огнём у получившего", () => {
  const s = duelState({}, { effects: [{ kind: "burn", name: "Горение", rounds: 2, value: 3, source: "b" }] });
  s.turn = "a"; s.apLeft = 1;
  /* Ход Аниного конца: начинается ход Бори — тик горения на нём. */
  const after = duel.duelAction(s, "a", { type: "pass" }, Date.now());
  const burn = after.hits.find((h) => h.type === "fire");
  assert.ok(burn, "огонь виден числом");
  assert.equal(burn.target, "b");
  assert.equal(burn.amount, 3);
});

test("иссушение: чистый урон у цели и лечение иссушающего", () => {
  const s = duelState({}, { effects: [{ kind: "drain", name: "Иссушение", rounds: 2, value: 0, source: "a" }] });
  s.a.hp = Math.max(1, s.a.maxHp - 30);
  s.turn = "a"; s.apLeft = 1;
  const after = duel.duelAction(s, "a", { type: "pass" }, Date.now());
  const pure = after.hits.find((h) => h.type === "pure");
  assert.ok(pure, "чистый урон виден числом");
  assert.equal(pure.target, "b");
  const heal = after.hits.find((h) => h.kind === "heal" && h.target === "a");
  assert.ok(heal && heal.amount > 0, "иссушающий получает лечение");
});

test("зелье: лечение без типа урона", () => {
  const s = duelState();
  s.a.hp = s.a.maxHp - 10;
  const after = duel.duelAction(s, "a", { type: "potion" }, Date.now());
  assert.deepEqual(after.hits, [{ target: "a", kind: "heal", amount: 10 }]);
});

test("разбор атаки: диапазон совпадает с ударом (без крита)", () => {
  const s = duelState();
  const { direct } = duel.duelAttackBreakdown(s.a, s.b, "normal");
  assert.equal(direct.length, 1);
  assert.equal(direct[0].type, "phys");
  /* Броски выше шанса крита: крит в разбор не входит. Попадание проверяем хотя бы на одном броске. */
  let checked = 0;
  for (const roll of [0.5, 0.6, 0.7]) {
    const after = withRandom(roll, () => duel.duelAction(s, "a", { type: "attack", kind: "normal" }, Date.now()));
    const hit = after.hits.find((h) => h.kind === "dmg");
    if (!hit) continue;
    checked += 1;
    assert.ok(hit.amount >= direct[0].min && hit.amount <= direct[0].max, `урон ${hit.amount} в ${direct[0].min}–${direct[0].max}`);
  }
  assert.ok(checked > 0, "хотя бы один бросок попал");
});

test("разбор рискованного удара: минимум — максимум оружия", () => {
  const s = duelState();
  const risky = duel.duelAttackBreakdown(s.a, s.b, "risky").direct[0];
  const safe = duel.duelAttackBreakdown(s.a, s.b, "safe").direct[0];
  assert.ok(risky.min >= safe.min, "рискованный удар не слабее безопасного");
  assert.ok(risky.max >= risky.min && safe.max >= safe.min);
});

test("разбор спец-приёма архимага: магический удар сразу и огонь с шансом 50%", () => {
  const s = duelState({ archetype: "archmage" });
  const { direct, procs } = duel.duelSpecialBreakdown(s.a, s.b);
  assert.equal(direct[0].type, "magic");
  assert.equal(direct[0].trigger, "Срабатывает сразу, без броска");
  const fire = procs.find((p) => p.type === "fire");
  assert.equal(fire.chance, 0.5);
  assert.equal(fire.ticks, 3);
  assert.ok(fire.min >= 1 && fire.max >= fire.min);
});

test("разбор спец-приёма чернокнижника: иссушение — чистый урон, без броска", () => {
  const s = duelState({ archetype: "warlock" });
  const { procs } = duel.duelSpecialBreakdown(s.a, s.b);
  assert.equal(procs[0].type, "pure");
  assert.equal(procs[0].ticks, 3);
});
