const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-thinking-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: ["react", "react-dom", "react/jsx-runtime"] });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

function hero(extra = {}) {
  return { ...PlayerFactory.createInitial(), pouch: [null, null, null, null, null], ...extra };
}

/** Бой с заданным набором ходов врага. Монстр фиксирован, чтобы не зависеть от жребия. */
function fixture(moves, hpShare = 1) {
  const b = battle.newBattle(hero({ hp: 300 }), 3, false, "classic", 0, 0, "normal", "husk");
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong", moves: [...moves], passive: null };
  b.enemy.moves = [...moves];
  b.enemy.passive = null;
  b.enemy.announced = null;
  b.enemy.specialCooldown = 0;
  b.enemy.hp = Math.max(1, Math.round(b.enemy.maxHp * hpShare));
  b.queue = ["e", "p"];
  b.idx = 0;
  return b;
}

/** Детерминированный генератор на время блока. */
function withSeed(seed, fn) {
  const orig = Math.random;
  let s = seed;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

test("раненый монстр защищается, здоровый — не тратит ход на стойку", () => {
  /* Печать атаки не даёт урона, поэтому её вес — от обычной атаки; стойка у здорового почти ничего не весит. */
  const hurt = fixture(["guard", "seal_attack"], 0.3);
  assert.equal(battle.chooseEnemyMove(hurt), "guard", "при низком ОЗ стойка лучше бесполезного приёма");
  const healthy = fixture(["guard", "seal_attack"], 1);
  assert.equal(battle.chooseEnemyMove(healthy), "seal_attack", "здоровый монстр не защищается зря");
});

test("приём, который накладывает уже висящий статус, не повторяется", () => {
  /* Проклятие бьёт сильнее обычной атаки (≈30 против ≈15), пока на герое его нет. */
  const fresh = fixture(["curse", "attack"], 1);
  assert.equal(battle.chooseEnemyMove(fresh), "curse");
  const cursed = fixture(["curse", "attack"], 1);
  cursed.p.statuses.curse = 3;
  assert.equal(battle.chooseEnemyMove(cursed), "attack", "проклятие уже есть — выбирается обычный удар");
});

test("при полной защите героя дебаффы не выбираются, берётся обычный удар", () => {
  const b = fixture(["curse", "attack"], 1);
  b.p.statuses.fullGuard = 2;
  assert.equal(battle.chooseEnemyMove(b), "attack");
});

test("обычный монстр заранее объявляет сокрушительный удар в начале раунда", () => {
  let announced = 0;
  for (let seed = 1; seed <= 40; seed++) {
    withSeed(seed, () => {
      const b = battle.newBattle(hero({ hp: 300 }), 3, false, "classic", 0, 0, "normal", "husk");
      if (!b.enemy.announced) return;
      announced += 1;
      assert.equal(b.enemy.announced, "heavy", "объявляется только сокрушительный удар");
      assert.equal(battle.enemyReadout(b).announced, "heavy", "подсказка показывает объявленный ход");
      assert.ok(b.log.some((l) => l.text.includes("готовит сокрушительный удар")), "игрок видит объявление в логе");
    });
  }
  assert.ok(announced > 0, "хотя бы в одном бою монстр объявил удар");
});

test("объявленный ход не выполняется, если враг запечатан", () => {
  const b = fixture(["heavy", "attack"], 1);
  b.enemy.announced = "heavy";
  b.enemy.statuses.sealMoves = 1;
  const before = b.log.length;
  const after = battle.enemyStep(b);
  const fresh = after.log.slice(before).map((l) => l.text);
  assert.ok(!fresh.some((t) => t.includes("обрушивает сокрушительный")), "запечатанный монстр не бьёт объявленным ударом");
});

test("тот же приём два хода подряд не выбирается, если есть другой", () => {
  const b = fixture(["heavy", "wound"], 1);
  assert.equal(battle.chooseEnemyMove(b), "heavy", "без истории берётся самый сильный приём");
  b.enemy.lastMove = "heavy";
  for (let i = 0; i < 20; i++) {
    assert.equal(battle.chooseEnemyMove(b), "wound", "после тяжёлого удара — другой приём");
  }
});

test("обычная атака повторяется подряд", () => {
  const b = fixture(["attack"], 1);
  b.enemy.lastMove = "attack";
  assert.equal(battle.chooseEnemyMove(b), "attack");
});

test("если других приёмов нет, повтор остаётся, чтобы монстр не стоял", () => {
  const b = fixture(["heavy"], 1);
  b.enemy.lastMove = "heavy";
  assert.equal(battle.chooseEnemyMove(b), "heavy");
});

test("ход врага запоминается и объявленный повтор не выполняется", () => {
  const b = fixture(["heavy", "attack"], 1);
  b.enemy.lastMove = "heavy";
  b.enemy.announced = "heavy";
  const before = b.log.length;
  const after = battle.enemyStep(b);
  const fresh = after.log.slice(before).map((l) => l.text);
  assert.ok(!fresh.some((t) => t.includes("обрушивает сокрушительный")), "объявленный повтор отменяется");
  assert.notEqual(after.enemy.lastMove, "heavy", "ход записан и он не тяжёлый");
  assert.equal(after.enemy.lastMove, "attack", "вместо повтора выбрана обычная атака");
});

test("новый бой начинается без истории хода", () => {
  const b = battle.newBattle(hero({ hp: 300 }), 3, false, "classic", 0, 0, "normal", "husk");
  assert.equal(b.enemy.lastMove, null);
});
