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

/** Карта, где событие стоит в клетке (1,0) сразу справа от входа. */
function gameWithEvent() {
  const game = new GameController(new MemoryStorage());
  game.startRun(1);
  game.model.setModal(null);
  /* События могут отнимать здоровье: даём герою запас, чтобы тест проверял
     пометку клетки, а не гибель от случайного исхода. */
  game.model.updatePlayer((p) => ({ ...p, stats: { ...p.stats, str: 10 }, hp: 500 }));
  const run = game.model.getSnapshot().run;
  /* Оставляем на карте только события: сундуки, ключи и твари в клетке (1,0)
     перехватили бы шаг раньше. */
  const size = run.maze.size;
  const maze = {
    ...run.maze,
    events: [1, 2],
    usedEvents: [],
    chests: [],
    doors: [],
    keys: [],
    monsters: [],
    traps: [],
  };
  maze.v = run.maze.v.map((row) => [...row]);
  maze.v[0][1] = false;
  /* Страж или лестница иногда стоят ровно в этой клетке — уводим их. */
  if (maze.boss.x === 1 && maze.boss.y === 0) maze.boss = { x: size - 1, y: size - 2 };
  if (maze.stairs.x === 1 && maze.stairs.y === 0) maze.stairs = { x: size - 1, y: size - 1 };
  game.model.setRun({ ...run, maze });
  return game;
}

test("событие помечает только свою клетку и не гасит соседнее", () => {
  const game = gameWithEvent();
  withRandom(0.99, () => game.dungeon.move(1, 0));
  const modal = game.model.getSnapshot().modal;
  assert.equal(modal.kind, "event");
  assert.equal(modal.cell, 1, "в окне записана клетка события");

  const ev = world.mapEventById(modal.eventId);
  assert.ok(ev, "событие известно");
  /* Фиксируем исход «удача», иначе плохая ветка может убить героя. */
  withRandom(0, () => game.dungeon.resolveEvent(ev.id, ev.choices[0].id, modal.cell));
  const after = game.model.getSnapshot().run;
  assert.deepEqual(after.maze.usedEvents, [1], "использована ровно одна клетка");
  assert.ok(!after.maze.usedEvents.includes(2), "соседнее событие осталось на карте");
});

test("тип события не привязан к индексу клетки", () => {
  const ids = new Set();
  for (let i = 0; i < 30; i++) {
    const game = gameWithEvent();
    game.dungeon.move(1, 0);
    const modal = game.model.getSnapshot().modal;
    assert.equal(modal.kind, "event");
    ids.add(modal.eventId);
  }
  assert.ok(ids.size >= 2, `на одной и той же клетке выпало ${ids.size} вид(ов) событий`);
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
