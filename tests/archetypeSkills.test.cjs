const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-skills-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function bundle(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const skills = bundle("src/game/archetypeSkills.ts", "archetypeSkills");
const content = bundle("src/game/content.ts", "content");
const progression = bundle("src/game/progression.ts", "progression");
const archetypes = bundle("src/game/archetypes.ts", "archetypes");
const battle = bundle("src/game/battle.ts", "battle");
const save = bundle("server/save.ts", "save");
const { PlayerFactory } = bundle("src/model/PlayerFactory.ts", "PlayerFactory");

function hero(extra = {}) {
  return { ...PlayerFactory.createInitial(), ...extra };
}

test("максимум 15 уровней; очки навыков — по одному за каждый уровень выше 5", () => {
  assert.equal(content.MAX_LEVEL, 15);
  assert.equal(skills.skillPointsEarned(1), 0);
  assert.equal(skills.skillPointsEarned(5), 0);
  assert.equal(skills.skillPointsEarned(6), 1);
  assert.equal(skills.skillPointsEarned(10), 5);
  assert.equal(skills.skillPointsEarned(15), 10);
  assert.equal(skills.skillPointsEarned(30), 10, "выше 15 очков не больше");
});

test("опыт до 15 уровня: таблица растёт, на 15 уровне опыт обнуляется", () => {
  assert.equal(content.xpForNextLevel(9), 2700);
  assert.equal(content.xpForNextLevel(10), 3510);
  assert.equal(content.xpForNextLevel(11), 4560);
  assert.equal(content.xpForNextLevel(12), 5700);
  assert.equal(content.xpForNextLevel(13), 6560);
  assert.equal(content.xpForNextLevel(14), 7220);
  const top = content.grantXp(hero({ level: 14, xp: 0 }), 1_000_000);
  assert.equal(top.player.level, 15);
  assert.equal(top.player.xp, 0);
});

test("очки характеристик не растут после 10 уровня", () => {
  assert.equal(progression.totalStatPoints(15), progression.totalStatPoints(10));
  const at10 = content.grantXp(hero({ level: 9, xp: 0, statPoints: 0 }), content.xpForNextLevel(9));
  assert.equal(at10.player.level, 10);
  assert.equal(at10.player.statPoints, 3);
  const at11 = content.grantXp(hero({ level: 10, xp: 0, statPoints: 0 }), content.xpForNextLevel(10));
  assert.equal(at11.player.level, 11);
  assert.equal(at11.player.statPoints, 0, "после 10 уровня очки характеристик не начисляются");
});

test("дерево: шесть архетипов, три ветки по четыре узла: пассив → приём → усиление и эффект", () => {
  assert.equal(skills.SKILL_NODES.length, 72);
  assert.equal(new Set(skills.SKILL_NODES.map((n) => n.id)).size, 72, "id узлов уникальны");
  for (const arch of archetypes.ARCHETYPE_ORDER) {
    const branches = skills.skillBranchesOf(arch);
    assert.equal(branches.length, 3, `архетип ${arch}: три ветки`);
    for (const br of branches) {
      assert.deepEqual(br.nodes.map((n) => n.kind), ["passive", "technique", "upgrade", "effect"], br.id);
      const [passive, tech, up, fx] = br.nodes;
      assert.equal(passive.requires, null);
      assert.equal(tech.requires, passive.id, "приём требует пассив");
      assert.equal(up.requires, tech.id, "усиление требует приём");
      assert.equal(fx.requires, tech.id, "эффект требует приём");
      assert.ok(br.nodes.every((n) => n.name && n.desc && n.archetype === arch), `ветка ${br.id} описана`);
    }
  }
});

test("каждый приём дерева — существующая техника оружия", () => {
  const techniques = skills.SKILL_NODES.filter((n) => n.technique).map((n) => n.technique);
  assert.equal(techniques.length, 18, "по одному приёму на ветку");
  for (const id of techniques) assert.ok(content.WEAPON_TECHNIQUES[id], `техника ${id} есть`);
});

test("setSkillRank: узел требует открытого предыдущего; очки списываются и возвращаются", () => {
  const base = hero({ level: 7, archetype: "bulwark", skillRanks: {} }); // 2 очка
  assert.equal(skills.setSkillRank(base, "wall_tech", 1), base, "приём без пассива закрыт");
  const p1 = skills.setSkillRank(base, "wall_passive", 1);
  assert.equal(skills.skillRankOf(p1, "wall_passive"), 1);
  assert.equal(skills.skillPointsAvailable(p1), 1);
  const p2 = skills.setSkillRank(p1, "wall_tech", 1);
  assert.equal(skills.skillPointsAvailable(p2), 0);
  assert.equal(skills.setSkillRank(p2, "wall_up", 1), p2, "очков нет — ранг не растёт");
  const down = skills.setSkillRank(p2, "wall_passive", 0);
  assert.equal(skills.skillRankOf(down, "wall_tech"), 0, "снижение пассива сбрасывает приём");
  assert.equal(skills.skillPointsAvailable(down), 2, "оба очка вернулись");
  assert.equal(skills.setSkillRank(base, "rage_passive", 1), base, "узел чужого архетипа");
  assert.equal(skills.setSkillRank(p1, "wall_passive", 4), p1, "ранг выше 3");
  assert.equal(skills.setSkillRank(p1, "wall_passive", -1), p1, "ранг ниже 0");
});

test("skillNum: число узла по рангу; ранг 0 — нет эффекта", () => {
  assert.equal(skills.skillNum({ rage_passive: 0 }, "rage_passive", "max"), 0);
  assert.equal(skills.skillNum({ rage_passive: 1 }, "rage_passive", "max"), 2);
  assert.equal(skills.skillNum({ rage_passive: 3 }, "rage_passive", "max"), 4);
  assert.equal(skills.skillNodeText(skills.skillNodeById("rage_passive"), 2).includes("Максимум стаков: 3"), true);
});

test("активные ранги: только узлы своего архетипа и открытые", () => {
  const p = hero({
    level: 15,
    archetype: "barbarian",
    skillRanks: { rage_passive: 3, thirst_passive: 2, wall_passive: 3, rage_tech: 0 },
  });
  assert.deepEqual(skills.activeSkillRanks(p), { rage_passive: 3, thirst_passive: 2 });
});

test("сервер: узлы чужого архетипа отбрасываются, лишние очки отклоняются, ранг обрезается", () => {
  const ok = save.sanitizePlayer(
    hero({ level: 15, archetype: "barbarian", skillRanks: { rage_passive: 3, rage_tech: 2, wall_passive: 3 } }),
  );
  assert.deepEqual(ok.skillRanks, { rage_passive: 3, rage_tech: 2 });
  assert.throws(
    () => save.sanitizePlayer(hero({ level: 6, archetype: "barbarian", skillRanks: { rage_passive: 3, rage_tech: 2 } })),
    /очки навыков/,
  );
  assert.equal(save.sanitizePlayer(hero({ level: 15, archetype: "barbarian", skillRanks: { rage_passive: 6 } })).skillRanks.rage_passive, 3);
  assert.equal(save.sanitizePlayer(hero({ level: 15, archetype: "barbarian", skillRanks: { rage_passive: -1 } })).skillRanks.rage_passive, undefined);
  assert.equal(save.sanitizePlayer(hero({ level: 16 })).level, 15);
});

/* Бой с фиксированным врагом: без уклонения, рода и характеристик. */
function fixedFight(pl, { enemyArmor = 0, guard = false, playerArmor = 0 } = {}) {
  const b = battle.newBattle(pl, 2, false, "classic", 0, 0);
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong", moves: ["attack"] };
  b.enemy.mtype = "strong";
  b.enemy.stats = { str: 0, agi: 0, int: 0 };
  b.enemy.moves = ["attack"];
  b.enemy.atk = [40, 40];
  b.enemy.armor = enemyArmor;
  /* 400 из 500: регенерация врага не упирается в максимум и не искажает сравнение. */
  b.enemy.hp = 400;
  b.enemy.maxHp = 500;
  b.enemy.statuses.blight = 0;
  b.enemy.statuses.curse = 0;
  b.queue = ["e"];
  b.idx = 0;
  b.p.hp = 300;
  b.p.maxHp = 300;
  b.p.armor = playerArmor;
  b.p.guard = guard;
  b.p.statuses.stone = 0;
  b.p.statuses.tempArmor = 0;
  b.p.statuses.ironTonic = 0;
  b.p.statuses.sundered = 0;
  return b;
}

function withFixedRandom(fn) {
  const rnd = Math.random;
  Math.random = () => 0.45;
  try {
    return fn();
  } finally {
    Math.random = rnd;
  }
}

test("в бою у героя ранги узлов своего архетипа", () => {
  const p = hero({ level: 15, archetype: "bulwark", skillRanks: { wall_passive: 3, answer_passive: 2, rage_passive: 3 } });
  const b = battle.newBattle(p, 2, false, "classic", 0, 0);
  assert.deepEqual(b.p.skillRanks, { wall_passive: 3, answer_passive: 2 });
});

test("Озлобление: каждый удар врага даёт стак, не больше пассива (ранг 1 → 2)", () => {
  withFixedRandom(() => {
    const b = fixedFight(hero({ level: 15, archetype: "barbarian", skillRanks: { rage_passive: 1 } }));
    let s = b;
    for (let i = 0; i < 3; i++) {
      s.queue = ["e", "p"];
      s.idx = 0;
      s.enemy.announced = "attack";
      s = battle.enemyStep(s);
    }
    assert.equal(s.p.skillState.fury, 2);
  });
});

test("Кровавый след (ранг 2): 8% нанесённого урона возвращается здоровьем", () => {
  const withSkill = withFixedRandom(() => {
    const b = fixedFight(hero({ level: 15, archetype: "barbarian", skillRanks: { thirst_passive: 2 } }));
    b.queue = ["p"];
    b.idx = 0;
    b.p.hp = 100;
    b.p.stamina = b.p.staminaMax;
    b.p.concentration = 0;
    b.p.hands = [];
    b.enemy.armor = 0;
    b.enemy.hp = 500;
    b.enemy.statuses.stunAp = 0;
    return battle.playerAct(b, { type: "attack" });
  });
  const dealt = 500 - withSkill.enemy.hp;
  assert.ok(dealt > 0, "удар прошёл");
  assert.ok(withSkill.p.hp > 100, "урон вернулся здоровьем");
  assert.ok(withSkill.p.hp - 100 <= Math.max(1, Math.round(dealt * 0.08)) + 1, "не больше 8% урона");
});

test("Упор: каждый ход в защите подряд добавляет броню до максимума (ранг 2: +3, макс. +9)", () => {
  withFixedRandom(() => {
    const b = fixedFight(hero({ level: 15, archetype: "bulwark", skillRanks: { wall_passive: 2 } }));
    b.p.guard = true;
    b.queue = ["e", "p"];
    b.idx = 0;
    b.enemy.announced = "attack";
    const first = battle.enemyStep(b);
    assert.equal(first.p.skillState.upright, 3, "первый ход в защите: +3");
    first.p.guard = true;
    first.queue = ["e", "p"];
    first.idx = 0;
    first.enemy.announced = "attack";
    const second = battle.enemyStep(first);
    assert.equal(second.p.skillState.upright, 6, "второй ход подряд: +6");
  });
});

test("Тихий шаг (ранг 3, шанс 20%): в первые 2 раунда промах врага — без урона", () => {
  const b = fixedFight(hero({ level: 15, archetype: "assassin", skillRanks: { quiet_passive: 3 } }));
  b.round = 1;
  b.queue = ["e", "p"];
  b.idx = 0;
  b.enemy.announced = "attack";
  /* Бросок 0.1 < шанс 20%: промах. */
  const orig = Math.random;
  Math.random = () => 0.1;
  let next;
  try {
    next = battle.enemyStep(b);
  } finally {
    Math.random = orig;
  }
  assert.equal(next.p.hp, 300, "промах не наносит урона");
  assert.equal(next.p.skillState.quietMissed, 1, "промах открывает Удар открытия");
});
