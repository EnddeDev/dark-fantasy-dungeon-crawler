const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-attack-preview-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

function withRandom(fn, rng) {
  const orig = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Бой без помех: враг с огромным запасом ОЗ, без брони и уклонения, без крита. */
function fight(hands) {
  const pl = PlayerFactory.createInitial();
  for (const k of Object.keys(pl.equip)) pl.equip[k] = null;
  const b = withRandom(() => battle.newBattle(pl, 1, false, "classic", 0, 0), () => 0.5);
  b.enemy.hp = 99999;
  b.enemy.maxHp = 99999;
  b.enemy.armor = 0;
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong", moves: ["attack"] };
  b.enemy.mtype = "strong";
  b.enemy.moves = ["attack"];
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.atk = [1, 1];
  b.enemy.stats = { str: 0, agi: 0, int: 0 };
  b.p.chanceLayers.crit = { stats: [], items: [], effects: [] };
  b.p.evade = 0;
  b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
  b.p.concentration = 7;
  b.queue = ["p", "e", "p", "e"];
  b.idx = 0;
  /* Оружие без эффектов: яд клинка давал бы тик в конце раунда и портил замер урона удара. */
  const plain = hands ?? [{ name: "Тестовый клинок", lo: 12, hi: 14, agi: false, cls: "light" }];
  b.p.hands = plain;
  b.p.hit = [plain[0].lo, plain[0].hi];
  return b;
}

/** Урон одного удара при фиксированном броске: 0 — все удары попадают и бросают минимум разброса. */
function strikeDamage(kind, rng, hands) {
  const b = fight(hands);
  const after = withRandom(() => battle.playerAct(b, { type: "attack", kind }), rng);
  return b.enemy.hp - after.enemy.hp;
}

test("превью урона: рискованная бьёт по максимуму, безопасная — по минимуму, обычная — в диапазоне", () => {
  const b = fight();
  const risky = battle.heroAttackDamage(b, "risky");
  const normal = battle.heroAttackDamage(b, "normal");
  const safe = battle.heroAttackDamage(b, "safe");
  assert.equal(risky.min, risky.max, "рискованная: один и тот же максимум");
  assert.equal(safe.min, safe.max, "безопасная: один и тот же минимум");
  assert.ok(safe.max <= normal.max && normal.max <= risky.max, "безопасная ≤ обычная ≤ рискованная");
  assert.ok(normal.min >= safe.min, "обычная не ниже минимума");
  assert.equal(risky.hands, 1);
});

test("превью совпадает с ударом: рискованная = максимум, безопасная = минимум, обычная с нулевым броском = минимум", () => {
  const preview = battle.heroAttackDamage(fight(), "risky");
  assert.equal(strikeDamage("risky", () => 0), preview.max, "рискованная в бою = превью");
  const safe = battle.heroAttackDamage(fight(), "safe");
  assert.equal(strikeDamage("safe", () => 0), safe.min, "безопасная в бою = превью");
  const normal = battle.heroAttackDamage(fight(), "normal");
  assert.equal(strikeDamage("normal", () => 0), normal.min, "обычная с нулевым броском = минимум");
});

test("две руки: диапазон суммарный за атаку, число ударов равно числу рук", () => {
  const hands = [
    { name: "Правая", lo: 6, hi: 10, agi: 0, cls: "light" },
    { name: "Левая", lo: 4, hi: 6, agi: 0, cls: "light" },
  ];
  const b = fight(hands);
  const risky = battle.heroAttackDamage(b, "risky");
  assert.equal(risky.hands, 2);
  assert.ok(risky.min > 0 && risky.min === risky.max);
  assert.equal(strikeDamage("risky", () => 0, hands), risky.max, "сумма двух ударов в бою = превью");
});
