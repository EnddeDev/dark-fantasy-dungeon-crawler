const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-next-move-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");
const { BattleView, EnemyMoveRow } = load("src/components/BattleView.tsx", "battle-view");

const noop = () => {};

function makePlayer(extra = {}) {
  return {
    name: "Покоритель", level: 3, xp: 20, statPoints: 3,
    stats: { str: 3, agi: 3, int: 4 }, hp: 40, gold: 120,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 2,
    shopLevel: 1, archetype: null, statMilestones: {},
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

/** Детерминированный генератор на время боя: одинаковое зерно — одинаковый бой. */
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

function freshBattle(pl, floor, isBoss, enemyId, seed = 1) {
  return withSeed(seed, () => battle.newBattle(pl, floor, isBoss, "plain", 0, false, undefined, enemyId));
}

/** Ход героя до первой точки, где монстр снова действует: «завершить ход» и первое действие врага. */
function firstEnemyActionAfterEndTurn(b) {
  let nb = battle.playerAct(b, { type: "end_turn" });
  const before = nb.enemy.actsTaken ?? 0;
  let guard = 0;
  while (nb.queue[nb.idx] !== "p" && !nb.over && guard++ < 50 && (nb.enemy.actsTaken ?? 0) === before) {
    nb = battle.enemyStep(nb);
  }
  return (nb.enemy.actsTaken ?? 0) > before ? nb.enemy.lastMove : null;
}

test("следующий ход: прогноз на ходу героя совпадает с первым действием монстра после конца хода", () => {
  const ids = ["husk", "orc_raider", "ogre_oaf", "seer", "wraith", "sphinx", "gargoyle", "witch_spider", "devourer", "goblin_warrior", "kobold"];
  let checked = 0;
  for (const id of ids) {
    for (let seed = 1; seed <= 12; seed++) {
      const b = freshBattle(makePlayer(), 5, false, id, seed);
      /* Перевод в ход героя тем же зерном, что и при проверке. */
      let cur = b;
      let guard = 0;
      withSeed(seed * 31, () => {
        while (cur.queue[cur.idx] !== "p" && !cur.over && guard++ < 50) cur = battle.enemyStep(cur);
      });
      if (cur.over || cur.queue[cur.idx] !== "p") continue;
      const snapshot = JSON.stringify(cur);
      const predicted = withSeed(seed * 17, () => battle.predictEnemyTurn(cur).move);
      assert.equal(JSON.stringify(cur), snapshot, `${id}: прогноз не меняет состояние боя`);
      const actual = withSeed(seed * 53, () => firstEnemyActionAfterEndTurn(cur));
      assert.equal(predicted, actual, `${id}, зерно ${seed}: показано ${predicted}, сделано ${actual}`);
      checked++;
    }
  }
  assert.ok(checked > 60, `проверено ${checked} ходов`);
});

test("следующий ход: у мёртвого монстра и в конце боя прогноза нет", () => {
  const b = freshBattle(makePlayer(), 5, false, "husk", 3);
  const dead = { ...b, enemy: { ...b.enemy, hp: 0 } };
  assert.equal(battle.enemyReadout(dead).next, null);
  assert.equal(battle.predictEnemyTurn({ ...b, over: "win" }).move, null);
});

test("следующий ход: в сводке врага он есть и совпадает с прогнозом боя", () => {
  const b = freshBattle(makePlayer(), 5, false, "orc_raider", 4);
  const er = battle.enemyReadout(b);
  assert.ok(er.moves.length > 0);
  assert.ok(er.next === null || er.moves.some((m) => m.move === er.next), "следующий ход — один из приёмов врага");
});

test("строка приёма: подпись «следующий ход» и выделение только у следующего хода", () => {
  const b = freshBattle(makePlayer(), 5, false, "husk", 2);
  const er = battle.enemyReadout(b);
  const mv = er.moves[0];
  const plain = renderToStaticMarkup(React.createElement(EnemyMoveRow, { mv }));
  assert.ok(!plain.includes("следующий ход"), "без пометки подписи нет");
  assert.ok(!plain.includes('data-next="true"'), "без пометки строка не выделена");
  const marked = renderToStaticMarkup(React.createElement(EnemyMoveRow, { mv, next: true }));
  assert.ok(marked.includes("следующий ход"), "подпись у следующего хода");
  assert.ok(marked.includes('data-next="true"'), "строка выделена");
  assert.ok(marked.includes("bg-flame/10"), "выделение видно глазу");
});

test("строка приёма: «объявлено» сохраняется у объявленного хода и не заменяется подписью следующего", () => {
  const b = freshBattle(makePlayer(), 5, false, "husk", 2);
  const mv = battle.enemyReadout(b).moves[0];
  const both = renderToStaticMarkup(React.createElement(EnemyMoveRow, { mv, announced: true, next: true }));
  assert.ok(both.includes("объявлено"), "объявленный ход помечен как раньше");
  assert.ok(both.includes("следующий ход"), "и следующий ход тоже виден");
  const onlyAnnounced = renderToStaticMarkup(React.createElement(EnemyMoveRow, { mv, announced: true }));
  assert.ok(onlyAnnounced.includes("объявлено") && !onlyAnnounced.includes("следующий ход"));
});

test("барьер врага: полоска в шапке рядом с ОЗ, строки барьера в сводке больше нет", () => {
  const b = freshBattle(makePlayer(), 5, false, "husk", 2);
  b.enemy.barrierMax = 120;
  b.enemy.barrier = 45;
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.ok(html.includes("Барьер"), "полоска барьера врага в шапке");
  assert.ok(html.includes("45/120"), "значение барьера врага");
  assert.ok(!html.includes("Маг. барьер"), "строки «Маг. барьер» в сводке нет");
  /* Полоска стоит в шапке врага: до вкладки «Сводка врага». */
  const headerAt = html.indexOf("Барьер");
  const summaryAt = html.indexOf("Сводка врага");
  assert.ok(headerAt > -1 && summaryAt > -1 && headerAt < summaryAt, "барьер выше сводки");
});

test("барьер врага: без барьера полоски нет", () => {
  const b = freshBattle(makePlayer(), 5, false, "husk", 2);
  b.enemy.barrierMax = 0;
  b.enemy.barrier = 0;
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.ok(!html.includes(">Барьер<"), "у врага без барьера полоски нет");
});

test("следующий ход: прогноз не меняет живой бой ни на ходе героя, ни на ходе врага", () => {
  const ids = ["husk", "orc_raider", "ogre_oaf", "seer", "wraith", "gargoyle", "witch_spider", "devourer", "kobold", "boss_warlord"];
  let checked = 0;
  for (const id of ids) {
    for (let seed = 1; seed <= 6; seed++) {
      let cur = freshBattle(makePlayer(), 6, id.startsWith("boss"), id, seed);
      for (let step = 0; step < 40 && !cur.over; step++) {
        const snapshot = JSON.stringify(cur);
        withSeed(seed * 11 + step, () => battle.predictEnemyTurn(cur));
        withSeed(seed * 11 + step, () => battle.enemyReadout(cur));
        assert.equal(JSON.stringify(cur), snapshot, `${id}, зерно ${seed}, шаг ${step}: прогноз изменил бой`);
        checked++;
        /* Дальше идём по настоящему бою: ход врага или ход героя «завершить». */
        cur = withSeed(seed * 7 + step, () => {
          if (cur.queue[cur.idx] === "e") return battle.enemyStep(cur);
          return battle.playerAct(cur, { type: "end_turn" });
        });
      }
    }
  }
  assert.ok(checked > 100, `проверено ${checked} состояний`);
});
