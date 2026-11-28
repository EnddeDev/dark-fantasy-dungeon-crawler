const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-duelist-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("battle");
const content = load("content");
const skills = load("archetypeSkills");
const archetypes = load("archetypes");

const EMPTY_EQUIP = { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null };

function withRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Бой с неубиваемым врагом без умений; герой — Дуэлянт с заданными рубежами и ветками. */
function duelFight(passives = [], extra = {}) {
  const pl = {
    name: "Герой", level: 10, xp: 0, statPoints: 0,
    stats: { str: 5, agi: 8, int: 5 }, hp: 200, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [...passives], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { ...EMPTY_EQUIP }, archetype: "duelist", ...extra,
  };
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.enemy.hp = 99999;
  b.enemy.maxHp = 99999;
  b.enemy.armor = 0;
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong", moves: ["attack"] };
  b.enemy.moves = ["attack"];
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.atk = [1, 1];
  b.p.evade = 0;
  b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
  return b;
}

/** Проходит до следующего раунда: ходы героя завершаются, враг действует. */
function endRound(s) {
  let cur = s;
  const start = s.round;
  for (let i = 0; i < 60 && cur.round === start; i++) {
    cur = cur.queue[cur.idx] === "p" ? battle.playerAct(cur, { type: "end_turn" }) : battle.enemyStep(cur);
  }
  assert.equal(cur.round, start + 1, "раунд должен смениться");
  return cur;
}

test("комбо: стаки сгорают в конце раунда без удара героя", () => {
  const b = duelFight();
  b.p.statuses.comboStacks = 3;
  b.p.statuses.comboRound = b.round - 1;
  const next = endRound(b);
  assert.equal(next.p.statuses.comboStacks ?? 0, 0);
});

test("комбо: стаки остаются, если герой ударил в этом раунде", () => {
  const b = duelFight();
  b.p.statuses.comboStacks = 3;
  const hit = withRandom(0.45, () => battle.playerAct(b, { type: "attack" }));
  const next = endRound(hit);
  assert.equal(next.p.statuses.comboStacks, 3);
});

test("ветка «Тень на ране» (пассив, ранг 2): стаки комбо держатся до конца раунда; потолок тени растёт с рангом", () => {
  assert.equal(skills.skillNum({ shade_passive: 2 }, "shade_passive", "max"), 4, "пассив: до 4 стаков на ранге 2");
  assert.equal(skills.skillNum({ shade_up: 1 }, "shade_up", "cap"), 50, "усиление: потолок 50%");
  assert.equal(skills.skillNum({ shade_up: 3 }, "shade_up", "cap"), 70, "на ранге 3 — 70%");
  const b = duelFight([], { skillRanks: { shade_passive: 2 } });
  b.p.statuses.comboStacks = 3;
  b.p.statuses.comboRound = b.round;
  const first = endRound(b);
  assert.equal(first.p.statuses.comboStacks, 3, "1 раунд без удара — стаки на месте");
});
test("спец-приём Дуэлянта: контратака и раскол дают стаки комбо", () => {
  const b = duelFight();
  b.p.concentration = 5;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.ok((next.p.statuses.comboStacks ?? 0) >= 1, "раскол даёт стак");
  assert.ok((next.p.statuses.comboStacks ?? 0) <= 5, "не больше 5");
});

test("ветка «Выжидание» (пассив, ранг 1): если в прошлом раунде не атаковал, первый удар +10%", () => {
  const plain = duelFight();
  plain.enemy.armor = 0;
  const waiting = duelFight([], { skillRanks: { wait_passive: 1 } });
  waiting.enemy.armor = 0;
  const hpPlain = withRandom(0.45, () => battle.playerAct(plain, { type: "attack" })).enemy.hp;
  const hpWait = withRandom(0.45, () => battle.playerAct(waiting, { type: "attack" })).enemy.hp;
  assert.ok(99999 - hpWait > 99999 - hpPlain, "с «Выжиданием» первый удар сильнее");
});
test("«Встречный выпад» — приём с эффектом counter_thrust, его id и название на месте", () => {
  const def = content.WEAPON_TECHNIQUES.empty_step;
  assert.equal(def.name, "Встречный выпад");
  assert.equal(def.effect, "counter_thrust");
});

test("ветки Дуэлянта: «Тень на ране», «Яд на клинке», «Выжидание»; старые ветки удалены", () => {
  assert.deepEqual(skills.skillBranchesOf("duelist").map((b) => b.id), ["shade", "venom", "wait"]);
  assert.equal(skills.skillBranchById("combo"), null, "старая ветка «Серия» удалена");
  assert.equal(skills.skillBranchById("split"), null, "старая ветка «Раскол» удалена");
});
test("рубежи Дуэлянта: новые названия и спец-приём «Ответный залп»", () => {
  const d = archetypes.ARCHETYPES.duelist;
  assert.equal(d.milestone5.name, "Ответный шаг");
  assert.equal(d.milestone10.name, "Расколотый строй");
  assert.equal(d.special.name, "Ответный залп");
});
