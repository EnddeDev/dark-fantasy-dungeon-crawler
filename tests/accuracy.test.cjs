const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-accuracy-"));
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
const traps = load("src/game/traps.ts", "traps");
const stamina = load("src/game/stamina.ts", "stamina");
const { GameController } = load("src/controllers/GameController.ts", "game-controller");
const { MemoryStorage } = load("src/model/SaveRepository.ts", "save-repository");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

const EPS = 1e-9;

/** Детерминированный генератор mulberry32: одинаковые результаты при каждом запуске. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withRandom(fn, rng) {
  const orig = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Бой без врага-помехи: монстр не бьёт, не сбивает броню и не уклоняется эффектами. */
function fight(extra = {}) {
  const pl = PlayerFactory.createInitial();
  const b = withRandom(() => battle.newBattle(pl, 1, false, "classic", 0, 0), seeded(1));
  b.queue = ["p", "e", "p", "e"];
  b.idx = 0;
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
  Object.assign(b, extra);
  return b;
}

function freshAttack(kind, rng, hands) {
  const b = fight();
  if (hands) b.p.hands = hands;
  b.p.hit = hands ? [hands[0].lo, hands[0].hi] : b.p.hit;
  return withRandom(() => battle.playerAct(b, { type: "attack", kind }), rng);
}

test("меткость по весу: лёгкое 80%, среднее 75%, тяжёлое 65%; кулаки как лёгкое", () => {
  const b = fight();
  assert.ok(Math.abs(battle.heroAccuracy(b, "light", "normal") - 0.8) < EPS);
  assert.ok(Math.abs(battle.heroAccuracy(b, "medium", "normal") - 0.75) < EPS);
  assert.ok(Math.abs(battle.heroAccuracy(b, "heavy", "normal") - 0.65) < EPS);
  assert.ok(Math.abs(battle.heroAccuracy(b, undefined, "normal") - 0.8) < EPS, "без оружия — как лёгкое");
});

test("виды атаки: рискованная −15, безопасная +15, обычная без изменений", () => {
  const b = fight();
  assert.ok(Math.abs(battle.heroAccuracy(b, "medium", "risky") - 0.6) < EPS);
  assert.ok(Math.abs(battle.heroAccuracy(b, "medium", "normal") - 0.75) < EPS);
  assert.ok(Math.abs(battle.heroAccuracy(b, "medium", "safe") - 0.9) < EPS);
});

test("мрак биома отнимает 25 пунктов меткости, тьма героя — 50", () => {
  const b = fight();
  const base = battle.heroAccuracy(b, "light", "normal");
  const dark = fight({ biome: "dark" });
  assert.ok(Math.abs(base - battle.heroAccuracy(dark, "light", "normal") - 0.25) < EPS);
  const dim = fight();
  dim.p.statuses.darkness = 1;
  assert.ok(Math.abs(base - battle.heroAccuracy(dim, "light", "normal") - 0.5) < EPS);
});

test("меткость ограничена 5–95%", () => {
  const b = fight();
  b.p.statuses.darkness = 1;
  const low = battle.heroAccuracy(b, "heavy", "risky");
  assert.ok(Math.abs(low - 0.05) < EPS, `минимум 5%, получено ${low}`);
  const bright = fight();
  const high = battle.heroAccuracy(bright, "light", "safe");
  assert.ok(Math.abs(high - 0.95) < EPS, `максимум 95%, получено ${high}`);
});

test("сравнение с уклонением: выше — преимущество, ниже — помеха, равно — один бросок", () => {
  assert.equal(battle.heroHitState(0.7, 0.3), "advantage");
  assert.equal(battle.heroHitState(0.7, 0.9), "disadvantage");
  assert.equal(battle.heroHitState(0.7, 0.7), "normal");
});

test("шанс попасть: при меткости 70% и уклонении 30% — 91%, при 70% и 90% — 49%, при равенстве — 70%", () => {
  assert.ok(Math.abs(battle.heroHitChance(0.7, 0.3) - 0.91) < EPS, "преимущество: лучший из двух");
  assert.ok(Math.abs(battle.heroHitChance(0.7, 0.9) - 0.49) < EPS, "помеха: худший из двух");
  assert.ok(Math.abs(battle.heroHitChance(0.7, 0.7) - 0.7) < EPS, "один бросок");
});

test("бросок по меткости совпадает с расчётом шанса для каждого оружия и вида атаки", () => {
  const samples = 600;
  const weapons = [
    { cls: "light", hands: [{ lo: 4, hi: 6, agi: false, cost: 10, power: 1, name: "Тест", cls: "light" }] },
    { cls: "medium", hands: [{ lo: 4, hi: 6, agi: false, cost: 15, power: 1, name: "Тест", cls: "medium" }] },
    { cls: "heavy", hands: [{ lo: 4, hi: 6, agi: false, cost: 25, power: 1, name: "Тест", cls: "heavy" }] },
  ];
  const states = new Set();
  for (const w of weapons) {
    for (const kind of ["risky", "normal", "safe"]) {
      const probe = fight();
      probe.p.hands = w.hands;
      const acc = battle.heroAccuracy(probe, w.cls, kind);
      const evade = battle.enemyReadout(probe).evade;
      const expected = battle.heroHitChance(acc, evade);
      states.add(battle.heroHitState(acc, evade));
      const rng = seeded(7 + samples);
      let hits = 0;
      for (let i = 0; i < samples; i++) {
        const b = fight();
        b.p.hands = w.hands;
        b.p.hit = [4, 6];
        const after = withRandom(() => battle.playerAct(b, { type: "attack", kind }), rng);
        if (after.enemy.hp < 99999) hits++;
      }
      const rate = hits / samples;
      assert.ok(
        Math.abs(rate - expected) < 0.07,
        `${w.cls}/${kind}: частота ${rate.toFixed(3)} при ожидаемом ${expected.toFixed(3)}`,
      );
    }
  }
  assert.ok(states.size >= 1, "проверены сценарии");
});

test("удар по видам: рискованный бьёт максимумом оружия, безопасный — минимумом", () => {
  const hands = [{ lo: 4, hi: 10, agi: false, cost: 10, power: 7, name: "Тест", cls: "light" }];
  const dealt = (kind) => {
    const after = freshAttack(kind, () => 0, hands);
    return 99999 - after.enemy.hp;
  };
  const risky = dealt("risky");
  const safe = dealt("safe");
  const normal = dealt("normal");
  assert.ok(risky > normal, `рискованный сильнее обычного: ${risky} > ${normal}`);
  assert.equal(normal, safe, "с броском 0 обычный равен минимуму, как безопасный");
});

test("вид атаки записывается в журнал, кроме обычной", () => {
  const hands = [{ lo: 4, hi: 10, agi: false, cost: 10, power: 7, name: "Тест", cls: "light" }];
  const after = freshAttack("risky", () => 0.1, hands);
  assert.ok(after.log.some((l) => l.text.includes("[Рискованная]")), "журнал называет вид атаки");
  const plain = freshAttack("normal", () => 0.1, hands);
  assert.ok(!plain.log.some((l) => l.text.includes("[Обычная]")), "обычная атака без пометки");
});

test("выносливость переносится между боями: новый бой берёт остаток, а не полный запас", () => {
  const p = { ...PlayerFactory.createInitial(), stamina: 40 };
  const b = battle.newBattle(p, 1, false, "classic", 0, 0);
  /* Если первым ходит герой, его ход даёт +STAMINA_TURN_RECOVERY; порядок ходов в начале боя случаен. */
  const firstHero = b.queue[b.idx] === "p";
  assert.equal(b.p.stamina, 40 + (firstHero ? stamina.STAMINA_TURN_RECOVERY : 0));
  assert.equal(b.p.staminaMax, battle.derived(p).staminaMax);
  const none = battle.newBattle({ ...p, stamina: undefined }, 1, false, "classic", 0, 0);
  assert.equal(none.p.stamina, none.p.staminaMax, "без записи — полный запас");
  const over = battle.newBattle({ ...p, stamina: 99999 }, 1, false, "classic", 0, 0);
  assert.equal(over.p.stamina, over.p.staminaMax, "не выше максимума");
});

test("ловушка: избежать после провала стоит 25 выносливости", () => {
  assert.equal(traps.TRAP_AVOID_STAMINA, 25);
  assert.equal(stamina.STAMINA_BASE, 90);
});

test("ловушка: провал ждёт решения; «избежать» списывает 25 выносливости и не наносит урон", () => {
  const game = new GameController(new MemoryStorage());
  game.startRun(1);
  const max = battle.derived(game.model.getSnapshot().player).staminaMax;
  game.model.updatePlayer((p) => ({ ...p, stamina: max, hp: 500 }));
  const trap = {
    kind: "normal", damage: 40, rounds: 0, tick: 0, cursePower: 0,
    bypassChance: 0, disarmChance: 0, advantage: false,
  };
  game.model.setModal({ kind: "trap", trap });
  withRandom(() => game.dungeon.takeTrap("bypass"), () => 0.99);
  const failed = game.model.getSnapshot();
  assert.ok(failed.modal && failed.modal.failed, "провал оставляет окно решения");
  assert.equal(failed.player.hp, 500, "урон ещё не применён");

  game.dungeon.avoidTrapFailure();
  const after = game.model.getSnapshot();
  assert.equal(after.modal, null, "окно закрыто");
  assert.equal(after.player.hp, 500, "урона нет");
  assert.equal(after.player.stamina, max - 25, "списано 25 выносливости");
});

test("ловушка: без 25 выносливости избежать нельзя, последствия принимаются", () => {
  const game = new GameController(new MemoryStorage());
  game.startRun(1);
  game.model.updatePlayer((p) => ({ ...p, stamina: 20, hp: 500 }));
  const trap = {
    kind: "normal", damage: 40, rounds: 0, tick: 0, cursePower: 0,
    bypassChance: 0, disarmChance: 0, advantage: false,
  };
  game.model.setModal({ kind: "trap", trap });
  withRandom(() => game.dungeon.takeTrap("bypass"), () => 0.99);
  game.dungeon.avoidTrapFailure();
  assert.equal(game.model.getSnapshot().player.stamina, 20, "не хватает — ничего не списано");
  assert.ok(game.model.getSnapshot().modal?.failed, "окно остаётся");
  game.dungeon.acceptTrapFailure();
  const accepted = game.model.getSnapshot();
  assert.equal(accepted.modal, null);
  assert.equal(accepted.player.hp, 460, "последствия применены");
});

test("выход из похода возвращает полный запас выносливости", () => {
  const game = new GameController(new MemoryStorage());
  game.startRun(1);
  game.model.updatePlayer((p) => ({ ...p, stamina: 7 }));
  game.leaveRun(true);
  const { player } = game.model.getSnapshot();
  assert.equal(player.stamina, battle.derived(player).staminaMax);
});
