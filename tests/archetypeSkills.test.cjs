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

test("ветки: три на архетип, ID уникальны, у каждой эффекты на рангах 3 и 5", () => {
  const ids = skills.SKILL_BRANCHES.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const arch of archetypes.ARCHETYPE_ORDER) {
    assert.equal(skills.skillBranchesOf(arch).length, 3, `архетип ${arch}`);
  }
  for (const b of skills.SKILL_BRANCHES) {
    assert.ok(b.a.name && b.a.desc && b.b.name && b.b.desc, `ветка ${b.id} описана`);
  }
});

test("setSkillRank: очки списываются и возвращаются, чужие ветки и выход за 0–5 не меняют героя", () => {
  const base = hero({ level: 7, archetype: "bulwark", skillRanks: {} }); // 2 очка
  const up1 = skills.setSkillRank(base, "wall", 1);
  assert.equal(skills.skillRankOf(up1, "wall"), 1);
  assert.equal(skills.skillPointsAvailable(up1), 1);
  const up2 = skills.setSkillRank(up1, "ram", 1);
  assert.equal(skills.skillPointsAvailable(up2), 0);
  assert.equal(skills.setSkillRank(up2, "fortitude", 1), up2, "очков нет — ранг не растёт");
  const down = skills.setSkillRank(up2, "wall", 0);
  assert.equal(skills.skillPointsAvailable(down), 1, "снижение возвращает очко");
  assert.equal(skills.setSkillRank(base, "rage", 1), base, "ветка чужого архетипа");
  assert.equal(skills.setSkillRank(base, "wall", 6), base, "ранг выше 5");
  assert.equal(skills.setSkillRank(base, "wall", -1), base, "ранг ниже 0");
});

test("активные эффекты: только ветки своего архетипа; ранг 3 — A, ранг 5 — A и B", () => {
  const p = hero({ level: 15, archetype: "barbarian", skillRanks: { rage: 3, thirst: 5, wall: 5 } });
  const active = skills.activeSkillEffects(p);
  assert.ok(active.includes("rage_a") && !active.includes("rage_b"));
  assert.ok(active.includes("thirst_a") && active.includes("thirst_b"));
  assert.ok(!active.some((k) => k.startsWith("wall")), "ветка другого архетипа не действует");
});

test("сервер: ранги веток проверяются — чужие ветки отбрасываются, лишние очки отклоняются", () => {
  const ok = save.sanitizePlayer(
    hero({ level: 15, archetype: "bulwark", skillRanks: { wall: 3, ram: 2, rage: 4 } }),
  );
  assert.deepEqual(ok.skillRanks, { wall: 3, ram: 2 }, "ветка «ярость» чужая — отброшена");
  assert.throws(() => save.sanitizePlayer(hero({ level: 6, archetype: "bulwark", skillRanks: { wall: 3 } })), /очки навыков/);
  /* Числа сервер обрезает в допустимые границы, как и остальные поля сохранения. */
  assert.equal(save.sanitizePlayer(hero({ level: 15, archetype: "bulwark", skillRanks: { wall: 6 } })).skillRanks.wall, 5);
  assert.equal(save.sanitizePlayer(hero({ level: 15, archetype: "bulwark", skillRanks: { wall: -1 } })).skillRanks.wall, undefined);
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
  Math.random = () => 0.99;
  try {
    return fn();
  } finally {
    Math.random = rnd;
  }
}

test("в бою действуют только пассивы выбранных веток (skill_<ветка>_<ранг>)", () => {
  const p = hero({ level: 15, archetype: "bulwark", skillRanks: { wall: 5, ram: 3 } });
  const b = battle.newBattle(p, 2, false, "classic", 0, 0);
  assert.ok(b.p.passives.includes("skill_wall_a"));
  assert.ok(b.p.passives.includes("skill_wall_b"));
  assert.ok(b.p.passives.includes("skill_ram_a"));
  assert.ok(!b.p.passives.includes("skill_ram_b"));
  assert.ok(!b.p.passives.some((id) => id.startsWith("skill_rage")));
});

test("Стена щитов (ранг 3): в защите щит 15% макс. ОЗ поглощает удар", () => {
  const plain = withFixedRandom(() => {
    const b = fixedFight(hero({ level: 15, archetype: "bulwark", skillRanks: {} }), { guard: true });
    return battle.enemyStep(b).p.hp;
  });
  const shielded = withFixedRandom(() => {
    const b = fixedFight(hero({ level: 15, archetype: "bulwark", skillRanks: { wall: 3 } }), { guard: true });
    return battle.enemyStep(b).p.hp;
  });
  const lossPlain = 300 - plain;
  const lossShielded = 300 - shielded;
  assert.ok(lossPlain > 0, "без щита удар проходит");
  assert.equal(lossPlain - lossShielded, Math.min(45, lossPlain), "щит 45 (15% от 300) режет урон");
});

test("Стена щитов (ранг 5): ответ на удар врага — броня ÷ 10", () => {
  withFixedRandom(() => {
    const plainFight = fixedFight(hero({ level: 15, archetype: "bulwark", skillRanks: { wall: 3 } }), {
      guard: true,
      playerArmor: 60,
    });
    const replyFight = fixedFight(hero({ level: 15, archetype: "bulwark", skillRanks: { wall: 5 } }), {
      guard: true,
      playerArmor: 60,
    });
    const reply = Math.floor(battle.playerArmorNow(replyFight) / 10);
    assert.ok(reply > 0);
    const plainAfter = battle.enemyStep(plainFight);
    const replyAfter = battle.enemyStep(replyFight);
    assert.equal(plainAfter.enemy.hp - replyAfter.enemy.hp, reply, "ответ добавляет броню ÷ 10");
  });
});

test("Жажда крови (ранг 3): 10% нанесённого урона возвращается здоровьем", () => {
  const withSkill = withFixedRandom(() => {
    const b = fixedFight(hero({ level: 15, archetype: "barbarian", skillRanks: { thirst: 3 } }));
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
  assert.ok(withSkill.p.hp - 100 <= Math.max(1, Math.round(dealt * 0.1)) + 1, "не больше 10% урона");
});
