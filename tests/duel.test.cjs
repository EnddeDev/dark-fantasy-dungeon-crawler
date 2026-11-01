const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-duel-"));
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

test("duel fighters reuse dungeon formulas: hp, weapon damage, evade and crit", () => {
  const weapon = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  const p = player({ armory: [weapon], equip: { ...player().equip, mainHand: weapon.uid } });
  const f = duel.fighterFromPlayer("u1", p);
  assert.ok(f.maxHp >= 50, `здоровье от Силы: ${f.maxHp}`);
  assert.equal(f.hp, f.maxHp);
  assert.ok(f.hit[1] >= f.hit[0]);
  assert.ok(f.evade > 0.2 && f.evade < 0.3, `уклонение 5% за Ловкость: ${f.evade}`);
  assert.ok(f.crit > 0.05);
  assert.equal(f.ap, 4, "действия за ход ограничены четырьмя");
  assert.equal(f.potions, 2);
});

test("attack, guard, potion and turn order follow the 20 second rules", () => {
  const a = duel.fighterFromPlayer("a", player({ name: "Аня" }));
  const b = duel.fighterFromPlayer("b", player({ name: "Боря" }));
  const state = {
    id: "d1", a, b, turn: "a", round: 1, apLeft: 1, winner: null, log: [],
    deadline: Date.now() + duel.DUEL_TURN_MS, seq: 0,
  };
  assert.equal(duel.duelActionError(state, "b", { type: "attack" }), "Сейчас ход соперника");
  assert.equal(duel.duelActionError(state, "a", { type: "attack" }), null);

  const guard = duel.duelAction(state, "a", { type: "guard" }, Date.now());
  assert.equal(guard.turn, "b");
  assert.equal(guard.a.guard, true);
  assert.equal(guard.b.guard, false, "защита снимается при переходе хода");
  assert.ok(guard.deadline > Date.now());

  guard.a.hp = 40;
  const healed = duel.duelAction(guard, "b", { type: "potion" }, Date.now());
  assert.equal(healed.b.potions, 1);
  assert.ok(healed.b.hp >= healed.b.maxHp - 1 || healed.b.hp > 40);

  const hit = duel.duelAction({ ...state, apLeft: 4 }, "a", { type: "attack" }, Date.now());
  assert.ok(hit.b.hp <= b.hp, "удар не лечит врага");
  assert.ok(hit.log.length > 0);
});

test("timeout passes the turn, and a killing blow ends the duel", () => {
  const state = {
    id: "d2",
    a: duel.fighterFromPlayer("a", player({ name: "Аня" })),
    b: duel.fighterFromPlayer("b", player({ name: "Боря" })),
    turn: "a", round: 1, apLeft: 2, winner: null, log: [], deadline: Date.now() - 1, seq: 0,
  };
  const timed = duel.duelTimeout(state, Date.now());
  assert.equal(timed.turn, "b");
  assert.equal(timed.round, 1);
  assert.match(timed.log.join(" "), /20 секунд/);
  assert.equal(duel.duelTimeout(timed, Date.now()).seq, timed.seq, "ход не пропадает дважды");

  const lethal = { ...state, deadline: Date.now() + 1000, apLeft: 1 };
  lethal.b.hp = 1;
  const over = duel.duelAction(lethal, "a", { type: "pass" }, Date.now());
  assert.equal(over.winner, null, "пропуск хода не убивает");
  const killed = duel.duelAction({ ...lethal, apLeft: 4 }, "a", { type: "attack" }, Date.now());
  if (killed.winner) {
    assert.equal(killed.winner, "a");
    assert.equal(killed.b.hp <= 0, true);
    assert.equal(duel.duelAction(killed, "b", { type: "attack" }, Date.now()).seq, killed.seq, "после победы ходов нет");
  }
});
