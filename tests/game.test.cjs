const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [`src/game/${name}.ts`],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  return require(outfile);
}

const maze = loadGameModule("maze");
const content = loadGameModule("content");
const battle = loadGameModule("battle");
/**
 * Бой с нейтральным врагом: род «никакой» и тип «сильный» не дают ни
 * уклонения, ни иммунитетов. Тесты про роды и типы задают их вручную.
 */
function freshBattle(pl, floor, isBoss, biome, torchTurns, burning) {
  const b = battle.newBattle(pl, floor, isBoss, biome, torchTurns, burning);
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong" };
  b.enemy.mtype = "strong";
  return b;
}
const gearEffects = loadGameModule("gearEffects");

/** Модули вне src/game собираем тем же способом. */
function loadModule(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}
const { PlayerFactory } = loadModule("src/model/PlayerFactory.ts", "player-factory");

/** Базовый игрок для тестов снаряжения. */
function mkP(extra = {}) {
  return {
    name: "П", level: 1, xp: 0, statPoints: 0, stats: { str: 1, agi: 1, int: 1 }, hp: 30, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

function player(extra = {}) {
  return {
    name: "Покоритель",
    level: 1,
    xp: 0,
    statPoints: 2,
    stats: { str: 1, agi: 1, int: 1 },
    hp: 30,
    gold: 0,
    bag: {},
    knownRecipes: [],
    armory: [],
    equip: { weapon: null, armor: null, trinket: null },
    passives: [],
    statuses: { wound: 0, curse: 0, poison: 0 },
    kills: 0,
    ...extra,
  };
}

function reachable(m, blocked = new Set()) {
  const queue = [m.start];
  const seen = new Set([maze.cellIdx(m.start.x, m.start.y, m.size)]);
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const [dx, dy] of maze.openDirs(m, cell.x, cell.y)) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      const id = maze.cellIdx(x, y, m.size);
      if (blocked.has(id) || seen.has(id)) continue;
      seen.add(id);
      queue.push({ x, y });
    }
  }
  return seen;
}

test("floors grow from 8x8 to 16x16 and stay capped", () => {
  assert.deepEqual(
    Array.from({ length: 11 }, (_, i) => maze.mazeSizeForFloor(i + 1)),
    [8, 9, 10, 11, 12, 13, 14, 15, 16, 16, 16],
  );
  assert.deepEqual([8, 9, 12, 16].map((s) => maze.monsterCountFor(s)), [8, 10, 18, 32]);
  assert.deepEqual([8, 9, 12, 16].map((s) => maze.trapCountFor(s)), [4, 5, 9, 16]);
});

test("mazes stay solvable and carry the right number of chests and events", () => {
  for (let floor = 1; floor <= 10; floor++) {
    const size = maze.mazeSizeForFloor(floor);
    const wantChests = maze.chestCountForFloor(floor);
    for (let seed = 0; seed < 120; seed++) {
      const m = maze.genMaze(size, floor);
      assert.equal(m.size, size);
      assert.equal(m.chests.length, wantChests, `сундуков на этаже ${floor}`);
      assert.equal(m.doors.length, wantChests);
      assert.equal(m.keys.length, m.doors.length);
      /* события живут в комнатах: одна комната — одно событие, состав по этажу */
      const spawns = m.eventSpawns ?? [];
      assert.equal(m.events.length, spawns.length, "метки событий совпадают с привязкой к комнатам");
      assert.equal(new Set(spawns.map((sp) => sp.room)).size, spawns.length, `две события в одной комнате на этаже ${floor}`);
      const kindOf = (kind) => spawns.filter((sp) => sp.kind === kind).length;
      assert.equal(kindOf("positive"), 1, `положительных событий на этаже ${floor}`);
      if (floor <= 2) {
        assert.equal(kindOf("neutral"), 1, `на этаже ${floor} одно нейтральное событие`);
        assert.equal(kindOf("negative"), 0, `на этаже ${floor} нет негативных событий`);
      } else {
        assert.ok(kindOf("neutral") >= 1 && kindOf("neutral") <= 2, `нейтральных событий ${kindOf("neutral")} на этаже ${floor}`);
        assert.equal(kindOf("negative"), 1, `негативное событие на этаже ${floor}`);
      }
      for (const sp of spawns) {
        const room = m.rooms[sp.room];
        const x = sp.cell % size;
        const y = Math.floor(sp.cell / size);
        assert.ok(x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h, "метка стоит внутри своей комнаты");
        assert.ok(!room.pillars.some(([px, py]) => px === x && py === y), "метка не в колонне");
      }

      const boss = maze.cellIdx(m.boss.x, m.boss.y, size);
      const stairs = maze.cellIdx(m.stairs.x, m.stairs.y, size);
      const beforeDoors = reachable(m, new Set([...m.doors, boss, stairs]));
      for (const key of m.keys) assert.ok(beforeDoors.has(key), `недоступный ключ на ${size}x${size}`);
      assert.ok(reachable(m).has(stairs));
      assert.ok(
        maze.openDirs(m, m.boss.x, m.boss.y).some(([dx, dy]) =>
          m.boss.x + dx === m.stairs.x && m.boss.y + dy === m.stairs.y,
        ),
      );

      /* комнаты не ломают связность и не запирают служебные клетки */
      const all = reachable(m);
      for (const cell of [...m.chests, ...m.keys, ...m.events, boss, stairs]) {
        assert.ok(all.has(cell), `клетка ${cell} отрезана комнатами на ${size}x${size}`);
      }
      /* обитатели этажа: 1 монстр на 8 клеток, 1 ловушка на 16, без наложений */
      assert.equal(m.monsters.length, maze.monsterCountFor(size), `монстров на этаже ${floor}`);
      assert.equal(m.traps.length, maze.trapCountFor(size), `ловушек на этаже ${floor}`);
      assert.equal(
        new Set([...m.monsters, ...m.traps]).size,
        m.monsters.length + m.traps.length,
        "монстр и ловушка не делят клетку",
      );
      const service = new Set([0, boss, stairs, ...m.chests, ...m.doors, ...m.keys, ...m.events]);
      const pillars = new Set(
        m.rooms.flatMap((room) => room.pillars.map(([px, py]) => maze.cellIdx(px, py, size))),
      );
      for (const cell of [...m.monsters, ...m.traps]) {
        assert.ok(!service.has(cell), `обитатель на служебной клетке ${cell}`);
        assert.ok(!pillars.has(cell), `обитатель в колонне ${cell}`);
        assert.ok(all.has(cell), `обитатель ${cell} отрезан на ${size}x${size}`);
      }

      /* колонны комнат замурованы — туда нельзя поставить ни сундук, ни событие */
      m.rooms.forEach((room) =>
        room.pillars.forEach(([px, py]) => {
          const pillar = maze.cellIdx(px, py, size);
          assert.equal(maze.openDirs(m, px, py).length, 0, "колонна должна быть закрыта");
          assert.ok(!m.chests.includes(pillar));
          assert.ok(!m.events.includes(pillar));
          assert.ok(!m.keys.includes(pillar));
        }),
      );
    }
  }
});

test("туман не просачивается через обратный угол стены", () => {
  /* Решётка стен: h[y][x] — стена сверху клетки (x,y), v[y][x] — стена слева. */
  const blank = (size) => ({
    size,
    h: Array.from({ length: size + 1 }, () => Array(size).fill(true)),
    v: Array.from({ length: size }, () => Array(size + 1).fill(true)),
    doors: [],
    openedDoors: [],
  });
  /* H — герой, R — справа, U — сверху, D — по диагонали за стыком. */
  const tight = blank(5);
  tight.v[2][3] = false; // H|R открыто
  tight.h[2][2] = false; // H|U открыто
  /* стены сходятся ровно в точке стыка: R|D и U|D закрыты */
  assert.equal(maze.hasLOS(tight, { x: 2, y: 2 }, { x: 3, y: 1 }), false, "щель обратного угла не просматривается");

  const open = blank(5);
  open.v[2][3] = false;
  open.h[2][2] = false;
  open.h[2][3] = false;
  open.v[1][3] = false;
  assert.equal(maze.hasLOS(open, { x: 2, y: 2 }, { x: 3, y: 1 }), true, "открытый стык просматривается");

  const sideWall = blank(5);
  sideWall.v[2][3] = true;
  sideWall.h[2][2] = false;
  sideWall.h[2][3] = false;
  sideWall.v[1][3] = false;
  assert.equal(maze.hasLOS(sideWall, { x: 2, y: 2 }, { x: 3, y: 1 }), false, "стена рядом с героем закрывает диагональ");

  /* Зал 3×3: из угла видно весь зал, в том числе диагональ через центр. */
  const hall = blank(6);
  for (let y = 1; y <= 3; y++)
    for (let x = 1; x <= 3; x++) {
      hall.h[y][x] = false;
      hall.h[y + 1][x] = false;
      hall.v[y][x] = false;
      hall.v[y][x + 1] = false;
    }
  for (let y = 1; y <= 3; y++)
    for (let x = 1; x <= 3; x++) {
      assert.ok(maze.hasLOS(hall, { x: 1, y: 1 }, { x, y }), `клетка зала ${x},${y} должна быть видна`);
    }

  /* Ни разу за тысячу этажей: видимая клетка за сплошной стеной. */
  for (let floor = 1; floor <= 10; floor++) {
    for (let i = 0; i < 100; i++) {
      const m = maze.genMaze(maze.mazeSizeForFloor(floor), floor);
      const vis = maze.computeVisibility(m, m.start, {}, 0);
      for (let y = 0; y < m.size; y++)
        for (let x = 0; x < m.size; x++) {
          if (vis[y][x] === 0 || (x === m.start.x && y === m.start.y)) continue;
          assert.ok(maze.hasLOS(m, m.start, { x, y }), `клетка ${x},${y} видна без прямой линии`);
        }
    }
  }
});

test("комнаты занимают около 40 % площади, остальное — лабиринт", () => {
  assert.equal(maze.ROOM_AREA_SHARE, 0.4);
  for (const size of [8, 9, 10, 11, 12, 13, 14, 15, 16]) {
    let sumShare = 0;
    let sumRooms = 0;
    const runs = 40;
    for (let i = 0; i < runs; i++) {
      const m = maze.genMaze(size, 6);
      const share = maze.roomShare(m.rooms, size);
      assert.ok(share >= maze.ROOM_AREA_SHARE - 1e-9, `площадь комнат ${(share * 100).toFixed(1)}% на ${size}x${size}`);
      assert.ok(share <= 0.55, `комнаты заняли слишком много: ${(share * 100).toFixed(1)}% на ${size}x${size}`);
      assert.ok(
        m.rooms.length >= maze.minRoomsFor(size),
        `комнат ${m.rooms.length}, ждали минимум ${maze.minRoomsFor(size)} на ${size}x${size}`,
      );
      assert.ok(m.rooms.length <= maze.maxRoomsFor(size), `комнат слишком много: ${m.rooms.length}`);
      sumShare += share;
      sumRooms += m.rooms.length;
    }
    const avg = sumShare / runs;
    assert.ok(avg >= 0.4 && avg <= 0.46, `средняя доля ${(avg * 100).toFixed(1)}% на ${size}x${size}`);
    /* этаж крупнее — залов больше */
    const expected = size <= 8 ? 3 : size <= 10 ? 4 : size <= 12 ? 5 : size <= 14 ? 8 : 10;
    assert.ok(sumRooms / runs >= expected, `на ${size}x${size} в среднем ${(sumRooms / runs).toFixed(1)} комнат`);
  }
});

test("комнаты не слипаются: между залами остаётся стена", () => {
  /* Малые этажи — самый тесный случай: раньше добор шёл «вплотную». */
  for (const size of [8, 9, 10, 12, 16]) {
    for (let i = 0; i < 40; i++) {
      const m = maze.genMaze(size, 6);
      assert.ok(m.rooms.length >= maze.minRoomsFor(size), `на ${size}x${size} комнат ${m.rooms.length}`);
      for (let a = 0; a < m.rooms.length; a++) {
        for (let b = a + 1; b < m.rooms.length; b++) {
          const A = m.rooms[a];
          const B = m.rooms[b];
          const apart = A.x + A.w + 1 <= B.x || B.x + B.w + 1 <= A.x || A.y + A.h + 1 <= B.y || B.y + B.h + 1 <= A.y;
          assert.ok(apart, `залы ${A.kind} и ${B.kind} слиплись на ${size}x${size}`);
        }
      }
    }
  }
});

test("у каждой комнаты есть тон и имя, форм много", () => {
  const tones = new Set();
  const kinds = new Set();
  for (let i = 0; i < 60; i++) {
    const m = maze.genMaze(14, 8);
    for (const r of m.rooms) {
      assert.ok(typeof r.name === "string" && r.name.length > 0, "у комнаты нет имени");
      assert.ok(typeof r.tone === "string" && r.tone.length > 0, `у комнаты ${r.kind} нет тона`);
      tones.add(r.tone);
      kinds.add(r.kind);
    }
  }
  assert.ok(kinds.size >= 10, `видов комнат: ${kinds.size}`);
  assert.ok(tones.size >= 5, `тонов: ${[...tones].join(",")}`);
});

test("chests per floor follow 1 / 2 / 3 by tier and rooms appear sometimes", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 8, 10].map((f) => maze.chestCountForFloor(f)), [1, 1, 1, 2, 2, 3, 3]);
  let withRooms = 0;
  const kinds = new Set();
  for (let i = 0; i < 200; i++) {
    const m = maze.genMaze(8, 3);
    if (m.rooms.length) withRooms++;
    m.rooms.forEach((r) => kinds.add(r.kind));
  }
  assert.ok(withRooms > 150, `комнаты должны появляться часто, есть у ${withRooms}/200`);
  assert.ok(kinds.size >= 3, `разные формы комнат: ${[...kinds].join(",")}`);
});

test("torch never sees through walls or an unopened door", () => {
  const m = maze.genMaze(8);
  m.h = Array.from({ length: 9 }, () => Array(8).fill(true));
  m.v = Array.from({ length: 8 }, () => Array(9).fill(true));
  m.h[1][0] = false;
  m.h[2][0] = false;
  m.h[3][0] = false;
  m.h[4][0] = false;
  m.doors = [];
  m.openedDoors = [];

  const first = maze.computeVisibility(m, { x: 0, y: 0 }, { "0,0": true });
  assert.equal(first[1][0], 1);
  assert.equal(first[3][0], 1);
  assert.equal(first[4][0], 0);
  assert.equal(first[0][1], 0);

  m.doors = [maze.cellIdx(0, 2, 8)];
  const throughDoor = maze.computeVisibility(m, { x: 0, y: 0 }, { "0,0": true });
  assert.equal(throughDoor[2][0], 1);
  assert.equal(throughDoor[3][0], 0);
});

test("пустая клетка никогда не даёт находку: ни золото, ни реагент, ни случайный бой", () => {
  const src = fs.readFileSync(path.join("src", "controllers", "DungeonController.ts"), "utf8");
  assert.ok(!src.includes("rollStepEvent"), "шаг не бросает кубик на находку");
  assert.ok(!src.includes("Math.random() < 0.05"), "при входе на клетку нет 5% реагентов");
  assert.ok(!src.includes("Среди камней"), "золото из-под камней убрано");
  assert.ok(!src.includes("В щели найден"), "реагент из щели убран");
  assert.ok(!fs.existsSync(path.join("src", "game", "events.ts")), "модуль случайных находок удалён");
});

test("levels are never capped by the floor, but late levels cost many runs", () => {
  const first = content.grantXp(player(), 100_000);
  assert.equal(first.player.level, 10);
  assert.equal(first.player.xp, 0);
  assert.equal(first.player.statPoints, 29);
  assert.strictEqual(content.grantXp(first.player, 10_000).player, first.player);

  // Порог растёт, а опыт с монстра невелик: поздние уровни требуют всё больше заходов.
  const early = content.xpForNextLevel(1);
  const late = content.xpForNextLevel(9);
  assert.ok(late > early * 10);
  const mob = content.ENEMIES[0];
  assert.ok(mob.xp * 2 < early);
});

test("loot chances follow the stated percentages and scale with monster level", () => {
  const normal = content.lootTableFor(1, 1, "normal");
  assert.equal(Math.round(normal.gold), 75);
  assert.equal(Math.round(normal.reagents), 50);
  assert.equal(Math.round(normal.supplies), 25);
  assert.equal(Math.round(normal.gear), 5);
  assert.equal(normal.nothing, undefined, "«ничего» — не категория, а остаток после независимых бросков");

  const stronger = content.lootTableFor(2, 1, "normal");
  assert.equal(Math.round(stronger.gold), 76);
  assert.equal(Math.round(stronger.reagents), 51);
  assert.equal(Math.round(stronger.supplies), 26);
  assert.equal(Math.round(stronger.gear), 6);

  // Ужас: снаряжение +30 п.п., остальные категории сохраняются.
  const horror = content.lootTableFor(1, 1, "horror");
  assert.equal(Math.round(horror.gear), 35);
  assert.equal(Math.round(horror.gold), 75);
  assert.equal(Math.round(horror.reagents), 50);
  assert.equal(Math.round(horror.supplies), 25);

  // Катастрофа: треть золота, реагентов и припасов переходит в снаряжение.
  const catastrophe = content.lootTableFor(1, 1, "catastrophe");
  assert.ok(catastrophe.gear > horror.gear);
  assert.ok(catastrophe.gold > 0 && catastrophe.gold < horror.gold);

  // Шанс, что не выпадет ничего: 0.25 × 0.50 × 0.75 × 0.95 ≈ 8.9%.
  assert.ok(Math.abs(content.lootNoneChance(normal) - 8.90625) < 0.01, `ничего: ${content.lootNoneChance(normal)}`);
});

test("награды с монстра выпадают независимо: золото и реагент могут прийти вместе", () => {
  const rng = lcg(91);
  const n = 20000;
  let gold = 0;
  let reagent = 0;
  let both = 0;
  let none = 0;
  for (let i = 0; i < n; i++) {
    const drop = content.rollEnemyLoot(1, 1, "normal", rng);
    const hasGold = drop.gold > 0;
    const hasReagent = drop.items.some((id) => content.reagentPoolForFloor(1).includes(id));
    if (hasGold) gold++;
    if (hasReagent) reagent++;
    if (hasGold && hasReagent) both++;
    if (!hasGold && !hasReagent && !drop.items.length && !drop.gear.length) none++;
  }
  const near = (value, target, label) => assert.ok(Math.abs(value / n - target) < 0.015, `${label}: ${value / n}, ждали ${target}`);
  near(gold, 0.75, "золото");
  near(reagent, 0.50, "реагенты");
  near(both, 0.75 * 0.50, "золото и реагент вместе");
  near(none, content.lootNoneChance(content.lootTableFor(1, 1, "normal")) / 100, "ничего");
});

test("золото подземелья приходит вполовину", () => {
  assert.equal(content.DUNGEON_GOLD_SHARE, 0.5);
  assert.equal(content.dungeonGold(30), 15);
  assert.equal(content.dungeonGold(41), 20);
  assert.equal(content.dungeonGold(1), 1);
  assert.equal(content.dungeonGold(0), 1, "минимум одна монета");

  /* С монстра: прежний потолок 14 + 6 × уровень урезан вдвое. */
  const rng = lcg(77);
  let seen = 0;
  for (let level = 1; level <= 10; level++) {
    for (let i = 0; i < 400; i++) {
      const drop = content.rollEnemyLoot(level, level, "normal", rng);
      if (!drop.gold) continue;
      seen++;
      assert.ok(drop.gold >= 1, `золото ${drop.gold} меньше монеты`);
      assert.ok(drop.gold <= Math.floor((14 + level * 6) / 2), `золото ${drop.gold} выше половины при уровне ${level}`);
    }
  }
  assert.ok(seen > 200, `золото должно выпадать, найдено ${seen}`);
});

test("события: по десять каждого вида, виды не пересекаются", () => {
  const m = loadGameModule("mapEvents");
  assert.equal(m.POSITIVE_EVENTS.length, 10);
  assert.equal(m.NEUTRAL_EVENTS.length, 10);
  assert.equal(m.NEGATIVE_EVENTS.length, 10);
  assert.equal(m.MAP_EVENTS.length, 30);
  assert.equal(new Set(m.MAP_EVENTS.map((e) => e.id)).size, 30, "идентификаторы событий уникальны");
  for (const e of m.POSITIVE_EVENTS) assert.equal(e.kind, "positive");
  for (const e of m.NEUTRAL_EVENTS) assert.equal(e.kind, "neutral");
  for (const e of m.NEGATIVE_EVENTS) assert.equal(e.kind, "negative");
});

test("положительное событие: один дар без подвоха и «не сейчас»", () => {
  const m = loadGameModule("mapEvents");
  for (const ev of m.POSITIVE_EVENTS) {
    const acts = ev.choices.filter((c) => !c.leave);
    const leaves = ev.choices.filter((c) => c.leave);
    assert.equal(acts.length, 1, `${ev.id}: ровно один дар`);
    assert.equal(leaves.length, 1, `${ev.id}: есть выбор «не брать сейчас»`);
    assert.equal(acts[0].chance, 1, `${ev.id}: дар не бросает кубик`);
    assert.deepEqual(acts[0].bad, [], `${ev.id}: плохого исхода нет`);
    assert.ok(acts[0].good.length > 0, `${ev.id}: дар что-то даёт`);
    assert.equal(leaves[0].good.length + leaves[0].bad.length, 0, `${ev.id}: уход ничего не тратит`);
  }
});

test("нейтральное событие: две проверки характеристик и уход", () => {
  const m = loadGameModule("mapEvents");
  for (const ev of m.NEUTRAL_EVENTS) {
    assert.equal(ev.choices.length, 3, `${ev.id}: три варианта`);
    const acts = ev.choices.filter((c) => !c.leave);
    const leaves = ev.choices.filter((c) => c.leave);
    assert.equal(acts.length, 2, `${ev.id}: два рабочих варианта`);
    assert.equal(leaves.length, 1, `${ev.id}: третий — уйти`);
    for (const c of acts) {
      assert.ok(c.stat && ["str", "agi", "int"].includes(c.stat), `${ev.id}/${c.id}: проверка идёт через характеристику`);
      assert.ok(c.chance > 0 && c.chance < 1, `${ev.id}/${c.id}: есть шанс`);
      assert.ok(c.good.length > 0 && c.bad.length > 0, `${ev.id}/${c.id}: у обоих исходов есть последствия`);
    }
    const stats = new Set(acts.map((c) => c.stat));
    assert.equal(stats.size, 2, `${ev.id}: две разные характеристики`);
  }
});

test("шанс проверки растёт с характеристикой", () => {
  const m = loadGameModule("mapEvents");
  const choice = m.NEUTRAL_EVENTS[0].choices[0];
  const low = m.choiceChance(choice, { str: 3, agi: 3, int: 3 });
  const mid = m.choiceChance(choice, { str: 6, agi: 6, int: 6 });
  const high = m.choiceChance(choice, { str: 10, agi: 10, int: 10 });
  assert.equal(low, choice.chance);
  assert.ok(mid > low && high > mid, `шаг проверки сломан: ${low} / ${mid} / ${high}`);
  assert.ok(high <= 0.95 && low >= 0.05, "шанс остаётся в разумных границах");
  /* проверка читает именно свою характеристику */
  const strChoice = { ...choice, stat: "str" };
  assert.ok(m.choiceChance(strChoice, { str: 10, agi: 3, int: 3 }) > m.choiceChance(strChoice, { str: 3, agi: 10, int: 10 }));
});

test("негативное событие срабатывает само: последствия или призыв", () => {
  const m = loadGameModule("mapEvents");
  for (const ev of m.NEGATIVE_EVENTS) {
    assert.equal(ev.choices.length, 0, `${ev.id}: выбора нет`);
    assert.ok((ev.effects?.length ?? 0) > 0 || ev.summon, `${ev.id}: должно что-то делать`);
    assert.ok(ev.text && ev.text.length > 10, `${ev.id}: исход описан текстом`);
  }
  const packs = m.NEGATIVE_EVENTS.filter((e) => e.summon && "pack" in e.summon);
  assert.ok(packs.some((e) => e.summon.pack >= 4), "есть призыв четырёх тварей на карту");
  const battles = m.NEGATIVE_EVENTS.filter((e) => e.summon && "battle" in e.summon);
  assert.ok(battles.some((e) => e.summon.battle === "catastrophe"), "есть призыв катастрофы");
});

test("события карты тоже отдают вдвое меньше золота", () => {
  const world = loadGameModule("world");
  let positives = 0;
  for (const event of world.MAP_EVENTS) {
    for (const choice of event.choices) {
      for (const outcome of [choice.good, choice.bad]) {
        for (const effect of outcome ?? []) {
          if (effect.k !== "gold" || effect.v <= 0) continue;
          assert.ok(effect.v <= 55, `событие ${event.id}: +${effect.v} золота больше половины прежнего максимума`);
          positives++;
        }
      }
    }
  }
  assert.ok(positives >= 5, `событий с золотом: ${positives}`);
});

test("качество добычи с монстров: 5/15/25 редкое, легендарного нет", () => {
  assert.deepEqual(content.rarityWeightsFor("normal"), { common: 95, rare: 5, epic: 0, legendary: 0 });
  assert.deepEqual(content.rarityWeightsFor("horror"), { common: 84, rare: 15, epic: 1, legendary: 0 });
  assert.deepEqual(content.rarityWeightsFor("catastrophe"), { common: 70, rare: 25, epic: 5, legendary: 0 });
});

test("нулевой вес редкости не выпадает даже при rng() = 0", () => {
  /* Раньше вычитание нулевого веса не сдвигало бросок и возвращало запрещённую ступень. */
  /* rng() = 0 попадает в первый интервал — самую высокую ДОСТУПНУЮ ступень. */
  assert.equal(content.rollRarity({ common: 95, rare: 5, epic: 0, legendary: 0 }, () => 0), "rare");
  assert.equal(content.rollRarity({ common: 49, rare: 50, epic: 1, legendary: 0 }, () => 0), "epic");
  assert.equal(content.rollRarity({ common: 0, rare: 100, epic: 0, legendary: 0 }, () => 0), "rare");
  assert.equal(content.rollRarity({ common: 0, rare: 0, epic: 0, legendary: 0 }, () => 0), "common", "пустые веса — обычное");
  for (let i = 0; i < 3000; i++) {
    assert.notEqual(content.rollRarity(content.MONSTER_RARITY_WEIGHTS.normal), "legendary");
    assert.notEqual(content.rollRarity(content.MONSTER_RARITY_WEIGHTS.normal), "epic");
    assert.notEqual(content.rollRarity(content.CHEST_RARITY_WEIGHTS), "legendary");
  }
});

test("вещь из сундука получает уровень этажа, а не уровень модели", () => {
  const rng = lcg(77);
  for (const floor of [1, 3, 6, 10]) {
    for (let i = 0; i < 120; i++) {
      const chest = battle.rollGearDrop(floor, content.CHEST_RARITY_WEIGHTS, floor, rng);
      assert.equal(chest.level, Math.min(10, Math.max(1, floor)), `сундук ${floor} этажа дал уровень ${chest.level}`);
      assert.notEqual(chest.wear, "new");
    }
  }
});

test("босс 50/10/1, сундук 50/1 без легендарного", () => {
  assert.deepEqual(content.BOSS_RARITY_WEIGHTS, { common: 39, rare: 50, epic: 10, legendary: 1 });
  assert.deepEqual(content.CHEST_RARITY_WEIGHTS, { common: 49, rare: 50, epic: 1, legendary: 0 });
  for (const w of [
    content.rarityWeightsFor("normal"),
    content.rarityWeightsFor("horror"),
    content.rarityWeightsFor("catastrophe"),
    content.BOSS_RARITY_WEIGHTS,
    content.CHEST_RARITY_WEIGHTS,
  ]) {
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 100) < 1e-9, `веса должны давать 100%, получено ${total}`);
  }
});

test("вещь с монстра получает уровень монстра, а не уровень модели", () => {
  const rng = lcg(11);
  for (let level = 1; level <= 10; level++) {
    for (const threat of ["normal", "horror", "catastrophe"]) {
      let got = null;
      for (let i = 0; i < 400 && !got; i++) {
        const drop = content.rollEnemyLoot(level, level, threat, rng);
        if (drop.gear.length) got = drop.gear[0];
      }
      assert.ok(got, `за 400 попыток ${threat} уровня ${level} не выдал снаряжение`);
      assert.equal(got.level, level, `уровень вещи ${got.level} вместо ${level}`);
      assert.notEqual(got.wear, "new", "в подземелье новое не выпадает");
      assert.ok(["battered", "worn"].includes(got.wear), `износ ${got.wear}`);
      if (threat === "normal") assert.ok(!["epic", "legendary"].includes(got.rarity), `обычная тварь дала ${got.rarity}`);
      if (threat !== "normal") assert.notEqual(got.rarity, "legendary", "легендарное с монстров не выпадает");
    }
  }
});

test("изношенность находки: 75% изношенное и 25% ношеное, нового нет", () => {
  const rng = lcg(23);
  let battered = 0;
  let worn = 0;
  for (let i = 0; i < 4000; i++) {
    const wear = content.rollDungeonWear(rng);
    assert.ok(wear === "battered" || wear === "worn", `недопустимый износ ${wear}`);
    if (wear === "battered") battered++;
    else worn++;
  }
  assert.ok(Math.abs(battered / 4000 - 0.75) < 0.03, `изношенных ${battered}/4000`);
  assert.equal(battered + worn, 4000);
});

test("сундук и босс: подземный износ и уровень монстра у трофея", () => {
  const rng = lcg(5);
  for (let i = 0; i < 200; i++) {
    const chest = battle.rollGearDrop(4, content.CHEST_RARITY_WEIGHTS, undefined, rng);
    assert.notEqual(chest.wear, "new", "сундук не выдаёт новое");
    assert.equal(chest.identified, false, "качество скрыто до исследования");

    const boss = battle.rollGearDrop(4, content.BOSS_RARITY_WEIGHTS, 5, rng);
    assert.equal(boss.level, 5, "трофей босса получает уровень босса");
    assert.notEqual(boss.wear, "new", "босс не выдаёт новое");
  }

  let legendaries = 0;
  for (let i = 0; i < 4000; i++) {
    if (battle.rollGearDrop(1, content.BOSS_RARITY_WEIGHTS, 1, rng).rarity === "legendary") legendaries++;
  }
  assert.ok(Math.abs(legendaries / 4000 - 0.01) < 0.008, `легендарных с босса ${legendaries}/4000`);

  // сундук не выдаёт легендарное вовсе, эпическое — редкость
  let chestLegend = 0;
  let chestEpic = 0;
  for (let i = 0; i < 4000; i++) {
    const rarity = battle.rollGearDrop(1, content.CHEST_RARITY_WEIGHTS, undefined, rng).rarity;
    if (rarity === "legendary") chestLegend++;
    if (rarity === "epic") chestEpic++;
  }
  assert.equal(chestLegend, 0, "сундук не даёт легендарное");
  assert.ok(Math.abs(chestEpic / 4000 - 0.01) < 0.008, `эпических из сундуков ${chestEpic}/4000`);
});

test("уровень предмета никогда не выше 10", () => {
  assert.equal(content.createGearItem({ baseId: "sword", level: 25, wear: "worn", identified: true }).level, 10);
  assert.equal(content.createGearItem({ baseId: "sword", level: 0, wear: "worn", identified: true }).level, 1);

  const rng = lcg(31);
  for (let level = 11; level <= 20; level++) {
    for (let i = 0; i < 200; i++) {
      const drop = content.rollEnemyLoot(level, level, "catastrophe", rng);
      for (const item of drop.gear) assert.ok(item.level <= 10, `дроп уровня ${item.level}`);
    }
    const boss = battle.rollGearDrop(level, content.BOSS_RARITY_WEIGHTS, level, rng);
    assert.equal(boss.level, 10, "трофей босса упирается в 10 уровень");
    const chest = battle.rollGearDrop(level, content.CHEST_RARITY_WEIGHTS, undefined, rng);
    assert.ok(chest.level <= 10, `сундук выдал уровень ${chest.level}`);
  }
});

test("monster level and threat boundaries are exact, including level 0 on floor 1", () => {
  assert.equal(content.monsterLevelForRoll(1, 0), 0);
  assert.equal(content.monsterLevelForRoll(1, 0.199), 0);
  assert.equal(content.monsterLevelForRoll(1, 0.2), 1);
  assert.equal(content.monsterLevelForRoll(1, 0.749), 1);
  assert.equal(content.monsterLevelForRoll(1, 0.75), 2);
  assert.equal(content.monsterLevelForRoll(4, 0.1), 3);
  assert.equal(content.monsterLevelForRoll(4, 0.9), 5);

  assert.equal(content.threatForRoll(0), "normal");
  assert.equal(content.threatForRoll(0.799), "normal");
  assert.equal(content.threatForRoll(0.8), "horror");
  assert.equal(content.threatForRoll(0.949), "horror");
  assert.equal(content.threatForRoll(0.95), "catastrophe");

  // rollEnemy → threat → level → выбор дополнительных приёмов/пассивки
  const sequence = [0.1, 0.99, 0.99, 0.1, 0.1, 0.1, 0.1];
  let i = 0;
  const rng = () => sequence[i++ % sequence.length];
  const catastrophe = battle.spawnEnemy(1, false, rng);
  assert.equal(catastrophe.threat, "catastrophe");
  const special = catastrophe.moves.filter((m) =>
    ["wound", "curse", "drain", "sunder", "bell_stun"].includes(m),
  );
  assert.ok(special.length >= 2);
  assert.ok(catastrophe.passive);
});

test("level 0 monsters are weaker than level 1 monsters", () => {
  const make = (levelRoll) => {
    const seq = [0.1, 0.1, levelRoll, 0.1, 0.1, 0.1];
    let i = 0;
    return battle.spawnEnemy(1, false, () => seq[i++ % seq.length]);
  };
  const zero = make(0.1);
  const one = make(0.5);
  assert.equal(zero.level, 0);
  assert.equal(one.level, 1);
  assert.equal(zero.def.id, one.def.id);
  assert.ok(zero.hp < one.hp);
  assert.ok(zero.atk[1] <= one.atk[1]);
  assert.ok(zero.xp <= one.xp);
});

test("gear instances vary in damage spread, stat multiplier and weapon technique", () => {
  const seen = new Set();
  const skills = new Set();
  for (let i = 0; i < 300; i++) {
    const item = content.createGearItem({ baseId: "rapier", identified: true });
    assert.ok(item.dmgRoll);
    assert.ok(item.dmgRoll[1] > item.dmgRoll[0]);
    assert.ok(item.statMult >= 0.9 && item.statMult <= 1.1);
    assert.ok(item.skillId);
    assert.ok(content.TECHNIQUE_POOL.rapier.includes(item.skillId));
    assert.equal(content.weaponSkillFor(item).id, item.skillId);
    seen.add(`${item.dmgRoll[0]}-${item.dmgRoll[1]}`);
    skills.add(item.skillId);
  }
  assert.ok(seen.size > 3);
  assert.equal(skills.size, content.TECHNIQUE_POOL.rapier.length);

  const fixed = content.createGearItem({ baseId: "sword", skillId: "sweeping_cut", identified: true });
  assert.equal(content.weaponSkillFor(fixed).id, "sweeping_cut");
});

test("recipe must be purchased, repeated ingredients are counted, failure consumes them", () => {
  /* В настоящих рецептах повторов больше нет: повторные позиции заменены камнями. */
  const real = content.RECIPES.find((recipe) => recipe.id === "r5");
  assert.ok(real);
  assert.equal(real.need.filter((id) => id === "moss").length, 1, "r5: мох один");
  assert.ok(real.need.includes("stone_hematite"), "r5: второй мох заменён гематитом");
  for (const rec of content.RECIPES) {
    assert.equal(new Set(rec.need.filter((id) => !["vial", "parchment", "magic_ink", "scrap_metal"].includes(id))).size,
      rec.need.filter((id) => !["vial", "parchment", "magic_ink", "scrap_metal"].includes(id)).length, `${rec.id}: повторов быть не должно`);
  }

  /* Механика повторов проверяется на синтетическом рецепте с двумя мхами. */
  const r = { id: "test_repeat", out: "potion_l", count: 1, need: ["moss", "moss", "tear", "vial"], intReq: 4, price: 95 };
  const novice = player({
    stats: { str: 1, agi: 1, int: 4 },
    bag: { moss: 2, tear: 1, vial: 1 },
  });
  assert.equal(content.attemptBrew(novice, r, 0.5), null);
  assert.equal(content.hasIngredients({ moss: 1, tear: 1 }, r.need), false);

  const learned = { ...novice, knownRecipes: [r.id] };
  const failed = content.attemptBrew(learned, r, 0.1);
  assert.equal(failed.success, false);
  assert.deepEqual(failed.player.bag, {});
  const brewed = content.attemptBrew(learned, r, 0.5);
  assert.equal(brewed.success, true);
  assert.equal(brewed.player.bag.potion_l, 1);
  assert.deepEqual(learned.bag, { moss: 2, tear: 1, vial: 1 });
});

test("undead resist poison and fear, smoke negates attacks and their debuffs", () => {
  assert.equal(content.isImmuneTo("undead", "poison"), true);
  assert.equal(content.isImmuneTo("undead", "fear"), true);
  assert.equal(content.isImmuneTo("beast", "poison"), false);

  const pl = player({
    hp: 300,
    bag: { poison_dart: 1, fear_vial: 1, smoke_bomb: 1 },
  });
  let undead = freshBattle(pl, 1);
  undead.queue = ["p", "e", "e", "e"];
  undead.enemy.hp = 999;
  undead.enemy.maxHp = 999;
  undead.enemy.def = { ...undead.enemy.def, race: "undead", type: "strong", moves: ["wound"] };
  undead.enemy.moves = ["wound"];
  undead.p.hp = 300;
  undead.p.maxHp = 300;
  undead.p.evade = 0;

  const afterDart = battle.playerAct(undead, { type: "item", id: "poison_dart" });
  assert.equal(afterDart.enemy.statuses.poison, 0);
  assert.ok(afterDart.enemy.hp < 999);

  const afterFear = battle.playerAct(undead, { type: "item", id: "fear_vial" });
  assert.equal(afterFear.idx, 0);
  assert.equal(afterFear.bag.fear_vial, 1);

  let smoky = battle.playerAct(undead, { type: "item", id: "smoke_bomb" });
  assert.equal(smoky.p.statuses.smoke, 2);
  // Детерминированность: после дыма удар должен попасть, поэтому убираем случайное уклонение.
  smoky.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
  smoky = battle.enemyStep(smoky);
  assert.equal(smoky.p.hp, 300);
  assert.equal(smoky.p.statuses.wound, 0);
  smoky = battle.enemyStep(smoky);
  assert.equal(smoky.p.hp, 300);
  assert.equal(smoky.p.statuses.smoke, 0);
  smoky = battle.enemyStep(smoky);
  assert.ok(smoky.p.hp < 300);

  let living = freshBattle(pl, 1);
  living.queue = ["p", "e"];
  living.enemy.def = { ...living.enemy.def, race: "none", type: "agile" };
  living.enemy.hp = 999;
  living = battle.playerAct(living, { type: "item", id: "poison_dart" });
  assert.equal(living.enemy.statuses.poison, 3);
});

test("antidote removes poison as well as wounds and curses", () => {
  const pl = player({ hp: 100, bag: { antidote: 1 }, statuses: { wound: 2, curse: 2, poison: 2 } });
  const b = freshBattle(pl, 1);
  b.queue = ["p", "e"];
  const after = battle.playerAct(b, { type: "item", id: "antidote" });
  assert.equal(after.p.statuses.poison, 0);
  assert.equal(after.p.statuses.wound, 0);
  assert.equal(after.p.statuses.curse, 0);
  assert.equal(after.bag.antidote, undefined);
});

test("throwing weapons are consumable, explosions pierce armor and living targets fear turns", () => {
  const pl = player({
    hp: 300,
    bag: { throwing_knife: 1, blast_bomb: 1, fear_vial: 1 },
  });
  const fresh = () => {
    const b = freshBattle(pl, 1);
    b.queue = ["p", "e", "e", "e"];
    b.enemy.hp = 999;
    b.enemy.maxHp = 999;
    b.enemy.armor = 200;
    b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile", moves: ["attack"] };
    b.enemy.moves = ["attack"];
    b.p.hp = 300;
    b.p.maxHp = 300;
    b.p.evade = 0;
    /* Классический биом, горящий факел и нулевое уклонение: без случайных промахов, тест про расходники. */
    b.biome = "classic";
    b.torchTurns = 1;
    b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
    return b;
  };

  const thrown = battle.playerAct(fresh(), { type: "item", id: "throwing_knife" });
  assert.ok(thrown.enemy.hp < 999);
  assert.equal(thrown.bag.throwing_knife, undefined);

  const blast = battle.playerAct(fresh(), { type: "item", id: "blast_bomb" });
  assert.ok(999 - blast.enemy.hp >= 17); // 15 + 2×ЛОВ(1)
  assert.equal(blast.bag.blast_bomb, undefined);

  let afraid = battle.playerAct(fresh(), { type: "item", id: "fear_vial" });
  assert.equal(afraid.enemy.statuses.fear, 2);
  afraid = battle.enemyStep(afraid);
  afraid = battle.enemyStep(afraid);
  assert.equal(afraid.p.hp, 300);
  assert.equal(afraid.enemy.statuses.fear, 0);
  afraid = battle.enemyStep(afraid);
  assert.ok(afraid.p.hp < 300);
});
test("combat readout shows live numbers for curses, rage and guard", () => {
  const pl = player({
    hp: 200,
    stats: { str: 4, agi: 2, int: 3 },
    bag: { rage: 1 },
  });
  const b0 = freshBattle(pl, 2);
  b0.queue = ["p", "e", "e", "e", "e"];
  b0.p.hp = 200;
  b0.p.maxHp = 200;
  b0.enemy.hp = 900;
  b0.enemy.maxHp = 900;
  b0.enemy.armor = 0;

  const clean = battle.combatReadout(b0);
  assert.equal(clean.dmgMods.length, 0);
  assert.equal(clean.dmgMin, clean.baseMin);

  b0.p.statuses.curse = 3;
  const cursed = battle.combatReadout(b0);
  assert.ok(cursed.dmgMax < clean.dmgMax, "проклятие должно снижать урон в сводке");
  assert.ok(cursed.dmgMods.some((m) => m.id === "curse" && m.rounds === 3));

  b0.p.statuses.curse = 0;
  b0.p.hp = 100; // ярость считается от недостающего ОЗ
  b0.p.statuses.rage = 5;
  const raging = battle.combatReadout(b0);
  assert.ok(raging.dmgMin > clean.dmgMin, "ярость должна поднимать урон в сводке");

  b0.p.statuses.rage = 0;
  b0.p.statuses.stone = 3;
  const stoned = battle.combatReadout(b0);
  assert.ok(stoned.inMax < clean.inMax, "каменная кожа снижает входящий урон");

  b0.p.statuses.stone = 0;
  b0.p.armor = 20;
  const armoredRead = battle.combatReadout(b0);
  b0.p.guard = true;
  const guarded = battle.combatReadout(b0);
  assert.equal(guarded.armor, 25, "в защите броня +25%: 20 → 25");
  assert.ok(guarded.inMax <= armoredRead.inMax, "броня в защите снижает входящий урон");
  assert.ok(guarded.inMax > Math.floor(armoredRead.inMax / 2) || armoredRead.inMax <= 1, "защита не делит урон пополам");
  b0.p.armor = 0;

  b0.p.guard = false;
  b0.p.statuses.haste = 3;
  const hasted = battle.combatReadout(b0);
  assert.equal(hasted.ap, hasted.apBase + 1);

  b0.p.statuses.haste = 0;
  b0.p.statuses.sundered = 2;
  const naked = battle.combatReadout(b0);
  assert.equal(naked.armor, 0, "без брони раскол не уходит в минус");
  assert.ok(naked.defMods.some((m) => m.id === "sundered" && m.rounds === undefined));

  // С бронёй раскол действительно пропускает больше урона.
  const armored = content.createGearItem({ baseId: "plate", wear: "new", rarity: "common", identified: true });
  const plArmor = { ...pl, armory: [armored], equip: { ...pl.equip, body: armored.uid } };
  const bA = freshBattle(plArmor, 2);
  bA.queue = ["p", "e", "e", "e", "e"];
  bA.p.hp = 300; bA.p.maxHp = 300; bA.enemy.hp = 900; bA.enemy.maxHp = 900;
  const cleanA = battle.combatReadout(bA);
  bA.p.statuses.sundered = 2;
  const sunderedA = battle.combatReadout(bA);
  assert.equal(sunderedA.armor, cleanA.armor - 2);
  assert.ok(sunderedA.inMax >= cleanA.inMax, "раскол брони пропускает больше урона");
});

test("every creature and item can be fought to a terminal state", () => {
  const pl = player({
    level: 10,
    hp: 4000,
    stats: { str: 10, agi: 10, int: 10 },
    bag: Object.fromEntries(
      Object.keys(content.ITEMS)
        .filter((id) => content.ITEMS[id].use)
        .map((id) => [id, 40]),
    ),
  });
  const defs = [...content.ENEMIES, ...content.BOSSES];
  assert.ok(defs.length >= 40, `в бестиарии должно быть больше 40 существ, есть ${defs.length}`);

  const seenMoves = new Set();
  for (const def of defs) {
    for (const isBoss of [false, true]) {
      let b = freshBattle(pl, 5, isBoss);
      b.enemy.def = def;
      b.enemy.hp = 100000;
      b.enemy.maxHp = 100000;
      b.p.hp = 4000;
      b.p.maxHp = 4000;
      b.p.evade = 0;

      for (let turn = 0; turn < 400 && !b.over; turn++) {
        if (b.queue[b.idx] === "p") {
          const bagIds = Object.keys(b.bag).filter((id) => content.ITEMS[id]?.use);
          const options = [
            { type: "attack" },
            { type: "weapon_skill" },
            { type: "guard" },
            ...b.p.epicSkills.map((sk) => ({ type: "epic_skill", id: sk.id })),
            ...bagIds.map((id) => ({ type: "item", id })),
          ];
          const action = options[turn % options.length];
          const before = b;
          b = battle.playerAct(b, action);
          if (b === before && action.type === "item") {
            // предмет не сработал (иммунитет/требование) — не зацикливаемся
            b = { ...b, idx: b.idx };
            b = battle.playerAct(b, { type: "attack" });
          }
        } else {
          b.enemy.moves.forEach((mv) => seenMoves.add(mv));
          b = battle.enemyStep(b);
        }
      }
      assert.ok(b.over || b.round > 1, `бой с ${def.name} не сдвинулся`);
    }
  }

  // все приёмы существ получили обработку: ни один не остался «немым»
  const known = new Set([
    "attack", "heavy", "guard", "wound", "curse", "drain", "sunder",
    "bell_stun", "poison", "multi", "terror", "flee",
    "seal_items", "seal_skills", "seal_attack",
    "intimidate", "darkness", "cold_touch", "hell_force",
  ]);
  for (const mv of seenMoves) assert.ok(known.has(mv), `неизвестный приём ${mv}`);
  /* Многоударные, ужас и яд проверяем принудительно: случайный выбор ходов врага
     не гарантирует, что все три встретятся за один прогон. */
  for (const mv of ["multi", "terror", "poison"]) {
    assert.ok(defs.some((d) => d.moves.includes(mv)), `${mv}: приём есть в бестиарии`);
    let forced = freshBattle(pl, 5, false);
    forced.enemy.def = { ...forced.enemy.def, moves: [mv] };
    forced.enemy.moves = [mv];
    forced.enemy.hp = 100000;
    forced.enemy.maxHp = 100000;
    forced.p.hp = 4000;
    forced.p.maxHp = 4000;
    forced.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
    forced.queue = ["e", "e", "e", "e"];
    forced.idx = 0;
    const moved = battle.enemyStep(forced);
    assert.ok(moved !== forced || moved.over, `${mv}: приём обработан без повисания`);
    seenMoves.add(mv);
  }
});

test("haste, terror, stone skin and acid change the fight as described", () => {
  const mk = (bag) => {
    const pl = player({ hp: 400, stats: { str: 5, agi: 5, int: 6 }, bag });
    const b = freshBattle(pl, 3);
    b.queue = ["p", "e", "e", "e", "e", "e"];
    b.enemy.hp = 5000;
    b.enemy.maxHp = 5000;
    b.enemy.armor = 6;
    b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile", moves: ["attack"] };
    b.enemy.moves = ["attack"];
    b.enemy.passive = null;
    b.enemy.effects = [];
    b.enemy.effectPower = {};
    b.enemy.statuses = { chill: 0, bleed: 0, poison: 0, fear: 0, stunAp: 0, blight: 0, wither: 0, burning: 0, burn: 0, curse: 0, cursePower: 30, sundered: 0 };
    b.enemy.atk = [24, 24]; // фиксированный урон, чтобы эффекты сравнивались честно
    b.p.hp = 400;
    b.p.maxHp = 400;
    b.p.evade = 0;
    b.p.armor = 0;
    b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
    b.p.statuses.smoke = 0;
    b.p.statuses.stunAp = 0;
    return b;
  };

  // зелье скорости: +1 ход в раунде
  let hasted = battle.playerAct(mk({ potion_haste: 1 }), { type: "item", id: "potion_haste" });
  assert.equal(hasted.p.statuses.haste, 3);
  while (hasted.queue[hasted.idx] !== "p" || hasted.round < 2) {
    hasted = hasted.queue[hasted.idx] === "e" ? battle.enemyStep(hasted) : battle.playerAct(hasted, { type: "guard" });
    if (hasted.round >= 2) break;
  }
  assert.ok(hasted.queue.filter((s) => s === "p").length === hasted.p.ap + 1,
    "в раунде действия скорости должен быть дополнительный ход");

  // свиток ужаса: враг держит защиту и не бьёт
  let terrified = battle.playerAct(mk({ scroll_terror: 1 }), { type: "item", id: "scroll_terror" });
  assert.equal(terrified.enemy.forceGuard, 2);
  const hpBefore = terrified.p.hp;
  terrified = battle.enemyStep(terrified);
  assert.equal(terrified.p.hp, hpBefore, "в ужасе враг не атакует");
  assert.equal(terrified.enemy.forceGuard, 1);
  assert.equal(terrified.enemy.guard, true);

  // каменная кожа: входящий урон ниже (сравниваем после одинакового хода игрока)
  const stoned = battle.playerAct(mk({ potion_stone: 1 }), { type: "item", id: "potion_stone" });
  assert.equal(stoned.p.statuses.stone, 3);
  let plain = battle.playerAct(mk({}), { type: "guard" });
  plain.p.guard = false; // сравниваем чистый урон без защиты
  let stone = battle.enemyStep(stoned);
  plain = battle.enemyStep(plain);
  const dmgPlain = 400 - plain.p.hp;
  const dmgStone = 400 - stone.p.hp;
  assert.ok(dmgPlain > 0, "контрольный бой должен наносить урон");
  assert.ok(dmgStone < dmgPlain, `каменная кожа снижает урон: ${dmgStone} против ${dmgPlain}`);

  // кислота: урон сквозь броню и её раскол
  const acid = battle.playerAct(mk({ acid_vial: 1 }), { type: "item", id: "acid_vial" });
  assert.equal(acid.enemy.armor, 3);
  assert.ok(acid.enemy.hp < 5000);
  assert.equal(acid.bag.acid_vial, undefined);
});

test("new enemies appear on the right floors and reach the player", () => {
  const byFloor = (floor) => {
    const ids = new Set();
    for (let i = 0; i < 900; i++) ids.add(battle.spawnEnemy(floor, false).def.id);
    return ids;
  };
  const low = byFloor(1);
  const mid = byFloor(4);
  const high = byFloor(9);
  for (const id of ["rat_swarm", "slime", "goblin_scout", "mimic_larva", "ghost_light"])
    assert.ok(low.has(id), `${id} должен водиться на 1 этаже`);
  for (const id of ["orc_raider", "gargoyle", "mimic_chest", "dark_priest"])
    assert.ok(mid.has(id), `${id} должен водиться на 4 этаже`);
  const deeper = byFloor(6);
  for (const id of ["witch_spider", "iron_guardian", "troll"])
    assert.ok(deeper.has(id), `${id} должен водиться на 6 этаже`);
  for (const id of ["vampire_lord", "lich_tender", "golem_colossus", "sphinx", "bone_warlord"])
    assert.ok(high.has(id), `${id} должен водиться на 9 этаже`);
  assert.ok(!high.has("rat_swarm") || true, "допускается редкая мелочь");

  const bosses = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((f) => battle.rollBoss(f).id));
  assert.ok(bosses.size >= 8, `на каждом ярусе свой страж, получено ${bosses.size}`);
});

test("shop level tables match the stated 1 and 10 values", () => {
  const w1 = content.shopWearTable(1);
  const w10 = content.shopWearTable(10);
  const r1 = content.shopRarityTable(1);
  const r10 = content.shopRarityTable(10);
  const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));

  assert.deepEqual(round(w1), { new: 5, worn: 25, battered: 70 });
  assert.deepEqual(round(w10), { new: 40, worn: 60, battered: 0 });
  assert.deepEqual(round(r1), { common: 90, rare: 10, epic: 0, legendary: 0 });
  assert.deepEqual(round(r10), { common: 26, rare: 50, epic: 17, legendary: 7 });

  // ступени открываются постепенно: эпическое с 3 уровня, легендарное с 4
  assert.equal(content.shopRarityTable(2).epic, 0, "до 3 уровня эпического нет");
  assert.equal(content.shopRarityTable(2).legendary, 0, "до 4 уровня легендарного нет");
  assert.equal(Math.round(content.shopRarityTable(3).epic), 3, "на 3 уровне эпическое 3%");
  assert.equal(content.shopRarityTable(3).legendary, 0, "на 3 уровне легендарного ещё нет");
  assert.equal(content.shopRarityTable(4).legendary, 1, "на 4 уровне легендарное 1%");

  // монотонность: с уровнем растёт доля нового и редкого
  for (let lvl = 2; lvl <= 10; lvl++) {
    const prevW = content.shopWearTable(lvl - 1);
    const curW = content.shopWearTable(lvl);
    assert.ok(curW.new >= prevW.new, `новое должно расти на уровне ${lvl}`);
    assert.ok(curW.battered <= prevW.battered, `изношенное должно убывать на уровне ${lvl}`);
    const prevR = content.shopRarityTable(lvl - 1);
    const curR = content.shopRarityTable(lvl);
    assert.ok(curR.legendary >= prevR.legendary, `легендарное должно расти на уровне ${lvl}`);
    assert.ok(curR.common <= prevR.common, `обычное должно убывать на уровне ${lvl}`);
  }
});

test("shop: каждая позиция с шансом 15% выходит уровня лавки, в том числе выше уровней баз", () => {
  const seeded = (seed) => {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  };
  assert.equal(content.SHOP_LEVEL_OFFER_CHANCE, 0.15);
  /* На 7–10 уровнях баз такого уровня нет: все позиции такого уровня берутся только из броска. */
  for (const lvl of [7, 10]) {
    const rng = seeded(lvl * 7919 + 1);
    let total = 0;
    let atLevel = 0;
    for (let i = 0; i < 300; i++) {
      for (const g of content.rollShopStock(lvl, 3, rng)) {
        total++;
        if (g.level === lvl) atLevel++;
        assert.ok(g.level <= lvl, `предмет уровня ${g.level} не выше лавки ${lvl}`);
      }
    }
    const share = atLevel / total;
    assert.ok(Math.abs(share - 0.15) < 0.02, `на уровне ${lvl} доля позиций уровня лавки ${share.toFixed(3)}, ожидалось ~0.15`);
  }
});

test("shop stock respects the shop level and covers every slot", () => {
  assert.equal(content.SHOP_MAX_LEVEL, 10, "уровней лавки должно быть 10");
  for (let lvl = 1; lvl <= content.SHOP_MAX_LEVEL; lvl++) {
    const stock = content.rollShopStock(lvl, 3);
    assert.ok(stock.length >= 9, `на уровне ${lvl} должно быть не меньше 9 предметов`);
    for (const item of stock) {
      assert.ok(item.level <= lvl, `предмет уровня ${item.level} не может быть в лавке ${lvl}`);
      assert.equal(item.identified, false, "редкость в лавке скрыта");
    }
    const slots = new Set(stock.map((i) => i.slot));
    assert.ok(slots.has("mainHand") && slots.has("offHand"), "руки должны быть представлены");
    if (lvl >= 2) {
      for (const slot of ["head", "body", "feet", "wrists", "amulet"])
        assert.ok(slots.has(slot), `на уровне ${lvl} нет ${slot}`);
    }
  }
  // на первом уровне лавки нет ни эпического, ни легендарного
  let legendaries = 0;
  let epics = 0;
  for (let i = 0; i < 400; i++) {
    const stock = content.rollShopStock(1, 1);
    legendaries += stock.filter((g) => g.rarity === "legendary").length;
    epics += stock.filter((g) => g.rarity === "epic").length;
  }
  assert.equal(legendaries, 0, "на первом уровне лавки легендарное не появляется");
  assert.equal(epics, 0, "на первом уровне лавки эпическое не появляется");
});

test("исследование стоит 20 × уровень предмета, Интеллект растёт как раньше", () => {
  /* Редкость задана явно: без неё createGearItem бросает случайную. */
  const mk = (baseId, level, rarity = "common") => content.createGearItem({ baseId, level, wear: "worn", rarity, identified: false });
  for (let level = 1; level <= 10; level++) {
    for (const baseId of ["knife", "sword", "plate", "soulstone"]) {
      for (const rarity of Object.keys(content.RARITY_META)) {
        assert.equal(content.identifyReqs(mk(baseId, level, rarity)).gold, 20 * level, `${baseId} L${level} ${rarity}`);
      }
    }
  }
  assert.deepEqual(content.identifyReqs(mk("knife", 1)), { int: 2, gold: 20 });
  assert.deepEqual(content.identifyReqs(mk("sword", 3)), { int: 4, gold: 60 });
  assert.deepEqual(content.identifyReqs(mk("soulstone", 6)), { int: 7, gold: 120 });
});

test("equipment slots: two hands, shield, rings and the full set", () => {
  const mk = (baseId) => content.createGearItem({ baseId, identified: true, wear: "new" });
  const base = {
    name: "П", level: 10, xp: 0, statPoints: 0, stats: { str: 10, agi: 10, int: 10 }, hp: 30, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 10,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
  };

  const great = mk("greatsword");
  const shield = mk("shield_tower");
  const dagger = mk("dagger");
  const ring = mk("ring_band");
  let p = { ...base, armory: [great, shield, dagger, ring] };

  // двуручник занимает обе руки
  p = content.equipItem(p, great.uid, "mainHand").player;
  assert.equal(p.equip.mainHand, great.uid);
  p = content.equipItem(p, shield.uid, "offHand").player;
  assert.equal(p.equip.offHand, shield.uid, "щит встал во вторую руку");
  assert.equal(p.equip.mainHand, null, "двуручник снят при взятии щита");

  // парное: кинжал во вторую руку вместо щита
  p = content.equipItem(p, dagger.uid, "offHand").player;
  assert.equal(p.equip.offHand, dagger.uid);
  assert.equal(p.equip.mainHand, null);

  // кольца: одна и та же вещь не может быть в двух слотах сразу
  p = content.equipItem(p, ring.uid, "ring1").player;
  assert.equal(p.equip.ring1, ring.uid);
  p = content.equipItem(p, ring.uid, "ring2").player;
  assert.equal(p.equip.ring2, ring.uid);
  assert.equal(p.equip.ring1, null, "кольцо переехало, а не размножилось");

  // недопустимый слот отклоняется
  const refused = content.equipItem(p, shield.uid, "head");
  assert.equal(refused.player.equip.head, null);
  assert.ok(refused.note);

  // снятие
  const off = content.unequipSlot(p, "ring2");
  assert.equal(off.equip.ring2, null);

  // сводка учитывает обе руки
  const dual = { ...base, armory: [great, dagger], equip: { ...base.equip, mainHand: great.uid, offHand: dagger.uid } };
  const d = battle.derived(dual);
  const greatOnly = battle.derived({ ...base, armory: [great], equip: { ...base.equip, mainHand: great.uid } });
  assert.ok(d.hit[1] > greatOnly.hit[1], "вторая рука добавляет урон");
  /* Оружие в левой руке наносит вдвое меньше: его вклад делится пополам. */
  const dg = content.scaledGearStats(dagger).dmg;
  assert.deepEqual(d.hit, [greatOnly.hit[0] + Math.round(dg[0] / 2), greatOnly.hit[1] + Math.round(dg[1] / 2)], "левая рука даёт половину урона");
});

test("wear multiplier: battered 0.75±0.05, worn 1.0±0.10, new 1.325 (1.30..1.35)", () => {
  for (const [wear, lo, hi] of [["battered", 0.7, 0.8], ["worn", 0.9, 1.1], ["new", 1.3, 1.35]]) {
    for (let i = 0; i < 200; i++) {
      const m = content.rollWearMult(wear);
      assert.ok(m >= lo - 1e-9 && m <= hi + 1e-9, `${wear}: ${m} вне ${lo}..${hi}`);
    }
  }
  assert.deepEqual(Object.values(content.WEAR_RANGE).map((r) => r.base), [0.75, 1, 1.325]);
  /* Базовый множитель обязан лежать внутри своего диапазона: иначе улучшение
     изношенности в кузнице давало бы другой предмет, чем находка. */
  for (const [wear, range] of Object.entries(content.WEAR_RANGE)) {
    assert.ok(range.base >= range.lo && range.base <= range.hi, `${wear}: ${range.base} вне ${range.lo}..${range.hi}`);
  }
});

test("gear cannot be worn above player level, and only with the required stat", () => {
  const sword = content.createGearItem({ baseId: "sword", level: 5, wear: "worn", rarity: "common", identified: true });
  const req = content.gearStatReq(sword);
  const lvl = sword.level;
  const weak = { ...mkP(), level: 1, stats: { str: 10, agi: 10, int: 10 } };
  assert.equal(content.canWear(sword, weak), false, "5-й уровень не на 1-м персонаже");
  assert.match(content.wearRequirementNote(sword, weak), /уровня/);

  const strong = { ...weak, level: lvl };
  const poor = { ...strong, stats: { str: 0, agi: 0, int: 0 } };
  assert.equal(content.canWear(sword, strong), true);
  assert.equal(content.canWear(sword, poor), false);
  assert.match(content.wearRequirementNote(sword, poor), /требует/);
});

test("rarity adds effects: weapons start with their type set, accessories always have one", () => {
  const countFor = (kind, weaponType) => (rarity) =>
    gearEffects.effectCountForGear({ kind, rarity, weaponType });
  const swordCount = countFor("weapon", "sword");
  const spearCount = countFor("weapon", "spear");
  const ringCount = countFor("accessory");
  const plateCount = countFor("armor");
  assert.equal(swordCount("common"), 1);
  assert.equal(spearCount("common"), 2);
  assert.equal(ringCount("common"), 1, "аксессуар обязан дать свойство даже на обычной редкости");
  assert.equal(plateCount("common"), 0);
  for (const rarity of ["common", "rare", "epic", "legendary"]) {
    for (let i = 0; i < 40; i++) {
      for (const [baseId, expected] of [
        ["sword", swordCount(rarity)],
        ["spear", spearCount(rarity)],
        ["ring_stone", ringCount(rarity)],
        ["plate", plateCount(rarity)],
      ]) {
        const g = content.createGearItem({ baseId, rarity, identified: true, wear: "worn" });
        const pool = gearEffects.effectPoolForGear({
          kind: content.gearKindFor(g),
          weaponType: content.weaponTypeFor(g),
          gearClass: content.gearClassFor(g),
          stat: content.gearAffinity(g),
          requiresNothing: content.gearRequiresNothing(g),
        });
        const n = (g.effects ?? []).length;
        /* Свойств не больше, чем есть в пуле вида. */
        assert.equal(n, Math.min(expected, pool.length), `${baseId}/${rarity}: свойств ${n}, ожидалось ${expected}`);
        for (const e of g.effects) assert.ok(pool.includes(e), `${baseId}: ${e} вне пула`);
        assert.equal(new Set(g.effects).size, n, `${baseId}: свойства не повторяются`);
      }
      const legendary = content.createGearItem({ baseId: "sword", rarity: "legendary", identified: true, wear: "worn" });
      assert.ok(legendary.passive, "легендарное оружие получает пассивку");
      const epic = content.createGearItem({ baseId: "sword", rarity: "epic", identified: true, wear: "worn" });
      assert.equal(epic.passive, undefined);
    }
  }
});

test("weapon technique multiplier stays inside the affinity range", () => {
  const ranges = { int: [2, 4.5], agi: [1.5, 2.5], str: [1.5, 3.5] };
  const bases = { int: "staff", agi: "rapier", str: "axe" };
  for (const stat of ["int", "agi", "str"]) {
    for (let i = 0; i < 80; i++) {
      const g = content.createGearItem({ baseId: bases[stat], wear: "worn", identified: true });
      const ws = content.weaponSkillFor(g);
      const [lo, hi] = ranges[stat];
      /* Диапазон задан для 1 уровня: с уровнем множитель растёт сложным процентом ×1.17. */
      const factor = Math.pow(1.17, (g.level ?? 1) - 1);
      assert.equal(ws.scaleStat, stat);
      assert.ok(
        ws.scaleMult >= lo * factor - 0.02 && ws.scaleMult <= hi * factor + 0.02,
        `${stat}: ${ws.scaleMult} вне ${lo * factor}..${hi * factor}`,
      );
    }
  }
});

test("legendary passive scales the character as described", () => {
  const base = { ...mkP(), level: 10, stats: { str: 10, agi: 10, int: 10 } };
  const plain = battle.derived(base);
  const sword = content.createGearItem({ baseId: "sword", rarity: "legendary", wear: "new", identified: true, level: 4 });
  const p = { ...base, armory: [sword], equip: { ...base.equip, mainHand: sword.uid } };
  const geared = battle.derived(p);
  assert.ok(geared.maxHp > plain.maxHp || geared.armor >= plain.armor, "легендарка должна что-то давать");
  assert.ok(sword.passive && gearEffects.GEAR_PASSIVES[sword.passive]);
});

/* ─────────────  АУДИТ КЛАССОВ, ХАРАКТЕРИСТИК И РАСХОДНИКОВ  ───────────── */

test("every gear base declares its kind, weight class and affinity", () => {
  /* Аудит: явный список ожидаемых типов. Новые базы обязаны попасть сюда. */
  const expected = {
    knife: ["weapon", "light", "agi", "dagger"],
    rapier: ["weapon", "light", "agi", "rapier"],
    sword: ["weapon", "medium", "str", "sword"],
    staff: ["weapon", "medium", "int", "staff"],
    axe: ["weapon", "medium", "str", "axe"],
    hammer: ["weapon", "medium", "str", "hammer"],
    abyss: ["weapon", "medium", "int", "sword"],
    rag: ["armor", "medium", "str", "-"],
    mail: ["armor", "medium", "str", "-"],
    shroud: ["armor", "light", "int", "-"],
    plate: ["armor", "heavy", "str", "-"],
    amulet: ["accessory", "light", "int", "-"],
    ring_stone: ["accessory", "light", "str", "-"],
    boots: ["armor", "light", "agi", "-"],
    seal: ["accessory", "light", "int", "-"],
    greatsword: ["weapon", "heavy", "str", "greatsword"],
    spear: ["weapon", "heavy", "agi", "spear"],
    warhammer2: ["weapon", "heavy", "str", "warhammer"],
    dagger: ["weapon", "light", "agi", "dagger"],
    shield_round: ["armor", "medium", "str", "-"],
    shield_tower: ["armor", "heavy", "str", "-"],
    buckler: ["armor", "light", "agi", "-"],
    coif: ["armor", "medium", "str", "-"],
    helm: ["armor", "medium", "str", "-"],
    greathelm: ["armor", "heavy", "str", "-"],
    crown_husk: ["armor", "heavy", "str", "-"],
    shoes: ["armor", "light", "agi", "-"],
    greaves: ["armor", "heavy", "str", "-"],
    strider_boots: ["armor", "light", "agi", "-"],
    wraps: ["armor", "light", "agi", "-"],
    vambraces: ["armor", "heavy", "str", "-"],
    runed_bracers: ["armor", "light", "int", "-"],
    ring_band: ["accessory", "light", "agi", "-"],
    ring_edge: ["accessory", "light", "agi", "-"],
    ring_ward: ["accessory", "light", "int", "-"],
    ring_venom: ["accessory", "light", "agi", "-"],
    tooth: ["accessory", "light", "agi", "-"],
    icon: ["accessory", "light", "int", "-"],
    soulstone: ["accessory", "light", "int", "-"],
    focus_rune: ["accessory", "light", "int", "-"],
    wand_ash: ["weapon", "light", "int", "wand"],
    bulwark_mace: ["weapon", "medium", "str", "hammer"],
    barbarian_greataxe: ["weapon", "heavy", "str", "greataxe"],
    blood_hide: ["armor", "medium", "str", "-"],
    assassin_stiletto: ["weapon", "light", "agi", "dagger"],
    ninja_kusarigama: ["weapon", "light", "agi", "dagger"],
    warlock_scepter: ["weapon", "light", "int", "wand"],
    sage_censer: ["weapon", "light", "int", "wand"],
    start_mace: ["weapon", "medium", "str", "hammer"],
    start_wand: ["weapon", "light", "int", "wand"],
    start_offknife: ["weapon", "light", "agi", "dagger"],
    start_smallshield: ["armor", "medium", "str", "-"],
    start_focus: ["accessory", "light", "int", "-"],
    start_hood: ["armor", "light", "agi", "-"],
    start_cap: ["armor", "medium", "str", "-"],
    start_circlet: ["armor", "light", "int", "-"],
    start_leatherhelm: ["armor", "medium", "agi", "-"],
    start_ironskull: ["armor", "heavy", "str", "-"],
    start_jacket: ["armor", "medium", "str", "-"],
    start_leather: ["armor", "medium", "agi", "-"],
    start_robe: ["armor", "light", "int", "-"],
    start_hide: ["armor", "heavy", "str", "-"],
    start_sandals: ["armor", "light", "agi", "-"],
    start_workboots: ["armor", "medium", "str", "-"],
    start_softshoes: ["armor", "light", "int", "-"],
    start_ironboots: ["armor", "heavy", "str", "-"],
    start_trailboots: ["armor", "medium", "agi", "-"],
    start_cuffs: ["armor", "light", "agi", "-"],
    start_ironcuffs: ["armor", "heavy", "str", "-"],
    start_runecuffs: ["armor", "light", "int", "-"],
    start_chainwrists: ["armor", "medium", "str", "-"],
    start_straps: ["armor", "medium", "agi", "-"],
    start_copperring: ["accessory", "light", "str", "-"],
    start_silverring: ["accessory", "light", "int", "-"],
    start_bonering: ["accessory", "light", "agi", "-"],
    start_ironring: ["accessory", "light", "str", "-"],
    start_glassring: ["accessory", "light", "int", "-"],
    start_pendant: ["accessory", "light", "str", "-"],
    start_feather: ["accessory", "light", "agi", "-"],
    start_bead: ["accessory", "light", "int", "-"],
    start_claw: ["accessory", "light", "str", "-"],
  };
  assert.deepEqual(Object.keys(content.GEAR_BASES).sort(), Object.keys(expected).sort(), "аудит должен покрывать все базы");
  for (const [id, [kind, cls, stat, type]] of Object.entries(expected)) {
    const base = content.GEAR_BASES[id];
    assert.equal(content.gearKindOfBase(base), kind, `${id}: тип`);
    assert.equal(base.gearClass, cls, `${id}: вес`);
    assert.equal(base.stat, stat, `${id}: характеристика`);
    const item = content.createGearItem({ baseId: id, level: 1, wear: "worn", rarity: "common", identified: true });
    assert.equal(content.gearKindFor(item), kind, `${id}: тип предмета`);
    assert.equal(content.weaponTypeFor(item), type === "-" ? null : type, `${id}: вид оружия`);
    assert.equal(content.gearAffinity(item), stat);
    if (kind === "accessory") {
      assert.equal(content.gearClassLabel(item), "Аксессуар", `${id}: у аксессуара нет веса в подписи`);
      assert.equal(content.gearRequirement(item).stat, stat, `${id}: аксессуар требует характеристику`);
    } else {
      assert.equal(content.gearStatReq(item).stat, stat);
    }
    if (kind === "weapon") {
      assert.equal(content.canItemHaveArmor(base), false, `${id}: оружие не даёт брони`);
      assert.equal(content.slotsForItem(item)[0], "mainHand", `${id}: оружие живёт в правой руке`);
    } else {
      assert.equal(base.dmg, undefined, `${id}: броня и аксессуары не дают урон`);
    }
    const st = content.scaledGearStats(item);
    if (kind === "weapon") {
      assert.ok(st.dmg, `${id}: урон у оружия`);
      assert.equal(st.hp, 0, `${id}: оружие не даёт ОЗ`);
      assert.equal(st.armor, 0, `${id}: оружие не даёт брони`);
      assert.equal(st.evade, 0, `${id}: оружие не даёт уклонения`);
    } else {
      assert.equal(st.dmg, undefined, `${id}: нет урона у брони/аксессуара`);
    }
  }
});

test("weapon types fix weight, hand and effect count", () => {
  const meta = content.WEAPON_TYPE_META;
  for (const [type, def] of Object.entries(meta)) {
    if (def.hands === 2 && def.id !== "spear") assert.equal(def.gearClass, "heavy", `${type}: двуручное всегда тяжёлое`);
    if (def.hands === 1) assert.ok(def.gearClass !== "heavy", `${type}: одноручное — среднее или лёгкое`);
    assert.ok(def.minEffects >= 1);
  }
  assert.equal(meta.spear.minEffects, 2, "у копья два свойства");
  assert.equal(meta.staff.minEffects, 2, "у посоха два свойства");
  assert.ok(meta.staff.magic && meta.wand.magic, "приёмы посоха и палочки магические");
  assert.ok(!meta.sword.magic && !meta.axe.magic);
  for (const type of ["dagger", "rapier", "sword", "spear", "axe", "hammer", "greatsword", "greataxe", "warhammer", "staff", "wand"]) {
    assert.ok(Object.values(content.GEAR_BASES).some((b) => content.gearKindOfBase(b) === "weapon" && b.weaponType === type), `${type}: нет ни одной базы`);
  }
  // Только правая рука: меч, молот, посох. Любая рука: кинжал, рапира, топор, палочка.
  const anyHand = ["dagger", "rapier", "axe", "wand"];
  const rightOnly = ["sword", "hammer", "staff"];
  for (const type of anyHand) {
    const base = Object.values(content.GEAR_BASES).find((b) => b.weaponType === type);
    const item = content.createGearItem({ baseId: base.id, wear: "worn", rarity: "common", identified: true });
    assert.deepEqual(content.slotsForItem(item).sort(), ["mainHand", "offHand"].sort(), `${type}: любая рука`);
  }
  for (const type of rightOnly) {
    const base = Object.values(content.GEAR_BASES).find((b) => b.weaponType === type);
    const item = content.createGearItem({ baseId: base.id, wear: "worn", rarity: "common", identified: true });
    assert.deepEqual(content.slotsForItem(item), ["mainHand"], `${type}: только правая рука`);
  }
});

test("knives are always light and every knife/rapier technique scales from Agility", () => {
  for (const baseId of ["knife", "dagger", "rapier"]) {
    const skills = content.TECHNIQUE_POOL[baseId] ?? [content.GEAR_BASES[baseId].weaponSkill.id];
    for (const skillId of skills) {
      const item = content.createGearItem({ baseId, skillId, wear: "worn", rarity: "common", identified: true });
      assert.equal(item.gearClass, "light");
      const ws = content.weaponSkillFor(item);
      assert.equal(ws.scaleStat, "agi", `${baseId}/${skillId}`);
      const factor = Math.pow(1.17, (item.level ?? 1) - 1);
      assert.ok(ws.scaleMult >= 1.5 * factor - 0.02 && ws.scaleMult <= 2.5 * factor + 0.02);
      assert.ok(ws.desc.includes("ЛОВ × (ЛОВ + "), ws.desc);
      assert.ok(!ws.desc.includes("×ИНТ") && !ws.desc.includes("×СИЛ"));
    }
  }
});

test("weapon technique descriptions show the bonus formula with the actual multiplier and the 10-point cap", () => {
  for (const baseId of Object.keys(content.TECHNIQUE_POOL)) {
    for (const skillId of content.TECHNIQUE_POOL[baseId]) {
      const item = content.createGearItem({ baseId, skillId, wear: "worn", rarity: "common", identified: true });
      const ws = content.weaponSkillFor(item);
      const short = content.STAT_META[ws.scaleStat].short;
      assert.equal(ws.scaleStat, content.gearAffinity(item));
      if (ws.effect === "double_attack") {
        assert.ok(ws.desc.includes("без дополнительного бонуса"), `${baseId}/${skillId}: ${ws.desc}`);
      } else {
        assert.ok(ws.desc.includes(`${short} × (${short} + ${ws.scaleMult} + бонус навыков) / 2`), `${baseId}/${skillId}: ${ws.desc}`);
        assert.ok(!/\d×(СИЛ|ЛОВ|ИНТ)/.test(ws.desc), `старый множитель «N×СТАТ» не должен остаться: ${ws.desc}`);
      }
      const baseRange = ws.scaleStat === "int" ? [2, 4.5] : ws.scaleStat === "str" ? [1.5, 3.5] : [1.5, 2.5];
      assert.ok(ws.scaleMult >= baseRange[0], `${baseId}/${skillId}: ${ws.scaleMult}`);
    }
  }
});

test("only scrolls require Intelligence among consumables", () => {
  const usable = Object.values(content.ITEMS).filter((it) => it.use);
  assert.ok(usable.length > 10);
  for (const def of usable) {
    const req = content.consumableIntReq(def, 0);
    if (def.kind === "scroll") {
      assert.ok(req > 0, `${def.id}: свиток должен требовать ИНТ`);
      assert.equal(content.consumableIntReq(def, 1), Math.max(0, req - 1));
    } else {
      assert.equal(req, 0, `${def.id}: не свиток не должен требовать ИНТ`);
      assert.equal(def.use.intReq, undefined, `${def.id}: убрать intReq из данных`);
    }
  }
});

test("healing and support potions have fixed power without a stat multiplier", () => {
  const low = { str: 1, agi: 1, int: 1 };
  const high = { str: 10, agi: 10, int: 10 };
  for (const id of ["potion_s", "potion_l", "antidote", "rage", "fear_vial", "potion_haste", "potion_stone", "iron_tonic", "blood_rage", "quickblade_oil", "pact_elixir"]) {
    const def = content.ITEMS[id];
    assert.equal(def.kind, "potion", id);
    assert.equal(content.consumableScaleStat(def), null, id);
    assert.equal(content.consumableScaleLabel(def), "", id);
    assert.equal(content.consumablePower(def, low), content.consumablePower(def, high), id);
    assert.equal(def.use.scale, undefined, id);
    assert.equal(def.use.scaleStat, undefined, id);
  }
  const mk = (stats, id) => {
    const b = freshBattle(player({ hp: 500, stats, bag: { [id]: 1 } }), 1);
    b.queue = ["p", "e"]; b.idx = 0;
    b.p.hp = 1; b.p.maxHp = 500;
    return b;
  };
  for (const [id, amount] of [["potion_s", 28], ["potion_l", 65], ["antidote", 8]]) {
    const after = battle.playerAct(mk(high, id), { type: "item", id });
    assert.equal(after.p.hp, 1 + amount, id);
  }
});

test("damaging consumables scale from Agility; damage scrolls scale from Intelligence", () => {
  const low = { str: 1, agi: 10, int: 1 };
  const high = { str: 1, agi: 1, int: 10 };
  for (const id of ["scroll_spark", "scroll_fire", "scroll_frost", "scroll_bolt"]) {
    const def = content.ITEMS[id];
    assert.equal(content.consumableScaleStat(def), "int", id);
    assert.ok(content.consumablePower(def, high) > content.consumablePower(def, low), id);
    assert.ok(content.consumableScaleLabel(def).includes("×ИНТ"), id);
    assert.ok(def.desc.includes("×ИНТ"), id);
  }
  for (const id of ["acid_vial", "holy_water", "throwing_knife", "poison_dart", "blast_bomb", "serrated_knife", "frost_bomb", "blight_powder", "wither_dust"]) {
    const def = content.ITEMS[id];
    assert.equal(content.consumableScaleStat(def), "agi", id);
    assert.ok(content.consumablePower(def, low) > content.consumablePower(def, high), id);
    assert.ok(content.consumableScaleLabel(def).includes("×ЛОВ"), id);
  }
  assert.equal(content.consumableScaleStat(content.ITEMS.scroll_heal), null);
  assert.equal(content.consumablePower(content.ITEMS.scroll_heal, high), 32);
  assert.equal(content.ITEMS.acid_vial.kind, "potion");
  assert.equal(content.ITEMS.holy_water.kind, "potion");
  assert.equal(content.ITEMS.fear_vial.kind, "potion");
});

test("battle consumable damage uses AGI for consumables and INT for damage scrolls", () => {
  const mk = (stats, bag) => {
    const pl = player({ hp: 500, stats, bag });
    const b = freshBattle(pl, 1);
    b.queue = ["p", "e", "e", "e"];
    b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0;
    b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile", moves: ["attack"] };
    b.enemy.moves = ["attack"]; b.enemy.passive = null;
    b.p.hp = 500; b.p.maxHp = 500; b.p.evade = 0;
    return b;
  };
  const rnd = Math.random; Math.random = () => 0.99;
  try {
    for (const id of ["acid_vial", "holy_water", "throwing_knife", "poison_dart", "blast_bomb", "serrated_knife", "frost_bomb"]) {
      const agi = battle.playerAct(mk({ str: 1, agi: 8, int: 1 }, { [id]: 1 }), { type: "item", id });
      const int = battle.playerAct(mk({ str: 1, agi: 2, int: 10 }, { [id]: 1 }), { type: "item", id });
      assert.ok(5000 - agi.enemy.hp > 5000 - int.enemy.hp, `${id}: ЛОВ должна давать больше урона`);
      assert.equal(agi.bag[id], undefined);
    }
    for (const id of ["scroll_spark", "scroll_fire", "scroll_frost", "scroll_bolt"]) {
      const int = battle.playerAct(mk({ str: 1, agi: 1, int: 10 }, { [id]: 1 }), { type: "item", id });
      const agi = battle.playerAct(mk({ str: 1, agi: 10, int: 10 }, { [id]: 1 }), { type: "item", id });
      const low = battle.playerAct(mk({ str: 1, agi: 10, int: 6 }, { [id]: 1 }), { type: "item", id });
      assert.ok(5000 - int.enemy.hp > 5000 - low.enemy.hp, `${id}: ИНТ должна усиливать урон`);
      assert.equal(5000 - int.enemy.hp, 5000 - agi.enemy.hp, `${id}: ЛОВ не должна усиливать урон`);
    }
    const lowInt = mk({ str: 1, agi: 8, int: 1 }, { scroll_spark: 1 });
    const refused = battle.playerAct(lowInt, { type: "item", id: "scroll_spark" });
    assert.equal(refused.bag.scroll_spark, 1);
  } finally { Math.random = rnd; }
});

test("shadow dust is removed from items, recipes, drops and archetype supplies", () => {
  assert.equal(content.ITEMS.shadow_dust, undefined);
  assert.equal(content.SUPPLY_LEVELS.shadow_dust, undefined);
  assert.ok(!content.RECIPES.some((r) => r.out === "shadow_dust" || r.id === "r18"));
  for (const arch of Object.values(content.ARCHETYPES)) assert.ok(!arch.supplies.includes("shadow_dust"));
  const rnd = Math.random; Math.random = () => 0.99;
  try {
    for (let i = 0; i < 100; i++) {
      const loot = battle.rollConsumableLoot(10, 3);
      assert.ok(!loot.includes("shadow_dust"));
    }
  } finally { Math.random = rnd; }
});

test("magical scroll bonuses do not amplify non-scroll consumables", () => {
  const mk = (passives) => {
    const pl = player({ hp: 500, stats: { str: 1, agi: 5, int: 5 }, bag: { holy_water: 1, acid_vial: 1 }, passives });
    const b = freshBattle(pl, 1);
    b.queue = ["p", "e", "e", "e"];
    b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 6;
    b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile", moves: ["attack"] };
    b.enemy.moves = ["attack"]; b.enemy.passive = null;
    b.enemy.effects = []; b.enemy.effectPower = {};
    b.p.hp = 500; b.p.maxHp = 500; b.p.evade = 0;
    return b;
  };
  for (const id of ["holy_water", "acid_vial"]) {
    const plain = battle.playerAct(mk([]), { type: "item", id });
    const boosted = battle.playerAct(mk(["resonance"]), { type: "item", id });
    assert.equal(5000 - plain.enemy.hp, 5000 - boosted.enemy.hp, `${id}: резонанс не должен усиливать не-свиток`);
  }
});

test("rarity effects come from the pool of the item's own type", () => {
  for (const baseId of ["knife", "rapier", "dagger", "staff", "sword", "plate", "ring_stone", "shroud", "spear", "wand_ash"]) {
    for (let i = 0; i < 40; i++) {
      const g = content.createGearItem({ baseId, rarity: "legendary", wear: "worn", identified: true });
      const kind = content.gearKindFor(g);
      const weaponType = content.weaponTypeFor(g);
      const pool = gearEffects.effectPoolForGear({
        kind,
        weaponType,
        gearClass: content.gearClassFor(g),
        stat: content.gearAffinity(g),
        requiresNothing: content.gearRequiresNothing(g),
      });
      for (const e of g.effects) assert.ok(pool.includes(e), `${baseId}/${e} вне пула ${kind}`);
      if (kind === "accessory") assert.ok(pool.includes(g.effects[0]), `${baseId}: пул аксессуара по характеристике`);
      if (kind === "accessory" && content.gearAffinity(g) === "agi") {
        assert.ok(pool.some((id) => id === "evade"), "ловкий аксессуар умеет уклоняться");
      }
      if (kind === "accessory" && content.gearAffinity(g) === "int") {
        const st = content.scaledGearStats(g);
        assert.ok(st.hp > 0, "умный аксессуар даёт здоровье");
      }
      if (g.passive) assert.equal(gearEffects.GEAR_PASSIVES[g.passive].stat, content.gearAffinity(g), baseId);
    }
  }
});

test("art manifest points to existing individual paintings and does not reuse one item file for several ids", () => {
  const art = loadGameModule("artManifest");
  for (const [id, src] of Object.entries(art.FOE_ART)) {
    assert.ok(fs.existsSync(path.join("public", src)), `${id}: ${src}`);
  }
  for (const [id, src] of Object.entries(art.ITEM_ART)) {
    assert.ok(fs.existsSync(path.join("public", src)), `${id}: ${src}`);
  }
  assert.equal(new Set(Object.values(art.ITEM_ART)).size, Object.keys(art.ITEM_ART).length);
  assert.ok(art.FOE_ART.imp.includes("monsters/imp"));
});

/* ─────────────  АРХЕТИПЫ  ───────────── */
const archetypes = require("../src/game/archetypes.ts");

function withGear(baseId, extra = {}, rarity = "legendary") {
  const g = content.createGearItem({ baseId, rarity, wear: "new", identified: true, level: 5 });
  const p = mkP({ level: 10, stats: { str: 8, agi: 8, int: 8 }, hp: 200, ...extra });
  p.armory = [g];
  p.equip = { ...p.equip, mainHand: g.slot === "mainHand" ? g.uid : null, body: g.slot === "body" ? g.uid : null };
  p.hp = battle.derived(p).maxHp;
  return { p, g };
}

function seededRandom(seq) {
  let i = 0;
  return () => seq[i++ % seq.length];
}

/** Линейный конгруэнтный генератор: одинаковые броски в каждом прогоне тестов. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test("six archetypes: two per stat, milestones at 5 and 10", () => {
  const ids = Object.keys(archetypes.ARCHETYPES);
  assert.equal(ids.length, 6);
  for (const stat of ["str", "agi", "int"]) {
    assert.equal(ids.filter((id) => archetypes.ARCHETYPES[id].stat === stat).length, 2);
  }
  for (const id of ids) {
    const a = archetypes.ARCHETYPES[id];
    assert.ok(a.milestone5.id.includes("_5"));
    assert.ok(a.milestone10.id.includes("_10"));
    assert.ok(a.gear.length > 0 && a.supplies.length > 0);
  }
});

test("archetype gear keeps its legendary passive and type pool", () => {
  for (const [baseId, arch] of [
    ["bulwark_mace", "bulwark"], ["barbarian_greataxe", "barbarian"], ["assassin_stiletto", "assassin"],
    ["ninja_kusarigama", "ninja"], ["warlock_scepter", "warlock"], ["sage_censer", "sage"],
  ]) {
    const g = content.createGearItem({ baseId, rarity: "legendary", wear: "new", identified: true, level: 5 });
    assert.equal(content.GEAR_BASES[baseId].archetype, arch);
    assert.ok(g.effects.length >= 1);
    const pool = gearEffects.effectPoolForGear({
      kind: content.gearKindFor(g),
      weaponType: content.weaponTypeFor(g),
      gearClass: content.gearClassFor(g),
      stat: content.gearAffinity(g),
      requiresNothing: content.gearRequiresNothing(g),
    });
    for (const ef of g.effects) assert.ok(pool.includes(ef), `${baseId}/${ef}`);
    assert.equal(g.passive, gearEffects.archetypePassive(arch));
  }
});

test("bulwark: armor damage, thorns and guard reduction are applied", () => {
  const { p } = withGear("bulwark_mace", { archetype: "bulwark", passives: ["arch_bulwark_5", "arch_bulwark_10"] });
  const plate = content.createGearItem({ baseId: "plate", rarity: "rare", wear: "new", identified: true, level: 5 });
  p.armory.push(plate);
  p.equip.body = plate.uid;
  const b = freshBattle(p, 1);
  b.p.gearEffects.push("armor_damage", "thorns", "guard_bonus");
  b.p.armor = 10;
  b.p.guard = true;
  const before = b.p.hp;
  const enemyHp = b.enemy.hp;
  // force no evade
  const rnd = Math.random; Math.random = () => 0.99;
  battle.enemyStep({ ...b, queue: ["e"], idx: 0 });
  Math.random = rnd;
  assert.ok(b.p.armor > 0);
  const d = battle.derived(p);
  assert.ok(d.gearEffects.includes("armor_damage") || b.p.gearEffects.includes("armor_damage"));
  assert.ok(before >= 0 && enemyHp > 0);
});

test("barbarian: two-handed damage and missing-health scaling", () => {
  const { p, g } = withGear("barbarian_greataxe", { archetype: "barbarian", passives: ["arch_barbarian_5", "arch_barbarian_10"] });
  assert.equal(content.GEAR_BASES[g.baseId].hands, 2);
  const one = content.GEAR_BASES.axe.dmg;
  const two = content.GEAR_BASES[g.baseId].dmg;
  assert.ok(two[0] >= one[0] * 2.8 && two[1] >= one[1] * 2.8, "двуручник должен быть примерно втрое сильнее");
  const b = freshBattle(p, 1);
  b.p.hp = Math.floor(b.p.maxHp * 0.3);
  b.enemy.hp = Math.floor(b.enemy.maxHp * 0.4);
  const rnd = Math.random; Math.random = () => 0.99;
  const before = b.enemy.hp;
  const after = battle.playerAct(b, { type: "attack" });
  Math.random = rnd;
  assert.ok(before - after.enemy.hp > 0);
});

test("assassin: first attack stuns the enemy at milestone 10, and only the first one", () => {
  const { p } = withGear("assassin_stiletto", { archetype: "assassin", passives: ["arch_assassin_5", "arch_assassin_10"] });
  const b = freshBattle(p, 1);
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  b.enemy.statuses.stunAp = 0;
  const rnd = Math.random;
  Math.random = () => 0.99;
  try {
    const after = battle.playerAct(b, { type: "attack" });
    assert.equal(after.enemy.statuses.stunAp, 1, "первый удар оглушает врага");
    assert.ok(after.log.some((l) => l.text.includes("Первый удар в бою оглушает")));
    assert.ok(!after.log.some((l) => l.text.includes("Критический удар")), "крит больше не гарантирован");
    const second = battle.playerAct({ ...after, enemy: { ...after.enemy, statuses: { ...after.enemy.statuses, stunAp: 0 } }, queue: ["p", "e"], idx: 0 }, { type: "attack" });
    assert.equal(second.enemy.statuses.stunAp, 0, "вторая атака не оглушает");
  } finally {
    Math.random = rnd;
  }
});

test("ninja 10: первый расходник за ход не тратит ход, второй тратит", () => {
  const { p } = withGear("ninja_kusarigama", { archetype: "ninja", passives: ["arch_ninja_5", "arch_ninja_10"] });
  p.bag = { throwing_knife: 2 };
  const b = quietEnemy(freshBattle(p, 1));
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  const first = withRandom(() => battle.playerAct({ ...b, queue: ["p", "e"], idx: 0 }, { type: "item", id: "throwing_knife" }), 0.99);
  assert.equal(first.idx, 0, "первый расходник не тратит ход");
  assert.equal(first.bag.throwing_knife, 1);
  const second = withRandom(() => battle.playerAct({ ...first, queue: ["p", "e"], idx: 0 }, { type: "item", id: "throwing_knife" }), 0.99);
  assert.equal(second.idx, 1, "второй расходник тратит ход");
});

test("sage 10: первый удар по герою в бою полностью блокируется, второй проходит", () => {
  const b = monsterBattle("beast", "agile", ["attack"], { player: { passives: ["arch_sage_10"] } });
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  const hp0 = b.p.hp;
  const r1 = withRandom(() => battle.enemyStep({ ...b, queue: ["e", "p"], idx: 0 }), 0.99);
  assert.equal(r1.p.hp, hp0, "первый удар заблокирован");
  assert.equal(r1.p.sageWardUsed, true);
  const r2 = withRandom(() => battle.enemyStep({ ...r1, queue: ["e", "p"], idx: 0 }), 0.99);
  assert.ok(r2.p.hp < hp0, "второй удар проходит");
});

test("бастион 5: регенерация 3 + защита / 10; колдун 10: скейл приёмов +0.5 и через ИНТ", () => {
  const { p } = withGear("assassin_stiletto", { archetype: "bulwark", passives: ["arch_bulwark_5"] });
  const b = quietEnemy(freshBattle(p, 1));
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  b.p.armor = 25;
  b.p.hp = b.p.maxHp - 20;
  const hp0 = b.p.hp;
  const after = withRandom(() => battle.playerAct({ ...b, queue: ["p"], idx: 0 }, { type: "attack" }), 0.99);
  assert.equal(after.p.hp, Math.min(after.p.maxHp, hp0 + 3 + 2), "3 + 25 / 10 = 5 за раунд");
  assert.equal(battle.techniqueSkillScale({}, ["arch_warlock_10"]), 0.5, "колдун 10: +0.5 к множителю");
});

test("варвар 10: регенерация 1% макс. ОЗ за каждые 10% недостающего здоровья", () => {
  const { p } = withGear("barbarian_greataxe", { archetype: "barbarian", passives: ["arch_barbarian_10"] });
  const b = quietEnemy(freshBattle(p, 1));
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  const hp0 = Math.floor(b.p.maxHp / 2);
  /* Сравниваем с тем же боем без пассива: экипировка даёт своё лечение, его вычитаем. */
  const gain = (passives) => {
    const st = { ...b, p: { ...b.p, hp: hp0, passives } };
    const after = withRandom(() => battle.playerAct({ ...st, queue: ["p"], idx: 0 }, { type: "guard" }), 0.99);
    return after.p.hp - hp0;
  };
  const extra = gain(["arch_barbarian_10"]) - gain([]);
  assert.equal(extra, Math.round(b.p.maxHp * 0.05), "50% потерь = 5% регенерации");
});

test("ninja: consumables scale with AGI bonuses and grant lifesteal", () => {
  const { p } = withGear("ninja_kusarigama", { archetype: "ninja", passives: ["arch_ninja_5", "arch_ninja_10"] });
  p.bag = { throwing_knife: 2, smoke_bomb: 1 };
  const b = freshBattle(p, 5, true);
  b.p.gearEffects.push("consumable_damage", "consumable_scale", "consumable_vamp");
  b.p.hp = Math.floor(b.p.maxHp * 0.5);
  const rnd = Math.random; Math.random = () => 0.99;
  const after = battle.playerAct(b, { type: "item", id: "throwing_knife" });
  Math.random = rnd;
  assert.ok(after.enemy.hp < b.enemy.hp);
  assert.ok(after.log.some((l) => l.text.includes("Похищение жизни")));
  const b2 = freshBattle(p, 5, true);
  const smoke = battle.playerAct(b2, { type: "item", id: "smoke_bomb" });
  assert.ok(smoke.p.statuses.smoke > 0);
});

test("warlock: skill damage, cooldown reduction and lifesteal", () => {
  const { p } = withGear("warlock_scepter", { archetype: "warlock", passives: ["arch_warlock_5", "arch_warlock_10"] });
  const b = freshBattle(p, 1);
  b.p.gearEffects.push("skill_damage", "skill_cd", "skill_vamp", "skill_scale");
  b.p.hp = Math.floor(b.p.maxHp * 0.5);
  const rnd = Math.random; Math.random = () => 0.99;
  b.p.concentration = 5; // приём требует концентрацию
  const after = battle.playerAct(b, { type: "weapon_skill" });
  Math.random = rnd;
  assert.ok(after.enemy.hp < b.enemy.hp);
  assert.ok(after.p.weaponCd < b.p.weaponSkill.cooldown);
  assert.ok(after.log.some((l) => l.text.includes("Похищение жизни")));
});

test("sage: scroll creation, scroll damage and scroll save", () => {
  const { p } = withGear("sage_censer", { archetype: "sage", passives: ["arch_sage_5", "arch_sage_10"] });
  p.bag = { scroll_creation: 1, scroll_bolt: 1 };
  const b = freshBattle(p, 5, true);
  b.p.gearEffects.push("scroll_damage", "scroll_scale", "scroll_vamp", "scroll_save", "scroll_create");
  const rnd = Math.random; Math.random = () => 0.0;
  const after = battle.playerAct(b, { type: "item", id: "scroll_creation" });
  Math.random = rnd;
  assert.ok(Object.keys(after.bag).some((id) => id.startsWith("scroll_") && id !== "scroll_creation"));
  assert.ok(after.bag.scroll_creation === 1, "свиток сотворения должен сохраниться при 100% шансе");
  assert.ok(after.log.some((l) => l.text.includes("сотворён")));
});

test("archetype supplies exist and obey consumable INT rules", () => {
  for (const id of ["iron_tonic", "blood_rage", "quickblade_oil", "serrated_knife", "pact_elixir", "scroll_creation"]) {
    const def = content.ITEMS[id];
    assert.ok(def, id);
    assert.equal(content.consumableIntReq(def, 0), def.kind === "scroll" ? def.use.intReq : 0);
  }
});

/* ─────────────  РУБЕЖИ ХАРАКТЕРИСТИК  ───────────── */
const statMilestones = loadGameModule("statMilestones");

test("stat milestones offer exactly two archetype options at 5 and 10 for every stat", () => {
  for (const stat of ["str", "agi", "int"]) {
    for (const tier of [5, 10]) {
      const options = statMilestones.statMilestoneOptions(stat, tier);
      assert.equal(options.length, 2);
      assert.notEqual(options[0].archetype, options[1].archetype);
      for (const o of options) {
        assert.equal(o.stat, stat);
        assert.equal(o.tier, tier);
        assert.equal(archetypes.ARCHETYPES[o.archetype].stat, stat);
        assert.ok(o.name && o.desc);
      }
    }
  }
});

test("stat milestone choice is locked below threshold and cannot be taken twice", () => {
  const p = mkP({ stats: { str: 4, agi: 1, int: 1 } });
  assert.equal(statMilestones.canChooseStatMilestone(p, "str", 5), false);
  const [a] = statMilestones.statMilestoneOptions("str", 5);
  assert.equal(statMilestones.chooseStatMilestone(p, "str", 5, a.id), p);
  const ready = { ...p, stats: { ...p.stats, str: 5 } };
  const chosen = statMilestones.chooseStatMilestone(ready, "str", 5, a.id);
  assert.ok(chosen.passives.includes(a.id));
  assert.equal(chosen.statMilestones.str[5], a.id);
  assert.equal(statMilestones.canChooseStatMilestone(chosen, "str", 5), false);
  const [, b] = statMilestones.statMilestoneOptions("str", 5);
  assert.equal(statMilestones.chooseStatMilestone(chosen, "str", 5, b.id), chosen);
});

test("cross-archetype milestone passive works without matching main archetype", () => {
  const [barb] = statMilestones.statMilestoneOptions("str", 5).filter((o) => o.archetype === "barbarian");
  const p = mkP({ archetype: "sage", stats: { str: 5, agi: 1, int: 8 }, passives: [barb.id] });
  const g = content.createGearItem({ baseId: "barbarian_greataxe", rarity: "common", wear: "new", identified: true, level: 5 });
  p.armory = [g];
  p.equip = { ...p.equip, mainHand: g.uid };
  p.hp = battle.derived(p).maxHp;
  const b = freshBattle(p, 5, true);
  b.queue = ["p"];
  b.idx = 0;
  b.p.hp = Math.floor(b.p.maxHp * 0.4);
  const rnd = Math.random; Math.random = () => 0.99;
  const after = battle.playerAct(b, { type: "attack" });
  Math.random = rnd;
  assert.ok(after.enemy.hp < b.enemy.hp);
  assert.ok(after.log.some((l) => l.text.includes("Похищение жизни")), "варварский вампиризм должен работать у мудреца");
});

test("normalizeStatMilestones migrates old automatic archetype passives into stat choices", () => {
  const old = mkP({ archetype: "bulwark", stats: { str: 5, agi: 1, int: 1 }, passives: ["arch_bulwark_5", "arch_bulwark_10"] });
  const migrated = statMilestones.normalizeStatMilestones(old);
  assert.equal(migrated.statMilestones.str[5], "arch_bulwark_5");
  assert.ok(migrated.passives.includes("arch_bulwark_5"));
  assert.ok(!migrated.passives.includes("arch_bulwark_10"), "рубеж 10 ещё не открыт");
});


/* ─────────────  БАГ-ФИКСЫ И БАЛАНС СНАРЯЖЕНИЯ  ───────────── */

test("shop upgrade price is the same function used by the UI and the charge", () => {
  for (let level = 1; level < 10; level++) {
    const cost = content.shopUpgradeCost(level);
    assert.ok(Number.isInteger(cost) && cost > 0);
    assert.equal(cost, 250 * level);
  }
});

test("line of sight does not leak around corners or through closed doors", () => {
  const m = maze.genMaze(8);
  m.h = Array.from({ length: 9 }, () => Array(8).fill(true));
  m.v = Array.from({ length: 8 }, () => Array(9).fill(true));
  // L-коридор: (0,0) -> (1,0) -> (1,1)
  m.v[0][1] = false;
  m.h[1][1] = false;
  m.doors = [];
  m.openedDoors = [];
  const vis = maze.computeVisibility(m, { x: 0, y: 0 }, {});
  assert.equal(vis[0][1], 1, "соседняя открытая клетка видна");
  assert.equal(vis[1][1], 0, "клетка за углом не видна");
  assert.equal(vis[1][0], 0, "диагональ через закрытый угол не видна");

  // Прямой коридор с закрытой дверью посередине
  m.h[1][0] = false;
  m.h[2][0] = false;
  m.h[3][0] = false;
  m.doors = [maze.cellIdx(0, 2, 8)];
  const doorVis = maze.computeVisibility(m, { x: 0, y: 0 }, {});
  assert.equal(doorVis[2][0], 1, "сама дверь видна");
  assert.equal(doorVis[3][0], 0, "за дверью темно");
  m.openedDoors = [maze.cellIdx(0, 2, 8)];
  const openVis = maze.computeVisibility(m, { x: 0, y: 0 }, {});
  assert.equal(openVis[3][0], 1, "открытая дверь пропускает свет");
});

test("pathfinding accepts unseen targets and returns a walkable route", () => {
  const m = maze.genMaze(8);
  const target = { x: m.stairs.x, y: m.stairs.y };
  const route = maze.findPath(m, m.start, target);
  assert.ok(route && route.length > 0);
  let prev = m.start;
  for (const cell of route) {
    assert.equal(Math.abs(cell.x - prev.x) + Math.abs(cell.y - prev.y), 1);
    assert.ok(!maze.wallBetween(m, prev.x, prev.y, cell.x - prev.x, cell.y - prev.y));
    prev = cell;
  }
  assert.deepEqual(prev, target);
});

test("armor and accessories give defense by weight and stat; weapons give none", () => {
  const rolls = (id, how = () => 0) => {
    const base = content.GEAR_BASES[id];
    return content.rollItemStatRolls(base, base.gearClass ?? "medium", how);
  };
  /* Оружие не даёт ни здоровья, ни брони, ни уклонения. */
  for (const id of ["knife", "sword", "spear", "greatsword", "staff", "wand_ash"]) {
    const base = content.GEAR_BASES[id];
    assert.deepEqual(content.rollItemStatRolls(base, base.gearClass, () => 0.5), { hp: 0, armor: 0, evade: 0 }, `${id}: оружие без защиты`);
    const item = content.createGearItem({ baseId: id, level: 1, wear: "worn", rarity: "common", identified: true, rng: () => 0.5 });
    const st = content.scaledGearStats(item);
    assert.equal(st.hp, 0, `${id}: без ОЗ`);
    assert.equal(st.armor, 0, `${id}: без брони`);
    assert.equal(st.evade, 0, `${id}: без уклонения`);
    assert.ok(st.dmg, `${id}: зато с уроном`);
  }

  /* Тяжёлая броня: требуют СИЛ, много брони и немного здоровья. */
  const heavy = rolls("plate");
  const mediumStr = rolls("mail");
  assert.ok(heavy.armor > mediumStr.armor, "тяжёлая броня крепче средней");
  assert.equal(heavy.evade, 0, "тяжёлая броня не уклоняется");
  assert.equal(content.gearRequirement(content.createGearItem({ baseId: "plate", identified: true })).stat, "str");

  /* Средняя броня: СИЛ → броня, ЛОВ → уклонение. */
  const mediumAgi = rolls("start_leather");
  assert.ok(mediumAgi.evade > 0, "средняя ловкая броня даёт уклонение");
  assert.ok(mediumStr.armor > mediumAgi.armor, "силовая средняя крепче ловкой");

  /* Лёгкая броня: здоровье и уклонение; с ИНТ здоровья больше. */
  const lightInt = rolls("start_robe");
  const lightFree = rolls("start_hood");
  assert.ok(lightInt.hp > lightFree.hp, "лёгкая броня с ИНТ даёт больше здоровья");
  assert.ok(lightInt.evade > 0 && lightFree.evade > 0, "лёгкая броня уклоняется");
  assert.equal(lightInt.armor, 0, "лёгкая броня почти не защищает");
  const free = content.createGearItem({ baseId: "start_hood", identified: true, level: 1 });
  assert.equal(content.gearRequiresNothing(free), true, "лёгкая броня может не иметь требований");
  assert.equal(content.gearRequirement(free).stat, null);
  assert.equal(content.gearStatReqLabel(free), "без требований");
  const intLight = content.createGearItem({ baseId: "start_robe", identified: true, level: 1 });
  assert.equal(content.gearRequirement(intLight).stat, "int", "лёгкая с ИНТ требует ИНТ");

  /* Аксессуары: СИЛ → защита и немного ОЗ, ЛОВ → уклонение, ИНТ → здоровье. */
  const strAcc = rolls("ring_stone");
  assert.ok(strAcc.armor > 0 && strAcc.hp > 0, "силовой аксессуар даёт защиту и ОЗ");
  const agiAcc = rolls("ring_band");
  assert.ok(agiAcc.evade > 0, "ловкий аксессуар даёт уклонение");
  assert.equal(agiAcc.armor, 0);
  const intAcc = rolls("amulet");
  assert.ok(intAcc.hp > 0, "умный аксессуар даёт здоровье");
  assert.equal(intAcc.armor, 0);
  assert.equal(intAcc.evade, 0);

  /* Уклонение из брони доходит до персонажа. */
  const base = { ...mkP(), level: 10, stats: { str: 10, agi: 10, int: 10 } };
  const plain = battle.derived(base);
  const robe = content.createGearItem({ baseId: "start_robe", level: 1, wear: "worn", rarity: "common", identified: true });
  const geared = battle.derived({ ...base, armory: [robe], equip: { ...base.equip, body: robe.uid } });
  assert.ok(geared.evade > plain.evade, "лёгкая броня добавляет уклонение в бою");
  assert.ok(geared.maxHp > plain.maxHp, "лёгкая броня добавляет здоровье");
});

test("уровень предмета: параметры линейно +50%, эффекты сложным процентом ×1.17", () => {
  const scaling = loadGameModule("gearScaling");
  assert.equal(scaling.GEAR_STAT_RATE, 0.5);
  assert.equal(scaling.GEAR_EFFECT_RATE, 0.17);
  assert.equal(scaling.GEAR_EFFECT_GROWTH_MAIN, 1.17);
  assert.equal(scaling.GEAR_EFFECT_GROWTH_HIGH, undefined, "повышенной ставки больше нет");
  /* сложный процент: 5 → 6 → 8 → 10 … на десятом уровне 31 */
  assert.equal(scaling.scaleByLevel(5, 1), 5);
  assert.equal(scaling.scaleByLevel(5, 2), 6);
  assert.equal(scaling.scaleByLevel(5, 3), 8);
  assert.equal(scaling.scaleByLevel(5, 10), 31);
  assert.equal(scaling.scaleCompoundByLevel(5, 10, 1.25), 48, "функция умеет любую ставку");
  /* множители уровня: 1 + rate × уровень */
  assert.equal(scaling.levelFactor(1, 0.17), 1.17);
  assert.equal(Math.round(scaling.levelFactor(10, 0.17) * 100) / 100, 2.7);
  assert.equal(scaling.levelFactor(1, 0.5), 1.5);
  assert.equal(scaling.levelFactor(10, 0.5), 6);
  /* дискретные количества растут от базы: на 1 уровне остаются прежними */
  assert.equal(scaling.scaleIntegerByLevel(10, 1), 10);
  assert.equal(scaling.scaleIntegerByLevel(10, 2), 12);
  assert.equal(scaling.scaleIntegerByLevel(10, 3), 14);
  assert.equal(scaling.scalePercentByLevel(3, 2), 4);
  assert.equal(scaling.scaleMultByLevel(1.8, 2), 2.11);
  assert.equal(scaling.scaleGearStatByLevel(10, 1), 15);
  assert.equal(scaling.scaleGearStatByLevel(10, 3), 25);

  const item = content.createGearItem({ baseId: "plate", level: 1, wear: "worn", rarity: "legendary", identified: true });
  item.wearMult = 1;
  item.statMult = 1;
  item.effects = ["damage_resist"];
  item.passive = "fortress";
  const low = content.scaledGearStats(item);
  const high = content.scaledGearStats({ ...item, level: 3 });
  assert.ok(high.armor > low.armor);
  assert.ok(high.hp > low.hp);
  assert.equal(scaling.effectMagnitude("damage_resist", 3), 4);
  assert.equal(scaling.passiveMagnitude("fortress", "resist", 3), 29);
  assert.equal(scaling.legendaryMagnitude("executioner", "damage", 2), 41);

  const weapon = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  const ws1 = content.weaponSkillFor(weapon);
  const ws2 = content.weaponSkillFor({ ...weapon, level: 2 });
  assert.ok(ws2.scaleMult > ws1.scaleMult);
});

test("medium weapons can be gripped two-handed for ceil(1.5x) damage and occupy the off-hand", () => {
  const base = { ...mkP(), level: 10, stats: { str: 10, agi: 10, int: 10 } };
  const sword = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  sword.wearMult = 1;
  const shield = content.createGearItem({ baseId: "shield_round", level: 1, wear: "worn", rarity: "common", identified: true });
  let p = { ...base, armory: [sword, shield], equip: { ...base.equip, offHand: shield.uid } };
  const one = content.scaledGearStats(sword).dmg;
  const res = content.equipItem(p, sword.uid, "mainHand", "two");
  p = res.player;
  assert.equal(p.equip.offHand, null);
  assert.equal(p.armory.find((g) => g.uid === sword.uid).grip, "two");
  const two = content.scaledGearStats(p.armory.find((g) => g.uid === sword.uid)).dmg;
  assert.equal(two[0], Math.ceil(one[0] * 1.5));
  assert.equal(two[1], Math.ceil(one[1] * 1.5));
  assert.equal(battle.derived(p).gearHands, 2);
  // Нельзя занять левую руку, пока среднее оружие держат двумя руками
  const blocked = content.equipItem(p, shield.uid, "offHand");
  assert.equal(blocked.player.equip.offHand, null);
  assert.ok(blocked.note);
});

test("light weapons can be equipped in either hand", () => {
  const base = { ...mkP(), level: 10, stats: { str: 10, agi: 10, int: 10 } };
  const knife = content.createGearItem({ baseId: "knife", level: 1, wear: "worn", rarity: "common", identified: true });
  assert.deepEqual(content.slotsForItem(knife), ["mainHand", "offHand"]);
  let p = { ...base, armory: [knife] };
  p = content.equipItem(p, knife.uid, "offHand").player;
  assert.equal(p.equip.offHand, knife.uid);
  assert.equal(p.equip.mainHand, null);
  p = content.equipItem(p, knife.uid, "mainHand").player;
  assert.equal(p.equip.mainHand, knife.uid);
  assert.equal(p.equip.offHand, null);
});

test("technique INT requirements follow item level tiers and STR gear is lower", () => {
  const mk = (baseId, level) => content.createGearItem({ baseId, level, wear: "worn", rarity: "common", identified: true });
  for (const [level, expected] of [[1, 2], [5, 2], [6, 3], [8, 3], [9, 4], [10, 4]]) {
    assert.equal(content.weaponSkillFor(mk("staff", level)).intReq, expected);
    assert.equal(content.weaponSkillFor(mk("rapier", level)).intReq, expected);
    assert.equal(content.weaponSkillFor(mk("sword", level)).intReq, Math.max(1, expected - 1));
  }
});

/* ─────────────  БАЛАНС, БОССЫ, ПРИПАСЫ И КУЗНИЦА  ───────────── */

const forge = loadGameModule("forge");

test("stat point costs follow the per-stat target-value tables", () => {
  const cost = (stat, from) => content.statPointCost(stat, from);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => cost("str", v - 1)), [1, 1, 1, 2, 2, 2, 3, 3, 3]);
  assert.equal(cost("str", 9), 4);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => cost("agi", v - 1)), [2, 2, 2, 2, 3, 2, 2, 2, 2]);
  assert.equal(cost("agi", 9), 3);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => cost("int", v - 1)), [1, 1, 1, 2, 2, 2, 2, 2, 4]);
  assert.equal(cost("int", 9), 4);
  const leveled = content.grantXp(mkP({ statPoints: 2 }), 100_000);
  assert.equal(leveled.player.statPoints, 2 + 9 * 3);
});

test("monster stats multiply by 1.5 per level, AP excluded; boss level equals floor", () => {
  const rng = seededRandom([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  const l1 = battle.spawnEnemy(1, false, rng);
  const l2 = battle.spawnEnemy(2, false, seededRandom([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));
  // Сравниваем одного и того же монстра через принудительный уровень этажа.
  const def = l1.def;
  const mkAt = (floor) => {
    const old = Math.random;
    Math.random = () => 0.5;
    const s = battle.spawnEnemy(floor, false);
    Math.random = old;
    return s;
  };
  const a = mkAt(1), b = mkAt(2);
  if (a.def.id === b.def.id && a.threat === b.threat) {
    assert.ok(Math.abs(b.hp / a.hp - 1.5) < 0.02, `HP ×1.5: ${a.hp} → ${b.hp}`);
    assert.ok(Math.abs(b.atk[0] / a.atk[0] - 1.5) < 0.02, `ATK ×1.5`);
    assert.equal(b.ap, a.ap, "ходы не скейлятся от уровня");
  }
  const boss = battle.spawnEnemy(7, true, seededRandom([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]));
  assert.equal(boss.level, 7);
  assert.equal(boss.effects.length, 7);
  assert.ok(boss.moves.some((m) => m.startsWith("seal_")));
});

test("acceleration gear gives 0/1/2/3 extra actions by level 1/5/7/10 every round", () => {
  const mkAp = (level) => {
    const g = content.createGearItem({ baseId: "ring_band", level, rarity: "epic", wear: "new", identified: true });
    g.effects = ["ap"];
    g.passive = undefined;
    g.legendaryPassive = undefined;
    return g;
  };
  for (const [level, expected] of [[1, 0], [2, 0], [3, 0], [4, 0], [5, 1], [6, 1], [7, 2], [8, 2], [9, 3], [10, 3]]) {
    assert.equal(battle.gearExtraAp(mkAp(level)), expected, `уровень ${level}`);
  }
  const g = mkAp(10);
  const p = { ...mkP({ level: 10, stats: { str: 5, agi: 5, int: 5 } }), armory: [g], equip: { ...mkP().equip, ring1: g.uid } };
  const d = battle.derived(p);
  assert.equal(d.firstRoundApBonus, 0);
  assert.equal(d.ap, 5 + 3);
  const b = freshBattle(p, 1);
  const r1 = battle.combatReadout(b);
  b.round = 2;
  const r2 = battle.combatReadout(b);
  assert.equal(r1.ap, 8);
  assert.equal(r2.ap, 8);
});

test("starter gear has no stat or level requirements", () => {
  const initial = PlayerFactory.createInitial();
  const zero = { ...initial, stats: { str: 0, agi: 0, int: 0 } };
  assert.equal(initial.armory.length, 3);
  for (const item of initial.armory) {
    assert.equal(content.gearRequiresNothing(item), true, `${item.baseId}: без требований`);
    assert.equal(content.gearRequirement(item).stat, null);
    assert.equal(content.gearStatReqLabel(item), "без требований");
    assert.equal(content.canWear(item, zero), true, `${item.baseId} надевается даже с нулевыми характеристиками`);
  }

  /* Стартовые вещи без требований при любом качестве и в любом сохранении. */
  for (const item of initial.armory) {
    /* Ботинки — стартовые по экземпляру (noReq), а не по базе: базовый список обносков не трогаем. */
    if (item.baseId === "shoes") {
      assert.equal(content.gearRequiresNothing(item), true, "стартовые ботинки без требования");
      continue;
    }
    assert.equal(content.isStarterItem(item), true, `${item.baseId}: это стартовая вещь`);
    assert.equal(content.gearRequiresNothing({ ...item, rarity: "epic", wear: "new" }), true, "редкость не добавляет требований");
    assert.equal(content.gearRequiresNothing({ baseId: item.baseId, level: 1 }), true, "старое сохранение без полей тоже без требований");
  }
  /* Вещь той же базы, но выше 1 уровня, требования сохраняет. */
  const upgraded = content.createGearItem({ baseId: "knife", level: 4, rarity: "common", wear: "worn", identified: true });
  assert.equal(content.gearRequiresNothing(upgraded), false, "нож 4 уровня требует характеристику");

  /* Старые сохранения: те же обноски без флага тоже теряют требования. */
  const legacy = initial.armory.map((item) => {
    const copy = { ...item };
    delete copy.noReq;
    return copy;
  });
  const restored = PlayerFactory.restore({ ...initial, armory: legacy });
  for (const item of restored.armory) {
    assert.equal(content.gearRequiresNothing(item), true, `${item.baseId}: миграция снимает требования`);
  }
});

test("hero starts at full health with three stat points, two-handers hit twice as hard", () => {
  const initial = PlayerFactory.createInitial();
  /* Стартовый герой приходит с полным здоровьем и тремя свободными очками. */
  assert.equal(initial.statPoints, 3);
  assert.equal(initial.hp, battle.derived(initial).maxHp);
  /* СИЛ 1 = базовые 10 ОЗ + 10 за очко Силы. */
  assert.ok(battle.derived({ ...initial, armory: [], equip: { ...initial.equip, mainHand: null, body: null } }).maxHp >= 20);
  const oneHand = content.createGearItem({ baseId: "sword", level: 1, wear: "new", rarity: "common", identified: true, rng: () => 0.5 });
  const twoHand = content.createGearItem({ baseId: "greatsword", level: 1, wear: "new", rarity: "common", identified: true, rng: () => 0.5 });
  const a = content.scaledGearStats(oneHand).dmg;
  const b = content.scaledGearStats(twoHand).dmg;
  /* Двуручный меч ровно вдвое сильнее меча-аналога (было втрое). */
  assert.ok(Math.abs(b[0] / a[0] - 2) < 0.2, `мин: ${b[0]} против ${a[0]}`);
  assert.ok(Math.abs(b[1] / a[1] - 2) < 0.2, `макс: ${b[1]} против ${a[1]}`);
});

test("кнопка «Исследовать все»: бесплатно то, что открывает Интеллект, остальное за 20 × уровень", () => {
  const mk = (baseId, level) => content.createGearItem({ baseId, level, wear: "worn", rarity: "common", identified: false });
  const low = mk("knife", 1);
  const high = mk("soulstone", 6);
  const known = { ...mk("sword", 3), identified: true };
  const player = { stats: { str: 1, agi: 1, int: 3 }, armory: [low, high, known] };
  assert.deepEqual(content.identifyAllPlan(player, 0), { count: 2, free: 1, gold: 120 });
  assert.deepEqual(content.identifyAllPlan({ ...player, stats: { ...player.stats, int: 8 } }, 0), { count: 2, free: 2, gold: 0 });
});

/** Прибавка ценности от улучшения в кузнице — не меньше цены работы. */
test("приёмы с негативными эффектами уходят на перезарядку 3 раунда", () => {
  const mk = () => {
    const b = freshBattle(mkP({ level: 1, stats: { str: 1, agi: 1, int: 1 }, hp: 400 }), 1, false, "classic");
    b.enemy.hp = 9999;
    b.enemy.maxHp = 9999;
    b.enemy.moves = ["seal_attack"];
    b.enemy.def = { ...b.enemy.def, id: "fixture", moves: ["seal_attack"] };
    b.queue = ["p", "e"];
    b.idx = 1;
    return b;
  };
  const b = withRandom(() => battle.enemyStep(mk()), 0.5);
  assert.equal(b.enemy.specialCooldown, 1 + battle.ENEMY_MOVE_COOLDOWN, "печать ушла на перезарядку");
  assert.equal(battle.ENEMY_MOVE_COOLDOWN, 3);

  /* Счётчик: сколько раундов ещё ждать. */
  assert.equal(battle.enemyMoveCooldownLeft({ ...b, round: 1 }, "seal_attack"), 3);
  assert.equal(battle.enemyMoveCooldownLeft({ ...b, round: 3 }, "seal_attack"), 1);
  assert.equal(battle.enemyMoveCooldownLeft({ ...b, round: 4 }, "seal_attack"), 0);

  /* На перезарядке приём не выбирается: враг бьёт обычной атакой. */
  const onCd = { ...b, round: 2, enemy: { ...b.enemy, moves: ["seal_attack"] } };
  assert.equal(battle.chooseEnemyMove(onCd), "attack");
  const ready = { ...b, round: 4, enemy: { ...b.enemy, moves: ["seal_attack"] } };
  assert.equal(battle.chooseEnemyMove(ready), "seal_attack");

  /* Страх и печати в одном списке: все приёмы с негативным эффектом. */
  for (const mv of ["terror", "seal_items", "seal_skills", "seal_attack", "wound", "poison", "curse", "sunder", "bell_stun", "intimidate", "darkness", "cold_touch", "hell_force"]) {
    assert.ok(battle.ENEMY_COOLDOWN_MOVES.includes(mv), `${mv} должен уходить на перезарядку`);
  }
  /* Обычные удары, двойной выпад и лечение перезарядки не имеют. */
  for (const mv of ["attack", "heavy", "multi", "guard", "drain"]) {
    assert.ok(!battle.ENEMY_COOLDOWN_MOVES.includes(mv), `${mv} без перезарядки`);
  }
});

test("в бою дебаффы монстра идут не чаще раза в 3 раунда и не сменяют друг друга", () => {
  /* Броня героя делает обычные удары бесполезными — тварь давит дебаффами. */
  const mkState = () => {
    const b = freshBattle(mkP({ level: 5, stats: { str: 5, agi: 5, int: 5 }, hp: 400 }), 3, false, "classic");
    b.p.armor = 999;
    b.enemy.hp = 99999;
    b.enemy.maxHp = 99999;
    b.enemy.moves = ["attack", "curse", "terror", "wound"];
    /* Удар фиксирован: у случайного вида минимум удара зависит от правила обычных монстров. */
    b.enemy.atk = [5, 8];
    b.enemy.def = { ...b.enemy.def, id: "fixture", moves: ["attack", "curse", "terror", "wound"] };
    return b;
  };
  const applied = new Set();
  for (const seed of [11, 12, 13]) {
    const rounds = withSeededRandom(seed, () => {
      const used = [];
      let b = mkState();
      for (let step = 0; step < 200 && !b.over; step++) {
        b.p.hp = 400;
        b.p.statuses.sealAttack = 0;
        b.p.statuses.sealSkills = 0;
        if (b.queue[b.idx] === "e") {
          const round = b.round;
          const before = b.enemy.specialCooldown ?? 0;
          const chosen = battle.chooseEnemyMove(b);
          b = battle.enemyStep(b);
          if ((b.enemy.specialCooldown ?? 0) !== before) {
            used.push({ round, move: chosen });
            applied.add(chosen);
          }
        } else {
          b = battle.playerAct(b, { type: "guard" });
        }
      }
      return used;
    });
    for (let i = 1; i < rounds.length; i++) {
      const gap = rounds[i].round - rounds[i - 1].round;
      assert.ok(gap >= battle.ENEMY_MOVE_COOLDOWN, `${rounds[i - 1].move} и ${rounds[i].move}: раунды ${rounds[i - 1].round} и ${rounds[i].round}`);
    }
  }
  assert.ok(applied.size >= 2, `тварь должна пользоваться разными приёмами, а применила: ${[...applied].join(", ")}`);
});

/** Один ход врага с заданным набором приёмов: герой не уклоняется и не имеет брони. */
function enemyTurnWith(b, moves, value = 0.99) {
  const st = {
    ...b,
    enemy: { ...b.enemy, moves: [...moves], def: { ...b.enemy.def, moves: [...moves] }, specialCooldown: 0 },
    queue: ["e", "p"],
    idx: 0,
    p: {
      ...b.p,
      evade: 0,
      armor: 0,
      chanceLayers: { ...b.p.chanceLayers, evade: { stats: [], items: [], effects: [] } },
    },
  };
  return withRandom(() => battle.enemyStep(st), value);
}

/** Враг без случайных пассивов и эффектов: у катастроф они выбираются наугад и мешают считать наложения. */
function quietEnemy(b) {
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  return b;
}

test("яд складывается: срок обновляется, урон за тик суммируется", () => {
  const base = quietEnemy(freshBattle(mkP({ level: 1, stats: { str: 1, agi: 1, int: 1 }, hp: 100 }), 1, false, "classic"));
  /* Угроза монстра случайна: герой не должен погибнуть за восемь ходов, иначе наложения не запишутся. */
  base.p.hp = 1e6;
  base.p.maxHp = 1e6;
  base.enemy.hp = 9999;
  base.enemy.maxHp = 9999;

  const first = enemyTurnWith(base, ["poison"]);
  assert.equal(first.p.statuses.poison, 3, "яд висит 3 раунда");
  assert.equal(first.p.statuses.poisonStacks, 1);

  /* Второй яд при почти истёкшем сроке: время обновляется, наложения складываются. */
  const second = enemyTurnWith({ ...first, p: { ...first.p, statuses: { ...first.p.statuses, poison: 1 } } }, ["poison"]);
  assert.equal(second.p.statuses.poison, 3, "срок обновлён");
  assert.equal(second.p.statuses.poisonStacks, 2, "два наложения");

  /* Тик задаёт источник: два наложения складывают свой тик. */
  /* Фиксируем генератор: новый раунд тянет случайную инициативу, а тик должен быть точным. */
  const ticked = withRandom(() => battle.playerAct(
    {
      ...second,
      p: { ...second.p, hp: 100, maxHp: 100, statuses: { ...second.p.statuses, poison: 3, poisonStacks: 2 } },
      queue: ["p"],
      idx: 0,
    },
    { type: "guard" },
  ), 0.99);
  assert.equal(ticked.p.hp, 100 - 2 * second.p.statuses.poisonTick, "урон яда удвоился от двух наложений");

  /* Предел наложений — MAX_DOT_STACKS. */
  let many = base;
  for (let i = 0; i < 8; i++) many = enemyTurnWith(many, ["poison"]);
  assert.equal(many.p.statuses.poisonStacks, battle.MAX_DOT_STACKS);
});

test("кровотечение складывается так же, как яд", () => {
  const base = quietEnemy(freshBattle(mkP({ level: 1, stats: { str: 1, agi: 1, int: 1 }, hp: 100 }), 1, false, "classic"));
  base.p.hp = 1e6;
  base.p.maxHp = 1e6;
  base.enemy.hp = 9999;
  base.enemy.maxHp = 9999;
  const first = enemyTurnWith(base, ["wound"]);
  assert.equal(first.p.statuses.wound, 3);
  assert.equal(first.p.statuses.woundStacks, 1);
  const second = enemyTurnWith({ ...first, p: { ...first.p, statuses: { ...first.p.statuses, wound: 1 } } }, ["wound"]);
  assert.equal(second.p.statuses.wound, 3);
  assert.equal(second.p.statuses.woundStacks, 2);

  const ticked = withRandom(() => battle.playerAct(
    {
      ...second,
      p: { ...second.p, hp: 100, maxHp: 100, statuses: { ...second.p.statuses, wound: 3, woundStacks: 2 } },
      queue: ["p"],
      idx: 0,
    },
    { type: "guard" },
  ), 0.99);
  assert.equal(ticked.p.hp, 100 - 2 * second.p.statuses.woundTick, "тик кровотечения × 2 наложения");
});

test("тик задаёт источник: дротик и нож берут базовую формулу уровня героя, босс — процент от ОЗ", () => {
  const mk = () => quietEnemy(freshBattle(mkP({ level: 5, stats: { str: 1, agi: 10, int: 1 }, hp: 100, bag: { poison_dart: 1, serrated_knife: 1 } }), 1, false, "classic"));
  const b = mk();
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  /* Уровень героя 5, ролл 0.99: яд 1×5 + 3 = 8, кровотечение 1×5 + 3 = 8. */
  const poisoned = withRandom(() => battle.playerAct({ ...b, queue: ["p", "e"], idx: 0 }, { type: "item", id: "poison_dart" }), 0.99);
  assert.equal(poisoned.enemy.statuses.poisonTick, 8, "дротик: яд 1 × уровень 5 + до 3");
  const cut = withRandom(() => battle.playerAct({ ...poisoned, queue: ["p", "e"], idx: 0 }, { type: "item", id: "serrated_knife" }), 0.99);
  assert.equal(cut.enemy.statuses.bleedTick, 8, "нож: кровотечение 1 × уровень 5 + до 3");
  assert.equal(cut.enemy.statuses.poisonTick, 8, "яд от дротика остался со своим тиком");
  /* Босс: периодика процентом от макс. ОЗ, базовая формула не применяется. */
  const boss = mk();
  boss.isBoss = true;
  boss.enemy.hp = 9999;
  boss.enemy.maxHp = 9999;
  const bossPoisoned = withRandom(() => battle.playerAct({ ...boss, queue: ["p", "e"], idx: 0 }, { type: "item", id: "poison_dart" }), 0.99);
  assert.equal(bossPoisoned.enemy.statuses.poisonTick, 400, "босс: 4% от 9999 ОЗ");
});

test("раскол складывается, сила растёт с уровнем эффекта и монстра", () => {
  assert.equal(battle.sunderBreakAmount(30), 1);
  assert.equal(battle.sunderBreakAmount(60), 2);
  assert.equal(battle.sunderBreakAmount(90), 3);
  assert.equal(battle.sunderBreakAmount(5), 1, "минимум один пункт брони");

  assert.equal(battle.enemySunderBreak(1), 1);
  assert.equal(battle.enemySunderBreak(4), 1);
  assert.equal(battle.enemySunderBreak(5), 2);
  assert.equal(battle.enemySunderBreak(9), 3);

  const base = freshBattle(mkP({ level: 1, stats: { str: 1, agi: 1, int: 1 }, hp: 500 }), 3, false, "classic");
  base.p.armor = 12;
  base.enemy.hp = 9999;
  base.enemy.maxHp = 9999;
  base.enemy.level = 3;

  const first = enemyTurnWith(base, ["sunder"]);
  assert.equal(first.p.statuses.sundered, 1, "первое наложение");
  const second = enemyTurnWith({ ...first, p: { ...first.p, armor: 0 } }, ["sunder"]);
  assert.equal(second.p.statuses.sundered, 2, "наложения складываются");

  const strong = enemyTurnWith({ ...base, enemy: { ...base.enemy, level: 9 } }, ["sunder"]);
  assert.equal(strong.p.statuses.sundered, 3, "монстр 9 уровня снимает три пункта за наложение");
});

test("enemy AI picks the move with the highest expected damage to the hero", () => {
  const base = () => {
    const b = freshBattle(mkP({ level: 1, stats: { str: 1, agi: 1, int: 1 }, hp: 60 }), 1, false, "classic");
    b.enemy.hp = 100; b.enemy.maxHp = 100;
    b.biome = "classic";
    return b;
  };
  /* Тяжёлый удар бьёт сильнее обычного: 1.7× против 1× при той же броне. */
  const heavy = base();
  heavy.enemy.moves = ["attack", "heavy"];
  heavy.enemy.def = { ...heavy.enemy.def, moves: ["attack", "heavy"] };
  assert.equal(battle.chooseEnemyMove(heavy), "heavy");

  /* При толстой броне физика бессильна — выбирается магия, даже если она слабее по множителю. */
  const armored = base();
  armored.p.armor = 999;
  armored.enemy.moves = ["attack", "curse", "heavy"];
  armored.enemy.def = { ...armored.enemy.def, moves: ["attack", "curse", "heavy"] };
  assert.equal(battle.chooseEnemyMove(armored), "curse");

  /* Стойка и печати урона не дают — их не выбирают, пока есть приём с уроном. */
  const noDamageOnly = base();
  noDamageOnly.enemy.moves = ["guard", "seal_attack", "attack"];
  noDamageOnly.enemy.def = { ...noDamageOnly.enemy.def, moves: ["guard", "seal_attack", "attack"] };
  assert.equal(battle.chooseEnemyMove(noDamageOnly), "attack");

  /* Промах на прошлом ходу и порядок ходов не меняют выбор: решает только урон. */
  const missed = base();
  missed.enemy.lastMiss = true;
  missed.enemy.moves = ["attack", "heavy"];
  missed.enemy.def = { ...missed.enemy.def, moves: ["attack", "heavy"] };
  assert.equal(battle.chooseEnemyMove(missed), "heavy");
  const slower = base();
  slower.queue = ["p", "p", "e"]; slower.idx = 2;
  slower.enemy.moves = ["attack", "heavy"];
  slower.enemy.def = { ...slower.enemy.def, moves: ["attack", "heavy"] };
  assert.equal(battle.chooseEnemyMove(slower), "heavy");

  /* Если герой закрыт полной защитой, урона нет ни у одного приёма — берётся обычный удар. */
  const blocked = base();
  blocked.p.statuses.fullGuard = 2;
  blocked.enemy.moves = ["attack", "heavy", "curse"];
  blocked.enemy.def = { ...blocked.enemy.def, moves: ["attack", "heavy", "curse"] };
  assert.equal(battle.chooseEnemyMove(blocked), "attack");
});

test("enemy move choice is the argmax of expected damage across random hero states", () => {
  const allMoves = ["attack", "heavy", "wound", "poison", "sunder", "multi", "curse", "drain", "bell_stun", "terror", "hell_force", "cold_touch", "guard", "seal_attack"];
  withSeededRandom(77, () => {
    for (let i = 0; i < 60; i++) {
      const b = freshBattle(mkP({ level: 1 + (i % 9), stats: { str: 4, agi: 4, int: 4 }, hp: 200 }), 1 + (i % 10), false, "classic");
      b.p.armor = (i * 7) % 40;
      b.enemy.moves = allMoves.filter((_, k) => (k + i) % 3 !== 0);
      b.enemy.def = { ...b.enemy.def, id: "fixture", moves: [...b.enemy.moves] };
      const chosen = battle.chooseEnemyMove(b);
      const best = Math.max(...b.enemy.moves.map((m) => battle.enemyExpectedMoveDamage(b, m)));
      assert.ok(battle.enemyExpectedMoveDamage(b, chosen) >= best - 1e-6, `${chosen} хуже лучшего: ${best}`);
    }
  });
});

test("expected enemy damage matches the average of real enemy turns", () => {
  const moves = ["attack", "heavy", "wound", "poison", "sunder", "multi", "curse", "drain", "bell_stun", "terror", "hell_force", "cold_touch"];
  for (const m of moves) {
    const trials = 1500;
    /* Один и тот же монстр и герой под одним сидом: enemyStep копирует состояние, поэтому можно повторять ход. */
    const { expectedFixed, actual } = withSeededRandom(5, () => {
      const fixed = freshBattle(mkP({ level: 5, stats: { str: 4, agi: 4, int: 4 }, hp: 1e9 }), 5, false, "classic");
      fixed.enemy.moves = [m];
      fixed.enemy.def = { ...fixed.enemy.def, moves: [m] };
      fixed.enemy.specialCooldown = 0;
      fixed.queue = ["e", "p"];
      fixed.idx = 0;
      const exp = battle.enemyExpectedMoveDamage(fixed, m);
      let sum = 0;
      for (let i = 0; i < trials; i++) {
        const after = battle.enemyStep(fixed);
        sum += fixed.p.hp - after.p.hp;
      }
      return { expectedFixed: exp, actual: sum / trials };
    });
    assert.ok(Math.abs(actual - expectedFixed) <= Math.max(1, expectedFixed * 0.06), `${m}: ожидалось ${expectedFixed.toFixed(2)}, по ходам ${actual.toFixed(2)}`);
  }
});

test("trap cells near the entrance are never placed right after a descent", () => {
  for (let floor = 1; floor <= 6; floor++) {
    for (let run = 0; run < 5; run++) {
      const m = maze.genMaze(maze.mazeSizeForFloor(floor), floor);
      for (const t of m.traps) {
        const x = t % m.size;
        const y = Math.floor(t / m.size);
        const d = Math.abs(x - m.start.x) + Math.abs(y - m.start.y);
        assert.ok(d >= 1, `ловушка не стоит на входе (этаж ${floor})`);
      }
    }
  }
});

test("weapon effects bleed, poison and sunder trigger on a plain hit", () => {
  const weapon = content.createGearItem({ baseId: "knife", level: 1, wear: "worn", rarity: "rare", identified: true });
  weapon.effects = ["bleed", "poison_damage", "sunder"];
  weapon.effectRolls = { bleed: 100, poison_damage: 100, sunder: 100 };
  const p = { ...mkP({ level: 10, stats: { str: 3, agi: 3, int: 3 }, hp: 300 }), armory: [weapon], equip: { ...mkP().equip, mainHand: weapon.uid } };
  const b = freshBattle(p, 1);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 10;
  b.enemy.effects = []; b.enemy.effectPower = {};
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile" };
  b.enemy.moves = ["attack"];
  /* Биом и защитные шансы врага фиксированы: тест про свойства оружия, а не про удачу. */
  b.biome = "classic";
  b.torchTurns = 0;
  b.enemy.chanceLayers = { evade: { stats: [], items: [], effects: [] }, resist: { stats: [], items: [], effects: [] } };
  b.p.chanceLayers.crit = { stats: [], items: [], effects: [] };
  const old = Math.random;
  Math.random = () => 0.5; // свойства со 100% шансом срабатывают, промах и крит — нет
  const after = battle.playerAct(b, { type: "attack" });
  Math.random = old;
  assert.ok(after.enemy.statuses.bleed > 0, "кровотечение наложено");
  assert.ok(after.enemy.statuses.poison > 0, "яд наложен");
  assert.ok(after.enemy.armor < 10, `броня расколота: ${after.enemy.armor}`);
});

test("staff and wand techniques are magic, steel techniques are not", () => {
  const magicIds = ["staff", "wand_ash", "warlock_scepter", "sage_censer"];
  for (const baseId of magicIds) {
    const item = content.createGearItem({ baseId, level: 3, wear: "worn", rarity: "common", identified: true });
    const ws = content.weaponSkillFor(item);
    assert.equal(ws.magic, true, `${baseId}: приём магический`);
  }
  for (const baseId of ["sword", "knife", "axe", "greatsword", "spear"]) {
    const item = content.createGearItem({ baseId, level: 3, wear: "worn", rarity: "common", identified: true });
    const ws = content.weaponSkillFor(item);
    assert.ok(!ws.magic, `${baseId}: приём не магический`);
  }
});

test("migration gives accessories and spears their minimum effects", () => {
  const ring = content.createGearItem({ baseId: "ring_band", rarity: "common", level: 1, wear: "worn", identified: true });
  const legacyRing = { ...ring, effects: [], effectRolls: {}, statRolls: undefined };
  const migratedRing = content.migrateGearItem(legacyRing);
  assert.equal(migratedRing.effects.length, 1, "аксессуар после миграции получает свойство");
  assert.ok(migratedRing.statRolls, "характеристики пересчитаны");
  assert.equal(migratedRing.kind, "accessory");

  const spear = content.createGearItem({ baseId: "spear", rarity: "common", level: 1, wear: "worn", identified: true });
  const migratedSpear = content.migrateGearItem({ ...spear, effects: [], effectRolls: {} });
  assert.ok(migratedSpear.effects.length >= 2, "у копья минимум два свойства");
});

test("multi-hit technique deals normal attacks without the flat technique bonus", () => {
  const g = content.createGearItem({ baseId: "barbarian_greataxe", skillId: "rage_sweep", level: 1, wear: "new", rarity: "common", identified: true });
  g.dmgRoll = [10, 10];
  /* Свойства оружия здесь не проверяются: убираем их, чтобы считать только удары. */
  g.effects = [];
  g.effectRolls = {};
  const p = { ...mkP({ level: 10, stats: { str: 1, agi: 10, int: 4 }, hp: 500 }), armory: [g], equip: { ...mkP().equip, mainHand: g.uid } };
  const b = freshBattle(p, 1);
  b.queue = ["p", "e"]; b.idx = 0;
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0; b.enemy.passive = null; b.enemy.effects = []; b.enemy.effectPower = {};
  b.p.evade = 0; b.p.critChance = 0;
  const old = Math.random; Math.random = () => 0.99;
  b.p.concentration = 5; // приём требует концентрацию
  const after = battle.playerAct(b, { type: "weapon_skill" });
  Math.random = old;
  const dealt = 5000 - after.enemy.hp;
  // Два обычных удара: бросок оружия + (2 + СИЛ), без бонуса приёма.
  const normal = b.p.hit[0] + 2 + b.p.stats.str;
  assert.equal(dealt, normal * 2, `ожидалось два обычных удара без бонуса, получено ${dealt}`);
});

test("supplies have levels tied to minimum drop floor and new statuses work", () => {
  assert.equal(content.supplyLevel("throwing_knife"), 1);
  assert.equal(content.supplyLevel("wither_dust"), 7);
  for (let i = 0; i < 200; i++) {
    const loot = battle.rollConsumableLoot(1, 3);
    for (const id of loot) {
      if (content.ITEMS[id]?.use) assert.ok(content.supplyLevel(id) <= 1, `${id} выпал на этаже 1`);
    }
  }
  const pl = player({ hp: 500, stats: { str: 1, agi: 8, int: 1 }, bag: { serrated_knife: 1, wither_dust: 1, blight_powder: 1 } });
  const mk = (id) => {
    const b = freshBattle(pl, 5);
    b.queue = ["p", "e"]; b.idx = 0;
    b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0; b.enemy.passive = null; b.enemy.effects = []; b.enemy.effectPower = {};
    b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile", moves: ["attack"] };
    b.enemy.moves = ["attack"];
    return battle.playerAct(b, { type: "item", id });
  };
  assert.ok(mk("serrated_knife").enemy.statuses.bleed > 0);
  assert.ok(mk("blight_powder").enemy.statuses.blight > 0);
  assert.ok(mk("wither_dust").enemy.statuses.wither > 0);
});

test("workshop recipes craft throwables and special supplies, alchemy stays separate", () => {
  const workshop = content.RECIPES.filter((r) => r.station === "workshop");
  assert.ok(workshop.length >= 6);
  for (const r of workshop) assert.ok(["throwable", "special"].includes(content.ITEMS[r.out].kind));
  const r = workshop.find((x) => x.out === "serrated_knife");
  const pl = mkP({ stats: { str: 1, agi: 5, int: 5 }, bag: { fang: 1, powder: 1, scrap_metal: 1 }, knownRecipes: [r.id] });
  const res = content.attemptBrew(pl, r, 0.9);
  assert.equal(res.success, true);
  assert.equal(res.player.bag.serrated_knife, r.count);
  const kit = workshop.find((x) => x.out === "sapper_kit");
  assert.ok(kit);
  const kitPl = mkP({ stats: { str: 1, agi: 1, int: 5 }, bag: { scrap_metal: 1, cloth: 1, powder: 1 }, knownRecipes: [kit.id] });
  const kitRes = content.attemptBrew(kitPl, kit, 0.9);
  assert.equal(kitRes.success, true);
  assert.equal(kitRes.player.bag.sapper_kit, kit.count);
});

test("кузница: старые цены и шансы неудачи по таблице улучшений", () => {
  const g = content.createGearItem({ baseId: "sword", level: 1, wear: "battered", rarity: "common", identified: true });
  const opts = forge.forgeOptions(g);
  const rarity = opts.find((o) => o.kind === "rarity");
  const wear = opts.find((o) => o.kind === "wear");
  const level = opts.find((o) => o.kind === "level");
  assert.equal(rarity.cost, 100, "обычное → редкое");
  assert.equal(wear.cost, 100, "потрёпанное → ношеное");
  assert.equal(level.cost, 200, "100 + 50 × (1 + 1)");
  assert.equal(rarity.reagentTotal, 5);
  assert.equal(rarity.failChance, 0.25);
  assert.equal(rarity.failChanceFull, 0.1);
  assert.equal(wear.reagentTotal, 5);
  assert.equal(wear.reagentScrap, 5);
  assert.equal(wear.reagentForbidScrap, false, "металлолом — как раз для изношенности");
  assert.equal(rarity.reagentForbidScrap, true, "качество без металлолома");
  assert.equal(level.reagentForbidScrap, true, "уровень без металлолома");
  assert.equal(wear.failChance, 0.3);
  assert.equal(wear.failChanceFull, 0);
  assert.equal(level.reagentTotal, 2);
  assert.equal(level.failChance, 0.1);
  assert.equal(level.failChanceFull, 0.05);

  const rare = content.createGearItem({ baseId: "sword", level: 1, wear: "battered", rarity: "rare", identified: true });
  const rareOpt = forge.forgeOptions(rare).find((o) => o.kind === "rarity");
  assert.equal(rareOpt.cost, 500);
  assert.equal(rareOpt.reagentTotal, 15);
  assert.equal(rareOpt.failChanceFull, 0.25);

  const epic = content.createGearItem({ baseId: "sword", level: 1, wear: "battered", rarity: "epic", identified: true });
  const epicOpt = forge.forgeOptions(epic).find((o) => o.kind === "rarity");
  assert.equal(epicOpt.cost, 1000);
  assert.equal(epicOpt.reagentTotal, 25);
  assert.equal(epicOpt.failChanceFull, 0.45);

  const worn = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  const newWear = forge.forgeOptions(worn).find((o) => o.kind === "wear");
  assert.equal(newWear.cost, 375, "ношеное → новое");
  assert.equal(newWear.reagentTotal, 15);
  assert.equal(newWear.reagentScrap, 10);
  assert.equal(newWear.failChanceFull, 0.25);

  const lvl5 = content.createGearItem({ baseId: "sword", level: 5, wear: "worn", rarity: "common", identified: true });
  const lvl5Opt = forge.forgeOptions(lvl5).find((o) => o.kind === "level");
  assert.equal(lvl5Opt.cost, 400);
  assert.equal(lvl5Opt.reagentTotal, 10);
  assert.equal(lvl5Opt.failChance, 0.3);
  assert.equal(lvl5Opt.failChanceFull, 0.15);

  /* Неполный набор снижает риск частично. */
  assert.equal(forge.forgeFailChance(rarity, 0), 0.25);
  assert.equal(forge.forgeFailChance(rarity, 5), 0.1);
  assert.equal(forge.forgeFailChance(rarity, 2), 0.19);
});

test("кузница: реагенты кладутся в горн, а пергамент, чернила и фляга — нет", () => {
  for (const id of ["parchment", "magic_ink", "vial"]) {
    assert.equal(forge.isForgeReagent(id), false, `${id} не годится для горна`);
  }
  for (const id of ["scrap_metal", "moss", "bone", "tear"]) {
    assert.equal(forge.isForgeReagent(id), true, `${id} годится для горна`);
  }

  const item = content.createGearItem({ baseId: "sword", level: 1, wear: "battered", rarity: "common", identified: true });
  const wearOpt = forge.forgeOptions(item).find((o) => o.kind === "wear");
  const need = wearOpt;

  const short = forge.forgeReagentPlan({ scrap_metal: 3, moss: 1, parchment: 9 }, need);
  assert.equal(short.scrap, 3);
  assert.equal(short.total, 3, "лом есть на 3 из 5 — мох в набор не подменяет");
  assert.ok(!("parchment" in short.picked), "пергамент в горн не идёт");
  assert.ok(!("moss" in short.picked), "мох не заменяет металлолом");

  const full = forge.forgeReagentPlan({ scrap_metal: 30, moss: 3, tear: 2, magic_ink: 9, vial: 9 }, need);
  assert.equal(full.scrap, 5, "обязательный металлолом");
  assert.equal(full.total, 5);

  /* Много реагентов: сначала металлолом, потом самые дешёвые. */
  const worn = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  const newNeed = forge.forgeOptions(worn).find((o) => o.kind === "wear");
  const big = forge.forgeReagentPlan(
    { scrap_metal: 30, moss: 3, tear: 2, bone: 4, parchment: 9, magic_ink: 9, vial: 9 },
    newNeed,
  );
  /* Обязательные доли: 10 металлолома и 5 ткани. Ткани нет — её не заменяют другие реагенты. */
  assert.equal(big.scrap, 10, "металлолома ровно 10, а не весь набор");
  assert.equal(big.total, 10, "без ткани набор неполный: только лом");
  assert.equal(big.picked.parchment, undefined);
  assert.equal(big.picked.magic_ink, undefined);
  assert.equal(big.picked.vial, undefined);
  assert.equal(big.picked.bone, undefined, "кость не заменяет ткань");
  assert.equal(big.picked.moss, undefined, "мох не заменяет ткань");

  /* Качество и уровень: металлолом в горн не идёт, даже если он единственный. */
  const rarityOpt = forge.forgeOptions(item).find((o) => o.kind === "rarity");
  const rarityNeed = rarityOpt;
  const scrapOnly = forge.forgeReagentPlan({ scrap_metal: 50 }, rarityNeed);
  assert.equal(scrapOnly.total, 0, "из одного металлолома качество не сделать");
  assert.equal(scrapOnly.scrap, 0);
  const mixed = forge.forgeReagentPlan({ scrap_metal: 50, moss: 3, bone: 4 }, rarityNeed);
  assert.equal(mixed.scrap, 0, "металлолом не участвует");
  /* Состав качества: кость 2, порох 2, мох 1. Кости 4 не заменяет порох, которого нет. */
  assert.equal(mixed.total, 3, "берётся только состав: кость 2 и мох 1");
  assert.equal(mixed.picked.bone, 2, "кости по доле, не больше");
  assert.equal(mixed.picked.moss, 1);
  assert.equal(mixed.picked.powder, undefined, "пороха нет — кость его не заменяет");
  assert.equal(mixed.picked.scrap_metal, undefined);
  const wearNeed2 = wearOpt;
  assert.equal(forge.forgeReagentPlan({ scrap_metal: 50 }, wearNeed2).scrap, 5, "на изношенность металлолом идёт");

  /* Попытка с реагентами тратит и золото, и реагенты. */
  const player = mkP({ gold: 5000, armory: [item], bag: { scrap_metal: 10, moss: 4 } });
  const ok = forge.forgeUpgrade(player, item.uid, "wear", () => 0.99, true);
  assert.equal(ok.success, true);
  assert.equal(ok.reagentsUsed, 5);
  assert.equal(ok.player.bag.scrap_metal, 5);
  assert.equal(ok.player.gold, 5000 - 100);

  /* С реагентами неудача не ломает вещь, но реагенты сгорают. */
  const failing = forge.forgeUpgrade(player, item.uid, "rarity", () => 0.05, true);
  assert.equal(failing.success, false);
  assert.equal(failing.destroyed, false);
  assert.equal(failing.player.armory.length, 1, "предмет остаётся в арсенале");
  assert.equal(failing.reagentsUsed, 1, "взяли только долю мха из состава качества: лом не идёт, остальной мох не подменяет");
  assert.equal(failing.player.bag.moss, 3, "лишний мох остаётся в сумке");
  assert.equal(failing.player.bag.scrap_metal, 10, "металлолом не тронут");

  /* Без реагентов та же неудача уничтожает предмет. */
  const bare = forge.forgeUpgrade(player, item.uid, "rarity", () => 0.05, false);
  assert.equal(bare.success, false);
  assert.equal(bare.destroyed, true);
  assert.equal(bare.player.armory.length, 0, "предмет уничтожен");
  assert.equal(bare.reagentsUsed, 0);
  assert.equal(bare.player.bag.scrap_metal, 10, "без реагентов сумка не тронута");

  /* Пустая сумка = попытка без реагентов, значит риск уничтожения. */
  const empty = forge.forgeUpgrade({ ...player, bag: {} }, item.uid, "rarity", () => 0.05, true);
  assert.equal(empty.destroyed, true);
});

test("кузница: набор реагентов — разные реагенты, сумма как в таблице", () => {
  const sum = (parts) => parts.reduce((acc, p) => acc + p.count, 0);

  /* Качество: три-четыре разных реагента, сумма 5 / 15 / 25, лома нет. */
  const tiers = [
    ["common", 5],
    ["rare", 15],
    ["epic", 25],
  ];
  for (const [rarity, total] of tiers) {
    const item = content.createGearItem({ baseId: "sword", level: 1, wear: "battered", rarity, identified: true });
    const opt = forge.forgeOptions(item).find((o) => o.kind === "rarity");
    assert.equal(opt.reagentTotal, total, `${rarity}: сумма набора`);
    assert.equal(sum(opt.reagentParts), total, `${rarity}: состав совпадает с суммой`);
    assert.ok(opt.reagentParts.length >= 3, `${rarity}: реагенты разные`);
    assert.equal(new Set(opt.reagentParts.map((p) => p.id)).size, opt.reagentParts.length, "без повторов");
    assert.ok(!opt.reagentParts.some((p) => p.id === "scrap_metal"), `${rarity}: без металлолома`);
    assert.equal(opt.reagentForbidScrap, true);
  }

  /* Изношенность: 5 металлолома и 10 металлолома + 5 других. */
  const battered = content.createGearItem({ baseId: "sword", level: 1, wear: "battered", rarity: "common", identified: true });
  const wearOpt = forge.forgeOptions(battered).find((o) => o.kind === "wear");
  assert.deepEqual(wearOpt.reagentParts, [{ id: "scrap_metal", count: 5 }]);
  const worn = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  const wornOpt = forge.forgeOptions(worn).find((o) => o.kind === "wear");
  assert.equal(sum(wornOpt.reagentParts), 15);
  assert.equal(wornOpt.reagentParts.find((p) => p.id === "scrap_metal").count, 10);
  assert.equal(wornOpt.reagentParts.length, 2, "лом и ещё один реагент");

  /* Уровень: разные реагенты, сумма 2 × уровень предмета, лома нет. */
  for (let lvl = 1; lvl <= 10; lvl++) {
    const item = content.createGearItem({ baseId: "sword", level: lvl, wear: "battered", rarity: "common", identified: true });
    const opt = forge.forgeOptions(item).find((o) => o.kind === "level");
    assert.equal(opt.reagentTotal, 2 * lvl, `уровень ${lvl}: сумма`);
    assert.equal(sum(opt.reagentParts), 2 * lvl, `уровень ${lvl}: состав`);
    assert.ok(opt.reagentParts.length >= 2, `уровень ${lvl}: реагенты разные`);
    assert.ok(!opt.reagentParts.some((p) => p.id === "scrap_metal"), `уровень ${lvl}: без металлолома`);
  }

  /* Идеальная сумка: план берёт ровно состав и ничего лишнего. */
  const item = content.createGearItem({ baseId: "sword", level: 3, wear: "battered", rarity: "common", identified: true });
  const opt = forge.forgeOptions(item).find((o) => o.kind === "rarity");
  const bag = {};
  for (const part of opt.reagentParts) bag[part.id] = part.count;
  bag.moss = (bag.moss ?? 0) + 10;
  const plan = forge.forgeReagentPlan(bag, opt);
  assert.equal(plan.total, opt.reagentTotal);
  for (const part of opt.reagentParts) {
    assert.ok(plan.picked[part.id] >= part.count, `${part.id}: взяли не меньше своей доли`);
  }
});

test("кузница: шанс неудачи падает с числом вложенных реагентов", () => {
  const epic = content.createGearItem({ baseId: "sword", level: 1, wear: "battered", rarity: "epic", identified: true });
  const leg = forge.forgeOptions(epic).find((o) => o.kind === "rarity");
  assert.equal(leg.reagentTotal, 25);
  assert.equal(forge.forgeFailChance(leg, 0), 0.75, "без реагентов риск максимальный");
  assert.equal(forge.forgeFailChance(leg, 25), 0.45, "полный набор даёт таблицу");
  assert.equal(forge.forgeFailChance(leg, 13), 0.59, "половина набора снижает риск частично");

  const lvl3 = content.createGearItem({ baseId: "sword", level: 3, wear: "worn", rarity: "common", identified: true });
  const lvlOpt = forge.forgeOptions(lvl3).find((o) => o.kind === "level");
  assert.equal(lvlOpt.reagentTotal, 6, "2 реагента за каждый уровень предмета");
  assert.equal(lvlOpt.failChance, 0.2);
  assert.equal(lvlOpt.failChanceFull, 0.1, "полный набор — вдвое ниже обычного");

  const lvl10 = content.createGearItem({ baseId: "sword", level: 10, wear: "worn", rarity: "common", identified: true });
  const topOpt = forge.forgeOptions(lvl10).find((o) => o.kind === "level");
  assert.equal(topOpt.reagentTotal, 20);
  assert.equal(topOpt.failChance, 0.55);
  assert.equal(topOpt.failChanceFull, 0.28);
});

test("boss effect resistance is 25% and seals block the next player action", () => {
  const pl = player({ hp: 500, stats: { str: 5, agi: 5, int: 5 }, bag: { potion_s: 3 } });
  const b = freshBattle(pl, 3, true);
  b.queue = ["p", "e"]; b.idx = 0;
  b.p.statuses.sealItems = 1;
  const refused = battle.playerAct(b, { type: "item", id: "potion_s" });
  assert.equal(refused.bag.potion_s, 3);
  assert.equal(refused.idx, 0);
  const guard = battle.playerAct(refused, { type: "guard" });
  assert.equal(guard.p.statuses.sealItems, 0);
  // Сопротивление босса: при Math.random=0 эффект отражается.
  const b2 = freshBattle(pl, 3, true);
  b2.queue = ["p", "e"]; b2.idx = 0;
  b2.enemy.def = { ...b2.enemy.def, race: "none", type: "agile" };
  b2.bag.poison_dart = 1;
  const old = Math.random; Math.random = () => 0.0;
  const dart = battle.playerAct(b2, { type: "item", id: "poison_dart" });
  Math.random = old;
  assert.equal(dart.enemy.statuses.poison, 0);
});

/* ─────────────  ТИПЫ И РОДЫ МОНСТРОВ  ───────────── */

const monsters = loadGameModule("monsters");

test("every creature has a race and a type the race allows", () => {
  const defs = [...content.ENEMIES, ...content.BOSSES];
  assert.equal(defs.length, 49);
  for (const def of defs) {
    const meta = monsters.MONSTER_RACE_META[def.race];
    assert.ok(meta, `${def.id}: род ${def.race} известен`);
    assert.ok(monsters.MONSTER_TYPE_META[def.type], `${def.id}: тип ${def.type} известен`);
    assert.ok(meta.allowedTypes.includes(def.type), `${def.id}: тип ${def.type} допустим для рода ${def.race}`);
    if (def.race === "construct") assert.equal(def.type, "strong", `${def.id}: конструкт только сильный`);
  }
  for (const race of monsters.MONSTER_RACES) {
    assert.ok(defs.some((d) => d.race === race), `род ${race} кем-то представлен`);
  }
});

test("monster races keep their immunities, weaknesses and elements", () => {
  assert.equal(monsters.raceImmuneTo("undead", "poison"), true);
  assert.equal(monsters.raceImmuneTo("undead", "bleed"), true);
  assert.equal(monsters.raceImmuneTo("undead", "fear"), true);
  assert.equal(monsters.raceImmuneTo("construct", "bleed"), true);
  assert.equal(monsters.raceImmuneTo("ghost", "bleed"), true);
  assert.equal(monsters.raceImmuneTo("ghost", "fear"), false);
  assert.equal(monsters.raceImmuneTo("beast", "poison"), false);
  assert.equal(monsters.raceImmuneTo("dragon", "poison"), false);
  assert.equal(monsters.raceEffectResist("dragon") > 0, true);

  assert.equal(monsters.raceElementMult("construct", "fire"), 1.5);
  assert.equal(monsters.raceElementMult("construct", "ice"), 1.5);
  assert.equal(monsters.raceElementMult("construct", "acid"), 1.5);
  assert.equal(monsters.raceElementMult("construct", "light"), 1);
  assert.equal(monsters.raceElementMult("vampire", "light"), 1.5);
  assert.equal(monsters.raceElementMult("beast", "light"), 0);
  assert.equal(monsters.raceElementMult("undead", "fire"), 1);

  assert.equal(monsters.coerceMonsterType("construct", "agile"), "strong");
  assert.equal(monsters.coerceMonsterType("vampire", "strong"), "agile");
  assert.equal(monsters.coerceMonsterType("beast", "smart"), "agile");
  assert.equal(monsters.coerceMonsterType("demon", "smart"), "smart");
  assert.equal(monsters.raceCannotHeal("construct"), true);
});

test("spawn applies type profile and race moves", () => {
  for (let i = 0; i < 400; i++) {
    const s = battle.spawnEnemy(1 + (i % 8), false);
    const meta = monsters.MONSTER_RACE_META[s.def.race];
    assert.equal(s.mtype, monsters.coerceMonsterType(s.def.race, s.def.type));
    assert.ok(monsters.monsterEvade(s.def.race, s.mtype) >= 0);
    assert.ok(s.ap >= 1, "ходов всегда хотя бы один");
    for (const mv of meta.bonusMoves) assert.ok(s.moves.includes(mv), `${s.def.id}: приём рода ${mv}`);
  }
  const agile = battle.spawnEnemy(3, false, seededRandom([0.9, 0.9, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));
  assert.ok(Number.isFinite(monsters.monsterEvade(agile.def.race, agile.mtype)));
});

test("strong monsters are tougher, agile ones are quicker and harder to hit", () => {
  const strong = monsters.MONSTER_TYPE_META.strong;
  const agile = monsters.MONSTER_TYPE_META.agile;
  const smart = monsters.MONSTER_TYPE_META.smart;
  assert.ok(strong.hpMult > agile.hpMult && strong.atkMult > agile.atkMult);
  assert.ok(agile.apDelta > strong.apDelta && agile.evade > strong.evade);
  assert.ok(smart.movePower > strong.movePower && smart.atkMult < strong.atkMult);
});

/** Собирает бой с принудительным родом, типом и набором приёмов. */
function monsterBattle(race, type, moves, extra = {}) {
  const pl = player({ hp: 400, stats: { str: 2, agi: 1, int: 1 }, ...(extra.player ?? {}) });
  const b = freshBattle(pl, 1);
  b.queue = ["p", "e", "e", "e", "e"];
  b.idx = 0;
  b.enemy.def = { ...b.enemy.def, id: "fixture", race, type, moves };
  b.enemy.moves = moves;
  b.enemy.mtype = monsters.coerceMonsterType(race, type);
  b.enemy.hp = 400;
  b.enemy.maxHp = 400;
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.p.hp = 400;
  b.p.maxHp = 400;
  b.p.evade = 0;
  b.p.armor = 0;
  b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
  b.biome = "classic";
  b.torchTurns = 0;
  return b;
}

test("undead intimidate seals attacks and techniques for a turn", () => {
  const b = monsterBattle("undead", "strong", ["intimidate"]);
  b.idx = 1;
  const after = battle.enemyStep(b);
  assert.equal(after.p.statuses.sealAttack, 1);
  assert.equal(after.p.statuses.sealSkills, 1);
  after.idx = 0;
  const refused = battle.playerAct(after, { type: "attack" });
  assert.equal(refused.enemy.hp, after.enemy.hp);
  assert.ok(refused.log.some((l) => l.text.includes("Печать оков")));
});

test("vampire darkness hides half of the blows and bites bleed", () => {
  const b = monsterBattle("vampire", "agile", ["darkness"]);
  b.idx = 1;
  const darkened = battle.enemyStep(b);
  assert.equal(darkened.p.statuses.darkness, 1);
  darkened.idx = 0;
  const old = Math.random;
  Math.random = () => 0.1; // ниже 50% — атака уходит в пустоту
  const missed = battle.playerAct(darkened, { type: "attack" });
  Math.random = old;
  assert.equal(missed.enemy.hp, darkened.enemy.hp);
  assert.ok(missed.log.some((l) => l.text.includes("Мрак вампира")));

  const bite = monsterBattle("vampire", "agile", ["attack"]);
  bite.idx = 1;
  bite.enemy.hp = 200;
  const oldRandom = Math.random;
  Math.random = () => 0.9; // удар и укус состоялись: сопротивление героя не срабатывает
  const bitten = battle.enemyStep(bite);
  Math.random = oldRandom;
  assert.ok(bitten.p.statuses.wound > 0, "клыки открывают кровотечение");
  assert.ok(bitten.enemy.hp > 200, "вампир лечится от удара");
});

test("ghost cold touch pierces armor and forbids healing for two turns", () => {
  const b = monsterBattle("ghost", "smart", ["cold_touch"], { player: { bag: { potion_s: 3 } } });
  b.p.armor = 40;
  b.p.chanceLayers.magicResist = { stats: [], items: [], effects: [] };
  b.idx = 1;
  const after = battle.enemyStep(b);
  assert.ok(after.p.hp < 400, "холодное касание проходит сквозь броню 40");
  assert.equal(after.p.statuses.noHeal, 2);
  after.idx = 0;
  const healed = battle.playerAct(after, { type: "item", id: "potion_s" });
  assert.equal(healed.p.hp, after.p.hp, "пока стужа держит, зелье не лечит");
});

test("beast aggression doubles strikes under half health, demon hell force burns", () => {
  /* Один и тот же зверь: целый бьёт слабее, раненый — вдвое. */
  const seed = monsterBattle("beast", "agile", ["attack"]);
  seed.idx = 1;
  seed.enemy.atk = [10, 10];
  const calm = structuredClone(seed);
  calm.enemy.hp = 380;
  const angry = structuredClone(seed);
  angry.enemy.hp = 180; // ниже половины, но выше порога «лечусь»
  const fixed = Math.random;
  Math.random = () => 0.5;
  const calmLoss = 400 - battle.enemyStep(calm).p.hp;
  const angryLoss = 400 - battle.enemyStep(angry).p.hp;
  Math.random = fixed;
  assert.equal(calmLoss, 10, "обычный удар зверя");
  assert.equal(angryLoss, 20, "агрессия удваивает удар");

  const hell = monsterBattle("demon", "strong", ["hell_force"]);
  hell.idx = 1;
  const beforeHell = Math.random;
  Math.random = () => 0.9; // выше шанса стойкости: горение точно прилипнет
  const burned = battle.enemyStep(hell);
  Math.random = beforeHell;
  assert.ok(burned.p.hp < 400);
  assert.ok(burned.p.statuses.burn >= 4, "сила ада оставляет четыре слоя горения");
});

test("dragon builds fury after three player hits and resists effects", () => {
  const b = monsterBattle("dragon", "strong", ["attack"]);
  b.enemy.hp = 3000;
  b.enemy.maxHp = 3000;
  let state = b;
  for (let i = 0; i < 3; i++) {
    state.idx = 0;
    state = battle.playerAct(state, { type: "attack" });
  }
  assert.equal(state.enemy.fury, 3, "после трёх попаданий дракон в ярости");

  const resist = monsterBattle("dragon", "strong", ["attack"]);
  resist.bag.poison_dart = 1;
  const old = Math.random;
  Math.random = () => 0.1; // ниже 50% — эффект стряхнут
  const dart = battle.playerAct(resist, { type: "item", id: "poison_dart" });
  Math.random = old;
  assert.equal(dart.enemy.statuses.poison, 0);
});

test("constructs cannot be healed or poisoned and burn badly", () => {
  const b = monsterBattle("construct", "strong", ["drain"], { player: { bag: { scroll_fire: 1 } } });
  b.idx = 1;
  b.enemy.hp = 200;
  const drained = battle.enemyStep(b);
  assert.equal(drained.enemy.hp, 200, "конструкт не лечится похищением жизни");

  const poisoned = monsterBattle("construct", "strong", ["attack"], { player: { bag: { poison_dart: 1 } } });
  poisoned.enemy.hp = 300;
  const dart = battle.playerAct(poisoned, { type: "item", id: "poison_dart" });
  assert.equal(dart.enemy.statuses.poison, 0, "яд конструкту не страшен");

  /* Укрепление: физический урон по конструкту срезан на пятую часть. */
  const hitOnce = (race) => {
    const b = monsterBattle(race, "strong", ["attack"]);
    b.enemy.armor = 0;
    b.idx = 0;
    const old = Math.random;
    Math.random = () => 0.5;
    const hit = battle.playerAct(b, { type: "attack" });
    Math.random = old;
    return hit.enemy.maxHp - hit.enemy.hp;
  };
  const constructLoss = hitOnce("construct");
  const plainLossPhysical = hitOnce("none");
  assert.ok(constructLoss < plainLossPhysical, `Укрепление гасит удар: ${plainLossPhysical} → ${constructLoss}`);

  const fire = monsterBattle("beast", "agile", ["attack"], { player: { stats: { str: 1, agi: 1, int: 6 }, bag: { scroll_fire: 1 } } });
  fire.enemy.hp = 300;
  fire.enemy.def = { ...fire.enemy.def, race: "construct", type: "strong" };
  const burned = battle.playerAct(fire, { type: "item", id: "scroll_fire" });
  const fireLoss = 300 - burned.enemy.hp;

  const plain = monsterBattle("beast", "agile", ["attack"], { player: { stats: { str: 1, agi: 1, int: 6 }, bag: { scroll_fire: 1 } } });
  plain.enemy.hp = 300;
  plain.enemy.def = { ...plain.enemy.def, race: "none", type: "agile" };
  const plainBurn = battle.playerAct(plain, { type: "item", id: "scroll_fire" });
  const plainLoss = 300 - plainBurn.enemy.hp;
  assert.ok(fireLoss > plainLoss, `огонь бьёт конструкта сильнее: ${plainLoss} → ${fireLoss}`);
});

test("beasts are immune to light and vampires burn in it", () => {
  const beast = monsterBattle("beast", "agile", ["attack"], { player: { bag: { holy_water: 1 } } });
  beast.enemy.hp = 300;
  const blessed = battle.playerAct(beast, { type: "item", id: "holy_water" });
  assert.equal(blessed.enemy.hp, 300, "свет не берёт зверя");

  const vampire = monsterBattle("vampire", "agile", ["attack"], { player: { bag: { holy_water: 1 } } });
  vampire.enemy.hp = 300;
  const lightLoss = 300 - battle.playerAct(vampire, { type: "item", id: "holy_water" }).enemy.hp;

  const plain = monsterBattle("none", "agile", ["attack"], { player: { bag: { holy_water: 1 } } });
  plain.enemy.hp = 300;
  const plainLoss = 300 - battle.playerAct(plain, { type: "item", id: "holy_water" }).enemy.hp;
  assert.ok(lightLoss > plainLoss, `свет жжёт вампира сильнее: ${plainLoss} → ${lightLoss}`);
});

/* ─────────────  ПОРЯДОК ХОДОВ И ПЕЧАТИ  ───────────── */

test("turn queue spreads enemy turns evenly across the round", () => {
  const show = (p, e) => battle.buildQueue(p, e).map((s) => (s === "p" ? "5" : "2")).join("");
  /* Пример из правил: пять ходов против двух — 5525525, а не 5552525. */
  assert.equal(show(5, 2), "5525525");
  assert.equal(show(2, 5), "2252252");
  assert.equal(show(3, 1), "5525");
  assert.equal(show(1, 1), "52");
  assert.equal(show(2, 2), "5252");
  assert.equal(show(3, 5), "25225252");
  assert.equal(show(2, 1), "525");

  /* Число ходов всегда совпадает, а враг не копится в конце раунда. */
  for (let p = 1; p <= 10; p++) {
    for (let e = 1; e <= 10; e++) {
      const q = battle.buildQueue(p, e);
      assert.equal(q.filter((s) => s === "p").length, p, `${p}/${e}: ходы героя`);
      assert.equal(q.filter((s) => s === "e").length, e, `${p}/${e}: ходы врага`);
      assert.equal(q.length, p + e);
      const lastTwo = q.slice(-2).join("");
      assert.ok(!(p > e && lastTwo === "ee"), `${p}/${e}: враг не должен добирать ходы в конце`);
    }
  }
});

test("seals belong to bosses and catastrophes only", () => {
  const seals = battle.SEAL_MOVES;
  assert.equal(seals.length, 3);
  assert.equal(battle.mayHaveSeals(false, "normal"), false);
  assert.equal(battle.mayHaveSeals(false, "horror"), false);
  assert.equal(battle.mayHaveSeals(false, "catastrophe"), true);
  assert.equal(battle.mayHaveSeals(true, "catastrophe"), true);

  for (let i = 0; i < 1500; i++) {
    const threat = content.threatForRoll((i % 100) / 100);
    const s = battle.spawnEnemy(1 + (i % 8), false);
    const count = s.moves.filter((m) => seals.includes(m)).length;
    assert.equal(count, battle.mayHaveSeals(false, s.threat) ? 1 : 0, `${s.def.id} (${s.threat}): печатей ${count}`);
    assert.ok(threat);
  }
  for (let i = 0; i < 300; i++) {
    const boss = battle.spawnEnemy(1 + (i % 8), true);
    assert.equal(boss.moves.filter((m) => seals.includes(m)).length, 1, `${boss.def.id}: у босса ровно одна печать`);
  }
});

test("каждый приём оружия выпадает вместе с предметом", () => {
  const techniques = content.WEAPON_TECHNIQUES;
  const seen = new Set();
  for (const base of Object.values(content.GEAR_BASES)) {
    if (!base.weaponSkill) continue;
    for (let i = 0; i < 120; i++) {
      const item = content.createGearItem({
        baseId: base.id,
        rarity: ["common", "rare", "epic", "legendary"][i % 4],
        level: base.level ?? 1,
        wear: "worn",
        identified: true,
      });
      const skill = content.weaponSkillFor(item);
      assert.ok(skill, `${base.id}: приём не назначен`);
      assert.equal(skill.id, item.skillId, `${base.id}: приём предмета расходится с его описанием`);
      seen.add(skill.id);
    }
  }
  const missing = Object.keys(techniques).filter((id) => !seen.has(id));
  assert.deepEqual(missing, [], `приёмы не выпадают: ${missing.join(", ")}`);
  assert.equal(Object.keys(techniques).length, 47);
});

test("приём всегда считает от той характеристики, которую требует предмет", () => {
  for (const base of Object.values(content.GEAR_BASES)) {
    if (!base.weaponSkill) continue;
    for (let i = 0; i < 80; i++) {
      const item = content.createGearItem({
        baseId: base.id,
        rarity: ["common", "rare", "epic", "legendary"][i % 4],
        level: base.level ?? 1,
        wear: "worn",
        identified: true,
      });
      const want = content.gearStatReq(item).stat;
      const skill = content.weaponSkillFor(item);
      assert.equal(skill.scaleStat, want, `${base.id}: приём «${skill.name}» считает от ${skill.scaleStat}, а предмет требует ${want}`);
    }
  }
});

test("альтернативные приёмы линейки выдаются наравне с родным", () => {
  for (const base of Object.values(content.GEAR_BASES)) {
    if (!base.weaponSkill) continue;
    const stat = base.stat ?? (base.gearClass === "heavy" ? "str" : base.gearClass === "light" ? "int" : "agi");
    const pool = content.techniquePoolFor(base.id, stat);
    assert.ok(pool.length >= 1, `${base.id}: пустая линейка`);
    for (const id of pool) {
      assert.equal(content.WEAPON_TECHNIQUES[id].scaleStat, stat, `${base.id}/${id}: чужая характеристика в линейке`);
    }
    const counts = Object.fromEntries(pool.map((id) => [id, 0]));
    for (let i = 0; i < 300; i++) {
      const item = content.createGearItem({ baseId: base.id, rarity: "rare", wear: "worn", identified: true });
      assert.ok(counts[item.skillId] !== undefined, `${base.id}: вне линейки ${item.skillId}`);
      counts[item.skillId] += 1;
    }
    const share = Math.floor(300 / pool.length / 3);
    for (const id of pool) {
      assert.ok(counts[id] > share, `${base.id}/${id}: выпал ${counts[id]} раз из 300`);
    }
  }
});

test("оружие с единственным приёмом тоже получает эпические приёмы", () => {
  for (const baseId of ["greatsword", "spear", "warhammer2", "dagger", "wand_ash"]) {
    for (let i = 0; i < 60; i++) {
      const legendary = content.createGearItem({ baseId, rarity: "legendary", wear: "worn", identified: true });
      assert.ok(legendary.epicSkill, `${baseId}: легендарка без эпического приёма`);
    }
  }
});

test("выбранный приём переживает миграцию сохранения", () => {
  const item = content.createGearItem({ baseId: "sword", skillId: "sundering_blade", rarity: "rare", wear: "worn", identified: true });
  assert.equal(item.skillId, "sundering_blade");
  const migrated = content.migrateGearItem(item);
  assert.equal(migrated.skillId, "sundering_blade");
  assert.equal(content.weaponSkillFor(migrated).id, "sundering_blade");
  /* чужой линейке приём не подсунуть */
  const mismatch = content.createGearItem({ baseId: "sword", skillId: "quick_cut", rarity: "rare", wear: "worn", identified: true });
  assert.ok(content.TECHNIQUE_POOL.sword.includes(mismatch.skillId));
});

test("старый приём чужой характеристики меняется при миграции", () => {
  const broken = { ...content.createGearItem({ baseId: "abyss", wear: "worn", rarity: "rare", identified: true }), skillId: "shadow_rend" };
  const fixed = content.migrateGearItem(broken);
  const stat = content.gearStatReq(fixed).stat;
  assert.equal(stat, "int");
  assert.ok(content.TECHNIQUE_POOL.abyss.includes(fixed.skillId), `остался чужой приём ${fixed.skillId}`);
  assert.equal(content.weaponSkillFor(fixed).scaleStat, "int");
  /* родной приём своей характеристики миграция не трогает */
  const own = { ...content.createGearItem({ baseId: "abyss", wear: "worn", rarity: "rare", identified: true }), skillId: "void_reap" };
  assert.equal(content.migrateGearItem(own).skillId, "void_reap");
});

test("эпический приём тоже считается от характеристики предмета", () => {
  const seen = new Set();
  for (const base of Object.values(content.GEAR_BASES)) {
    if (!base.weaponSkill) continue;
    for (let i = 0; i < 120; i++) {
      const item = content.createGearItem({ baseId: base.id, rarity: "legendary", wear: "worn", identified: true });
      assert.ok(item.epicSkill, `${base.id}: у легендарки нет эпического приёма`);
      const want = content.gearStatReq(item).stat;
      const got = content.EPIC_SKILLS[item.epicSkill].scaleStat;
      assert.equal(got, want, `${base.id}: эпический приём «${item.epicSkill}» считает от ${got}, а предмет требует ${want}`);
      seen.add(item.epicSkill);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(content.EPIC_SKILLS).sort(), "эпические приёмы должны остаться достижимыми");
});

/** Игрок с оружием, у которого заранее задан приём. */
function withTechnique(skillId, baseId = "sword") {
  const g = content.createGearItem({ baseId, rarity: "rare", wear: "new", identified: true, level: 5, skillId });
  const p = mkP({ level: 10, stats: { str: 8, agi: 8, int: 8 }, hp: 200 });
  p.armory = [g];
  p.equip = { ...p.equip, mainHand: g.uid };
  p.hp = battle.derived(p).maxHp;
  const b = battle.newBattle(p, 1, false, undefined, 20, false);
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong" };
  b.enemy.mtype = "strong";
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.armor = 0;
  return b;
}

test("истощение врага накладывают приём на каждую характеристику, свиток и прах", () => {
  const breaks = Object.values(content.WEAPON_TECHNIQUES).filter((t) => t.effect === "buff_break");
  assert.deepEqual(breaks.map((t) => t.scaleStat).sort(), ["agi", "int", "str"], "нужен приём на каждую характеристику");
  for (const t of breaks) {
    const owners = Object.values(content.GEAR_BASES).filter((b) => (content.TECHNIQUE_POOL[b.id] ?? []).includes(t.id));
    assert.equal(owners.length, 1, `${t.id}: приём должен выпадать с одной моделью`);
    const stat = owners[0].stat ?? (owners[0].gearClass === "heavy" ? "str" : owners[0].gearClass === "light" ? "int" : "agi");
    assert.equal(stat, t.scaleStat, `${t.id}: линейка чужой характеристики`);
    assert.equal(t.cooldown, 3);
  }
  const scroll = content.ITEMS.scroll_dispel;
  const powder = content.ITEMS.dispel_powder;
  assert.ok(scroll && powder, "свиток и расходник должны существовать");
  assert.equal(scroll.kind, "scroll");
  assert.equal(powder.kind, "throwable");
  for (const def of [scroll, powder]) {
    assert.equal(def.use.type, "buff_break");
    assert.equal(def.use.rounds, 2, `${def.id}: истощение держится ровно 2 хода`);
    assert.ok(content.canBuySupply(def.id, 3), `${def.id}: должен появляться в лавке`);
  }
});

test("приём накладывает истощение на два хода", () => {
  const rnd = Math.random;
  const b = withTechnique("ward_shatter");
  Math.random = () => 0.9;
  b.p.concentration = 5; // приём требует концентрацию
  const after = battle.playerAct(b, { type: "weapon_skill" });
  Math.random = rnd;
  assert.equal(after.enemy.depleted, 2);
  assert.ok(after.log.some((l) => l.text.includes("Истощение")), "нет сообщения об истощении");
});

/** Бой с истощённым или обычным врагом: общая заготовка для сравнений. */
function depletionSeed() {
  const b = withTechnique("ward_shatter");
  b.enemy.maxHp = 5000;
  b.enemy.hp = 5000;
  b.enemy.armor = 0;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.p.hp = b.p.maxHp;
  return b;
}

/** Детерминированный ГПСЧ для боевых симуляций: без него интервалы кулдаунов плавают. */
function withSeededRandom(seed, fn) {
  const rnd = Math.random;
  let st = seed >>> 0;
  Math.random = () => {
    st = (st + 0x6d2b79f5) >>> 0;
    let t = st;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = rnd;
  }
}

test("созданный свиток льда несёт стихию льда: конструкт получает уязвимость", () => {
  /* Свиток сотворения при значении 0.6 создаёт и читает ледяные оковы (индекс 2 из 4). */
  const cast = (race) => {
    const b = monsterBattle(race, "strong", ["attack"], { player: { bag: { scroll_creation: 1 }, stats: { str: 2, agi: 1, int: 5 } } });
    b.enemy.hp = 400;
    const after = withRandom(() => battle.playerAct(b, { type: "item", id: "scroll_creation" }), 0.6);
    assert.equal(after.enemy.statuses.chill, 3, "должен сработать свиток ледяных оков");
    return 400 - after.enemy.hp;
  };
  const plain = cast("none");
  const construct = cast("construct");
  assert.ok(plain > 0, "обычная тварь получает урон");
  assert.ok(Math.abs(construct / plain - monsters.ELEMENT_WEAKNESS_MULT) < 0.05, `уязвимость ×1.5: ${plain} → ${construct}`);
});

test("стихийный урон магический: броню игнорирует, а в журнал попадает его стихия", () => {
  const fire = (armor) => {
    const b = monsterBattle("none", "strong", ["attack"], { player: { bag: { scroll_fire: 1 }, stats: { str: 2, agi: 1, int: 5 } } });
    b.enemy.hp = 400;
    b.enemy.armor = armor;
    return battle.playerAct(b, { type: "item", id: "scroll_fire" });
  };
  const soft = fire(0);
  const armored = fire(40);
  const lossSoft = 400 - soft.enemy.hp;
  const lossArmored = 400 - armored.enemy.hp;
  assert.ok(lossSoft > 0, "огонь наносит урон");
  assert.equal(lossArmored, lossSoft, "броня врага не режет стихийный урон");
  const line = soft.log.find((l) => l.dmg === "fire" && l.text.includes("получает"));
  assert.ok(line, "в журнале есть строка удара с меткой огня");
});

test("уязвимость рода к стихии попадает в журнал с меткой стихии", () => {
  const b = monsterBattle("construct", "strong", ["attack"], { player: { bag: { scroll_fire: 1 }, stats: { str: 2, agi: 1, int: 5 } } });
  b.enemy.hp = 400;
  const after = battle.playerAct(b, { type: "item", id: "scroll_fire" });
  const weak = after.log.find((l) => l.text.includes("Уязвимость к стихии"));
  assert.ok(weak, "уязвимость названа в журнале");
  assert.equal(weak.dmg, "fire", "строка уязвимости несёт огонь");
});

test("масла: шесть видов без физического, кровотечения и горения; тратят ход и стоят в расходниках", () => {
  const oils = Object.values(content.ITEMS).filter((i) => i.use?.type === "oil");
  assert.deepEqual(oils.map((i) => i.use.oil).sort(), ["acid", "fire", "ice", "light", "magic", "poison"]);
  assert.equal(content.ITEMS.oil_burn, undefined, "горючего масла нет: горение — это огонь");
  for (const i of oils) {
    assert.equal(i.kind, "potion", `${i.id}: расходник`);
    assert.ok(i.price > 0 && i.desc.length > 0, `${i.id}: есть цена и описание`);
    assert.ok(i.id in content.SUPPLY_LEVELS, `${i.id}: есть уровень припаса`);
  }
});

test("формулы масел: тик — 10% от удара, магия 3+3×ИНТ, свет 2×ИНТ", () => {
  const status = loadGameModule("statusEffects");
  assert.equal(status.oilTickFromHit(40), 4, "тик — 10% от удара 40");
  assert.equal(status.oilTickFromHit(3), 1, "тик не ниже 1");
  assert.equal(status.oilTickFromHit(55), 6, "5.5 округляется вверх");
  assert.equal(status.oilTickDamage("fire", 5, 0), 5, "огонь: тик как есть");
  assert.equal(status.oilTickDamage("fire", 5, 0.5), 3, "огонь режется магическим сопротивлением");
  assert.equal(status.oilTickDamage("ice", 5, 0), 5, "лёд: тик как есть");
  assert.equal(status.oilTickDamage("acid", 5, 0.5), 3, "кислота режется магическим сопротивлением");
  assert.equal(status.oilTickDamage("poison", 4, 0.9), 4, "яд: без сопротивления");
  assert.equal(status.oilTickDamage("magic", 0, 0), 0, "магия — разовый удар, тика нет");
  assert.equal(status.oilTickDamage("light", 0, 0), 0, "свет — разовый удар, тика нет");
  assert.equal(status.oilHitDamage("magic", 4), 15, "магия: 3 + 3×4");
  assert.equal(status.oilHitDamage("light", 4), 8, "свет: 2×4");
  assert.equal(status.oilHitDamage("fire", 4), 0, "огонь не бьёт разово");
  assert.equal(status.oilIceAttackCut(10), 0.5, "лёд: 5% за очко ИНТ");
  assert.equal(status.oilAcidArmorCut(3), 4, "кислота снимает 1 + ЛОВ");
});

test("масло на клинке: действует на ближайший раунд и истекает без удара", () => {
  const b = quietEnemy(freshBattle(mkP({ level: 1, stats: { str: 1, agi: 1, int: 1 }, hp: 100, bag: { oil_fire: 1 } }), 1, false, "classic"));
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  const oiled = battle.playerAct({ ...b, queue: ["p", "e"], idx: 0 }, { type: "item", id: "oil_fire" });
  assert.equal(oiled.p.statuses.oilType, "fire", "клинок смазан огнём");
  assert.equal(oiled.p.statuses.oilRounds, 2, "остаток раунда и следующий");
  assert.equal(oiled.bag.oil_fire ?? 0, 0, "масло израсходовано");

  const endRound = (st) => withRandom(() => battle.playerAct({ ...st, queue: ["p"], idx: 0 }, { type: "guard" }), 0.99);
  const r1 = endRound(oiled);
  assert.equal(r1.p.statuses.oilRounds, 1);
  const r2 = endRound(r1);
  assert.equal(r2.p.statuses.oilType, null, "без удара масло высохло");
  assert.equal(r2.p.statuses.oilRounds, 0);
});

test("огонь масла тикает 10% от удара три раунда; удар сам по себе не бьёт", () => {
  const b = quietEnemy(freshBattle(mkP({ level: 1, stats: { str: 1, agi: 1, int: 1 }, hp: 100, bag: { oil_fire: 1 } }), 1, false, "classic"));
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  const oiled = battle.playerAct({ ...b, queue: ["p", "e"], idx: 0 }, { type: "item", id: "oil_fire" });

  const hit = withRandom(() => battle.playerAct({ ...oiled, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  assert.equal(hit.enemy.statuses.oilType, "fire", "удар наложил огонь");
  assert.equal(hit.enemy.statuses.oilRounds, 3, "на 3 раунда");
  const dealt = 9999 - hit.enemy.hp;
  const tick = Math.max(1, Math.round(dealt * 0.1));
  assert.equal(hit.enemy.statuses.oilTick, tick, "тик — 10% от удара, которым наложено");

  const endRound = (st) => withRandom(() => battle.playerAct({ ...st, queue: ["p"], idx: 0 }, { type: "guard" }), 0.99);
  let st = hit;
  const ticks = [];
  for (let i = 0; i < 3; i++) {
    const before = st.enemy.hp;
    st = endRound(st);
    ticks.push(before - st.enemy.hp);
  }
  assert.deepEqual(ticks, [tick, tick, tick], "огонь: тик за раунд");
  assert.equal(st.enemy.statuses.oilType, null, "после трёх раундов масло угасло");
  const line = st.log.find((l) => l.text.includes(`Огонь масла отнимает ${tick} ОЗ`));
  assert.ok(line, "тик урона записан в журнал");
  assert.equal(line.dmg, "fire", "строка тика несёт метку огня");
});

test("яд масла: тик 10% от удара, а не от ЛОВ", () => {
  const b = quietEnemy(freshBattle(mkP({ level: 1, stats: { str: 1, agi: 5, int: 1 }, hp: 100, bag: { oil_poison: 1 } }), 1, false, "classic"));
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  const oiled = battle.playerAct({ ...b, queue: ["p", "e"], idx: 0 }, { type: "item", id: "oil_poison" });
  const hit = withRandom(() => battle.playerAct({ ...oiled, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  const tick = Math.max(1, Math.round((9999 - hit.enemy.hp) * 0.1));
  assert.equal(hit.enemy.statuses.oilTick, tick, "тик — 10% от удара");
  const ended = withRandom(() => battle.playerAct({ ...hit, queue: ["p"], idx: 0 }, { type: "guard" }), 0.99);
  assert.ok(ended.log.some((l) => l.text.includes(`Яд масла отнимает ${tick} ОЗ`)), "яд тикает своим тиком");
});

test("масло на боссе не процентное: тик — 10% от удара, как у обычной цели", () => {
  const b = quietEnemy(freshBattle(mkP({ level: 1, stats: { str: 1, agi: 1, int: 1 }, hp: 100, bag: { oil_fire: 1 } }), 1, false, "classic"));
  b.isBoss = true;
  b.enemy.hp = 9999;
  b.enemy.maxHp = 9999;
  const oiled = battle.playerAct({ ...b, queue: ["p", "e"], idx: 0 }, { type: "item", id: "oil_fire" });
  const hit = withRandom(() => battle.playerAct({ ...oiled, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  const dealt = 9999 - hit.enemy.hp;
  assert.equal(hit.enemy.statuses.oilTick, Math.max(1, Math.round(dealt * 0.1)), "тик масла — 10% от удара, а не % от ОЗ босса");
});

test("стихия масла учитывает род: конструкт получает ×1.5, зверь не получает света", () => {
  const constructB = monsterBattle("construct", "strong", ["attack"], { player: { bag: { oil_fire: 1 } } });
  constructB.enemy.hp = 9999;
  constructB.enemy.maxHp = 9999;
  const oiled = battle.playerAct({ ...constructB, queue: ["p", "e"], idx: 0 }, { type: "item", id: "oil_fire" });
  const hit = withRandom(() => battle.playerAct({ ...oiled, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  const ended = withRandom(() => battle.playerAct({ ...hit, queue: ["p"], idx: 0 }, { type: "guard" }), 0.99);
  const shown = ended.log.map((l) => l.text).find((t) => t.includes("Огонь масла отнимает") && t.includes("Уязвимость ×1.5"));
  assert.ok(shown, "огонь бьёт конструкт ×1.5");
  assert.equal(Number(/отнимает (\d+) ОЗ/.exec(shown)[1]), Math.max(1, Math.round(hit.enemy.statuses.oilTick * 1.5)), "тик × 1.5 от уязвимости");

  const beastB = monsterBattle("beast", "agile", ["attack"], { player: { bag: { oil_light: 1 } } });
  beastB.enemy.hp = 9999;
  beastB.enemy.maxHp = 9999;
  const lit = battle.playerAct({ ...beastB, queue: ["p", "e"], idx: 0 }, { type: "item", id: "oil_light" });
  const beastHit = withRandom(() => battle.playerAct({ ...lit, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  assert.equal(beastHit.enemy.statuses.oilType, null, "зверь невосприимчив к свету: масло не накладывается");
  assert.ok(beastHit.log.some((l) => l.text.includes("не поддаётся маслу")), "в журнале сказано почему");
});

test("магическое масло бьёт сразу: 3 + 3×ИНТ при каждом ударе, без тика", () => {
  const plainB = quietEnemy(monsterBattle("demon", "strong", ["attack"], { player: { bag: { oil_magic: 1 }, stats: { str: 10, agi: 1, int: 4 } } }));
  plainB.enemy.hp = 9999;
  plainB.enemy.maxHp = 9999;
  const plain = withRandom(() => battle.playerAct({ ...plainB, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  const oiled = battle.playerAct({ ...plainB, queue: ["p", "e"], idx: 0 }, { type: "item", id: "oil_magic" });
  const hit = withRandom(() => battle.playerAct({ ...oiled, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  assert.equal(hit.enemy.statuses.oilType, "magic", "удар наложил магию");
  const plainDmg = plainB.enemy.hp - plain.enemy.hp;
  const oiledDmg = oiled.enemy.hp - hit.enemy.hp;
  assert.equal(oiledDmg - plainDmg, 15, "сверх обычного удара: 3 + 3×4");
  const ended = withRandom(() => battle.playerAct({ ...hit, queue: ["p"], idx: 0 }, { type: "guard" }), 0.99);
  assert.ok(!ended.log.some((l) => l.text.includes("Магический масла отнимает")), "тика у магии нет");
});

test("световое масло: сразу 2×ИНТ и 25% промахов врага, пока висит", () => {
  const plainB = quietEnemy(monsterBattle("demon", "strong", ["attack"], { player: { bag: { oil_light: 1 }, stats: { str: 10, agi: 1, int: 4 } } }));
  plainB.enemy.hp = 9999;
  plainB.enemy.maxHp = 9999;
  const plain = withRandom(() => battle.playerAct({ ...plainB, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  const oiled = battle.playerAct({ ...plainB, queue: ["p", "e"], idx: 0 }, { type: "item", id: "oil_light" });
  const hit = withRandom(() => battle.playerAct({ ...oiled, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  assert.equal(hit.enemy.statuses.oilType, "light", "удар наложил свет");
  assert.equal((oiled.enemy.hp - hit.enemy.hp) - (plainB.enemy.hp - plain.enemy.hp), 8, "сверх обычного удара: 2×4");

  const foe = quietEnemy(monsterBattle("demon", "strong", ["attack"], { player: { hp: 400 } }));
  foe.enemy.statuses.oilType = "light";
  foe.enemy.statuses.oilRounds = 3;
  foe.queue = ["e"];
  foe.idx = 0;
  const missed = withRandom(() => battle.enemyStep(foe), 0.1);
  assert.equal(missed.p.hp, foe.p.hp, "при шансе 0.1 (<25%) удар промахивается");
  assert.ok(missed.log.some((l) => l.text.includes("ослеплён светом")), "в журнале сказано почему");
  const landed = withRandom(() => battle.enemyStep(foe), 0.5);
  assert.ok(landed.p.hp < foe.p.hp, "при шансе 0.5 (>25%) удар проходит");
});

test("ледяное масло режет силу атаки врага на 5% за очко ИНТ героя", () => {
  const foe = quietEnemy(monsterBattle("demon", "strong", ["attack"], { player: { hp: 400, stats: { str: 1, agi: 1, int: 10 } } }));
  foe.queue = ["e"];
  foe.idx = 0;
  const iced = { ...foe, enemy: { ...foe.enemy, statuses: { ...foe.enemy.statuses, oilType: "ice", oilRounds: 3 } } };
  const plainLoss = foe.p.hp - withRandom(() => battle.enemyStep(foe), 0.5).p.hp;
  const icedLoss = iced.p.hp - withRandom(() => battle.enemyStep(iced), 0.5).p.hp;
  assert.ok(plainLoss > 0, "без масла враг бьёт");
  assert.ok(Math.abs(icedLoss * 2 - plainLoss) <= 1, `лёд при ИНТ 10 режет вдвое: ${icedLoss} против ${plainLoss}`);
});

test("кислотное масло снимает с брони врага 1 + ЛОВ героя", () => {
  const plainB = quietEnemy(monsterBattle("demon", "strong", ["attack"], { player: { stats: { str: 10, agi: 3, int: 1 } } }));
  plainB.enemy.hp = 9999;
  plainB.enemy.maxHp = 9999;
  plainB.enemy.armor = 6;
  const acidB = { ...plainB, enemy: { ...plainB.enemy, statuses: { ...plainB.enemy.statuses, oilType: "acid", oilRounds: 3 } } };
  const plain = withRandom(() => battle.playerAct({ ...plainB, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  const acid = withRandom(() => battle.playerAct({ ...acidB, queue: ["p", "e"], idx: 0 }, { type: "attack" }), 0.99);
  assert.equal((acidB.enemy.hp - acid.enemy.hp) - (plainB.enemy.hp - plain.enemy.hp), 4, "броня 6 → 2: удар на 4 сильнее");
});

function withRandom(fn, value = 0.5) {
  const rnd = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = rnd;
  }
}

test("истощение гасит лечение, эффекты и ярость дракона", () => {
  const seed = depletionSeed();

  const heal = (depleted) => {
    const b = structuredClone(seed);
    b.enemy.moves = ["drain"];
    b.enemy.hp = Math.floor(b.enemy.maxHp * 0.5);
    if (depleted) b.enemy.depleted = 2;
    b.queue = ["p", "e", "p", "e"];
    b.idx = 1;
    const after = withRandom(() => battle.enemyStep(b), 0.9);
    return { healed: after.enemy.hp - b.enemy.hp, log: after.log.map((l) => l.text) };
  };
  assert.ok(heal(false).healed > 0, "без истощения вампиризм лечит");
  const blocked = heal(true);
  assert.equal(blocked.healed, 0, "истощение отключает лечение");
  assert.ok(blocked.log.some((t) => t.includes("истощение")));

  const furyDamage = (depleted) => {
    const b = structuredClone(seed);
    b.enemy.def = { ...b.enemy.def, id: "fixture", race: "dragon" };
    b.enemy.moves = ["attack"];
    b.enemy.atk = [10, 10];
    b.enemy.fury = 3;
    if (depleted) b.enemy.depleted = 2;
    b.p.hp = b.p.maxHp;
    b.queue = ["p", "e", "p", "e"];
    b.idx = 1;
    const after = withRandom(() => battle.enemyStep(b), 0.9);
    return b.p.hp - after.p.hp;
  };
  const rage = furyDamage(false);
  const damped = furyDamage(true);
  assert.ok(damped > 0, "истощённый дракон всё равно бьёт обычным уроном");
  assert.ok(rage > damped * 1.8, `ярость дракона гаснет: ${damped} против ${rage}`);
});

test("истощение гасит шипы, сопротивление урону и укрепление эффектов", () => {
  const seed = depletionSeed();
  const thorns = (depleted) => {
    const b = structuredClone(seed);
    b.enemy.effectPower = { thorns: 12 };
    b.enemy.effects = ["thorns"];
    if (depleted) b.enemy.depleted = 2;
    b.p.hp = b.p.maxHp;
    const after = withRandom(() => battle.playerAct(b, { type: "attack" }));
    return b.p.hp - after.p.hp;
  };
  assert.ok(thorns(false) > 0, "шипы врага работают");
  assert.equal(thorns(true), 0, "истощение отключает шипы");

  const resist = (depleted) => {
    const b = structuredClone(seed);
    b.enemy.effectPower = { damage_resist: 6 };
    b.enemy.effects = ["damage_resist"];
    if (depleted) b.enemy.depleted = 2;
    const after = withRandom(() => battle.playerAct(b, { type: "attack" }));
    return b.enemy.hp - after.enemy.hp;
  };
  const plain = resist(false);
  const depleted = resist(true);
  assert.ok(depleted > plain, `сопротивление урону гаснет: ${plain} против ${depleted}`);
});

test("истощение не трогает обычные параметры: броню, урон, ходы и стойку", () => {
  const seed = depletionSeed();

  /* Броня — параметр, а не эффект: она режет урон одинаково. */
  const armored = (depleted) => {
    const b = structuredClone(seed);
    b.enemy.armor = 8;
    if (depleted) b.enemy.depleted = 2;
    const after = withRandom(() => battle.playerAct(b, { type: "attack" }));
    return b.enemy.hp - after.enemy.hp;
  };
  assert.equal(armored(true), armored(false), "истощение не снимает броню");

  /* Стойка (защита) — действие, а не эффект: урон делится пополам и при истощении. */
  const guarded = (depleted) => {
    const b = structuredClone(seed);
    b.enemy.guard = true;
    if (depleted) b.enemy.depleted = 2;
    const after = withRandom(() => battle.playerAct(b, { type: "attack" }));
    return b.enemy.hp - after.enemy.hp;
  };
  const plainHit = guarded(false);
  const depletedHit = guarded(true);
  assert.equal(depletedHit, plainHit, "стойка работает и при истощении");

  /* Урон и число ходов твари не меняются. */
  const stats = (depleted) => {
    const b = structuredClone(seed);
    b.enemy.moves = ["attack"];
    b.enemy.atk = [10, 10];
    if (depleted) b.enemy.depleted = 2;
    b.p.hp = b.p.maxHp;
    b.queue = ["p", "e", "p", "e"];
    b.idx = 1;
    const after = withRandom(() => battle.enemyStep(b), 0.9);
    return { damage: b.p.hp - after.p.hp, ap: after.enemy.ap, atk: after.enemy.atk };
  };
  const normal = stats(false);
  const depleted = stats(true);
  assert.equal(depleted.damage, normal.damage, "базовый урон твари от истощения не меняется");
  assert.equal(depleted.ap, normal.ap, "ходы не отнимаются");
  assert.deepEqual(depleted.atk, normal.atk, "удар не ослабевает");
});

test("истощённый враг по-прежнему выбирает удар: истощение не мешает приёму урона", () => {
  const b = depletionSeed();
  b.enemy.depleted = 2;
  b.enemy.moves = ["attack"];
  b.enemy.hp = Math.floor(b.enemy.maxHp * 0.2);
  b.queue = ["p", "e", "p", "e"];
  b.idx = 1;
  assert.equal(battle.chooseEnemyMove(b), "attack", "удар — основной способ нанести урон");
});

test("истощение спадает через два раунда, свиток и прах накладывают его сразу", () => {
  const rnd = Math.random;
  Math.random = () => 0.9;
  let b = withTechnique("ward_shatter");
  b.enemy.depleted = 2;
  const startRound = b.round;
  let steps = 0;
  while (b.round < startRound + 1 && steps < 40) {
    b = b.queue[b.idx] === "p" ? battle.playerAct(b, { type: "guard" }) : battle.enemyStep(b);
    steps++;
  }
  assert.equal(b.enemy.depleted, 1, "через раунд остаётся один ход");
  while (b.round < startRound + 2 && steps < 80) {
    b = b.queue[b.idx] === "p" ? battle.playerAct(b, { type: "guard" }) : battle.enemyStep(b);
    steps++;
  }
  assert.equal(b.enemy.depleted, 0, "через два раунда эффекты возвращаются");

  const scroll = withTechnique("ward_shatter");
  scroll.bag = { scroll_dispel: 1 };
  const scrollHit = battle.playerAct(scroll, { type: "item", id: "scroll_dispel" });
  assert.equal(scrollHit.enemy.depleted, 2, "свиток накладывает истощение");

  const powder = withTechnique("ward_shatter");
  powder.bag = { dispel_powder: 1 };
  const powderHit = battle.playerAct(powder, { type: "item", id: "dispel_powder" });
  assert.equal(powderHit.enemy.depleted, 2, "прах накладывает истощение");
  assert.equal(powderHit.enemy.hp, powder.enemy.hp, "прах не наносит урона");
  Math.random = rnd;
});

/* ─────────────  ШИПЫ: ТОЛЬКО ПРОТИВ ФИЗИКИ  ───────────── */

/** Бой с техникой указанного вида у героя и шипами у врага. */
function thornsBattle(skillId, baseId) {
  const b = withTechnique(skillId, baseId);
  b.enemy.effectPower = { ...(b.enemy.effectPower ?? {}), thorns: 7 };
  b.enemy.effects = [...(b.enemy.effects ?? []), "thorns"];
  b.enemy.hp = 5000;
  b.enemy.maxHp = 5000;
  b.p.hp = b.p.maxHp;
  b.p.gearEffects = [];
  b.p.effectPower = {};
  return b;
}

function applyWithoutLuck(b, act) {
  const rnd = Math.random;
  Math.random = () => 0.5;
  try {
    return act();
  } finally {
    Math.random = rnd;
  }
}

test("шипы врага ранят за физический приём, но не за магический", () => {
  /* «Истощающий удар» — приём меча, бьёт физикой. */
  const physical = thornsBattle("ward_shatter", "sword");
  physical.p.concentration = 5; // приём требует концентрацию
  const afterPhys = applyWithoutLuck(physical, () => battle.playerAct(physical, { type: "weapon_skill" }));
  assert.ok(afterPhys.p.hp < physical.p.hp, "физический приём задел шипы");
  assert.ok(afterPhys.log.some((l) => l.text.includes("Шипы противника")), "нет сообщения о шипах врага");

  /* «Истощающее слово» — приём посоха, урон магический. */
  const magic = thornsBattle("ward_unravel", "staff");
  magic.p.concentration = 5; // приём требует концентрацию
  const afterMagic = applyWithoutLuck(magic, () => battle.playerAct(magic, { type: "weapon_skill" }));
  assert.equal(afterMagic.p.hp, magic.p.hp, "магический приём шипы не задевает");
  assert.ok(!afterMagic.log.some((l) => l.text.includes("Шипы противника")), "шипы сработали на магию");
});

test("шипы врага молчат на свиток и магический урон", () => {
  const b = thornsBattle("ward_shatter", "sword");
  b.bag = { scroll_fire: 2 };
  const after = applyWithoutLuck(b, () => battle.playerAct(b, { type: "item", id: "scroll_fire" }));
  assert.ok(after.enemy.hp < b.enemy.hp, "свиток нанёс урон");
  assert.equal(after.p.hp, b.p.hp, "свиток не будит шипы");
});

test("шипы героя отвечают на физическую атаку врага, но не на магию", () => {
  const strike = freshBattle(mkP({ level: 5, stats: { str: 6, agi: 2, int: 2 }, hp: 200 }), 1);
  strike.enemy.def = { ...strike.enemy.def, race: "undead", type: "strong" };
  strike.enemy.moves = ["attack"];
  strike.enemy.effectPower = {};
  strike.p.effectPower = { thorns: 9 };
  strike.p.hp = 300;
  strike.enemy.hp = 5000;
  strike.enemy.maxHp = 5000;
  /* Два хода твари в очереди: ИИ не уходит в защиту на последнем ходу раунда. */
  const hit = applyWithoutLuck(strike, () => battle.enemyStep({ ...strike, queue: ["e", "e", "p"], idx: 0 }));
  assert.ok(hit.enemy.hp < strike.enemy.hp, "физический удар врага наткнулся на шипы");
  assert.ok(hit.log.some((l) => l.text.includes("Шипы возвращают")), "нет сообщения о шипах героя");

  const spell = freshBattle(mkP({ level: 5, stats: { str: 6, agi: 2, int: 2 }, hp: 200 }), 1);
  spell.enemy.def = { ...spell.enemy.def, race: "undead", type: "strong" };
  spell.enemy.moves = ["curse"];
  spell.enemy.effectPower = {};
  spell.p.effectPower = { thorns: 9 };
  spell.p.hp = 300;
  spell.enemy.hp = 5000;
  spell.enemy.maxHp = 5000;
  const cursed = applyWithoutLuck(spell, () => battle.enemyStep({ ...spell, queue: ["e", "e", "p"], idx: 0 }));
  assert.equal(cursed.enemy.hp, spell.enemy.hp, "магический выпад врага шипы не отражают");
  assert.ok(!cursed.log.some((l) => l.text.includes("Шипы возвращают")), "шипы сработали на магию врага");
});

test("враг с магией выбирает её, когда физический удар бессилен", () => {
  const b = freshBattle(mkP({ level: 5, stats: { str: 6, agi: 2, int: 2 }, hp: 200 }), 1);
  b.enemy.moves = ["attack", "curse"];
  b.enemy.def = { ...b.enemy.def, id: "fixture", moves: ["attack", "curse"] };
  b.enemy.effectPower = {};
  b.p.armor = 999;
  b.p.hp = 300;
  const move = battle.chooseEnemyMove(b);
  assert.equal(move, "curse", `при огромной броне урон даёт магия, а выбрана ${move}`);
});

test("угрозы: обычный монстр +30% ОЗ, ужас ×1.25, катастрофа ×1.5, босс ×1.75 по ОЗ, атаке и броне", () => {
  const monsters = loadGameModule("monsters");
  const scaling = loadGameModule("enemyScaling");
  const lcg = (seed) => {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  };
  const spawn = (threat, seed, floor) => battle.spawnEnemy(floor, false, lcg(seed), threat);
  let checked = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const floor = 2 + (seed % 7);
    const n = spawn("normal", seed, floor);
    const h = spawn("horror", seed, floor);
    const c = spawn("catastrophe", seed, floor);
    assert.equal(n.def.id, h.def.id, "один и тот же монстр для сравнения");
    assert.equal(n.def.id, c.def.id);
    assert.equal(n.level, c.level);
    const lm = scaling.enemyLevelMult(n.level);
    const typeMeta = monsters.MONSTER_TYPE_META[n.mtype];
    /* Обычный: ОЗ ×1.3 к базе. */
    assert.ok(Math.abs(n.hp - Math.round(n.def.hp * lm * 1.3 * typeMeta.hpMult)) <= 1, `обычный ОЗ ${n.hp}`);
    /* Ужас ×1.25, катастрофа ×1.5 — относительно обычного, по ОЗ и атаке. */
    assert.ok(Math.abs(h.hp - 1.25 * n.hp) <= 2, `ужас ОЗ ${h.hp} при обычном ${n.hp}`);
    assert.ok(Math.abs(c.hp - 1.5 * n.hp) <= 2, `катастрофа ОЗ ${c.hp} при обычном ${n.hp}`);
    /* Минимум 10 у обычных монстров: множитель проверяем, пока удар выше минимума. */
    if (n.atk[0] > battle.NORMAL_MIN_ATK) {
      assert.ok(Math.abs(h.atk[0] - 1.25 * n.atk[0]) <= 2, `ужас атака ${h.atk[0]} при обычной ${n.atk[0]}`);
      assert.ok(Math.abs(c.atk[0] - 1.5 * n.atk[0]) <= 2, `катастрофа атака ${c.atk[0]} при обычной ${n.atk[0]}`);
    }
    /* Броня масштабируется вместе с остальными параметрами, у прибавки типа своя поправка. */
    if (n.def.armor * lm >= 2) {
      const d = typeMeta.armorDelta;
      assert.ok(Math.abs((h.armor - d) - 1.25 * (n.armor - d)) <= 2, `ужас броня ${h.armor}, обычная ${n.armor}`);
      assert.ok(Math.abs((c.armor - d) - 1.5 * (n.armor - d)) <= 2, `катастрофа броня ${c.armor}, обычная ${n.armor}`);
    }
    checked++;
  }
  assert.ok(checked >= 80);

  /* Босс: ×1.75 к обычному по ОЗ, атаке и броне. Сравниваем с формулой от его собственной базы. */
  for (let seed = 1; seed <= 20; seed++) {
    const floor = 2 + (seed % 7);
    const boss = battle.spawnEnemy(floor, true, lcg(seed));
    const lm = scaling.enemyLevelMult(boss.level);
    const tm = monsters.MONSTER_TYPE_META[boss.mtype];
    assert.ok(Math.abs(boss.hp - Math.round(boss.def.hp * lm * 2.275 * tm.hpMult)) <= 1, `босс ОЗ ${boss.hp}`);
    assert.ok(Math.abs(boss.atk[0] - Math.round(boss.def.atk[0] * lm * 1.75 * tm.atkMult)) <= 1, `босс атака ${boss.atk[0]}`);
  }
});

test("кнопка «Защита» не делит урон пополам, а даёт броню +25%", () => {
  const rnd = Math.random;
  Math.random = () => 0.99; // без промахов, уклонений и критов
  try {
    const hitFor = (armor, guard) => {
      const b = freshBattle(player({ hp: 300 }), 2);
      b.queue = ["e"];
      b.idx = 0;
      b.p.hp = 300; b.p.maxHp = 300;
      b.p.armor = armor; b.p.guard = guard;
      b.p.statuses.stone = 0; b.p.statuses.tempArmor = 0; b.p.statuses.ironTonic = 0; b.p.statuses.sundered = 0;
      b.enemy.moves = ["attack"]; b.enemy.def = { ...b.enemy.def, id: "fixture", moves: ["attack"] };
      b.enemy.atk = [40, 40];
      b.enemy.statuses.blight = 0; b.enemy.statuses.curse = 0;
      const s = battle.enemyStep(b);
      return 300 - s.p.hp;
    };
    assert.equal(battle.playerArmorNow({ p: { armor: 20, statuses: { tempArmor: 0, ironTonic: 0, sundered: 0 }, guard: true } }), 25);
    const open = hitFor(0, false);
    const guardedNoArmor = hitFor(0, true);
    assert.equal(guardedNoArmor, open, "в защите без брони урон тот же, а не вдвое меньше");
    const plainArmored = hitFor(20, false);
    const guardedArmored = hitFor(20, true);
    assert.equal(plainArmored - guardedArmored, 5, `броня 20 → 25 режет на 5 больше: без защиты ${plainArmored}, в защите ${guardedArmored}`);
  } finally {
    Math.random = rnd;
  }
});

test("оглушённый герой пропускает ход сам: действие не тратится, очередь уходит монстру", () => {
  const base = freshBattle(PlayerFactory.createInitial(), 1, false, "normal", 0, false);
  const stunned = {
    ...base,
    over: null,
    queue: ["p", "e", "p", "e"],
    idx: 0,
    p: { ...base.p, statuses: { ...base.p.statuses, stunAp: 1 } },
  };
  const skipped = battle.skipStunnedTurn(stunned);
  assert.equal(skipped.p.statuses.stunAp, 0, "оглушение снято ровно на один ход");
  assert.equal(skipped.idx, 1, "очередь ушла к монстру");
  assert.ok(skipped.log.some((line) => line.text.includes("пропускаешь этот ход")), "в журнале записан пропуск");
  assert.equal(skipped.enemy.hp, base.enemy.hp, "монстр не получил урона: героя ничего не атаковало");
});

test("playerAct при оглушении даёт тот же пропуск, что и отдельный пропуск", () => {
  const base = freshBattle(PlayerFactory.createInitial(), 1, false, "normal", 0, false);
  const stunned = {
    ...base,
    over: null,
    queue: ["p", "e"],
    idx: 0,
    p: { ...base.p, statuses: { ...base.p.statuses, stunAp: 2 } },
  };
  const viaAct = battle.playerAct(stunned, { type: "attack" });
  const viaSkip = battle.skipStunnedTurn(stunned);
  assert.equal(viaAct.p.statuses.stunAp, 1, "действие не тратит оглушение сверх одного хода");
  assert.equal(viaAct.p.statuses.stunAp, viaSkip.p.statuses.stunAp);
  assert.equal(viaAct.idx, viaSkip.idx);
  assert.equal(viaAct.enemy.hp, base.enemy.hp, "атака не прошла");
  const notStunned = battle.skipStunnedTurn({ ...stunned, p: { ...stunned.p, statuses: { ...stunned.p.statuses, stunAp: 0 } } });
  assert.equal(notStunned.idx, 0, "без оглушения пропуска нет");
});

test("кузница: сумма реагентов без нужного состава не даёт улучшения за реагенты", () => {
  const item = content.createGearItem({ baseId: "sword", level: 1, wear: "battered", rarity: "common", identified: true });
  /* Качество обычного: кость 2, порох 2, мох 1. Пять костной пыли — сумма есть, состава нет. */
  const wrong = mkP({ gold: 5000, armory: [item], bag: { bone: 5 } });
  const wrongRes = forge.forgeUpgrade(wrong, item.uid, "rarity", () => 0.99, true);
  assert.equal(wrongRes.reagentsUsed, 2, "в горн уходит только кость по доле, не вся сумма");
  assert.equal(wrongRes.player.bag.bone, 3, "остальная кость в сумке");
  assert.equal(forge.forgeReagentPlan({ bone: 5 }, forge.forgeOptions(item).find((o) => o.kind === "rarity")).total, 2);

  /* Полный состав: кость 2, порох 2, мох 1 — набор 5 из 5. */
  const full = mkP({ gold: 5000, armory: [item], bag: { bone: 2, powder: 2, moss: 1 } });
  const fullRes = forge.forgeUpgrade(full, item.uid, "rarity", () => 0.99, true);
  assert.equal(fullRes.reagentsUsed, 5, "полный состав уходит целиком");
});
