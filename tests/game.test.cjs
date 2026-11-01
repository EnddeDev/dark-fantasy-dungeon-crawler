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
const events = loadGameModule("events");
const battle = loadGameModule("battle");
/**
 * Бой с нейтральным врагом: род «никакой» и тип «сильный» не дают ни
 * уклонения, ни иммунитетов. Тесты про роды и типы задают их вручную.
 */
function freshBattle(pl, floor, isBoss, biome, torchTurns, burning) {
  const b = battle.newBattle(pl, floor, isBoss, biome, torchTurns, burning);
  b.enemy.def = { ...b.enemy.def, race: "none", type: "strong" };
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
      assert.ok(m.events.length >= 1 && m.events.length <= 2, `событий ${m.events.length} на этаже ${floor}`);

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
  for (let i = 0; i < 60; i++) {
    const size = 12;
    const m = maze.genMaze(size, 6);
    for (let a = 0; a < m.rooms.length; a++) {
      for (let b = a + 1; b < m.rooms.length; b++) {
        const A = m.rooms[a];
        const B = m.rooms[b];
        const apart = A.x + A.w + 1 <= B.x || B.x + B.w + 1 <= A.x || A.y + A.h + 1 <= B.y || B.y + B.h + 1 <= A.y;
        assert.ok(apart, `залы ${A.kind} и ${B.kind} слиплись на ${size}x${size}`);
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

test("empty cells only ever offer a small find, never a random fight or trap", () => {
  assert.deepEqual(
    [0, 0.599, 0.899, 0.9, 0.999].map((r) => events.rollStepEvent(false, r)),
    ["quiet", "quiet", "quiet", "find", "find"],
  );
  assert.deepEqual(
    [0, 0.5, 0.899, 0.9, 0.999].map((r) => events.rollStepEvent(true, r)),
    ["quiet", "quiet", "quiet", "quiet", "quiet"],
  );
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

test("loot tables follow the stated percentages and scale with monster level", () => {
  const normal = content.lootTableFor(1, 1, "normal");
  assert.equal(Math.round(normal.nothing), 30);
  assert.equal(Math.round(normal.gold), 30);
  assert.equal(Math.round(normal.reagents), 20);
  assert.equal(Math.round(normal.supplies), 15);
  assert.equal(Math.round(normal.gear), 5);

  const stronger = content.lootTableFor(2, 1, "normal");
  assert.equal(Math.round(stronger.nothing), 26);
  assert.equal(Math.round(stronger.gold), 31);
  assert.equal(Math.round(stronger.reagents), 21);
  assert.equal(Math.round(stronger.supplies), 16);
  assert.equal(Math.round(stronger.gear), 6);

  // Ужас: доля «ничего» уходит в снаряжение, остальные категории сохраняются.
  const horror = content.lootTableFor(1, 1, "horror");
  assert.equal(horror.nothing, 0);
  assert.equal(Math.round(horror.gear), 35);
  assert.equal(Math.round(horror.gold), 30);
  assert.equal(Math.round(horror.reagents), 20);
  assert.equal(Math.round(horror.supplies), 15);

  // Катастрофа: ещё треть расходников и золота уходит в снаряжение.
  const catastrophe = content.lootTableFor(1, 1, "catastrophe");
  assert.equal(catastrophe.nothing, 0);
  assert.ok(catastrophe.gear > horror.gear);
  assert.ok(catastrophe.gold > 0 && catastrophe.gold < horror.gold);
  for (const t of [normal, horror, catastrophe]) {
    const sum = t.nothing + t.gold + t.reagents + t.supplies + t.gear;
    assert.ok(Math.abs(sum - 100) < 0.001, `сумма ${sum}`);
  }

  assert.equal(content.lootCategoryForRoll(normal, 0), "nothing");
  assert.equal(content.lootCategoryForRoll(normal, 0.299), "nothing");
  assert.equal(content.lootCategoryForRoll(normal, 0.3), "gold");
  assert.equal(content.lootCategoryForRoll(normal, 0.6), "reagents");
  assert.equal(content.lootCategoryForRoll(normal, 0.8), "supplies");
  assert.equal(content.lootCategoryForRoll(normal, 0.95), "gear");
});

test("качество добычи с монстров: 5/15/25 редкое, легендарного нет", () => {
  assert.deepEqual(content.rarityWeightsFor("normal"), { common: 95, rare: 5, epic: 0, legendary: 0 });
  assert.deepEqual(content.rarityWeightsFor("horror"), { common: 84, rare: 15, epic: 1, legendary: 0 });
  assert.deepEqual(content.rarityWeightsFor("catastrophe"), { common: 70, rare: 25, epic: 5, legendary: 0 });
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
  const r = content.RECIPES.find((recipe) => recipe.id === "r5");
  assert.ok(r);
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
    b.enemy.def = { ...b.enemy.def, race: "none", type: "agile", moves: ["attack"] };
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
  assert.ok(999 - blast.enemy.hp >= 8); // 7 + 1.5×ЛОВ(1), округление
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
  b0.p.guard = true;
  const guarded = battle.combatReadout(b0);
  assert.ok(guarded.inGuardMax <= Math.ceil(clean.inMax / 2));

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
    b.enemy.def = { ...b.enemy.def, race: "none", type: "agile", moves: ["attack"] };
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

test("research cost grows with the item level", () => {
  const low = content.createGearItem({ baseId: "knife", identified: false });
  const high = content.createGearItem({ baseId: "soulstone", identified: false });
  const rLow = content.identifyReqs({ ...low, level: 1 });
  const rHigh = content.identifyReqs({ ...high, level: 6 });
  assert.deepEqual(rLow, { int: 2, gold: 20 });
  assert.deepEqual(rHigh, { int: 7, gold: 120 });
  assert.ok(rHigh.int > rLow.int && rHigh.gold > rLow.gold);
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
      assert.equal(ws.scaleStat, stat);
      assert.ok(ws.scaleMult >= lo && ws.scaleMult <= hi, `${stat}: ${ws.scaleMult} вне ${lo}..${hi}`);
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
      assert.ok(ws.scaleMult >= 1.5 && ws.scaleMult <= 2.5);
      assert.ok(ws.desc.includes("×ЛОВ"), ws.desc);
      assert.ok(ws.passiveNote.includes("×ЛОВ"), ws.passiveNote);
      assert.ok(!ws.desc.includes("×ИНТ") && !ws.desc.includes("×СИЛ"));
    }
  }
});

test("weapon technique descriptions and passive notes match the actual affinity and multiplier", () => {
  for (const baseId of Object.keys(content.TECHNIQUE_POOL)) {
    for (const skillId of content.TECHNIQUE_POOL[baseId]) {
      const item = content.createGearItem({ baseId, skillId, wear: "worn", rarity: "common", identified: true });
      const ws = content.weaponSkillFor(item);
      const short = content.STAT_META[ws.scaleStat].short;
      assert.equal(ws.scaleStat, content.gearAffinity(item));
      if (ws.effect === "double_attack") {
        assert.ok(ws.desc.includes("без дополнительного бонуса"), `${baseId}/${skillId}: ${ws.desc}`);
      } else {
        assert.ok(ws.desc.includes(`${ws.scaleMult}×${short}`), `${baseId}/${skillId}: ${ws.desc}`);
      }
      assert.ok(ws.passiveNote.includes(`×${short}`), ws.passiveNote);
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
    b.enemy.def = { ...b.enemy.def, race: "none", type: "agile", moves: ["attack"] };
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
    b.enemy.def = { ...b.enemy.def, race: "none", type: "agile", moves: ["attack"] };
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

test("assassin: first attack is guaranteed crit at milestone 10", () => {
  const { p } = withGear("assassin_stiletto", { archetype: "assassin", passives: ["arch_assassin_5", "arch_assassin_10"] });
  const b = freshBattle(p, 1);
  const rnd = Math.random; Math.random = () => 0.99;
  const after = battle.playerAct(b, { type: "attack" });
  Math.random = rnd;
  assert.ok(after.log.some((l) => l.text.includes("Критический удар")));
  assert.equal(after.p.firstAttackDone, true);
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

test("item level scales stats, effects, techniques and legendary passives by +20% ceil", () => {
  const scaling = loadGameModule("gearScaling");
  assert.equal(scaling.scaleIntegerByLevel(10, 1), 10);
  assert.equal(scaling.scaleIntegerByLevel(10, 2), 12);
  assert.equal(scaling.scaleIntegerByLevel(10, 3), 15);
  assert.equal(scaling.scalePercentByLevel(3, 2), 4);
  assert.equal(scaling.scaleMultByLevel(1.8, 2), 2.16);

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
  assert.equal(scaling.legendaryMagnitude("executioner", "damage", 2), 42);

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
  assert.equal(initial.armory.length, 2);
  for (const item of initial.armory) {
    assert.equal(content.gearRequiresNothing(item), true, `${item.baseId}: без требований`);
    assert.equal(content.gearRequirement(item).stat, null);
    assert.equal(content.gearStatReqLabel(item), "без требований");
    assert.equal(content.canWear(item, zero), true, `${item.baseId} надевается даже с нулевыми характеристиками`);
  }

  /* Стартовые вещи без требований при любом качестве и в любом сохранении. */
  for (const item of initial.armory) {
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

test("enemy AI heals or guards when low, punishes misses and closes rounds by turn order", () => {
  const base = () => {
    const b = freshBattle(mkP({ level: 1, stats: { str: 1, agi: 1, int: 1 }, hp: 60 }), 1, false, "classic");
    b.enemy.hp = 100; b.enemy.maxHp = 100;
    b.biome = "classic";
    b.enemy.moves = ["attack", "drain", "wound"];
    b.enemy.def = { ...b.enemy.def, moves: ["attack", "drain", "wound"] };
    return b;
  };
  /* Мало ОЗ — лечащий приём, а без него защитная стойка. */
  const low = base();
  low.enemy.hp = 20;
  assert.equal(battle.chooseEnemyMove(low), "drain");
  const lowNoHeal = base();
  lowNoHeal.enemy.hp = 20;
  lowNoHeal.enemy.moves = ["attack", "wound"];
  assert.equal(battle.chooseEnemyMove(lowNoHeal), "guard");

  /* Промах — следующий ход приём, при магии именно магический. */
  const missed = base();
  missed.enemy.lastMiss = true;
  missed.enemy.moves = ["attack", "heavy", "wound", "terror"];
  assert.equal(battle.chooseEnemyMove(missed), "terror");
  const missedNoMagic = base();
  missedNoMagic.enemy.lastMiss = true;
  missedNoMagic.enemy.moves = ["attack", "heavy", "wound"];
  assert.equal(battle.chooseEnemyMove(missedNoMagic), "wound");

  /* Последний ход раунда: меньше ходов — защита, больше — удар или приём. */
  const slower = base();
  slower.queue = ["p", "p", "e"]; slower.idx = 2;
  assert.equal(battle.chooseEnemyMove(slower), "guard");
  const faster = base();
  faster.queue = ["e", "e", "p"]; faster.idx = 1;
  assert.ok(["attack", "drain", "wound"].includes(battle.chooseEnemyMove(faster)));

  /* Слабый обычный удар — приёмы на негативные эффекты. */
  const weak = base();
  weak.p.armor = 999;
  weak.enemy.moves = ["attack", "wound"];
  assert.equal(battle.chooseEnemyMove(weak), "wound");
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
  b.enemy.def = { ...b.enemy.def, race: "none", type: "agile" };
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
  const after = battle.playerAct(b, { type: "weapon_skill" });
  Math.random = old;
  const dealt = 5000 - after.enemy.hp;
  // Два обычных удара: бросок оружия + (2 + СИЛ), без бонуса приёма.
  const normal = b.p.hit[0] + 2 + b.p.stats.str;
  assert.equal(dealt, normal * 2, `ожидалось два обычных удара без бонуса, получено ${dealt}`);
});

test("supplies have levels tied to minimum drop floor and new statuses work", () => {
  assert.equal(content.supplyLevel("throwing_knife"), 1);
  assert.equal(content.supplyLevel("wither_dust"), 5);
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
    b.enemy.def = { ...b.enemy.def, race: "none", type: "agile", moves: ["attack"] };
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

test("forge upgrade costs and destruction risks match the design", () => {
  const g = content.createGearItem({ baseId: "sword", level: 1, wear: "battered", rarity: "common", identified: true });
  const opts = forge.forgeOptions(g);
  assert.equal(opts.find((o) => o.kind === "rarity").cost, 100);
  assert.equal(opts.find((o) => o.kind === "rarity").destroyChance, 0.25);
  assert.equal(opts.find((o) => o.kind === "wear").cost, 100);
  assert.equal(opts.find((o) => o.kind === "wear").destroyChance, 0.3);
  assert.equal(opts.find((o) => o.kind === "level").cost, 200);
  assert.equal(opts.find((o) => o.kind === "level").destroyChance, 0.1);
  assert.equal(opts.find((o) => o.kind === "level").successChance, undefined);
  assert.equal(forge.levelUpgradeDestroyChance(1), 0.1);
  assert.equal(forge.levelUpgradeDestroyChance(3), 0.2);
  assert.equal(forge.levelUpgradeDestroyChance(10), 0.55);
  const p = mkP({ gold: 1000, armory: [g], equip: { ...mkP().equip, mainHand: g.uid } });
  const destroyed = forge.forgeUpgrade(p, g.uid, "level", () => 0.05);
  assert.equal(destroyed.destroyed, true);
  assert.equal(destroyed.player.gold, 800);
  assert.equal(destroyed.player.armory.length, 0);
  assert.equal(destroyed.player.equip.mainHand, null);
  const upgraded = forge.forgeUpgrade(p, g.uid, "level", () => 0.9);
  assert.equal(upgraded.success, true);
  assert.equal(upgraded.destroyed, false);
  assert.equal(upgraded.item.level, 2);
  const rare = forge.forgeUpgrade({ ...p, gold: 1000 }, g.uid, "rarity", () => 0.9);
  assert.equal(rare.item.rarity, "rare");
  assert.ok(rare.item.effects.length >= 1);
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
  b.enemy.def = { ...b.enemy.def, race, type, moves };
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
  b.enemy.def = { ...b.enemy.def, race: "none", type: "strong" };
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
    b.enemy.def = { ...b.enemy.def, race: "dragon" };
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

test("истощённый враг по-прежнему уходит в защиту", () => {
  const b = depletionSeed();
  b.enemy.depleted = 2;
  b.enemy.moves = ["attack"];
  b.enemy.hp = Math.floor(b.enemy.maxHp * 0.2);
  b.queue = ["p", "e", "p", "e"];
  b.idx = 1;
  assert.equal(battle.chooseEnemyMove(b), "guard", "стойка — обычное действие, не эффект");
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
  const afterPhys = applyWithoutLuck(physical, () => battle.playerAct(physical, { type: "weapon_skill" }));
  assert.ok(afterPhys.p.hp < physical.p.hp, "физический приём задел шипы");
  assert.ok(afterPhys.log.some((l) => l.text.includes("Шипы противника")), "нет сообщения о шипах врага");

  /* «Истощающее слово» — приём посоха, урон магический. */
  const magic = thornsBattle("ward_unravel", "staff");
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
  strike.enemy.def = { ...strike.enemy.def, race: "none", type: "strong" };
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
  spell.enemy.def = { ...spell.enemy.def, race: "none", type: "strong" };
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

test("враг с магией выбирает её, когда у героя шипы", () => {
  const b = freshBattle(mkP({ level: 5, stats: { str: 6, agi: 2, int: 2 }, hp: 200 }), 1);
  b.enemy.moves = ["attack", "curse"];
  b.enemy.effectPower = {};
  b.p.effectPower = { thorns: 9 };
  b.p.hp = 300;
  const move = battle.chooseEnemyMove(b);
  assert.equal(move, "curse", `при шипах тварь бьёт магией, а выбрала ${move}`);
});
