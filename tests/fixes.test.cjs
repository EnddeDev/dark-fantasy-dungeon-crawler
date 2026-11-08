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
const gearScaling = load("src/game/gearScaling.ts", "gear-scaling");
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
    assert.equal(res.success, true, res.message);
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

  const bonus = Math.round(battle.weaponTechniqueBonus(a.skillStat, a.skill.scaleMult));
  const plainHit = a.hit[1] + a.strFlat;
  const expected = Math.max(1, plainHit + bonus - Math.max(0, b.armor));
  assert.equal(b.hp - result.b.hp, expected, `урон приёма ${b.hp - result.b.hp}, ожидалось ${expected}`);
});

test("бонус приёма оружия: урон приёма + (ХАР × (ХАР + множитель приёма + бонус навыков)) / 2, ХАР до 10", () => {
  assert.equal(battle.weaponTechniqueBonus(10, 2.4), (10 * (10 + 2.4)) / 2);
  assert.equal(battle.weaponTechniqueBonus(10, 2.4, 0.8), (10 * (10 + 2.4 + 0.8)) / 2);
  assert.equal(battle.weaponTechniqueBonus(0, 0), 0);
  assert.equal(battle.weaponTechniqueBonus(4, 2.4), 4 * (4 + 2.4) / 2, "при ХАР 4 старая и новая формулы совпадают");
  assert.equal(battle.weaponTechniqueBonus(30, 2.4), battle.weaponTechniqueBonus(10, 2.4), "ХАР выше 10 не даёт бонуса");
  assert.equal(battle.TECHNIQUE_STAT_CAP, 10);
  // ХАР — характеристика предмета: у приёма на ловкость растёт от ЛОВ, а не от ИНТ.
  const knife = content.createGearItem({ baseId: "knife", level: 1, wear: "worn", rarity: "common", identified: true });
  const knifePlayer = {
    ...PlayerFactory.createInitial(),
    level: 5,
    stats: { str: 2, agi: 9, int: 2 },
    armory: [knife],
    equip: { ...emptyEquip(), mainHand: knife.uid },
  };
  const knifeFighter = duel.fighterFromPlayer("k", knifePlayer);
  assert.equal(knifeFighter.skill.scaleStat, "agi", "нож требует ловкость");
  assert.equal(knifeFighter.skillStat, 9, "ХАР ножа — ловкость героя, не интеллект");
  assert.equal(battle.weaponTechniqueBonus(knifeFighter.skillStat, 2.2), (9 * (9 + 2.2)) / 2);
  // Множитель приёма входит линейно: +1 к нему даёт ХАР / 2 урона приёма (при ХАР 10 — +5).
  assert.equal(battle.weaponTechniqueBonus(11, 2.4), battle.weaponTechniqueBonus(10, 2.4), "ХАР 11 считается как 10");
  assert.equal(battle.weaponTechniqueBonus(10, 3.4) - battle.weaponTechniqueBonus(10, 2.4), 5);
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
 * Карта: комната справа от входа — клетки (1,0)…(2,1). Значок события стоит в глубине,
 * на клетке (2,1). Вход в комнату через (1,0) сам по себе событие не запускает:
 * оно срабатывает, когда герой шагает на клетку значка.
 */
function gameWithEvent(overrides = {}) {
  const game = new GameController(new MemoryStorage());
  game.startRun(1);
  game.model.setModal(null);
  game.model.updatePlayer((p) => ({ ...p, stats: { ...p.stats, str: 10 }, hp: 500 }));
  const run = game.model.getSnapshot().run;
  const size = run.maze.size;
  const mark = size + 2;
  const room = { x: 1, y: 0, w: 2, h: 2, kind: "hall", name: "Зал", tone: "plain", pillars: [] };
  const maze = {
    ...run.maze,
    rooms: [room],
    events: [mark],
    usedEvents: [],
    eventSpawns: [{ room: 0, cell: mark, kind: "neutral", eventId: "altar", ...overrides }],
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
  /* босс и лестница не должны стоять на пути к значку: иначе бой или спуск перехватят шаг */
  const onPath = (c) => (c.x === 1 && c.y === 0) || (c.x === 2 && c.y === 0) || (c.x === 2 && c.y === 1);
  if (onPath(maze.boss)) maze.boss = { x: size - 1, y: size - 2 };
  if (onPath(maze.stairs)) maze.stairs = { x: size - 1, y: size - 1 };
  game.model.setRun({ ...run, maze });
  game.eventCell = mark;
  return game;
}

/* Путь от входа к значку: (0,0) → (1,0) → (2,0) → (2,1). Первый шаг — вход в комнату. */
function walkToEvent(game) {
  withRandom(0.99, () => game.dungeon.move(1, 0));
  withRandom(0.99, () => game.dungeon.move(1, 0));
  withRandom(0.99, () => game.dungeon.move(0, 1));
}

test("вход в комнату без шага на значок события не запускает", () => {
  const game = gameWithEvent();
  withRandom(0.99, () => game.dungeon.move(1, 0));
  const snap = game.model.getSnapshot();
  assert.equal(snap.modal, null, "событие не открылось при входе в комнату");
  assert.deepEqual(snap.run.maze.usedEvents, [], "событие не потрачено");
});

test("событие срабатывает при шаге на его клетку и гасит только свой значок", () => {
  const game = gameWithEvent();
  walkToEvent(game);
  const modal = game.model.getSnapshot().modal;
  assert.equal(modal.kind, "event");
  assert.equal(modal.cell, game.eventCell, "в окне записана клетка значка");
  assert.equal(modal.eventId, "altar", "событие взято из комнаты");

  /* «Уйти» не тратит событие: оно ждёт следующего захода на значок. */
  const leave = world.mapEventById("altar").choices.find((c) => c.leave);
  game.dungeon.resolveEvent("altar", leave.id, modal.cell);
  assert.deepEqual(game.model.getSnapshot().run.maze.usedEvents, [], "уход не гасит событие");
  assert.equal(game.model.getSnapshot().modal, null);

  /* Второй заход на значок снова открывает выбор. */
  withRandom(0.99, () => game.dungeon.move(0, -1));
  withRandom(0.99, () => game.dungeon.move(0, 1));
  assert.equal(game.model.getSnapshot().modal.kind, "event", "событие вернулось");

  const choice = world.mapEventById("altar").choices.find((c) => !c.leave);
  withRandom(0, () => game.dungeon.resolveEvent("altar", choice.id, modal.cell));
  const after = game.model.getSnapshot().run;
  assert.deepEqual(after.maze.usedEvents, [game.eventCell], "использована клетка значка");
});

test("вид события берётся из комнаты, а не из индекса клетки", () => {
  const positive = gameWithEvent({ kind: "positive", eventId: "life_spring" });
  walkToEvent(positive);
  assert.equal(positive.model.getSnapshot().modal.eventId, "life_spring");

  const negative = gameWithEvent({ kind: "negative", eventId: "ceiling_collapse" });
  const hpBefore = negative.model.getSnapshot().player.hp;
  walkToEvent(negative);
  const snap = negative.model.getSnapshot();
  assert.equal(snap.modal.kind, "event");
  assert.ok(snap.modal.result, "негативное событие сразу показывает исход");
  assert.ok(snap.run.maze.usedEvents.includes(negative.eventCell), "негативное событие сработало сразу");
  assert.ok(snap.player.hp < hpBefore, "обвал снял здоровье");
});

test("положительное событие лечит полностью и помечается использованным", () => {
  const game = gameWithEvent({ kind: "positive", eventId: "life_spring" });
  game.model.updatePlayer((p) => ({ ...p, hp: 40 }));
  walkToEvent(game);
  const modal = game.model.getSnapshot().modal;
  game.dungeon.resolveEvent("life_spring", "drink", modal.cell);
  const snap = game.model.getSnapshot();
  assert.equal(snap.player.hp, battle.derived(snap.player).maxHp, "источник восстанавливает всё здоровье");
  assert.ok(snap.run.maze.usedEvents.includes(game.eventCell));
});

test("негативное событие призывает четырёх тварей рядом с героем", () => {
  const game = gameWithEvent({ kind: "negative", eventId: "pack_ambush" });
  const before = game.model.getSnapshot().run.maze.monsters.length;
  walkToEvent(game);
  const snap = game.model.getSnapshot();
  assert.equal(snap.run.maze.monsters.length, before + 4, "стая вышла на карту");
  assert.ok(snap.run.maze.usedEvents.includes(game.eventCell), "событие одноразовое");
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
  walkToEvent(game);
  const snap = game.model.getSnapshot();
  assert.equal(snap.screen, "battle", "катастрофа бьёт сразу");
  assert.ok(snap.battle, "бой создан");
  assert.equal(snap.battle.enemy.threat, "catastrophe");
  assert.equal(snap.battle.isBoss, false, "это не Страж лестницы");
  assert.ok(snap.run.maze.usedEvents.includes(game.eventCell));
});

test("авто-исследование учитывает скидку на Интеллект", () => {
  const game = new GameController(new MemoryStorage());
  const item = content.createGearItem({ baseId: "sword", level: 4, wear: "worn", rarity: "common", identified: false });
  const reqInt = content.identifyReqs(item).int;
  assert.ok(reqInt >= 5, `требование предмета ${reqInt}`);
  game.model.updatePlayer((p) => ({
    ...p,
    stats: { ...p.stats, int: reqInt - 1 },
    passives: [...p.passives.filter((id) => id !== "scribe"), "scribe"],
    armory: [item],
  }));

  /* «Тайновед» снижает требование на 1 — кнопка в арсенале активна, значит и авто должно сработать. */
  assert.equal(content.identifyIntReq(item, 1), reqInt - 1);
  const msg = game.lobby.autoIdentify();
  assert.ok(msg, "авто-исследование сработало со скидкой");
  assert.equal(game.model.getSnapshot().player.armory[0].identified, true);

  /* Без скидки то же самое требование не проходит — предмет ждёт ручного исследования. */
  const strict = new GameController(new MemoryStorage());
  strict.model.updatePlayer((p) => ({
    ...p,
    stats: { ...p.stats, int: reqInt - 1 },
    passives: p.passives.filter((id) => id !== "scribe"),
    armory: [{ ...item, identified: false }],
  }));
  assert.equal(strict.lobby.autoIdentify(), null);
  assert.equal(strict.model.getSnapshot().player.armory[0].identified, false);
});

test("кнопка «Исследовать все»: платит золотом только за вещи, которые ИНТ не открывает", () => {
  const game = new GameController(new MemoryStorage());
  const low = content.createGearItem({ baseId: "knife", level: 1, wear: "worn", rarity: "common", identified: false });
  const high = content.createGearItem({ baseId: "soulstone", level: 6, wear: "worn", rarity: "common", identified: false });
  game.model.updatePlayer((p) => ({
    ...p, gold: 100, stats: { ...p.stats, int: 3 },
    passives: p.passives.filter((id) => id !== "scribe"), armory: [low, high],
  }));
  /* Нужно 120 золота за вторую вещь: при 100 ничего не меняется. */
  assert.equal(game.lobby.identifyAllGear(), null);
  assert.equal(game.model.getSnapshot().player.armory.filter((g) => !g.identified).length, 2);
  game.model.updatePlayer((p) => ({ ...p, gold: 150 }));
  assert.ok(game.lobby.identifyAllGear(), "при достаточном золоте кнопка срабатывает");
  const after = game.model.getSnapshot().player;
  assert.ok(after.armory.every((g) => g.identified), "все вещи исследованы");
  assert.equal(after.gold, 150 - 120, "списано только за вещь, которую ИНТ не открывает");
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

test("число урона у приёма в меню совпадает с ударом приёма в бою", () => {
  const cases = [
    ["knife", { str: 2, agi: 14, int: 4 }],
    ["sword", { str: 14, agi: 1, int: 4 }],
    ["staff", { str: 8, agi: 1, int: 14 }],
    ["barbarian_greataxe", { str: 14, agi: 1, int: 4 }],
  ];
  for (const [baseId, stats] of cases) {
    const item = content.createGearItem({ baseId, level: 5, wear: "worn", rarity: "common", identified: true, rng: () => 0.5 });
    item.effects = [];
    item.effectRolls = {};
    item.passive = undefined;
    item.legendaryPassive = undefined;
    const base = PlayerFactory.createInitial();
    const player = {
      ...base, level: 6, stats, statPoints: 0, armory: [item], bag: {}, passives: [], archetype: null, statMilestones: {},
      equip: { ...emptyEquip(), mainHand: item.uid },
    };
    player.hp = battle.derived(player).maxHp;
    // Монстр выбирается при Math.random = 0.5; ход и удар — при 0.99: без уклонения и крита, бросок максимальный.
    let b = withRandom(0.5, () => battle.newBattle(player, 5, false, "classic", 0, 0));
    /* Характеристики случайного монстра дают ему ходы и урон: здесь проверяем только совпадение чисел меню и боя, герой не должен погибнуть. */
    b.p.hp = 1e6;
    b.p.maxHp = 1e6;
    b = withRandom(0.99, () => {
      let guard = 0;
      let s = b;
      while (s.queue[s.idx] !== "p" && guard++ < 20) s = battle.enemyStep(s);
      return s;
    });
    assert.ok(!b.over, `${baseId}: герой погиб до хода`);
    const readout = battle.combatReadout(b);
    assert.ok(readout.techMin !== null && readout.techMin <= readout.techMax, `${baseId}: диапазон приёма`);
    b.p.concentration = 5; // приём требует концентрацию
    const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
    const hits = after.log
      .filter((l) => l.text.includes("[Приём:") && l.text.includes("получает"))
      .map((l) => Number(/получает (\d+) урона/.exec(l.text)[1]));
    assert.ok(hits.length > 0, `${baseId}: приём не ударил`);
    const ws = content.weaponSkillFor(item);
    if (ws.effect === "double_attack") {
      /* Двойной удар: в меню — сумма всех ударов; бой может оборваться, если враг погиб раньше. */
      const count = gearScaling.scaleIntegerByLevel(2, ws.level ?? 1);
      assert.equal(readout.techMax % count, 0, `${baseId}: диапазон делится на число ударов`);
      assert.equal(hits[0], readout.techMax / count, `${baseId}: один удар в меню ${readout.techMax / count}, в бою ${hits[0]}`);
      assert.ok(hits.every((n) => n <= readout.techMax / count), `${baseId}: удары не выше превью`);
    } else {
      const dealt = hits.reduce((sum, n) => sum + n, 0);
      assert.equal(dealt, readout.techMax, `${baseId}: в меню ${readout.techMin}–${readout.techMax}, в бою ${dealt}`);
    }
  }
});
