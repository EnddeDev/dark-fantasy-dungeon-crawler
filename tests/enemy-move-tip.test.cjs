const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-enemy-tip-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");
const statusEffects = load("src/game/statusEffects.ts", "status-effects");
const { EnemyMoveTip } = load("src/components/BattleView.tsx", "battle-view");

function makePlayer(extra = {}) {
  return {
    name: "Покоритель", level: 3, xp: 20, statPoints: 3,
    stats: { str: 3, agi: 3, int: 4 }, hp: 40, gold: 120,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 2,
    shopLevel: 1, archetype: null, statMilestones: {},
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

/** Нейтральный враг: род и тип заданы, эффектов от снаряжения нет, чтобы цифры были стабильны. */
function fixtureBattle(race = "none", biome = "plain") {
  const b = battle.newBattle(makePlayer(), 3, false, biome, 0, false);
  b.enemy.def = { ...b.enemy.def, id: "fixture", race, type: "strong", passive: null };
  b.enemy.mtype = "strong";
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.atk = [5, 8];
  b.enemy.armor = 10;
  b.enemy.guard = false;
  b.enemy.specialCooldown = 0;
  b.enemy.revived = false;
  b.p.guard = false;
  b.p.statuses.stone = 0;
  b.p.statuses.evadeTurn = 0;
  b.p.statuses.dodgeNext = 0;
  b.p.statuses.fullGuard = 0;
  b.p.statuses.invulnerable = 0;
  b.p.statuses.smoke = 0;
  b.p.statuses.immune = {};
  return b;
}

test("breakdown: the last line is the damage after defence, expected is the sum over hits", () => {
  const b = fixtureBattle();
  for (const m of ["attack", "heavy", "wound", "poison", "sunder", "multi", "curse", "cold_touch", "hell_force"]) {
    const bd = battle.enemyMoveBreakdown(b, m);
    const d = bd.lines[bd.lines.length - 1].value;
    let want = 0;
    let reach = 1;
    for (let i = 0; i < bd.hits; i++) {
      reach *= bd.hitChance;
      want += reach * d;
    }
    assert.ok(Math.abs(bd.expected - want) < 1e-9, `${m}: ${bd.expected} ≠ ${want}`);
    assert.equal(bd.expected, battle.enemyExpectedMoveDamage(b, m), `${m}: тот же расчёт, что у выбора приёма`);
  }
  assert.equal(battle.enemyMoveBreakdown(b, "multi").hits, 2, "два удара у «двойного»");
});

test("breakdown: moves without damage have no lines and no damage", () => {
  const b = fixtureBattle();
  for (const m of ["guard", "intimidate", "darkness", "seal_items"]) {
    const bd = battle.enemyMoveBreakdown(b, m);
    assert.deepEqual(bd.lines, [], m);
    assert.equal(bd.expected, 0, m);
  }
});

test("breakdown: the first line is the base blow with its range, then the enemy's own factors", () => {
  const b = fixtureBattle();
  const bd = battle.enemyMoveBreakdown(b, "attack");
  assert.equal(bd.lines[0].label, "Базовый удар врага");
  assert.equal(bd.lines[0].note, "5–8");
  assert.equal(bd.lines[0].value, Math.round((5 + 8) / 2));
});

test("breakdown: a blocked hit shows the reason and deals nothing", () => {
  const b = fixtureBattle();
  b.p.statuses.fullGuard = 1;
  const bd = battle.enemyMoveBreakdown(b, "attack");
  assert.equal(bd.expected, 0);
  assert.equal(bd.hitChance, 0);
  assert.match(bd.blocked, /защита героя/);
});

test("breakdown: darkness is listed as a miss chance for strikes only", () => {
  const b = fixtureBattle("none", "dark");
  b.torchTurns = 0;
  const strike = battle.enemyMoveBreakdown(b, "attack");
  assert.ok(strike.hitMisses.some((x) => x.label === "мрак" && x.chance > 0), "мрак снижает шанс удара");
  const spell = battle.enemyMoveBreakdown(b, "curse");
  assert.ok(!spell.hitMisses.some((x) => x.label === "мрак"), "мрак не действует на магию");
});

test("effects: a bleed from a wound shows rounds, tick range and chance below the hit chance", () => {
  const b = fixtureBattle();
  const wound = battle.enemyMoveEffectDetails(b, "wound").find((x) => x.id === "bleed");
  assert.ok(wound, "у удара кровотечение есть");
  assert.ok(wound.lines[0].includes("Кровотечение: 3 раунда"), wound.lines[0]);
  const [lo, hi] = statusEffects.dotTickSpan("bleed", b.enemy.level, true);
  assert.ok(wound.lines[0].includes(`−${lo}–${hi} ОЗ`), `диапазон тика ${lo}–${hi}: ${wound.lines[0]}`);
  const hit = battle.enemyMoveBreakdown(b, "wound").hitChance;
  assert.ok(wound.chance > 0 && wound.chance <= hit + 1e-9, "шанс не выше шанса попасть");
});

test("effects: a beast strike splits its chance between bleed and poison, each half of the landed hits", () => {
  const b = fixtureBattle("beast");
  const details = battle.enemyMoveEffectDetails(b, "attack");
  const bleed = details.find((x) => x.id === "bleed");
  const poison = details.find((x) => x.id === "poison");
  assert.ok(bleed && poison, "зверь накладывает оба эффекта");
  assert.ok(bleed.half && poison.half, "оба помечены как «примерно в половине»");
  assert.ok(Math.abs(bleed.chance - poison.chance) < 1e-12, "шансы равны");
  const hit = battle.enemyMoveBreakdown(b, "attack").hitChance;
  assert.ok(bleed.chance > 0 && bleed.chance <= hit * 0.5 + 1e-9, "половина от попаданий, стойкость только снижает");
});

test("effects: immunity turns the chance to zero and says so", () => {
  const b = fixtureBattle();
  b.p.statuses.immune = { bleed: 3 };
  const wound = battle.enemyMoveEffectDetails(b, "wound").find((x) => x.id === "bleed");
  assert.equal(wound.chance, 0);
  assert.match(wound.lines[0], /Иммунитет: кровотечение/i);
});

test("effects: seal moves are certain and each seal is named", () => {
  const b = fixtureBattle();
  const details = battle.enemyMoveEffectDetails(b, "intimidate");
  assert.deepEqual(details.map((x) => x.id).sort(), ["sealAttack", "sealSkills"]);
  assert.ok(details.every((x) => x.chance === 1), "печать не зависит от попадания");
  assert.ok(details[0].lines[0].includes("следующий ход"));
});

test("effects: curse shows 30% weaker damage and three rounds", () => {
  const b = fixtureBattle();
  const curse = battle.enemyMoveEffectDetails(b, "curse").find((x) => x.id === "curse");
  assert.ok(curse.lines[0].includes("Проклятие: 3 раунда"), curse.lines[0]);
  assert.ok(curse.lines[0].includes("снижен на 30%"), curse.lines[0]);
});

test("effects: round counts use the right Russian form", () => {
  const b = fixtureBattle();
  const hell = battle.enemyMoveEffectDetails(b, "hell_force").find((x) => x.id === "burn");
  assert.ok(hell.lines[0].includes("Горение: 4 раунда"), hell.lines[0]);
  const terror = battle.enemyMoveEffectDetails(b, "terror").find((x) => x.id === "fear");
  assert.ok(terror.lines[0].startsWith("Страх: 1 раунд (2 раунда"), terror.lines[0]);
  const dark = battle.enemyMoveEffectDetails(b, "darkness")[0];
  assert.ok(dark.lines[0].includes("Мрак: 1 раунд;"), dark.lines[0]);
});

test("effects: the list of ids matches the plain effects list used by the icons", () => {
  const b = fixtureBattle("vampire");
  for (const m of ["attack", "heavy", "wound", "curse", "intimidate", "guard"]) {
    const plain = battle.enemyMoveEffects(b, m);
    const detailed = battle.enemyMoveEffectDetails(b, m).map(({ id, half }) => ({ id, half }));
    assert.deepEqual(plain, detailed, m);
  }
});

test("notes: a vampire's strike weakens the hero and heals the vampire", () => {
  const b = fixtureBattle("vampire");
  const notes = battle.enemyMoveNotes(b, "attack");
  assert.ok(notes.some((n) => n.startsWith("Слабость (")), "слабость");
  assert.ok(notes.some((n) => n.startsWith("Вампиризм (")), "вампиризм");
  assert.deepEqual(battle.enemyMoveNotes(b, "guard"), [], "стойка особенностей не даёт");
});

test("readout: every move carries breakdown, details and notes", () => {
  const b = fixtureBattle();
  b.enemy.moves = ["attack", "wound", "guard"];
  const er = battle.enemyReadout(b);
  for (const mv of er.moves) {
    assert.ok(mv.breakdown && Array.isArray(mv.breakdown.lines), mv.move);
    assert.ok(Array.isArray(mv.details), mv.move);
    assert.ok(Array.isArray(mv.notes), mv.move);
    assert.equal(mv.damage, Math.round(mv.breakdown.expected), mv.move);
  }
});

test("tip: the hover card lists the damage steps, the chance and each effect with its numbers", () => {
  const b = fixtureBattle("beast");
  b.enemy.moves = ["attack", "wound"];
  const mv = battle.enemyReadout(b).moves.find((x) => x.move === "wound");
  const html = renderToStaticMarkup(React.createElement(EnemyMoveTip, { mv, meta: { name: "Рваная рана", desc: "Режет плоть." } }));
  assert.ok(html.includes("Рваная рана") && html.includes("Режет плоть."), "название и описание");
  assert.ok(html.includes("Базовый удар врага"), "первый шаг расчёта");
  assert.ok(html.includes("Шанс попасть"), "шанс попасть");
  assert.ok(html.includes("Ожидаемый урон приёма"), "итог");
  assert.ok(html.includes("Кровотечение"), "название эффекта");
  assert.ok(html.includes("Кровотечение: 3 раунда"), "эффект с числами");
  assert.ok(html.includes("шанс"), "шанс наложения");
});

test("tip: a move with no damage says so and lists no damage steps", () => {
  const b = fixtureBattle();
  b.enemy.moves = ["darkness"];
  const mv = battle.enemyReadout(b).moves[0];
  const html = renderToStaticMarkup(React.createElement(EnemyMoveTip, { mv, meta: { name: "Мрак", desc: "" } }));
  assert.ok(html.includes("Приём урона не наносит."));
  assert.ok(!html.includes("Ожидаемый урон приёма"));
  assert.ok(html.includes("Мрак: 1 раунд"), "эффект мрака с числом");
});
