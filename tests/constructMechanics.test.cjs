const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-construct-"));
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

/** Бой с врагом нужного вида; герой ходит первым. */
function fight(id, floor = 3) {
  /* Создание боя тасует очередь и задаёт ОЗ монстра случайно: фиксируем, чтобы тест не зависел от запуска. */
  const b = seeded(() => battle.newBattle(hero(), floor, false, "classic", 0, 0, "normal", id));
  b.torchTurns = 99;
  b.queue = ["p", "e"];
  b.idx = 0;
  return b;
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

/** Бой с боссом: id боссов нет в обычном списке, поэтому вид подменяется, как в тестах нежити. */
function bossFight(id, floor = 8) {
  const b = fight("husk", floor);
  b.enemy.def = { ...content.BOSSES.find((x) => x.id === id) };
  b.enemy.hp = b.enemy.maxHp = 500;
  return b;
}

/** Ход врага с заранее объявленным приёмом. */
function enemyMove(b, move, value = 0.5) {
  b.enemy.announced = move;
  b.queue = ["e", "p"];
  b.idx = 0;
  return seeded(() => battle.enemyStep(b), value);
}

/* ─── Страж из шлака ─── */

test("Страж из шлака: «Накал шлака» держится 3 хода и вдвое снижает броню", () => {
  const b = fight("golem");
  const armor0 = battle.enemyArmorNow(b.enemy);
  b.enemy.statuses.heat = 3;
  assert.equal(battle.enemyArmorNow(b.enemy), Math.round(armor0 * 0.5), "броня вдвое ниже");
  const after = enemyMove(b, "heat");
  assert.equal(after.enemy.statuses.heat, 2, "эффект тикает в конце хода врага: 3 хода всего");
  assert.ok(after.log.some((l) => l.text.includes("накаляет шлак")), "приём описан в логе");
});

test("Страж из шлака: каждая атака во время накала добавляет огонь 5 × уровень", () => {
  const b = fight("golem");
  b.enemy.statuses.heat = 3;
  const after = enemyMove(b, "attack", 0.99);
  assert.ok(after.log.some((l) => l.text.includes("жжёт огнём раскалённого шлака")), "огненный удар в логе");
  const dealt = after.log.filter((l) => l.text.includes("жжёт огнём")).length;
  assert.equal(dealt, 1, "огонь добавляется один раз за атаку");
});

test("Страж из шлака: без накала огненного удара нет", () => {
  const b = fight("golem");
  const after = enemyMove(b, "attack", 0.99);
  assert.ok(!after.log.some((l) => l.text.includes("жжёт огнём")), "огня нет");
});

/* ─── Слизь ─── */

test("Слизь: физическое сопротивление 2% + 1% за уровень (магия не режется)", () => {
  const b = fight("slime");
  b.enemy.hp = 500;
  /* Тот же бой, но с другим видом того же рода: отличие только в слизи. */
  const other = JSON.parse(JSON.stringify({ ...b, enemy: { ...b.enemy, def: { ...b.enemy.def, id: "sporeling" } } }));
  const slimePhys = battle.damageAfterEnemyDefense(b, 100, "phys");
  const otherPhys = battle.damageAfterEnemyDefense(other, 100, "phys");
  assert.ok(slimePhys < otherPhys, `слизь режет физику: ${slimePhys} < ${otherPhys}`);
  const slimeMagic = battle.damageAfterEnemyDefense(b, 100, "magic");
  const otherMagic = battle.damageAfterEnemyDefense(other, 100, "magic");
  assert.equal(slimeMagic, otherMagic, "магия без сопротивления слизи");
});

test("Слизь: регенерирует в начале своего хода 1% + 1% за уровень от макс. ОЗ", () => {
  const b = fight("slime");
  b.enemy.hp = Math.floor(b.enemy.maxHp / 2);
  const hp0 = b.enemy.hp;
  const after = seeded(() => battle.playerAct(b, { type: "end_turn" }));
  const want = Math.max(1, Math.round(after.enemy.maxHp * (0.01 + 0.01 * after.enemy.level)));
  assert.equal(after.enemy.hp, Math.min(after.enemy.maxHp, hp0 + want), "регенерация от макс. ОЗ обходит запрет лечения конструктов");
  assert.ok(after.log.some((l) => l.text.includes("регенерирует")), "регенерация в логе");
});

/* ─── Мимик-малыш ─── */

test("Мимик-малыш: до первого урона не делает действий", () => {
  const b = fight("mimic_larva");
  assert.equal(b.enemy.dormant, true, "спит в начале боя");
  const hp0 = b.p.hp;
  const after = enemyMove(b, "heavy");
  assert.equal(after.p.hp, hp0, "герой не получает урона");
  assert.equal(after.enemy.dormant, true, "остаётся спящим");
  assert.equal(after.queue[after.idx], "p", "ход врага проходит без действий");
});

test("Мимик-малыш: первый удар будит, контратакует и заканчивает ход героя", () => {
  const b = fight("mimic_larva");
  b.enemy.hp = 500;
  const after = seeded(() => battle.playerAct(b, { type: "attack", kind: "normal" }));
  assert.equal(after.enemy.dormant, false, "проснулся");
  assert.ok(after.log.some((l) => l.text.includes("раскрывается и контратакует")), "контратака в логе");
  assert.equal(after.queue[after.idx], "e", "ход героя окончен, ход врага следует");
  assert.equal(after.queue.filter((x) => x === "e").length, b.queue.filter((x) => x === "e").length, "ход врага не добавлен в очередь");
});

/* ─── Мимик-сундук и старший мимик: «Засада» ─── */

test("Мимик-сундук: «Засада» — первый ход всегда за ним", () => {
  const b = battle.newBattle(hero(), 5, false, "classic", 0, 0, "normal", "mimic_chest");
  assert.equal(b.queue[0], "e", "очередь начинается с мимика");
  assert.equal(b.enemy.ambushFirst, true);
});

test("Мимик-сундук: от засадной атаки нельзя уклониться", () => {
  const b = fight("mimic_chest");
  b.queue = ["e", "p"];
  b.idx = 0;
  b.enemy.ambushLive = true;
  b.p.statuses.evadeTurn = 5;
  b.p.statuses.dodgeNext = 5;
  assert.equal(battle.incoming(b, 10, "phys", "удар сундука"), true, "удар проходит без уклонения");
});

test("Мимик-сундук: вне засадной атаки уклонение работает", () => {
  const b = fight("mimic_chest");
  b.queue = ["e", "p"];
  b.idx = 0;
  b.enemy.ambushLive = false;
  b.p.statuses.evadeTurn = 5;
  assert.equal(battle.incoming(b, 10, "phys", "удар сундука"), false, "уклонение срабатывает");
});

test("Мимик-сундук: засадная атака накладывает кровотечение 5 × уровень и гасит засаду", () => {
  const b = fight("mimic_chest");
  const after = enemyMove(b, "attack", 0.99);
  assert.ok(after.log.some((l) => l.text.includes("Засада: кровотечение")), "кровотечение наложено");
  assert.equal(after.enemy.ambushFirst, false, "засада кончилась первой атакой");
});

test("Старший мимик: первый ход за ним и от первой атаки не уклониться", () => {
  const b = battle.newBattle(hero(), 9, false, "classic", 0, 0, "normal", "mimic_elder");
  assert.equal(b.queue[0], "e", "первый ход врага");
  assert.equal(b.enemy.ambushFirst, true);
});

test("Старший мимик: при смерти бьёт магией 10 × уровень", () => {
  const b = fight("mimic_elder", 9);
  b.enemy.hp = 1;
  const hp0 = b.p.hp;
  const after = seeded(() => battle.playerAct(b, { type: "attack", kind: "normal" }), 0.01);
  assert.ok(after.log.some((l) => l.text.includes("взрывается ловушкой")), "ловушка в логе");
  assert.ok(after.p.hp < hp0, "герой получил урон ловушки");
});

/* ─── Каменная горгулья ─── */

test("Каменная горгулья: при 30% ОЗ окаменяет, лечит 20% макс. ОЗ и не получает физический урон", () => {
  const b = fight("gargoyle");
  b.enemy.hp = Math.floor(b.enemy.maxHp * 0.3);
  const hp0 = b.enemy.hp;
  const after = enemyMove(b, "attack");
  assert.equal(after.enemy.statuses.petrified, 1, "окаменение наложено");
  assert.ok(after.enemy.hp > hp0, "лечится");
  assert.ok(after.enemy.hp <= after.enemy.maxHp, "не выше максимума");
  assert.equal(after.queue[after.idx], "p", "ход врага окончен");
  const dealt = seeded(() => battle.hitEnemy(after, 50, "phys", ""));
  assert.equal(dealt, 0, "физический урон не проходит");
});

test("Каменная горгулья: окаменение кончается с её следующим ходом", () => {
  const b = fight("gargoyle");
  b.enemy.hp = Math.floor(b.enemy.maxHp * 0.3);
  const petrified = enemyMove(b, "attack");
  const next = seeded(() => battle.playerAct(petrified, { type: "end_turn" }));
  assert.equal(next.enemy.statuses.petrified, 0, "окаменение снято на её ходу");
  assert.equal(next.queue[next.idx], "e", "теперь её ход");
});

/* ─── Железный голем-страж ─── */

test("Железный голем: начинает с боевого, при ОЗ ниже 50% в начале своего хода переходит в защитный", () => {
  const b = battle.newBattle(hero(), 5, false, "classic", 0, 0, "normal", "iron_guardian");
  assert.equal(b.enemy.ironMode, "combat", "начинает с боевого");
  b.enemy.hp = Math.floor(b.enemy.maxHp * 0.4);
  b.queue = ["p", "e"];
  b.idx = 0;
  const after = seeded(() => battle.playerAct(b, { type: "end_turn" }));
  assert.equal(after.enemy.ironMode, "defense", "защитный режим при ОЗ ниже 50%");
  assert.ok(after.log.some((l) => l.text.includes("защитный режим")), "переключение в логе");
});

test("Железный голем: броня в защитном режиме +25%, в боевом −25%", () => {
  const b = battle.newBattle(hero(), 5, false, "classic", 0, 0, "normal", "iron_guardian");
  const base = battle.enemyArmorNow({ ...b.enemy, ironMode: undefined });
  assert.equal(battle.enemyArmorNow({ ...b.enemy, ironMode: "combat" }), Math.round(base * 0.75), "боевой −25%");
  assert.equal(battle.enemyArmorNow({ ...b.enemy, ironMode: "defense" }), Math.round(base * 1.25), "защитный +25%");
});

test("Железный голем: боевой режим бьёт сильнее защитного", () => {
  const b = battle.newBattle(hero(), 5, false, "classic", 0, 0, "normal", "iron_guardian");
  b.enemy.ironMode = "combat";
  const combat = battle.enemyExpectedMoveDamage(b, "attack");
  b.enemy.ironMode = "defense";
  const defense = battle.enemyExpectedMoveDamage(b, "attack");
  assert.ok(combat > defense, `боевой ${combat} > защитный ${defense}`);
});

test("Железный голем: при промахе наносит половину урона", () => {
  const b = fight("iron_guardian", 5);
  b.queue = ["e", "p"];
  b.idx = 0;
  b.p.statuses.evadeTurn = 5;
  const hp0 = b.p.hp;
  assert.equal(battle.incoming(b, 40, "phys", "удар голема"), false, "удар промахнулся");
  const lost = hp0 - b.p.hp;
  assert.ok(lost > 0, "но задел");
  assert.ok(lost <= 20, `не больше половины от 40 (${lost})`);
});

test("Железный голем: защитный режим шипами отвечает на каждый физический удар героя", () => {
  const b = battle.newBattle(hero(), 5, false, "classic", 0, 0, "normal", "iron_guardian");
  b.enemy.ironMode = "defense";
  b.enemy.hp = 500;
  const hp0 = b.p.hp;
  seeded(() => battle.hitEnemy(b, 20, "phys", "", true));
  assert.ok(b.log.some((l) => l.text.includes("Шипы голема")), "шипы в логе");
  assert.ok(b.p.hp < hp0, "шипы ранят героя");
});

/* ─── Голем-колосс ─── */

test("Голем-колосс: в начале боя броня 10 × уровень, каждая атака героя снимает 5", () => {
  const b = battle.newBattle(hero(), 9, false, "classic", 0, 0, "normal", "golem_colossus");
  assert.equal(b.enemy.colossusArmor, 10 * b.enemy.level, "броня 10 × уровень");
  const armor0 = battle.enemyArmorNow(b.enemy);
  b.enemy.hp = 500;
  seeded(() => battle.hitEnemy(b, 30, "phys", "", true));
  assert.equal(b.enemy.colossusArmor, 10 * b.enemy.level - 5, "атака снимает 5 брони");
  assert.ok(battle.enemyArmorNow(b.enemy) < armor0, "броня колосса упала");
});

test("Голем-колосс: при промахе наносит половину урона", () => {
  const b = battle.newBattle(hero(), 9, false, "classic", 0, 0, "normal", "golem_colossus");
  b.queue = ["e", "p"];
  b.idx = 0;
  b.p.statuses.evadeTurn = 5;
  const hp0 = b.p.hp;
  assert.equal(battle.incoming(b, 40, "phys", "удар колосса"), false, "удар промахнулся");
  const lost = hp0 - b.p.hp;
  assert.ok(lost > 0 && lost <= 20, `половина от 40 (${lost})`);
});

/* ─── Сфинкс-страж ─── */

test("Сфинкс-страж: «Загадка» даёт барьер 10 × уровень и накладывает проклятие", () => {
  const b = fight("sphinx", 9);
  const after = enemyMove(b, "riddle", 0.01);
  assert.equal(after.enemy.barrierMax, 10 * after.enemy.level, "максимум барьера 10 × уровень");
  assert.equal(after.enemy.barrier, 10 * after.enemy.level, "барьер полон");
  assert.ok(after.p.statuses.curse > 0 || after.log.some((l) => l.text.includes("Стойкость")), "проклятие наложено или отброшено стойкостью");
});

test("Сфинкс-страж: снятый барьер снимает проклятие загадки", () => {
  const b = fight("sphinx", 9);
  b.enemy.barrier = 5;
  b.enemy.barrierMax = 50;
  b.p.statuses.curse = 3;
  b.p.statuses.cursePower = 30;
  b.p.statuses.riddleCurse = 1;
  seeded(() => battle.hitEnemy(b, 100, "magic", "", false));
  assert.equal(b.p.statuses.curse, 0, "проклятие снято");
  assert.equal(b.p.statuses.riddleCurse, 0, "метка загадки снята");
  assert.ok(b.log.some((l) => l.text.includes("проклятие загадки уходит")), "в логе");
});

/* ─── Хранитель Загадок ─── */

test("Хранитель Загадок: 75% магического сопротивления и укрепления", () => {
  const b = bossFight("boss_sphinx");
  const r = battle.enemyReadout(b);
  assert.ok(Math.abs(r.magicResist - 0.75) < 1e-9, `сопротивление 75% (${r.magicResist})`);
  assert.ok(Math.abs(r.fortify - 0.75) < 1e-9, `укрепление 75% (${r.fortify})`);
});

test("Хранитель Загадок: выполненная загадка снижает сопротивление и укрепление на 25%", () => {
  const b = bossFight("boss_sphinx");
  b.enemy.guessAction = "attack";
  const after = seeded(() => battle.playerAct(b, { type: "attack", kind: "normal" }));
  assert.equal(after.enemy.sphinxDown, 1, "одна разгаданная загадка");
  assert.equal(after.enemy.guessAction, null, "загадка сброшена");
  const r = battle.enemyReadout(after);
  assert.ok(Math.abs(r.magicResist - 0.5) < 1e-9, `сопротивление 50% (${r.magicResist})`);
  assert.ok(Math.abs(r.fortify - 0.5) < 1e-9, `укрепление 50% (${r.fortify})`);
});

test("Хранитель Загадок: другое действие не считается разгаданным", () => {
  const b = bossFight("boss_sphinx");
  b.enemy.guessAction = "guard";
  const after = seeded(() => battle.playerAct(b, { type: "attack", kind: "normal" }));
  assert.equal(after.enemy.sphinxDown ?? 0, 0, "сопротивление не снижено");
  assert.equal(after.enemy.guessAction, "guard", "загадка остаётся");
});

test("Хранитель Загадок: загадка показывает четыре действия без побега, одно из них правильное", () => {
  const b = bossFight("boss_sphinx");
  let after = b;
  const asked = () => after.log.some((l) => l.text.includes("загадывает одно из четырёх действий"));
  for (let i = 0; i < 6 && !asked(); i++) {
    after = seeded(() => battle.playerAct(after, { type: "end_turn" }));
    if (after.queue[after.idx] === "e") after = seeded(() => battle.enemyStep(after));
  }
  const line = after.log.find((l) => l.text.includes("загадывает одно из четырёх действий"));
  assert.ok(line, "загадка появилась в логе");
  assert.ok(line.text.includes("атака, защита, умение, предмет"), "четыре варианта, побега нет");
  assert.ok(["attack", "guard", "skill", "item"].includes(after.enemy.guessAction), "загадано одно из четырёх");
});

test("Хранитель Загадок: загаданное «предмет» считается выполненным", () => {
  /* В бою доступны только предметы из карманов героя, поэтому предмет кладётся туда до начала боя. */
  const b = battle.newBattle({ ...hero(), bag: { poison_dart: 1 }, pouch: ["poison_dart", null, null, null, null] }, 8, false, "classic", 0, 0, "normal", "husk");
  b.enemy.def = { ...content.BOSSES.find((x) => x.id === "boss_sphinx") };
  b.enemy.hp = b.enemy.maxHp = 500;
  b.torchTurns = 99;
  b.queue = ["p", "e"];
  b.idx = 0;
  b.enemy.guessAction = "item";
  const after = seeded(() => battle.playerAct(b, { type: "item", id: "poison_dart" }));
  assert.equal(after.enemy.sphinxDown, 1, "предмет разгадан");
  assert.equal(after.enemy.guessAction, null, "загадка сброшена");
});

/* ─── Содержимое ─── */

test("Все новые приёмы описаны и доступны врагам", () => {
  assert.ok(content.ENEMY_MOVE_META.heat, "описание «Накала шлака»");
  assert.ok(content.ENEMY_MOVE_META.riddle, "описание «Загадки»");
  const golem = content.ENEMIES.find((x) => x.id === "golem");
  assert.ok(golem.moves.includes("heat"), "у стража из шлака есть «Накал шлака»");
  const sphinx = content.ENEMIES.find((x) => x.id === "sphinx");
  assert.ok(sphinx.moves.includes("riddle"), "у сфинкса есть «Загадка»");
});
