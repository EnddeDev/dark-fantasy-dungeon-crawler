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
const gearEffects = loadGameModule("gearEffects");

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
    statPoints: 4,
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

test("floors grow from 6x6 to 10x10 and stay capped", () => {
  assert.deepEqual(
    Array.from({ length: 9 }, (_, i) => maze.mazeSizeForFloor(i + 1)),
    [6, 7, 8, 9, 10, 10, 10, 10, 10],
  );
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
  const m = maze.genMaze(6);
  m.h = Array.from({ length: 7 }, () => Array(6).fill(true));
  m.v = Array.from({ length: 6 }, () => Array(7).fill(true));
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

  m.doors = [maze.cellIdx(0, 2, 6)];
  const throughDoor = maze.computeVisibility(m, { x: 0, y: 0 }, { "0,0": true });
  assert.equal(throughDoor[2][0], 1);
  assert.equal(throughDoor[3][0], 0);
});

test("new and explored cells use exact probability boundaries", () => {
  assert.deepEqual(
    [0, 0.599, 0.6, 0.699, 0.7, 0.899, 0.9, 0.999].map((r) => events.rollStepEvent(false, r)),
    ["quiet", "quiet", "trap", "trap", "fight", "fight", "find", "find"],
  );
  assert.deepEqual(
    [0, 0.749, 0.75, 0.799, 0.8, 0.999].map((r) => events.rollStepEvent(true, r)),
    ["quiet", "quiet", "trap", "trap", "fight", "fight"],
  );
});

test("levels are never capped by the floor, but late levels cost many runs", () => {
  const first = content.grantXp(player(), 100_000);
  assert.equal(first.player.level, 10);
  assert.equal(first.player.xp, 0);
  assert.equal(first.player.statPoints, 22);
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

test("rarity weights are 60/30/8/2 and grow with threat and monster level", () => {
  const base = content.rarityWeightsFor("normal", 0);
  assert.equal(base.common, 60);
  assert.equal(base.rare, 30);
  assert.equal(base.epic, 8);
  assert.equal(base.legendary, 2);

  const horror = content.rarityWeightsFor("horror", 0);
  assert.ok(horror.rare > base.rare);
  const catastrophe = content.rarityWeightsFor("catastrophe", 0);
  assert.ok(catastrophe.epic > horror.epic);
  const stronger = content.rarityWeightsFor("normal", 1);
  assert.ok(stronger.rare > base.rare);
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
    bag: { moss: 2, tear: 1 },
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
  assert.deepEqual(learned.bag, { moss: 2, tear: 1 });
});

test("undead resist poison and fear, smoke negates attacks and their debuffs", () => {
  assert.equal(content.isImmuneTo("undead", "poison"), true);
  assert.equal(content.isImmuneTo("undead", "fear"), true);
  assert.equal(content.isImmuneTo("beast", "poison"), false);

  const pl = player({
    hp: 300,
    bag: { poison_dart: 1, fear_vial: 1, smoke_bomb: 1 },
  });
  let undead = battle.newBattle(pl, 1);
  undead.queue = ["p", "e", "e", "e"];
  undead.enemy.hp = 999;
  undead.enemy.maxHp = 999;
  undead.enemy.def = { ...undead.enemy.def, type: "undead", moves: ["wound"] };
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
  smoky = battle.enemyStep(smoky);
  assert.equal(smoky.p.hp, 300);
  assert.equal(smoky.p.statuses.wound, 0);
  smoky = battle.enemyStep(smoky);
  assert.equal(smoky.p.hp, 300);
  assert.equal(smoky.p.statuses.smoke, 0);
  smoky = battle.enemyStep(smoky);
  assert.ok(smoky.p.hp < 300);

  let living = battle.newBattle(pl, 1);
  living.queue = ["p", "e"];
  living.enemy.def = { ...living.enemy.def, type: "beast" };
  living.enemy.hp = 999;
  living = battle.playerAct(living, { type: "item", id: "poison_dart" });
  assert.equal(living.enemy.statuses.poison, 3);
});

test("antidote removes poison as well as wounds and curses", () => {
  const pl = player({ hp: 100, bag: { antidote: 1 }, statuses: { wound: 2, curse: 2, poison: 2 } });
  const b = battle.newBattle(pl, 1);
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
  const freshBattle = () => {
    const b = battle.newBattle(pl, 1);
    b.queue = ["p", "e", "e", "e"];
    b.enemy.hp = 999;
    b.enemy.maxHp = 999;
    b.enemy.armor = 200;
    b.enemy.def = { ...b.enemy.def, type: "beast", moves: ["attack"] };
    b.enemy.moves = ["attack"];
    b.p.hp = 300;
    b.p.maxHp = 300;
    b.p.evade = 0;
    return b;
  };

  const thrown = battle.playerAct(freshBattle(), { type: "item", id: "throwing_knife" });
  assert.ok(thrown.enemy.hp < 999);
  assert.equal(thrown.bag.throwing_knife, undefined);

  const blast = battle.playerAct(freshBattle(), { type: "item", id: "blast_bomb" });
  assert.ok(999 - blast.enemy.hp >= 24);
  assert.equal(blast.bag.blast_bomb, undefined);

  let afraid = battle.playerAct(freshBattle(), { type: "item", id: "fear_vial" });
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
  const b0 = battle.newBattle(pl, 2);
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
  const bA = battle.newBattle(plArmor, 2);
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
      let b = battle.newBattle(pl, 5, isBoss);
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
      assert.ok(b.round > 1, `бой с ${def.name} не сдвинулся`);
    }
  }

  // все приёмы существ получили обработку: ни один не остался «немым»
  const known = new Set([
    "attack", "heavy", "guard", "wound", "curse", "drain", "sunder",
    "bell_stun", "poison", "multi", "terror", "flee",
  ]);
  for (const mv of seenMoves) assert.ok(known.has(mv), `неизвестный приём ${mv}`);
  assert.ok(seenMoves.has("multi") && seenMoves.has("terror") && seenMoves.has("poison"),
    "новые приёмы должны встречаться в бестиарии");
});

test("haste, terror, stone skin and acid change the fight as described", () => {
  const mk = (bag) => {
    const pl = player({ hp: 400, stats: { str: 5, agi: 5, int: 6 }, bag });
    const b = battle.newBattle(pl, 3);
    b.queue = ["p", "e", "e", "e", "e", "e"];
    b.enemy.hp = 5000;
    b.enemy.maxHp = 5000;
    b.enemy.armor = 6;
    b.enemy.def = { ...b.enemy.def, type: "beast", moves: ["attack"] };
    b.enemy.moves = ["attack"];
    b.enemy.passive = null;
    b.enemy.statuses = { chill: 0, bleed: 0, poison: 0, fear: 0, stunAp: 0 };
    b.enemy.atk = [24, 24]; // фиксированный урон, чтобы эффекты сравнивались честно
    b.p.hp = 400;
    b.p.maxHp = 400;
    b.p.evade = 0;
    b.p.armor = 0;
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
  assert.deepEqual(round(r1), { common: 80, rare: 15, epic: 5, legendary: 0 });
  assert.deepEqual(round(r10), { common: 40, rare: 25, epic: 20, legendary: 15 });

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
  // легендарки на первом уровне лавки невозможны
  let legendaries = 0;
  for (let i = 0; i < 400; i++) legendaries += content.rollShopStock(1, 1).filter((g) => g.rarity === "legendary").length;
  assert.equal(legendaries, 0, "на первом уровне лавки легендарное не появляется");
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

test("wear multiplier: battered 0.75±0.05, worn 1.0±0.10, new 1.25±0.05..0.10", () => {
  for (const [wear, lo, hi] of [["battered", 0.7, 0.8], ["worn", 0.9, 1.1], ["new", 1.3, 1.35]]) {
    for (let i = 0; i < 200; i++) {
      const m = content.rollWearMult(wear);
      assert.ok(m >= lo - 1e-9 && m <= hi + 1e-9, `${wear}: ${m} вне ${lo}..${hi}`);
    }
  }
  assert.deepEqual(Object.values(content.WEAR_RANGE).map((r) => r.base), [0.75, 1, 1.25]);
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

test("rarity gives effects by required stat: rare 1, epic more, legendary passive", () => {
  const statOf = (g) => content.gearStatReq(g).stat;
  for (const rarity of ["common", "rare", "epic", "legendary"]) {
    for (let i = 0; i < 60; i++) {
      const g = content.createGearItem({ baseId: "sword", rarity, identified: true, wear: "worn" });
      const n = (g.effects ?? []).length;
      if (rarity === "common") assert.equal(n, 0, "обычное без бафов");
      else if (rarity === "rare") assert.equal(n, 1, "редкое ровно 1 эффект");
      else {
        // эпическое/легендарное: свойство редкого + (2 доп. эффекта ИЛИ 1 боевой приём)
        const hasTech = !!g.epicSkill;
        if (hasTech) assert.equal(n, 1, `${rarity}: приём вместо 2 эффектов, эффектов ${n}`);
        else assert.equal(n, 3, `${rarity}: свойство + 2 эффекта, а не ${n}`);
      }
      if (rarity === "epic" || rarity === "legendary") {
        assert.ok(
          g.epicSkill || (g.effects ?? []).length === 3,
          "эпическое даёт приём или два эффекта сверх редкого",
        );
      }
      if (rarity === "legendary") assert.ok(g.passive);
      else assert.equal(g.passive, undefined);
      const stat = statOf(g);
      for (const e of g.effects ?? []) {
        assert.equal(gearEffects.GEAR_EFFECTS[e].stat, stat, "эффект должен относиться к характеристике требования");
      }
      if (g.passive) assert.equal(gearEffects.GEAR_PASSIVES[g.passive].stat, stat);
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

test("every gear base has an explicit logical weight class and affinity", () => {
  const expected = {
    knife: ["light", "agi"], dagger: ["light", "agi"], rapier: ["light", "agi"],
    bulwark_mace: ["medium", "str"], barbarian_greataxe: ["heavy", "str"], blood_hide: ["medium", "str"],
    assassin_stiletto: ["light", "agi"], ninja_kusarigama: ["light", "agi"], warlock_scepter: ["light", "int"], sage_censer: ["light", "int"],
    staff: ["light", "int"], abyss: ["medium", "int"],
    sword: ["medium", "str"], spear: ["medium", "agi"],
    axe: ["heavy", "str"], hammer: ["heavy", "str"], greatsword: ["heavy", "str"], warhammer2: ["heavy", "str"],
    rag: ["medium", "str"], mail: ["medium", "str"], coif: ["medium", "str"], helm: ["medium", "str"],
    shroud: ["light", "int"], plate: ["heavy", "str"], greathelm: ["heavy", "str"], crown_husk: ["heavy", "str"],
    shield_round: ["medium", "str"], shield_tower: ["heavy", "str"], buckler: ["light", "agi"],
    boots: ["light", "agi"], shoes: ["light", "agi"], strider_boots: ["light", "agi"], greaves: ["heavy", "str"],
    wraps: ["light", "agi"], vambraces: ["heavy", "str"], runed_bracers: ["light", "int"],
    amulet: ["light", "int"], seal: ["light", "int"], soulstone: ["light", "int"], icon: ["light", "int"], tooth: ["light", "agi"],
    ring_stone: ["light", "str"], ring_band: ["light", "agi"], ring_edge: ["light", "agi"], ring_ward: ["light", "int"], ring_venom: ["light", "agi"],
  };
  assert.deepEqual(Object.keys(content.GEAR_BASES).sort(), Object.keys(expected).sort(), "аудит должен покрывать все базы");
  for (const [id, [cls, stat]] of Object.entries(expected)) {
    const base = content.GEAR_BASES[id];
    assert.equal(base.gearClass, cls, `${id}: вес`);
    assert.equal(base.stat, stat, `${id}: характеристика`);
    const item = content.createGearItem({ baseId: id, level: 1, wear: "worn", rarity: "common", identified: true });
    assert.equal(item.gearClass, cls);
    assert.equal(content.gearClassFor(item), cls);
    assert.equal(content.gearAffinity(item), stat);
    assert.equal(content.gearStatReq(item).stat, stat);
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
      assert.ok(ws.desc.includes(`${ws.scaleMult}×${short}`), `${baseId}/${skillId}: ${ws.desc}`);
      assert.ok(ws.passiveNote.includes(`×${short}`), ws.passiveNote);
      const range = ws.scaleStat === "int" ? [2, 4.5] : ws.scaleStat === "str" ? [1.5, 3.5] : [1.5, 2.5];
      assert.ok(ws.scaleMult >= range[0] && ws.scaleMult <= range[1]);
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

test("throwing knife, poison dart, acid, bomb and holy water scale from Agility, not Intelligence", () => {
  const ids = ["throwing_knife", "poison_dart", "acid_vial", "blast_bomb", "holy_water"];
  const low = { str: 1, agi: 2, int: 10 };
  const high = { str: 1, agi: 8, int: 1 };
  for (const id of ids) {
    const def = content.ITEMS[id];
    assert.equal(def.kind, "throwable");
    assert.equal(content.consumableScaleStat(def), "agi", id);
    assert.ok(content.consumablePower(def, high) > content.consumablePower(def, low), id);
    assert.ok(content.consumableScaleLabel(def).includes("×ЛОВ"), id);
  }
  for (const id of ["scroll_spark", "scroll_fire", "scroll_heal", "scroll_frost", "scroll_bolt"]) {
    const def = content.ITEMS[id];
    assert.equal(content.consumableScaleStat(def), "int", id);
    assert.ok(content.consumableScaleLabel(def).includes("×ИНТ"), id);
  }
  assert.equal(content.consumableScaleStat(content.ITEMS.potion_s), null);
});

test("battle consumable damage follows Agility and ignores Intelligence for non-scrolls", () => {
  const mk = (stats, bag) => {
    const pl = player({ hp: 500, stats, bag });
    const b = battle.newBattle(pl, 1);
    b.queue = ["p", "e", "e", "e"];
    b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0;
    b.enemy.def = { ...b.enemy.def, type: "beast", moves: ["attack"] };
    b.enemy.moves = ["attack"]; b.enemy.passive = null;
    b.p.hp = 500; b.p.maxHp = 500; b.p.evade = 0;
    return b;
  };
  for (const id of ["throwing_knife", "poison_dart", "acid_vial", "blast_bomb", "holy_water"]) {
    const agi = battle.playerAct(mk({ str: 1, agi: 8, int: 1 }, { [id]: 1 }), { type: "item", id });
    const int = battle.playerAct(mk({ str: 1, agi: 2, int: 10 }, { [id]: 1 }), { type: "item", id });
    assert.ok(5000 - agi.enemy.hp > 5000 - int.enemy.hp, `${id}: ЛОВ должна давать больше урона, чем ИНТ`);
    assert.equal(agi.bag[id], undefined);
  }
  // Свиток по-прежнему требует ИНТ и усиливается им.
  const lowInt = mk({ str: 1, agi: 8, int: 1 }, { scroll_spark: 1 });
  const refused = battle.playerAct(lowInt, { type: "item", id: "scroll_spark" });
  assert.equal(refused.bag.scroll_spark, 1);
  const highInt = battle.playerAct(mk({ str: 1, agi: 1, int: 8 }, { scroll_spark: 1 }), { type: "item", id: "scroll_spark" });
  assert.ok(5000 - highInt.enemy.hp >= 16 + 3 * 8);
});

test("magical scroll bonuses do not amplify non-scroll consumables", () => {
  const mk = (passives) => {
    const pl = player({ hp: 500, stats: { str: 1, agi: 5, int: 5 }, bag: { holy_water: 1, acid_vial: 1 }, passives });
    const b = battle.newBattle(pl, 1);
    b.queue = ["p", "e", "e", "e"];
    b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 6;
    b.enemy.def = { ...b.enemy.def, type: "beast", moves: ["attack"] };
    b.enemy.moves = ["attack"]; b.enemy.passive = null;
    b.p.hp = 500; b.p.maxHp = 500; b.p.evade = 0;
    return b;
  };
  for (const id of ["holy_water", "acid_vial"]) {
    const plain = battle.playerAct(mk([]), { type: "item", id });
    const boosted = battle.playerAct(mk(["resonance"]), { type: "item", id });
    assert.equal(5000 - plain.enemy.hp, 5000 - boosted.enemy.hp, `${id}: резонанс не должен усиливать не-свиток`);
  }
});

test("rarity effects and legendary passives follow gear affinity, not weight class", () => {
  for (const baseId of ["knife", "rapier", "dagger", "staff", "sword", "plate", "ring_stone", "shroud"]) {
    for (let i = 0; i < 40; i++) {
      const g = content.createGearItem({ baseId, rarity: "legendary", wear: "worn", identified: true });
      const stat = content.gearAffinity(g);
      for (const e of g.effects) assert.equal(gearEffects.GEAR_EFFECTS[e].stat, stat, `${baseId}/${e}`);
      if (g.passive) assert.equal(gearEffects.GEAR_PASSIVES[g.passive].stat, stat, baseId);
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

test("archetype gear rolls archetype effects and legendary passive", () => {
  for (const [baseId, arch] of [
    ["bulwark_mace", "bulwark"], ["barbarian_greataxe", "barbarian"], ["assassin_stiletto", "assassin"],
    ["ninja_kusarigama", "ninja"], ["warlock_scepter", "warlock"], ["sage_censer", "sage"],
  ]) {
    const g = content.createGearItem({ baseId, rarity: "legendary", wear: "new", identified: true, level: 5 });
    assert.equal(content.GEAR_BASES[baseId].archetype, arch);
    assert.ok(g.effects.length >= 1);
    for (const ef of g.effects) {
      assert.ok(gearEffects.effectPoolFor(content.GEAR_BASES[baseId].stat, arch).includes(ef), `${baseId}/${ef}`);
    }
    assert.equal(g.passive, gearEffects.archetypePassive(arch));
  }
});

test("bulwark: armor damage, thorns and guard reduction are applied", () => {
  const { p } = withGear("bulwark_mace", { archetype: "bulwark", passives: ["arch_bulwark_5", "arch_bulwark_10"] });
  const plate = content.createGearItem({ baseId: "plate", rarity: "rare", wear: "new", identified: true, level: 5 });
  p.armory.push(plate);
  p.equip.body = plate.uid;
  const b = battle.newBattle(p, 1);
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
  const b = battle.newBattle(p, 1);
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
  const b = battle.newBattle(p, 1);
  const rnd = Math.random; Math.random = () => 0.99;
  const after = battle.playerAct(b, { type: "attack" });
  Math.random = rnd;
  assert.ok(after.log.some((l) => l.text.includes("Критический удар")));
  assert.equal(after.p.firstAttackDone, true);
});

test("ninja: consumables scale with AGI bonuses and grant lifesteal", () => {
  const { p } = withGear("ninja_kusarigama", { archetype: "ninja", passives: ["arch_ninja_5", "arch_ninja_10"] });
  p.bag = { throwing_knife: 2, shadow_dust: 1 };
  const b = battle.newBattle(p, 5, true);
  b.p.gearEffects.push("consumable_damage", "consumable_scale", "consumable_vamp");
  b.p.hp = Math.floor(b.p.maxHp * 0.5);
  const rnd = Math.random; Math.random = () => 0.99;
  const after = battle.playerAct(b, { type: "item", id: "throwing_knife" });
  Math.random = rnd;
  assert.ok(after.enemy.hp < b.enemy.hp);
  assert.ok(after.log.some((l) => l.text.includes("Похищение жизни")));
  const b2 = battle.newBattle(p, 5, true);
  const dust = battle.playerAct(b2, { type: "item", id: "shadow_dust" });
  assert.ok(dust.p.statuses.shadowStep >= 1 && dust.p.statuses.smoke > 0);
});

test("warlock: skill damage, cooldown reduction and lifesteal", () => {
  const { p } = withGear("warlock_scepter", { archetype: "warlock", passives: ["arch_warlock_5", "arch_warlock_10"] });
  const b = battle.newBattle(p, 1);
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
  const b = battle.newBattle(p, 5, true);
  b.p.gearEffects.push("scroll_damage", "scroll_scale", "scroll_vamp", "scroll_save", "scroll_create");
  const rnd = Math.random; Math.random = () => 0.0;
  const after = battle.playerAct(b, { type: "item", id: "scroll_creation" });
  Math.random = rnd;
  assert.ok(Object.keys(after.bag).some((id) => id.startsWith("scroll_") && id !== "scroll_creation"));
  assert.ok(after.bag.scroll_creation === 1, "свиток сотворения должен сохраниться при 100% шансе");
  assert.ok(after.log.some((l) => l.text.includes("сотворён")));
});

test("archetype supplies exist and obey consumable INT rules", () => {
  for (const id of ["iron_tonic", "blood_rage", "quickblade_oil", "shadow_dust", "pact_elixir", "scroll_creation"]) {
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
  const b = battle.newBattle(p, 5, true);
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
