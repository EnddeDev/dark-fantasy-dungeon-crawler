const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-monsters-"));
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

/** Фиксирует генератор: 0.99 — попадание героя и без уклонения; 0.01 — промах. */
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

/** Значения генератора по порядку: сначала бросок попадания, потом всё остальное. */
function sequenced(fn, values) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => (i < values.length ? values[i++] : 0.5);
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

function logHas(b, text) {
  return b.log.some((l) => l.text.includes(text));
}

/* ─── Крысиный рой ─── */

test("Крысиный рой: ниже половины ОЗ физический удар героя режется вдвое", () => {
  const full = fight("rat_swarm");
  const hpFull = full.enemy.hp;
  seeded(() => battle.hitEnemy(full, 20, "phys"), 0.01);
  const dmgFull = hpFull - full.enemy.hp;

  const low = fight("rat_swarm");
  low.enemy.hp = Math.floor(low.enemy.maxHp * 0.4);
  const hpLow = low.enemy.hp;
  seeded(() => battle.hitEnemy(low, 20, "phys"), 0.01);
  const dmgLow = hpLow - low.enemy.hp;

  assert.ok(dmgFull > 0 && dmgLow > 0, "оба удара попали");
  assert.ok(Math.abs(dmgLow - dmgFull / 2) <= 1, `ниже половины ОЗ урон ≈ половине (${dmgLow} против ${dmgFull})`);
  assert.ok(logHas(low, "Рой разлетается"), "разлёт описан в логе");
});

test("Крысиный рой: двойной выпад кусает третьей укусой, у других видов — два удара", () => {
  const swarm = fight("rat_swarm");
  const after = enemyMove(swarm, "multi");
  assert.ok(logHas(after, "кусает третьим"), "у роя три укуса");

  const other = fight("spider_hunter");
  const afterOther = enemyMove(other, "multi");
  assert.ok(!logHas(afterOther, "кусает третьим"), "у паука-охотника два удара");
});

/* ─── Гигантская крыса ─── */

test("Гигантская крыса: при кровотечении у героя её удары и приёмы сильнее на 25%", () => {
  const b = fight("rat_giant");
  const plain = battle.enemyExpectedMoveDamage(b, "attack");
  b.p.statuses.wound = 3;
  const bleeding = battle.enemyExpectedMoveDamage(b, "attack");
  assert.ok(plain > 0, "ожидаемый урон есть");
  /* Броня вычитается плоско уже после бонуса, поэтому итог меньше ×1.25, но растёт заметно. */
  assert.ok(bleeding > plain, `кровотечение усиливает удар (${bleeding} против ${plain})`);
  assert.ok(bleeding <= plain * 1.25 + 1, `не больше +25% (${bleeding} против ${plain})`);
});

/* ─── Гарпия ─── */

test("Гарпия: при атаке с шансом 25% наносит ещё один удар", () => {
  const hit = enemyMove(fight("harpy"), "attack", 0.1);
  assert.ok(logHas(hit, "срывается в повторную атаку"), "при низком броске второй удар есть");

  const miss = enemyMove(fight("harpy"), "attack", 0.9);
  assert.ok(!logHas(miss, "срывается в повторную атаку"), "при высоком броске второго удара нет");
});

test("Гарпия: промах героя с шансом 25% вызывает её ответный удар", () => {
  const b = fight("harpy");
  const missed = sequenced(() => battle.hitEnemy(b, 10, "phys"), [0.99, 0.99, 0.01]);
  assert.equal(missed, 0, "удар героя промахнулся");
  assert.ok(logHas(b, "срывается с места и бьёт в ответ"), "гарпия отвечает на промах");

  const other = fight("harpy");
  sequenced(() => battle.hitEnemy(other, 10, "phys"), [0.01, 0.01, 0.01]);
  assert.ok(!logHas(other, "срывается с места и бьёт в ответ"), "без промаха ответа нет");
});

/* ─── Паук-охотник ─── */

test("Паук-охотник: если герой уклонился от её удара, она бьёт ещё раз", () => {
  const dodged = fight("spider_hunter");
  dodged.p.statuses.evadeTurn = 1;
  const after = enemyMove(dodged, "attack", 0.5);
  assert.ok(logHas(after, "преследует уклонившегося героя"), "после уклонения преследует");

  const clean = enemyMove(fight("spider_hunter"), "attack", 0.5);
  assert.ok(!logHas(clean, "преследует уклонившегося героя"), "без уклонения не преследует");
});

/* ─── Волколак ─── */

test("Волколак: каждый третий ход — перевоплощение с лечением 5% макс. ОЗ", () => {
  let b = fight("werewolf");
  /* fight() переписывает очередь: ход врага, уже начатый в newBattle, не считаем. */
  b.enemy.turnsTaken = 0;
  const snaps = [];
  let lowAt3 = 0;
  for (let i = 0; i < 40 && snaps.length < 3; i++) {
    if (b.queue[b.idx] === "e") {
      snaps.push({ t: b.enemy.turnsTaken, rage: b.enemy.rageTurn === true, hp: b.enemy.hp });
      b = seeded(() => battle.enemyStep(b));
    } else {
      if (snaps.length === 2) {
        b.enemy.hp = Math.floor(b.enemy.maxHp * 0.5);
        lowAt3 = b.enemy.hp;
      }
      b = seeded(() => battle.playerAct(b, { type: "end_turn" }));
    }
  }
  assert.deepEqual(snaps.map((x) => x.t), [1, 2, 3], "каждый ход врага посчитан");
  assert.deepEqual(snaps.map((x) => x.rage), [false, false, true], "перевоплощение на третьем ходу");
  assert.ok(snaps[2].hp > lowAt3, "на третьем ходу лечится");
  assert.ok(logHas(b, "перевоплощается"), "перевоплощение в логе");
});

/* ─── Опутывание и выбраться ─── */

test("Опутывание: герой может только выбраться, на это уходит 25 выносливости", () => {
  let b = enemyMove(fight("spider_weaver"), "web", 0.99);
  assert.equal(b.p.statuses.webbed, 1, "герой опутан");
  assert.equal(b.queue[b.idx], "p", "ход героя");

  b.p.stamina = 30;
  const blocked = battle.playerAct(b, { type: "attack" });
  assert.equal(blocked.p.statuses.webbed, 1, "атака не сбрасывает паутину");
  assert.equal(blocked.queue[blocked.idx], "p", "ход остаётся у героя");
  assert.ok(logHas(blocked, "можно только выбраться"), "отказ описан");

  const freed = battle.playerAct(b, { type: "struggle" });
  assert.equal(freed.p.statuses.webbed, 0, "выбрался");
  assert.equal(battle.actionStaminaCost(b, { type: "struggle" }), 25, "выбраться стоит 25 выносливости");
  assert.equal(freed.queue[freed.idx], "e", "выбраться тратит ход");
});

test("Опутан без выносливости: выбраться нельзя, пропуск хода доступен", () => {
  const b = enemyMove(fight("spider_weaver"), "web", 0.99);
  b.p.stamina = 24;

  const stuck = battle.playerAct(b, { type: "struggle" });
  assert.equal(stuck.p.statuses.webbed, 1, "не выбрался при 24 выносливости");
  assert.ok(logHas(stuck, "Не хватает выносливости"), "нехватка описана");

  const passed = battle.playerAct(b, { type: "end_turn" });
  assert.equal(passed.queue[passed.idx], "e", "пропуск хода разрешён, когда выбраться не на что");
});

/* ─── Тролль-пещерник ─── */

test("Тролль: в начале своего хода регенерирует 5% макс. ОЗ", () => {
  const b = fight("troll");
  b.enemy.hp = Math.floor(b.enemy.maxHp * 0.5);
  const low = b.enemy.hp;
  const after = seeded(() => battle.playerAct(b, { type: "end_turn" }));
  assert.equal(after.enemy.hp, low + Math.round(after.enemy.maxHp * 0.05), "регенерация 5% макс. ОЗ");
});

test("Тролль: огонь или кислота останавливают регенерацию на 2 его хода", () => {
  const b = fight("troll");
  b.enemy.hp = Math.floor(b.enemy.maxHp * 0.5);
  seeded(() => battle.hitEnemy(b, 10, "phys", "", true, "fire"), 0.01);
  assert.equal(b.enemy.statuses.regenBlock, 2, "огонь ставит блок на 2 хода");

  /* Исход каждого начала хода врага пишется в лог: сначала два блока, потом регенерация. */
  let cur = b;
  for (let i = 0; i < 40 && cur.log.filter((l) => /Тролль-пещерник (не )?регенерирует/.test(l.text)).length < 3; i++) {
    if (cur.queue[cur.idx] === "e") cur = seeded(() => battle.enemyStep(cur));
    else cur = seeded(() => battle.playerAct(cur, { type: "end_turn" }));
  }
  const outcomes = cur.log.map((l) => l.text).filter((t) => /Тролль-пещерник (не )?регенерирует/.test(t));
  assert.ok(outcomes.length >= 3, "есть три начала хода врага");
  assert.ok(outcomes[0].includes("не регенерирует") && outcomes[1].includes("не регенерирует"), "два хода без регенерации");
  assert.ok(outcomes[2].includes("регенерирует") && !outcomes[2].includes("не регенерирует"), "потом регенерация возвращается");
});

/* ─── Харчок тролля ─── */

test("Харчок: яд на 3 раунда, и действия героя стоят +5 выносливости", () => {
  const b = enemyMove(fight("troll"), "spit", 0.99);
  assert.ok((b.p.statuses.poison ?? 0) > 0, "яд наложен");
  assert.equal(b.p.statuses.spit, 3, "надбавка держится 3 раунда");
  assert.equal(battle.actionStaminaCost(b, { type: "guard" }), 15, "защита 10 + 5");
  assert.equal(battle.attackStaminaCost(b), battle.attackStaminaCost({ ...b, p: { ...b.p, statuses: { ...b.p.statuses, spit: 0 } } }) + 5, "атака +5");
});

test("Харчок заканчивается после трёх ходов героя", () => {
  let b = fight("troll");
  /* Иначе тролль в своих лишних ходах снова выберет харчок и продлит надбавку. */
  b.enemy.def = { ...b.enemy.def, moves: ["attack"] };
  /* Запас здоровья: тролль в тесте бьёт в полную силу, а нам нужны только ходы героя. */
  b.p.hp = b.p.maxHp = 5000;
  b = enemyMove(b, "spit", 0.99);
  /* У врага в раунде может быть несколько ходов: ходы героя считаем, ходы врага проигрываем. */
  for (let turn = 0; turn < 3; turn++) {
    b = seeded(() => battle.playerAct(b, { type: "end_turn" }));
    let guard = 0;
    while (b.queue[b.idx] === "e" && !b.over && guard++ < 10) b = seeded(() => battle.enemyStep(b));
    if (turn < 2) assert.equal(b.p.statuses.spit, 2 - turn, `после хода героя ${turn + 1} осталось ${2 - turn}`);
  }
  assert.equal(b.p.statuses.spit ?? 0, 0, "надбавка снята после третьего хода героя");
});

/* ─── Матка глубины: яд от ударов героя ─── */

test("Матка: физический удар героя отравляет самого героя", () => {
  const b = fight("husk", 4);
  /* newBattle не знает id боссов: вид Матки подставляем из списка боссов. */
  b.enemy.def = { ...content.BOSSES.find((x) => x.id === "boss_queen") };
  b.enemy.hp = b.enemy.maxHp = 500;
  // 0.01 — попадание, 0.99 — бросок сопротивления яду проходит
  sequenced(() => battle.hitEnemy(b, 10, "phys", "", true), [0.01, 0.99, 0.99]);
  assert.ok((b.p.statuses.poison ?? 0) > 0, "удар по Матке даёт герою яд");
});

/* ─── Данные ─── */

test("Паук-ткач и Матка глубины знают приём опутывания", () => {
  const weaver = content.ENEMIES.find((x) => x.id === "spider_weaver");
  const queen = content.BOSSES.find((x) => x.id === "boss_queen");
  assert.ok(weaver.moves.includes("web"), "у паука-ткача есть опутывание");
  assert.ok(queen.moves.includes("web"), "у Матки есть опутывание");
  assert.ok(content.ENEMY_MOVE_META.web.name, "приём описан в кодексе");
});
