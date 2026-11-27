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

test("Гоблин-разведчик: ниже 30% ОЗ отступает — ход пропущен, уклонение +25% на 2 хода", () => {
  const b = fight("goblin_scout");
  b.enemy.hp = Math.floor(b.enemy.maxHp * 0.2);
  const hpBefore = b.p.hp;
  const after = enemyMove(b, "attack", 0.99);
  assert.ok(logHas(after, "отступает в тень"), "отступление описано");
  assert.equal(after.p.hp, hpBefore, "в ход отступления героя не бьют");
  assert.equal(after.enemy.statuses.retreatEvade, 2, "уклонение на 2 хода");
  assert.equal(after.enemy.retreatUsed, true, "отступление отмечено");
});

test("Гоблин-разведчик: отступает только раз за бой", () => {
  const b = fight("goblin_scout");
  b.enemy.hp = Math.floor(b.enemy.maxHp * 0.2);
  const first = enemyMove(b, "attack", 0.99);
  const second = enemyMove(first, "attack", 0.99);
  const count = second.log.filter((l) => l.text.includes("отступает в тень")).length;
  assert.equal(count, 1, "второго отступления нет");
});

test("Гоблин-разведчик: промах героя по нему — следующий удар критический", () => {
  const b = fight("goblin_scout");
  // Точность 0 — гарантированный промах по мишени.
  seeded(() => battle.hitEnemy(b, 10, "phys", "", true, undefined, 0), 0.5);
  assert.equal(b.enemy.critNext, true, "промах взводит крит на следующий удар");
  const after = enemyMove(b, "attack", 0.5);
  assert.ok(logHas(after, "критический удар"), "следующий удар критический");
  assert.equal(after.enemy.critNext, false, "флаг снимается после удара");
});

/* ─── Кобольд-рудокоп: злость на шум ─── */

test("Кобольд: каждое действие героя копит злость", () => {
  const b = fight("kobold");
  const after = seeded(() => battle.playerAct(b, { type: "end_turn" }));
  assert.equal(after.enemy.noise, 1, "одно действие героя — одна единица шума");
});

test("Кобольд: злость усиливает удар — при двух единицах шума урон больше", () => {
  const calm = fight("kobold");
  calm.enemy.noise = 0;
  const loud = fight("kobold");
  loud.enemy.noise = 2;
  const calmAfter = enemyMove(calm, "attack", 0.99);
  const loudAfter = enemyMove(loud, "attack", 0.99);
  const dCalm = calm.p.hp - calmAfter.p.hp;
  const dLoud = loud.p.hp - loudAfter.p.hp;
  assert.ok(dCalm > 0 && dLoud > 0, "оба удара попали");
  assert.ok(dLoud > dCalm, `злость усиливает удар (${dLoud} против ${dCalm})`);
});

/* ─── Гоблин-воин: два удара после попадания, потом перезарядка атаки ─── */

test("Гоблин-воин: попал — ещё два удара в этот ход и обычная атака на перезарядке", () => {
  const b = fight("goblin_warrior");
  const hpBefore = b.p.hp;
  const after = enemyMove(b, "attack", 0.99);
  assert.ok(logHas(after, "ещё два удара"), "дополнительные удары описаны");
  assert.ok(after.p.hp < hpBefore, "герой получил урон");
  assert.equal(after.enemy.moveUntil.attack, after.round + 3, "атака на перезарядке два хода");
  assert.equal(battle.enemyMoveCooldownLeft(after, "attack"), 3, "перезарядка видна движку");
});

test("Гоблин-воин: промах героя — дополнительных ударов нет", () => {
  const b = fight("goblin_warrior");
  const after = enemyMove(b, "attack", 0.01);
  assert.ok(!logHas(after, "разгоняется"), "без попадания лишних ударов нет");
  assert.equal(after.enemy.moveUntil?.attack ?? 0, 0, "перезарядки нет");
});

test("Гоблин-воин: пока атака на перезарядке, он её не выбирает", () => {
  const b = fight("goblin_warrior");
  b.enemy.moveUntil = { attack: b.round + 3 };
  for (let i = 0; i < 30; i++) {
    assert.notEqual(battle.chooseEnemyMove(b), "attack", "обычная атака не выбирается");
  }
});

/* ─── Орк-налётчик: подготовка ─── */

test("Орк: без подготовки уклонение героя спасает от удара", () => {
  const b = fight("orc_raider");
  b.enemy.actsTaken = 1; // не первый ход: в первый ход орк готовится
  b.p.guard = false;
  const hpBefore = b.p.hp;
  const after = enemyMove(b, "attack", 0.01);
  assert.equal(after.p.hp, hpBefore, "уклонение срабатывает");
});

test("Орк: подготовка — следующий удар не промахивается, если герой не в защите", () => {
  const b = fight("orc_raider");
  b.p.guard = false;
  const prepared = enemyMove(b, "prepare", 0.99);
  assert.equal(prepared.enemy.statuses.prepRounds, 1, "подготовка держится до следующего удара врага");
  const hpBefore = prepared.p.hp;
  // Сначала ход героя, потом удар врага: бросок уклонения 0.01 не должен спасти.
  const hit = seeded(() => battle.playerAct(prepared, { type: "end_turn" }));
  const after = enemyMove(hit, "attack", 0.01);
  assert.ok(after.p.hp < hpBefore, "удар попал несмотря на уклонение");
});

test("Орк: подготовка не работает, если герой ушёл в защиту", () => {
  const b = fight("orc_raider");
  b.p.guard = false;
  const prepared = enemyMove(b, "prepare", 0.99);
  /* Защиту герой ставит в свой ход; она сбрасывается в начале его следующего хода. */
  prepared.p.guard = true;
  const hpBefore = prepared.p.hp;
  const after = enemyMove(prepared, "attack", 0.01);
  assert.equal(after.p.hp, hpBefore, "в защите удар может уклониться, как обычно");
});

/* ─── Огр-тупица: тупая хитрость ─── */

test("Огр: замах тупой хитростью, в следующий ход — удар; перезарядка 3 раунда", () => {
  const b = fight("ogre_oaf");
  b.enemy.actsTaken = 1; // замах доступен со второго хода
  const wound = enemyMove(b, "trick", 0.99);
  assert.equal(wound.enemy.statuses.trickWindup, 1, "замах готов");
  assert.equal(battle.enemyMoveCooldownLeft(wound, "trick"), 3, "перезарядка три раунда");
  assert.ok(logHas(wound, "замахивается"), "замах описан");
});

test("Огр: удар после замаха без защиты — урон ×3", () => {
  const b = fight("ogre_oaf");
  b.p.guard = false;
  b.enemy.statuses.trickWindup = 1;
  const after = enemyMove(b, "attack", 0.01); // 0.01 < 0.5 — ветка атаки
  assert.ok(logHas(after, "урон ×3"), "без защиты удар ×3");
  assert.equal(after.enemy.statuses.trickWindup, 0, "замах израсходован");
});

test("Огр: удар после замаха в защите — урон ×2", () => {
  const b = fight("ogre_oaf");
  b.p.guard = true;
  b.enemy.statuses.trickWindup = 1;
  const after = enemyMove(b, "attack", 0.01);
  assert.ok(logHas(after, "урон ×2"), "в защите удар ×2");
});

test("Огр: камень без защиты — половина урона и оглушение на 1 ход", () => {
  const b = fight("ogre_oaf");
  b.p.guard = false;
  b.enemy.statuses.trickWindup = 1;
  const after = enemyMove(b, "attack", 0.99); // 0.99 ≥ 0.5 — ветка камня
  assert.ok(logHas(after, "урон пополам"), "камень без защиты режет урон");
  assert.equal(after.p.statuses.stunAp, 1, "оглушение на 1 ход");
});

test("Огр: камень в защиту — урон полный и оглушение на 2 хода", () => {
  const b = fight("ogre_oaf");
  b.p.guard = true;
  b.enemy.statuses.trickWindup = 1;
  const after = enemyMove(b, "attack", 0.99);
  assert.ok(!logHas(after, "урон пополам"), "в защите урон не делится");
  assert.equal(after.p.statuses.stunAp, 2, "оглушение на 2 хода");
});

/* ─── Тёмный жрец: магический барьер и отражение ─── */

test("Тёмный жрец: магический барьер 5 × уровень", () => {
  const b = fight("dark_priest");
  assert.equal(b.enemy.barrier, 5 * b.enemy.level, "барьер 5 × уровень");
  assert.equal(b.enemy.barrierMax, 5 * b.enemy.level, "максимум барьера тот же");
});

test("Тёмный жрец: 20% полученного урона возвращается герою", () => {
  const b = fight("dark_priest");
  b.enemy.barrier = 0;
  const hpEnemy = b.enemy.hp;
  const hpHero = b.p.hp;
  seeded(() => battle.hitEnemy(b, 50, "phys"), 0.01);
  const enemyLoss = hpEnemy - b.enemy.hp;
  const heroLoss = hpHero - b.p.hp;
  assert.ok(enemyLoss > 0, "жрец получил урон");
  assert.ok(heroLoss > 0, "часть урона вернулась герою");
  assert.ok(heroLoss < enemyLoss, "возврат меньше полученного урона");
  assert.ok(logHas(b, "возвращает часть урона"), "отражение описано");
});

test("Тёмный жрец: барьер поглощает удар первым, отражение считается от всего урона", () => {
  const b = fight("dark_priest");
  b.enemy.barrier = 500;
  const hpEnemy = b.enemy.hp;
  const hpHero = b.p.hp;
  seeded(() => battle.hitEnemy(b, 50, "phys"), 0.01);
  assert.equal(b.enemy.hp, hpEnemy, "барьер принял удар целиком");
  assert.ok(b.p.hp < hpHero, "отражение всё равно идёт герою");
});

test("Гоблин-разведчик: уклонение после отступа тает на ходах героя", () => {
  const b = fight("goblin_scout");
  b.enemy.statuses.retreatEvade = 2;
  const once = seeded(() => battle.playerAct(b, { type: "end_turn" }));
  assert.equal(once.enemy.statuses.retreatEvade, 1, "после первого хода героя — один ход уклонения");
});

/* ─── Расписание: орк готовится в первый ход, огр замахивается со второго ─── */

test("Орк: в первый свой ход подготавливается, даже если объявлен другой приём", () => {
  const b = fight("orc_raider");
  const after = enemyMove(b, "attack", 0.99);
  assert.equal(after.enemy.statuses.prepRounds, 1, "первый ход орка — подготовка");
  assert.ok(logHas(after, "готовится"), "подготовка описана");
});

test("Огр: в первый свой ход не замахивается, даже если объявлена тупая хитрость", () => {
  const b = fight("ogre_oaf");
  const first = enemyMove(b, "trick", 0.99);
  assert.ok(!(first.enemy.statuses.trickWindup > 0), "на первом ходу замаха нет");
  assert.equal(first.enemy.actsTaken, 1, "первый ход засчитан");
});

test("Огр: со второго своего хода замахивается тупой хитростью", () => {
  const b = fight("ogre_oaf");
  const first = enemyMove(b, "attack", 0.99);
  const second = enemyMove(first, "attack", 0.99);
  assert.equal(second.enemy.statuses.trickWindup, 1, "на втором ходу замах");
  assert.ok(logHas(second, "замахивается"), "замах описан");
});
