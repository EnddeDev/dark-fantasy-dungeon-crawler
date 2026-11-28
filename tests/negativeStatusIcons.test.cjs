const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-status-icons-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");
const effects = load("src/game/effects.ts", "effects");

function makePlayer() {
  return {
    name: "Покоритель", level: 3, xp: 20, statPoints: 3,
    stats: { str: 3, agi: 3, int: 4 }, hp: 40, gold: 120,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 2,
    shopLevel: 1, archetype: null, statMilestones: {},
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
  };
}

function fight() {
  const b = battle.newBattle(makePlayer(), 3, false, "plain", 0, false);
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  return b;
}

/* Негативный статус героя → id фишки. Каждый должен дать фишку с иконкой. */
const PLAYER_CASES = [
  { field: "rot", value: 2, extra: { rotRounds: 2 }, chip: "rot" },
  { field: "weakness", value: 2, chip: "weaken" },
  { field: "noEvade", value: 2, chip: "noEvade" },
  { field: "wound", value: 2, extra: { woundTick: 3 }, chip: "bleed" },
  { field: "poison", value: 2, extra: { poisonTick: 2 }, chip: "poison" },
  { field: "burn", value: 2, extra: { burnTick: 3 }, chip: "burn" },
  { field: "chill", value: 2, extra: { chillTick: 2 }, chip: "chill" },
  { field: "curse", value: 2, extra: { curseTick: 2 }, chip: "curse" },
  { field: "wither", value: 2, chip: "wither" },
  { field: "noHeal", value: 2, chip: "noHeal" },
  { field: "darkness", value: 2, chip: "darkness" },
  { field: "sundered", value: 2, chip: "sunder" },
  { field: "stunAp", value: 1, chip: "stun" },
  { field: "fear", value: 1, chip: "fear" },
  { field: "beat", value: 2, chip: "beat" },
  { field: "weaken", value: 2, chip: "weaken" },
  { field: "shatter", value: 2, chip: "shatter" },
  { field: "drain", value: 2, chip: "drain" },
  { field: "slow", value: 2, chip: "slow" },
  { field: "sealItems", value: 2, chip: "sealItems" },
  { field: "sealSkills", value: 2, chip: "sealSkills" },
  { field: "sealAttack", value: 2, chip: "sealAttack" },
];

/* Негативный статус врага → id фишки. */
const ENEMY_CASES = [
  { field: "drainRounds", value: 3, extra: { drainTick: 5 }, chip: "drain" },
  { field: "eruptRounds", value: 3, extra: { eruptTick: 4, eruptDown: 0.2, eruptWither: 1 }, chip: "eruption" },
  { field: "breakRounds", value: 2, extra: { breakFlat: 2 }, chip: "sunder" },
  { field: "shatterRounds", value: 3, chip: "shatter" },
  { field: "beatRounds", value: 3, extra: { beatMult: 0.2 }, chip: "beat" },
  { field: "noEvade", value: 2, chip: "noEvade" },
  { field: "noGuard", value: 1, chip: "guard" },
  { field: "sealMoves", value: 2, chip: "sealSkills" },
  { field: "skipTurn", value: 1, chip: "stun" },
  { field: "throwDown", value: 1, chip: "weaken" },
  { field: "feint", value: 1, chip: "blind" },
  { field: "echoDue", value: 4, chip: "echo" },
];

test("каждый негативный статус героя показан фишкой с иконкой", () => {
  for (const c of PLAYER_CASES) {
    const b = fight();
    b.p.statuses[c.field] = c.value;
    Object.assign(b.p.statuses, c.extra ?? {});
    const chips = effects.playerEffectChips(b);
    const chip = chips.find((x) => x.id === c.chip && x.polarity === "bad");
    assert.ok(chip, `${c.field}: нет фишки «${c.chip}» у героя`);
    assert.ok(effects.EFFECT_ICON_IDS.includes(chip.id), `${c.field}: нет иконки «${chip.id}»`);
  }
});

test("каждый негативный статус врага показан фишкой с иконкой", () => {
  for (const c of ENEMY_CASES) {
    const b = fight();
    b.enemy.statuses[c.field] = c.value;
    Object.assign(b.enemy.statuses, c.extra ?? {});
    const chips = effects.enemyEffectChips(b);
    const chip = chips.find((x) => x.id === c.chip && x.polarity === "bad");
    assert.ok(chip, `${c.field}: нет фишки «${c.chip}» у врага`);
    assert.ok(effects.EFFECT_ICON_IDS.includes(chip.id), `${c.field}: нет иконки «${chip.id}»`);
  }
});

test("все фишки негативных статусов имеют подсказку с текстом", () => {
  const b = fight();
  for (const c of PLAYER_CASES) {
    b.p.statuses[c.field] = c.value;
    Object.assign(b.p.statuses, c.extra ?? {});
  }
  for (const chip of effects.playerEffectChips(b)) {
    assert.ok(chip.details.length > 0, `${chip.id}: пустая подсказка`);
  }
});
