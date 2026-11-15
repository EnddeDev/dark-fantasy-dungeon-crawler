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

test("ветка «Серия» A: стаки держатся 2 раунда без удара, на третьем сгорают", () => {
  const b = duelFight(["skill_combo_a"]);
  b.p.statuses.comboStacks = 3;
  b.p.statuses.comboRound = b.round;
  const first = endRound(b);
  assert.equal(first.p.statuses.comboStacks, 3, "1 раунд без удара — стаки на месте");
  const second = endRound(first);
  assert.equal(second.p.statuses.comboStacks, 3, "2 раунда без удара — ещё на месте");
  const third = endRound(second);
  assert.equal(third.p.statuses.comboStacks ?? 0, 0, "3 раунда без удара — сгорели");
});

test("спец-приём Дуэлянта: контратака и раскол дают стаки комбо", () => {
  const b = duelFight();
  b.p.concentration = 5;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.ok((next.p.statuses.comboStacks ?? 0) >= 1, "раскол даёт стак");
  assert.ok((next.p.statuses.comboStacks ?? 0) <= 5, "не больше 5");
});

test("ветка «Раскол» A «Трещина»: раскол снимает ещё 1 броню", () => {
  const b = duelFight(["skill_split_a"]);
  b.p.concentration = 5;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.enemy.statuses.breakFlat, 4, "3 от спец-приёма + 1 от ветки");
});

test("ветка «Раскол» A вместе с рубежом 10: +2 и +1 к раколу", () => {
  const b = duelFight(["skill_split_a", "arch_duelist_10"]);
  b.p.concentration = 5;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.enemy.statuses.breakFlat, 6, "3 + 1 + 2");
  assert.equal(next.enemy.statuses.breakRounds, 2);
});

test("ветка «Ответ» A «Точный ответ»: контратака пробивает больше брони врага", () => {
  /* Удар без оружия небольшой (6): при броне 5 разница видна — 1 и 2 урона. */
  const plain = duelFight();
  plain.enemy.armor = 5;
  plain.p.concentration = 5;
  const riposte = duelFight(["skill_riposte_a"]);
  riposte.enemy.armor = 5;
  riposte.p.concentration = 5;
  const hpPlain = withRandom(0.45, () => battle.playerAct(plain, { type: "archetype_skill" })).enemy.hp;
  const hpRiposte = withRandom(0.45, () => battle.playerAct(riposte, { type: "archetype_skill" })).enemy.hp;
  assert.ok(99999 - hpRiposte > 99999 - hpPlain, "с «Точным ответом» контратака сильнее");
});

test("ветка «Ответ» B «Ответ без промаха»: контратака попадает даже при плохом броске", () => {
  const plain = duelFight();
  plain.p.concentration = 5;
  const sure = duelFight(["skill_riposte_b"]);
  sure.p.concentration = 5;
  const hpPlain = withRandom(0.99, () => battle.playerAct(plain, { type: "archetype_skill" })).enemy.hp;
  const hpSure = withRandom(0.99, () => battle.playerAct(sure, { type: "archetype_skill" })).enemy.hp;
  assert.equal(hpPlain, 99999, "без ветки бросок 0.99 промахивается");
  assert.ok(hpSure < 99999, "с веткой удар проходит");
});

test("«Встречный выпад» — приём с эффектом counter_thrust, его id и название на месте", () => {
  const def = content.WEAPON_TECHNIQUES.empty_step;
  assert.equal(def.name, "Встречный выпад");
  assert.equal(def.effect, "counter_thrust");
});

test("ветки Дуэлянта: новые id принадлежат архетипу, старые удалены", () => {
  for (const id of ["riposte", "combo", "split"]) {
    assert.equal(skills.skillBranchById(id).archetype, "duelist", id);
  }
  for (const id of ["poisoner", "stealth", "smokeveil"]) {
    assert.equal(skills.skillBranchById(id), null, id);
  }
});

test("рубежи Дуэлянта: новые названия и спец-приём «Ответный залп»", () => {
  const d = archetypes.ARCHETYPES.duelist;
  assert.equal(d.milestone5.name, "Ответный шаг");
  assert.equal(d.milestone10.name, "Расколотый строй");
  assert.equal(d.special.name, "Ответный залп");
});
