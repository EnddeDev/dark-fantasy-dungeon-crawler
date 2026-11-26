const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-undead-"));
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

/** Бой с врагом нужного вида. Вид подменяется у обычного монстра, чтобы не зависеть от жребия. */
function fight(id, floor = 3) {
  const b = battle.newBattle(hero(), floor, false, "classic", 0, 0, "normal", id);
  b.enemy.hp = 1;
  b.torchTurns = 99;
  b.queue = ["p", "e"];
  b.idx = 0;
  return b;
}

/** Герой добивает врага обычной атакой: так срабатывает перерождение. */
function killWithAttack(b) {
  return seeded(() => battle.playerAct(b, { type: "attack", kind: "normal" }), 0.01);
}

/** Фиксирует генератор: 0.5 — попадание и без сопротивления. */
function seeded(fn, value = 0.5) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

test("Гнилой ходок: при перерождении накладывает яд на героя", () => {
  const b = fight("husk");
  const after = killWithAttack(b);
  assert.equal(after.enemy.revived, true, "перерождение состоялось");
  assert.ok(after.p.statuses.poison > 0, "яд наложен");
  assert.ok(after.log.some((l) => l.text.includes("яд на 3 хода")), "в логе описан яд");
});

test("Смотритель Катакомб: перерождение накладывает проклятие на героя", () => {
  const b = fight("husk");
  const boss = content.BOSSES.find((x) => x.id === "boss_warden");
  b.enemy.def = { ...boss };
  const after = killWithAttack(b);
  assert.ok(after.enemy.revived, "перерождение состоялось");
  assert.ok(after.p.statuses.curse > 0, "проклятие наложено");
});

test("Скелет-страж: каждый третий удар героя полностью блокируется", () => {
  const b = fight("skeleton_guard");
  b.enemy.heroHits = 2;
  const hp0 = b.enemy.hp = 500;
  const dealt = seeded(() => battle.hitEnemy(b, 40, "phys"));
  assert.equal(dealt, 0, "третий удар не наносит урона");
  assert.equal(b.enemy.hp, hp0, "здоровье не меняется");
  assert.ok(b.log.some((l) => l.text.includes("полностью блокирует")), "в логе отмечен блок");
});

test("Архиерей: маг. барьер поглощает удар, а снятый барьер накладывает проклятие", () => {
  const b = fight("husk");
  b.enemy.def = { ...content.BOSSES.find((x) => x.id === "boss_prelate") };
  b.enemy.hp = 500;
  b.enemy.barrier = 50;
  b.enemy.barrierMax = 50;
  seeded(() => battle.hitEnemy(b, 30, "phys"));
  assert.equal(b.enemy.hp, 500, "барьер поглотил весь удар");
  assert.ok(b.enemy.barrier < 50 && b.enemy.barrier > 0, "барьер ослаблен, но не снят");
  seeded(() => battle.hitEnemy(b, 200, "phys"));
  assert.equal(b.enemy.barrier, 0, "барьер снят");
  assert.ok(b.enemy.hp < 500, "остаток удара пошёл в здоровье");
  assert.ok(b.p.statuses.curse > 0, "снятый барьер накладывает проклятие");
});

test("Владыка Урны: барьер восстанавливается до 50 в начале его хода", () => {
  const b = fight("husk");
  b.enemy.def = { ...content.BOSSES.find((x) => x.id === "boss_lich") };
  b.enemy.hp = 500;
  b.enemy.barrier = 0;
  b.enemy.barrierMax = 50;
  b.queue = ["p", "e"];
  b.idx = 0;
  const after = battle.playerAct(b, { type: "end_turn" });
  assert.equal(after.queue[after.idx], "e", "ход героя окончен");
  assert.equal(after.enemy.barrier, 50, "барьер восстановлен в начале хода врага");
});

test("Владыка Урны: барьер не растёт сверх 50", () => {
  const b = fight("husk");
  b.enemy.def = { ...content.BOSSES.find((x) => x.id === "boss_lich") };
  b.enemy.hp = 500;
  b.enemy.barrier = 30;
  b.enemy.barrierMax = 50;
  b.queue = ["p", "e"];
  b.idx = 0;
  const after = battle.playerAct(b, { type: "end_turn" });
  assert.equal(after.enemy.barrier, 50);
});

test("Владыка Урны: барьер не восстанавливается у Архиерея", () => {
  const b = fight("husk");
  b.enemy.def = { ...content.BOSSES.find((x) => x.id === "boss_prelate") };
  b.enemy.hp = 500;
  b.enemy.barrier = 0;
  b.enemy.barrierMax = 50;
  b.queue = ["p", "e"];
  b.idx = 0;
  const after = battle.playerAct(b, { type: "end_turn" });
  assert.equal(after.enemy.barrier, 0, "у Архиерея барьер не возвращается");
});

test("Лич-хранитель: перерождение сбрасывает перезарядки и заканчивает ход героя", () => {
  const b = fight("lich_tender");
  b.enemy.specialCooldown = 99;
  b.enemy.barrier = 0;
  const after = killWithAttack(b);
  assert.equal(after.enemy.revived, true, "перерождение состоялось");
  assert.equal(after.enemy.specialCooldown, 0, "перезарядки сброшены");
  assert.equal(after.queue[after.idx], "e", "ход героя окончен после перерождения");
});

test("Древний полководец: без дебаффа перерождения и с бронёй на 3 хода", () => {
  const b = fight("bone_warlord", 9);
  const after = killWithAttack(b);
  assert.equal(after.enemy.revived, false, "дебаффа перерождения нет");
  assert.equal(after.enemy.warlordArmor, 20 + 2 * after.enemy.level, "броня 20 + 2 × уровень");
  assert.equal(after.enemy.warlordArmorTurns, 3);
  assert.ok(battle.enemyArmorNow(after.enemy) >= after.enemy.warlordArmor, "броня учитывается");
  /* Три хода героя: броня спадает. */
  let cur = after;
  for (let i = 0; i < 3; i++) {
    cur.queue = ["p", "e"];
    cur.idx = 0;
    cur = battle.playerAct(cur, { type: "end_turn" });
    cur.queue = ["p", "e"];
    cur.idx = 0;
  }
  assert.equal(cur.enemy.warlordArmor, 0, "через три хода броня пропала");
});

test("Мёртвый Маршал: угаданный тип действия — контрудар и конец хода героя", () => {
  const b = fight("husk");
  b.enemy.guessAction = "attack";
  const after = seeded(() => battle.playerAct(b, { type: "attack", kind: "normal" }));
  assert.ok(after.log.some((l) => l.text.includes("угадал твой ход")), "в логе есть контрудар");
  assert.equal(after.enemy.guessAction, null, "загадывание сброшено");
  assert.equal(after.queue[after.idx], "e", "ход героя окончен");
});

test("Мёртвый Маршал: другой тип действия не считается угаданным", () => {
  const b = fight("husk");
  b.enemy.guessAction = "guard";
  const after = seeded(() => battle.playerAct(b, { type: "attack", kind: "normal" }));
  assert.ok(!after.log.some((l) => l.text.includes("угадал твой ход")));
  assert.equal(after.enemy.guessAction, "guard", "загадывание остаётся");
});

test("Скелет-лучник: огненная стрела в подсказке больше обычной атаки", () => {
  const b = fight("skeleton_archer", 3);
  const arrow = battle.enemyExpectedMoveDamage(b, "fire_arrow");
  const plain = battle.enemyExpectedMoveDamage(b, "attack");
  assert.ok(arrow > plain, `огненная стрела ${arrow} > атака ${plain}`);
});

test("Скелет-лучник: огненная стрела накладывает горение", () => {
  let burned = false;
  for (let seed = 1; seed <= 60 && !burned; seed++) {
    const b = fight("skeleton_archer", 3);
    b.enemy.announced = "fire_arrow";
    b.queue = ["e", "p"];
    b.idx = 0;
    b.p.statuses.burn = 0;
    const r = seeded(() => battle.enemyStep(b), (seed * 7919 % 100) / 100);
    if (r.p.statuses.burn > 0) burned = true;
  }
  assert.ok(burned, "горение наложено хотя бы в одном из бросков");
});

test("Скелет-страж: заблокированный удар поднимает броню на 2 × уровень", () => {
  const b = fight("skeleton_guard");
  b.enemy.heroHits = 2;
  b.enemy.hp = 500;
  const before = battle.enemyArmorNow(b.enemy);
  seeded(() => battle.hitEnemy(b, 40, "phys"));
  assert.equal(b.enemy.blockArmor, 2 * b.enemy.level, "броня выросла на 2 × уровень");
  assert.equal(battle.enemyArmorNow(b.enemy), before + 2 * b.enemy.level, "новая броня учитывается");
});

test("Гнилой ходок: в начале своего хода теряет 2 × уровень ОЗ и столько же магического урона наносит герою", () => {
  const b = fight("husk");
  b.enemy.hp = 500;
  b.p.hp = 300;
  b.queue = ["p", "e"];
  b.idx = 0;
  const after = seeded(() => battle.playerAct(b, { type: "end_turn" }));
  assert.equal(after.enemy.hp, 500 - 2 * after.enemy.level, "враг потерял 2 × уровень ОЗ");
  assert.ok(after.p.hp < 300, "герой получил магический урон");
  assert.ok(after.log.some((l) => l.text.includes("выплёскивает гниль")), "в логе описан удар");
});

test("Скелет-лучник: метка — два следующих хода монстр не промахивается", () => {
  const b = fight("skeleton_archer", 3);
  b.enemy.announced = "mark";
  b.queue = ["e", "p"];
  b.idx = 0;
  const after = seeded(() => battle.enemyStep(b));
  assert.equal(after.enemy.statuses.markRounds, 2, "метка держится два следующих хода");
  /* Уклонение героя не спасает от удара под меткой. */
  const hitNoMark = fight("skeleton_archer", 3);
  hitNoMark.queue = ["e", "p"];
  hitNoMark.idx = 0;
  hitNoMark.p.statuses.dodgeNext = 5;
  assert.equal(battle.incoming(hitNoMark, 10, "phys", "удар"), false, "без метки уклонение срабатывает");
  const marked = fight("skeleton_archer", 3);
  marked.queue = ["e", "p"];
  marked.idx = 0;
  marked.p.statuses.dodgeNext = 5;
  marked.enemy.statuses.markRounds = 2;
  assert.equal(battle.incoming(marked, 10, "phys", "удар"), true, "под меткой удар проходит");
});

test("Лич-хранитель: барьер 10 × уровень и магические удары", () => {
  const b = battle.newBattle(hero(), 3, false, "classic", 0, 0, "normal", "lich_tender");
  assert.equal(b.enemy.barrier, 10 * b.enemy.level, "барьер 10 × уровень");
  assert.equal(b.enemy.barrierMax, 10 * b.enemy.level);
  /* Уклонение работает против физических ударов, но не против магических. */
  const lich = fight("lich_tender", 3);
  lich.queue = ["e", "p"];
  lich.idx = 0;
  lich.p.statuses.evadeTurn = 5;
  assert.equal(battle.incoming(lich, 10, "phys", "удар"), true, "удар лича магический: уклонение не спасает");
  const other = fight("husk", 3);
  other.queue = ["e", "p"];
  other.idx = 0;
  other.p.statuses.evadeTurn = 5;
  assert.equal(battle.incoming(other, 10, "phys", "удар"), false, "обычный монстр физический, уклонение работает");
});

test("Владыка Урны и Архиерей: барьер виден в сводке врага, у обычного врага строки нет", () => {
  const lich = fight("husk");
  lich.enemy.def = { ...lich.enemy.def, id: "boss_lich" };
  lich.enemy.barrier = 50;
  lich.enemy.barrierMax = 50;
  const rLich = battle.enemyReadout(lich);
  assert.equal(rLich.barrier, 50, "барьер в сводке");
  assert.equal(rLich.barrierMax, 50, "максимум барьера в сводке");
  const plain = battle.enemyReadout(fight("husk"));
  assert.equal(plain.barrierMax, 0, "у обычного монстра барьера нет");
});

test("Мёртвый Маршал: загадывание не раскрывает тип действия в логе", () => {
  const b = fight("husk");
  b.enemy.def = { ...b.enemy.def, id: "boss_warlord" };
  b.enemy.guessAction = null;
  /* Конец хода героя без действия врага: начинается новый раунд, и Маршал загадывает. */
  b.queue = ["p"];
  b.idx = 0;
  const started = seeded(() => battle.playerAct(b, { type: "end_turn" }));
  const line = started.log.map((l) => l.text).find((t) => t.includes("загадывает"));
  assert.ok(line, "загадывание описано");
  assert.ok(!/ты применишь/.test(line), "тип действия не назван");
  assert.ok(!/атаку|защиту|приём/.test(line), "тип действия не назван словом");
});
