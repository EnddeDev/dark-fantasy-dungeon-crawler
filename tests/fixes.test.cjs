const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

/**
 * Регрессии по аудиту: правила веса снаряжения, множитель «Нового» состояния,
 * таблица опыта, формулы приёмов в дуэлях, пометка событий на карте,
 * списание трофеев и проверки лавки.
 */
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-fixes-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name, externals = []) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: externals });
  return require(outfile);
}

const content = load("src/game/content.ts", "content");
const battle = load("src/game/battle.ts", "battle");
const duel = load("src/game/duel.ts", "duel");
const forge = load("src/game/forge.ts", "forge");
const world = load("src/game/world.ts", "world");
const mazeLib = load("src/game/maze.ts", "maze");
const types = load("src/game/types.ts", "types");
const runLoot = load("src/game/runLoot.ts", "run-loot");
const { GameController } = load("src/controllers/GameController.ts", "game-controller", [
  "react",
  "react-dom",
  "react/jsx-runtime",
]);
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");
const { MemoryStorage } = load("src/model/SaveRepository.ts", "save-repository");

const SLOTS = ["mainHand", "offHand", "head", "body", "feet", "wrists", "ring1", "ring2", "amulet"];
const emptyEquip = () => Object.fromEntries(SLOTS.map((slot) => [slot, null]));

function withRandom(value, fn) {
  const rnd = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = rnd;
  }
}

test("вес снаряжения: двуручное всегда тяжёлое, одноручное — не тяжёлое", () => {
  for (const base of Object.values(content.GEAR_BASES)) {
    if (base.hands === 2) assert.equal(base.gearClass, "heavy", `${base.id}: двуручное, но ${base.gearClass}`);
    if (base.hands === 1) assert.notEqual(base.gearClass, "heavy", `${base.id}: одноручное, но тяжёлое`);
  }
});

test("«Новое» состояние: базовый множитель внутри диапазона, кузница не ослабляет предмет", () => {
  for (const [tier, range] of Object.entries(types.WEAR_RANGE)) {
    assert.ok(range.base >= range.lo && range.base <= range.hi, `${tier}: base ${range.base} вне ${range.lo}..${range.hi}`);
  }
  const item = content.createGearItem({ baseId: "sword", level: 1, wear: "battered", rarity: "common", identified: true });
  let player = { ...PlayerFactory.createInitial(), gold: 10_000, armory: [item] };
  /* Изношенное → ношенное → новое: два шага кузнеца. */
  for (let step = 0; step < 2; step++) {
    const res = forge.forgeUpgrade(player, item.uid, "wear", () => 0.99);
    assert.equal(res.destroyed, false, res.message);
    player = res.player;
  }
  const upgraded = player.armory.find((g) => g.uid === item.uid);
  assert.equal(upgraded.wear, "new");
  const range = types.WEAR_RANGE.new;
  assert.ok(
    upgraded.wearMult >= range.lo && upgraded.wearMult <= range.hi,
    `кованое «Новое» состояние даёт ${upgraded.wearMult}, диапазон ${range.lo}..${range.hi}`,
  );
});

test("таблица опыта положительна на всех уровнях, включая максимальный", () => {
  for (let level = 1; level <= content.MAX_LEVEL; level++) {
    assert.ok(content.xpForNextLevel(level) > 0, `уровень ${level}: ${content.xpForNextLevel(level)}`);
  }
  for (let level = 1; level < content.MAX_LEVEL - 1; level++) {
    assert.ok(
      content.xpForNextLevel(level + 1) > content.xpForNextLevel(level),
      `рост опыта между ${level} и ${level + 1}`,
    );
  }
});

function duelFighters() {
  const weapon = content.createGearItem({
    baseId: "staff",
    level: 1,
    wear: "worn",
    rarity: "common",
    identified: true,
    skillId: "arcane_pulse",
  });
  const base = PlayerFactory.createInitial();
  const player = {
    ...base,
    level: 5,
    stats: { str: 3, agi: 3, int: 6 },
    armory: [weapon],
    equip: { ...emptyEquip(), mainHand: weapon.uid },
    bag: { potion_s: 1 },
  };
  const a = duel.fighterFromPlayer("a", player);
  const b = duel.fighterFromPlayer("b", { ...player, name: "Боря" });
  return { a, b, player };
}

test("дуэль: приём бьёт той же формулой, что и в подземелье", () => {
  const { a, b } = duelFighters();
  assert.ok(a.skill, "у посоха есть приём");
  b.hp = 5000;
  b.maxHp = 5000;
  const state = { id: "d1", a, b, turn: "a", round: 1, apLeft: 4, winner: null, log: [], deadline: Date.now() + 20_000, seq: 0 };
  const result = withRandom(0.99, () => duel.duelAction(state, "a", { type: "technique" }, Date.now()));

  const bonus = Math.round(battle.techniqueDamage(a.intStat, a.skill.scaleMult));
  const plainHit = a.hit[1] + a.strFlat;
  const expected = Math.max(1, plainHit + bonus - Math.max(0, b.armor));
  assert.equal(b.hp - result.b.hp, expected, `урон приёма ${b.hp - result.b.hp}, ожидалось ${expected}`);
  assert.ok(bonus > a.skill.scaleMult * a.intStat * 2, `бонус приёма ${bonus} вырос до формулы подземелья`);
});

test("дуэль: при обоюдной смерти побеждает тот, у кого больше здоровья", () => {
  const { a, b } = duelFighters();
  const make = (hpA, hpB) => ({
    id: "d2",
    a: { ...a, hp: hpA, maxHp: 100 },
    b: { ...b, hp: hpB, maxHp: 100 },
    turn: "a",
    round: 2,
    apLeft: 1,
    winner: null,
    log: [],
    deadline: Date.now() + 20_000,
    seq: 3,
  });
  const first = withRandom(0.99, () => duel.duelAction(make(-1, -5), "a", { type: "pass" }, Date.now()));
  assert.equal(first.winner, "a");
  const second = withRandom(0.99, () => duel.duelAction(make(-5, -1), "a", { type: "pass" }, Date.now()));
  assert.equal(second.winner, "b");
});

test("лавка: бесплатного обновления прилавка при нехватке золота нет", () => {
  const game = new GameController(new MemoryStorage());
  game.model.updatePlayer((p) => ({ ...p, gold: 0 }));
  const before = game.model.getSnapshot().shopStock.map((g) => g.uid).join(",");
  game.lobby.refreshShop();
  let snap = game.model.getSnapshot();
  assert.equal(snap.player.gold, 0);
  assert.equal(snap.shopStock.map((g) => g.uid).join(","), before, "прилавок не обновился бесплатно");

  game.model.updatePlayer((p) => ({ ...p, gold: 100 }));
  game.lobby.refreshShop();
  snap = game.model.getSnapshot();
  assert.equal(snap.player.gold, 75, "за обновление списано 25 золотых");
  assert.notEqual(snap.shopStock.map((g) => g.uid).join(","), before, "прилавок обновился");
});

/**
 * Карта, где событие закреплено за комнатой справа от входа: клетки (1,0)…(2,1).
 * Событие срабатывает при входе в комнату, а не на отдельной клетке.
 */
function gameWithEvent(overrides = {}) {
  const game = new GameController(new MemoryStorage());
  game.startRun(1);
  game.model.setModal(null);
  game.model.updatePlayer((p) => ({ ...p, stats: { ...p.stats, str: 10 }, hp: 500 }));
  const run = game.model.getSnapshot().run;
  const size = run.maze.size;
  const room = { x: 1, y: 0, w: 2, h: 2, kind: "hall", name: "Зал", tone: "plain", pillars: [] };
  const maze = {
    ...run.maze,
    rooms: [room],
    events: [1],
    usedEvents: [],
    eventSpawns: [{ room: 0, cell: 1, kind: "neutral", eventId: "altar", ...overrides }],
    chests: [],
    doors: [],
    keys: [],
    monsters: [],
    traps: [],
  };
  maze.v = run.maze.v.map((row) => [...row]);
  maze.h = run.maze.h.map((row) => [...row]);
  /* комната открыта: вход (0,0)→(1,0) и все стены внутри зала убраны */
  maze.v[0][1] = false;
  maze.v[0][2] = false;
  maze.v[1][1] = false;
  maze.v[1][2] = false;
  maze.h[1][1] = false;
  maze.h[1][2] = false;
  if (maze.boss.x === 1 && maze.boss.y === 0) maze.boss = { x: size - 1, y: size - 2 };
  if (maze.stairs.x === 1 && maze.stairs.y === 0) maze.stairs = { x: size - 1, y: size - 1 };
  game.model.setRun({ ...run, maze });
  return game;
}

test("событие срабатывает при входе в комнату и помечает только свою комнату", () => {
  const game = gameWithEvent();
  withRandom(0.99, () => game.dungeon.move(1, 0));
  const modal = game.model.getSnapshot().modal;
  assert.equal(modal.kind, "event");
  assert.equal(modal.cell, 1, "в окне записана метка комнаты");
  assert.equal(modal.eventId, "altar", "событие взято из комнаты");

  /* «Уйти» не тратит событие: оно ждёт следующего захода. */
  const leave = world.mapEventById("altar").choices.find((c) => c.leave);
  game.dungeon.resolveEvent("altar", leave.id, modal.cell);
  assert.deepEqual(game.model.getSnapshot().run.maze.usedEvents, [], "уход не гасит событие");
  assert.equal(game.model.getSnapshot().modal, null);

  /* Второй заход в ту же комнату снова открывает выбор. */
  withRandom(0.99, () => game.dungeon.move(-1, 0));
  withRandom(0.99, () => game.dungeon.move(1, 0));
  assert.equal(game.model.getSnapshot().modal.kind, "event", "событие вернулось");

  const choice = world.mapEventById("altar").choices.find((c) => !c.leave);
  withRandom(0, () => game.dungeon.resolveEvent("altar", choice.id, modal.cell));
  const after = game.model.getSnapshot().run;
  assert.deepEqual(after.maze.usedEvents, [1], "использована метка комнаты");
});

test("вид события берётся из комнаты, а не из индекса клетки", () => {
  const positive = gameWithEvent({ kind: "positive", eventId: "life_spring" });
  withRandom(0.99, () => positive.dungeon.move(1, 0));
  assert.equal(positive.model.getSnapshot().modal.eventId, "life_spring");

  const negative = gameWithEvent({ kind: "negative", eventId: "ceiling_collapse" });
  const hpBefore = negative.model.getSnapshot().player.hp;
  withRandom(0.99, () => negative.dungeon.move(1, 0));
  const snap = negative.model.getSnapshot();
  assert.equal(snap.modal.kind, "event");
  assert.ok(snap.modal.result, "негативное событие сразу показывает исход");
  assert.ok(snap.run.maze.usedEvents.includes(1), "негативное событие сработало сразу");
  assert.ok(snap.player.hp < hpBefore, "обвал снял здоровье");
});

test("положительное событие лечит полностью и помечается использованным", () => {
  const game = gameWithEvent({ kind: "positive", eventId: "life_spring" });
  game.model.updatePlayer((p) => ({ ...p, hp: 40 }));
  withRandom(0.99, () => game.dungeon.move(1, 0));
  const modal = game.model.getSnapshot().modal;
  game.dungeon.resolveEvent("life_spring", "drink", modal.cell);
  const snap = game.model.getSnapshot();
  assert.equal(snap.player.hp, battle.derived(snap.player).maxHp, "источник восстанавливает всё здоровье");
  assert.ok(snap.run.maze.usedEvents.includes(1));
});

test("негативное событие призывает четырёх тварей рядом с героем", () => {
  const game = gameWithEvent({ kind: "negative", eventId: "pack_ambush" });
  const before = game.model.getSnapshot().run.maze.monsters.length;
  withRandom(0.99, () => game.dungeon.move(1, 0));
  const snap = game.model.getSnapshot();
  assert.equal(snap.run.maze.monsters.length, before + 4, "стая вышла на карту");
  assert.ok(snap.run.maze.usedEvents.includes(1), "событие одноразовое");
  assert.equal(snap.screen, "dungeon", "стая не начинает бой сама");
  /* новые твари стоят рядом: в трёх шагах от героя */
  const fresh = snap.run.maze.monsters.slice(before);
  for (const cell of fresh) {
    const x = cell % snap.run.maze.size;
    const y = Math.floor(cell / snap.run.maze.size);
    const dist = Math.max(Math.abs(x - snap.run.pos.x), Math.abs(y - snap.run.pos.y));
    assert.ok(dist <= 3, `тварь на карте слишком далеко: ${dist}`);
  }
});

test("негативное событие с катастрофой сразу начинает бой", () => {
  const game = gameWithEvent({ kind: "negative", eventId: "rift_summon" });
  withRandom(0.99, () => game.dungeon.move(1, 0));
  const snap = game.model.getSnapshot();
  assert.equal(snap.screen, "battle", "катастрофа бьёт сразу");
  assert.ok(snap.battle, "бой создан");
  assert.equal(snap.battle.enemy.threat, "catastrophe");
  assert.equal(snap.battle.isBoss, false, "это не Страж лестницы");
  assert.ok(snap.run.maze.usedEvents.includes(1));
});

test("список добычи сокращается, когда найденное потрачено", () => {
  assert.deepEqual(runLoot.pruneRunLoot(["potion_s", "potion_s", "moss"], { potion_s: 1 }), ["potion_s", "moss"]);
  assert.deepEqual(runLoot.pruneRunLoot(["moss"], { potion_s: 2 }), ["moss"]);
  assert.deepEqual(runLoot.usedFromBags({ potion_s: 3, moss: 1 }, { potion_s: 2, moss: 1 }), { potion_s: 1 });
});

test("трофеи, израсходованные в бою, не списываются второй раз при гибели", () => {
  const game = new GameController(new MemoryStorage());
  game.startRun(1);
  const start = game.model.getSnapshot().player;
  const player = { ...start, hp: 500, bag: { ...start.bag, potion_s: 1 } };
  game.model.setPlayer(player);
  /* Герой нашёл два зелья: в сумке 3, в добыче 2. */
  game.model.updatePlayer((p) => ({ ...p, bag: { ...p.bag, potion_s: 3 } }));
  game.model.updateRun((run) => ({ ...run, loot: ["potion_s", "potion_s"] }));

  const battleState = battle.newBattle({ ...player, bag: { potion_s: 3 } }, 1, false, undefined, 0, false);
  battleState.bag = { potion_s: 3 };
  battleState.idx = battleState.queue.indexOf("p");
  game.model.setBattle(battleState);
  game.model.update({ screen: "battle" });

  game.battle.act({ type: "item", id: "potion_s" });
  const afterDrink = game.model.getSnapshot();
  assert.equal(afterDrink.run.loot.length, 1, "выпитое зелье убрано из добычи");
  assert.equal(afterDrink.battle.bag.potion_s, 2);

  game.die("проверка штрафа");
  const afterDeath = game.model.getSnapshot();
  assert.equal(afterDeath.player.bag.potion_s, 1, "списан только оставшийся трофей, личное зелье цело");
});
