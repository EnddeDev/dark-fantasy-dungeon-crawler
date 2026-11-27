const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-none-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: ["react", "react-dom", "react/jsx-runtime"] });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");
const content = load("src/game/content.ts", "content");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

function hero() {
  return { ...PlayerFactory.createInitial(), pouch: [null, null, null, null, null], hp: 300 };
}

/** Фиксирует генератор: 0.99 — попадание героя; 0.01 — промах (уклонение героя). */
function seeded(fn, value = 0.99) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Бой с врагом нужного вида; герой ходит первым. */
function fight(id, floor = 3) {
  const b = seeded(() => battle.newBattle(hero(), floor, false, "classic", 0, 0, "normal", id), 0.5);
  b.torchTurns = 99;
  b.queue = ["p", "e"];
  b.idx = 0;
  return b;
}

/** Ход врага с заранее объявленным приёмом. */
function enemyMove(b, move, value = 0.99) {
  b.enemy.announced = move;
  b.queue = ["e", "p"];
  b.idx = 0;
  return seeded(() => battle.enemyStep(b), value);
}

function logHas(b, text) {
  return b.log.some((l) => l.text.includes(text));
}

/* ─── Гоблин-разведчик: отход и крит после промаха героя ─── */

const world = load("src/game/world.ts", "world");

function demonDef(id) {
  return [...content.ENEMIES, ...content.BOSSES, ...world.EXTRA_ENEMIES, ...world.EXTRA_BOSSES].find((d) => d.id === id);
}

/** Бой с боссом: герой ходит первым, враг — выбранный босс. */
function bossFight(id) {
  const b = seeded(() => battle.newBattle(hero(), 7, true, "classic", 0, 0, "normal"), 0.5);
  b.torchTurns = 99;
  b.enemy.def = demonDef(id);
  b.queue = ["p", "e"];
  b.idx = 0;
  return b;
}

/* ─── Угольный бес: при смерти огонь 20 × уровень ─── */

test("Угольный бес: при смерти вспыхивает огнём 20 × уровень", () => {
  const b = fight("imp", 4);
  b.p.hp = 300;
  b.enemy.hp = 1;
  const level = b.enemy.level;
  /* 0.0 — удар героя попадает: бес ловкий и при 0.99 уклоняется. */
  const after = seeded(() => battle.playerAct(b, { type: "attack" }), 0.0);
  assert.equal(after.over, "win", "бой выигран: смерть беса не отменяет победу");
  assert.ok(logHas(after, `вспыхивает при смерти: огонь ${20 * level} урона`));
  assert.ok(logHas(after, "вспыхивает огнём"), "огонь бьёт героя");
  assert.ok(after.p.hp < 300, "герой получает огонь");
});

test("Угольный бес: без смерти огонь не срабатывает", () => {
  const b = fight("imp", 4);
  b.p.hp = 300;
  b.enemy.hp = 9999;
  const after = seeded(() => battle.playerAct(b, { type: "attack" }), 0.0);
  assert.equal(logHas(after, "вспыхивает при смерти"), false);
});

test("Угольный бес: набор правил в бестиарии упоминает смертельный огонь", () => {
  const rules = load("src/game/monsterRules.ts", "rules");
  assert.ok(rules.MONSTER_RULES.imp.text.includes("При смерти"));
});

/* ─── Ведьма-паучиха ─── */

test("Ведьма-паучиха: броня +5 и урон по ней вдвое", () => {
  assert.equal(battle.enemyArmorNow({ armor: 10, def: { id: "witch_spider" } }), 15);
  assert.equal(battle.enemyArmorNow({ armor: 10, def: { id: "devourer" } }), 10);
  const b = fight("witch_spider", 4);
  b.enemy.hp = 500;
  b.enemy.maxHp = 500;
  const before = b.enemy.hp;
  seeded(() => battle.hitEnemy(b, 40, "pure"), 0.99);
  assert.equal(before - b.enemy.hp, 20, "чистый урон 40 режется до 20");
});

test("Ведьма-паучиха: в начале своего хода вытягивает 2% ОЗ героя и лечится", () => {
  const b = fight("witch_spider", 4);
  b.p.hp = 300;
  b.enemy.hp = b.enemy.maxHp - 50;
  const enemyBefore = b.enemy.hp;
  b.queue = ["p", "e"];
  b.idx = 0;
  const after = seeded(() => battle.playerAct(b, { type: "end_turn" }), 0.99);
  assert.ok(logHas(after, "вытягивает"), "вытягивание в начале хода паучихи");
  const amt = Math.max(1, Math.round(b.p.maxHp * 0.02));
  assert.equal(after.p.hp, 300 - amt, "−2% макс. ОЗ героя");
  assert.ok(after.enemy.hp > enemyBefore, "паучиха лечится");
});

/* ─── Демон-пожиратель: атака из стойки защиты ─── */

test("Демон-пожиратель: атака из стойки защиты — 10% ОЗ героя чистым уроном и лечение 5%", () => {
  const b = fight("devourer", 4);
  b.p.hp = 300;
  b.enemy.hp = b.enemy.maxHp - 60;
  b.enemy.lastMove = "guard";
  const enemyBefore = b.enemy.hp;
  const after = enemyMove(b, "attack", 0.99);
  assert.ok(logHas(after, "бьёт из стойки защиты"));
  const dmg = Math.max(1, Math.round(b.p.maxHp * 0.1));
  assert.ok(after.p.hp <= 300 - dmg, "чистый урон не меньше 10% макс. ОЗ героя");
  assert.ok(after.enemy.hp > enemyBefore, "лечится на 5% макс. ОЗ");
});

test("Демон-пожиратель: без стойки защиты обычная атака без чистого урона", () => {
  const b = fight("devourer", 4);
  b.enemy.lastMove = "attack";
  const after = enemyMove(b, "attack", 0.99);
  assert.equal(logHas(after, "бьёт из стойки защиты"), false);
});

/* ─── Пожиратель Сводов: удар по земле на каждые 20% ОЗ ─── */

test("Пожиратель Сводов: каждые 20% потерянного ОЗ — удар по земле и оглушение героя", () => {
  const b = bossFight("boss_devourer");
  b.p.hp = 300;
  b.enemy.hp = b.enemy.maxHp;
  const maxHp = b.enemy.maxHp;
  const after = seeded(() => {
    battle.hitEnemy(b, Math.round(maxHp * 0.25), "pure");
    return b;
  }, 0.99);
  assert.equal(after.enemy.quakesDone, 1, "первый порог пройден");
  assert.ok(logHas(after, "теряет 20% ОЗ и бьёт по земле!"));
  assert.equal(after.p.statuses.stunAp, 1, "герой оглушён на ход");
  assert.equal(after.enemy.endHeroTurn, true, "ход героя заканчивается");
});

test("Пожиратель Сводов: без нового порога удар по земле не повторяется", () => {
  const b = bossFight("boss_devourer");
  b.p.hp = 300;
  b.enemy.hp = b.enemy.maxHp;
  b.enemy.quakesDone = 1;
  const after = seeded(() => {
    battle.hitEnemy(b, Math.round(b.enemy.maxHp * 0.05), "pure");
    return b;
  }, 0.99);
  assert.equal(after.enemy.quakesDone, 1);
  assert.equal(logHas(after, "теряет 20% ОЗ и бьёт по земле!"), false);
});
