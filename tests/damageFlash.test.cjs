/* Числа урона в бою: цвет по типу и вспышки всех тиков (src/game/damageNumbers.ts, battle.ts). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-damageflash-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}
const battle = loadGameModule("battle");
const numbers = loadGameModule("damageNumbers");

function player(extra = {}) {
  return {
    name: "Покоритель", level: 1, xp: 0, statPoints: 2, stats: { str: 1, agi: 1, int: 1 }, hp: 30, gold: 0,
    bag: {}, knownRecipes: [], armory: [], equip: { weapon: null, armor: null, trinket: null }, passives: [],
    statuses: { wound: 0, curse: 0, poison: 0 }, kills: 0, ...extra,
  };
}
function fresh(pl = player()) {
  const b = battle.newBattle(pl, 1, false, "classic");
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong" };
  b.enemy.mtype = "strong";
  b.enemy.stats = { str: 0, agi: 0, int: 0 };
  b.queue = ["p", "e", "p"]; b.idx = 0;
  return b;
}

test("палитра чисел урона: цвета заданы явно", () => {
  assert.deepEqual(numbers.DAMAGE_NUMBER_COLORS, {
    phys: "#f6d48a", magic: "#5b8dd6", fire: "#c0392b", ice: "#8dbbc6",
    acid: "#c4e04a", light: "#fbe7a1", poison: "#408132", bleed: "#408132", pure: "#ffffff",
  });
});

test("кислота и свет совпадают с палитрой иконок урона", () => {
  const icon = fs.readFileSync("src/components/DamageTypeIcon.tsx", "utf8");
  assert.ok(icon.includes("#c4e04a"), "кислота из иконок");
  assert.ok(icon.includes("#fbe7a1"), "свет из иконок");
});

test("удар по врагу: вспышка несёт тип урона и сумму удара", () => {
  const b = fresh();
  b.enemy.hp = 999; b.enemy.maxHp = 999; b.enemy.armor = 0;
  const rnd = Math.random;
  Math.random = () => 0.45;
  let after;
  try { after = battle.playerAct(b, { type: "attack" }); } finally { Math.random = rnd; }
  const hits = after.flashes.filter((f) => f.target === "e" && f.kind === "hit");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].amount, 999 - after.enemy.hp);
  assert.equal(hits[0].dmg, "phys");
});

test("тики врага: каждый тик за ход — отдельная вспышка со своим типом", () => {
  const b = fresh();
  b.queue = ["p", "e", "p"]; b.idx = 0;
  b.enemy.hp = 999; b.enemy.maxHp = 999;
  b.enemy.statuses.poison = 3; b.enemy.statuses.poisonTick = 2;
  b.enemy.statuses.burn = 3; b.enemy.statuses.burnTick = 3;
  const after = battle.playerAct(b, { type: "end_turn" });
  const ticks = after.flashes.filter((f) => f.target === "e" && f.kind === "hit");
  assert.ok(ticks.some((f) => f.dmg === "poison"), "яд виден числом");
  assert.ok(ticks.some((f) => f.dmg === "fire"), "горение виден числом");
  assert.equal(ticks.reduce((s, f) => s + f.amount, 0), 999 - after.enemy.hp, "сумма вспышек равна потерянному ОЗ");
});

test("вспышки видны на ходу героя и сбрасываются его следующим действием", () => {
  const b = fresh();
  b.queue = ["p", "e", "p"]; b.idx = 0;
  b.enemy.hp = 999; b.enemy.maxHp = 999;
  b.enemy.statuses.poison = 3; b.enemy.statuses.poisonTick = 2;
  const enemyTurn = battle.playerAct(b, { type: "end_turn" });
  const heroTurn = battle.enemyStep(enemyTurn);
  const seen = heroTurn.flashes.filter((f) => f.target === "e").map((f) => f.id);
  assert.ok(seen.length > 0, "тики врага видны герою на его ходу");
  const next = battle.playerAct(heroTurn, { type: "end_turn" });
  for (const f of next.flashes) assert.ok(!seen.includes(f.id), "старые вспышки не остаются");
});

test("тики героя: яд отмечен цветом яда", () => {
  const b = fresh(player({ hp: 60 }));
  b.queue = ["e", "p"]; b.idx = 0;
  b.enemy.hp = 999; b.enemy.maxHp = 999;
  b.p.hp = 60; b.p.maxHp = 60;
  b.p.statuses.poison = 3; b.p.statuses.poisonTick = 2;
  const after = battle.enemyStep(b);
  const mine = after.flashes.filter((f) => f.target === "p");
  assert.ok(mine.some((f) => f.dmg === "poison" && f.amount > 0), JSON.stringify(after.flashes));
});
