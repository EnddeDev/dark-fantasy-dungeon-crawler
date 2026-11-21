const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-checkpoint-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

const outfile = path.join(temp, "runCheckpoint.cjs");
buildSync({ entryPoints: ["src/game/runCheckpoint.ts"], outfile, bundle: true, platform: "node", format: "cjs" });
const { checkpointOf } = require(outfile);

const player = { name: "Герой", hp: 10, stamina: 90, statuses: {}, bag: { potion: 1 } };
const run = { floor: 2, pos: { x: 1, y: 1 }, prevPos: { x: 0, y: 1 }, battleCell: null, log: [] };

/** Бой-заглушка: поля, которые читает точка. Здоровье и эффекты героя — то, что переживает бой. */
function fightState({ hp = 4, stamina = 40, bag = { potion: 1 }, conjured = {}, isBoss = false, curse = 0 } = {}) {
  return {
    isBoss,
    enemy: { def: { id: "wolf" } },
    bag: { ...bag, scroll: 1 },
    conjured: { ...conjured, scroll: 1 },
    p: {
      hp,
      stamina,
      statuses: {
        wound: 2, curse, cursePower: 30, poison: 0, chill: 0, fear: 0, wither: 0, burn: 0,
        woundTick: 1, poisonTick: 0, burnTick: 0, chillTick: 0, curseTick: 0,
      },
    },
  };
}

test("лобби без похода сохраняется как точка без карты", () => {
  assert.deepEqual(checkpointOf({ screen: "lobby", player, run: null, battle: null }), { player, run: null });
});

test("титульный экран с локальным героем тоже безопасен: вход в аккаунт сохранит прогресс", () => {
  assert.deepEqual(checkpointOf({ screen: "title", player, run: null, battle: null }), { player, run: null });
});

test("карта без боя сохраняется вместе с походом", () => {
  assert.deepEqual(checkpointOf({ screen: "dungeon", player, run, battle: null }), { player, run });
});

test("бой на карте: точка несёт здоровье, выносливость, эффекты и сумку из боя", () => {
  const cp = checkpointOf({ screen: "battle", player, run, battle: fightState() });
  assert.equal(cp.player.hp, 4);
  assert.equal(cp.player.stamina, 40);
  assert.equal(cp.player.statuses.wound, 2);
  assert.equal(cp.player.statuses.woundTick, 1);
  assert.deepEqual(cp.player.bag, { potion: 1 }, "созданное в бою (scroll) не переносится");
  assert.deepEqual(cp.run.pendingFight, { foe: "wolf", boss: false });
  assert.equal(cp.run.pos.x, 1, "позиция остаётся на клетке боя");
});

test("боевое проклятие врага не переходит в точку, проклятие героя переходит", () => {
  /* BATTLE_CURSE (traps.ts) = 999: проклятие, которое накладывает бой, не живёт после него. */
  const enemyCurse = checkpointOf({ screen: "battle", player, run, battle: fightState({ curse: 999 }) });
  assert.equal(enemyCurse.player.statuses.curse, 0);
  assert.equal(enemyCurse.player.statuses.cursePower, 0);
  const ownCurse = checkpointOf({ screen: "battle", player, run, battle: fightState({ curse: 2 }) });
  assert.equal(ownCurse.player.statuses.curse, 2);
});

test("страж яруса сохраняется как открытый бой с флагом босса", () => {
  const cp = checkpointOf({ screen: "battle", player, run, battle: fightState({ isBoss: true }) });
  assert.deepEqual(cp.run.pendingFight, { foe: "wolf", boss: true });
});

test("победа, ещё не забранная кнопкой «Дальше», остаётся открытым боем", () => {
  const cp = checkpointOf({ screen: "battle", player, run, battle: fightState({ hp: 3 }) });
  assert.ok(cp, "точка есть: откат к состоянию до боя дал бы обход потерь");
  assert.equal(cp.player.hp, 3);
});

test("в походе без боя признака открытого боя нет: модель похода его не хранит", () => {
  const withFight = { ...run, pendingFight: { foe: "wolf", boss: false } };
  const cp = checkpointOf({ screen: "dungeon", player, run: withFight, battle: null });
  assert.equal("pendingFight" in cp.run, false);
});

test("бой без похода не даёт точки", () => {
  assert.equal(checkpointOf({ screen: "battle", player, run: null, battle: fightState() }), null);
});
