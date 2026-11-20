const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-archmage-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("battle");
const skills = load("archetypeSkills");

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

/** Бой с неубиваемым врагом; герой — Архимаг с заданными рубежами, ветками и гир-пассивами. */
/** Сумка по умолчанию: предметы из bag лежат в сумке. Правило «в бой только сумка» — в tests/pouchExit.test.cjs. */
function withAutoPouch(pl) {
  if (pl.pouch !== undefined) return pl;
  const ids = Object.keys(pl.bag ?? {}).filter((id) => (pl.bag[id] ?? 0) > 0).slice(0, 5);
  return { ...pl, pouch: [...ids, ...Array(5 - ids.length).fill(null)] };
}

function mageFight(passives = [], extra = {}) {
  const pl = {
    name: "Герой", level: 10, xp: 0, statPoints: 0,
    stats: { str: 5, agi: 5, int: 10 }, hp: 200, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [...passives], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { ...EMPTY_EQUIP }, archetype: "archmage", ...extra,
  };
  const b = battle.newBattle(withAutoPouch(pl), 1, false, "classic", 0, 0);
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
  b.enemy.atk = [0, 0];
  b.p.evade = 0;
  b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
  b.p.concentration = 5;
  return b;
}

test("ветки Архимага: «Угли», «Стужа», «Списки» вместо «Переписывание», «Печать знания», «Библиотека»", () => {
  const ids = skills.skillBranchesOf("archmage").map((x) => x.id);
  assert.deepEqual(ids, ["ember", "frost", "scribe"]);
});

test("спец-приём «Слово созидания»: 2 свитка, огонь или холод на 3 раунда, тратит 5 концентрации", () => {
  const b = mageFight();
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.p.concentration, 0);
  assert.equal(next.scrollsMade, 2);
  const burning = next.enemy.statuses.burn > 0 || next.enemy.statuses.chill > 0;
  assert.ok(burning, "один свиток накладывает горение или обморожение");
  assert.ok(next.log.some((l) => l.text.includes("Слово созидания создаёт свитки")));
});

test("спец-приём без вампиризма: старый бонус +25% к вампиризму убран", () => {
  const b = mageFight();
  b.p.hp = Math.floor(b.p.maxHp * 0.5);
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.ok(!next.log.some((l) => l.text.includes("Похищение жизни")), "лечения от вампиризма нет");
});

test("Пылающий канон и Вечная стужа: магический урон +10% и +25% складываются в один множитель", () => {
  /* Свиток молнии бьёт магически; спец-приём урона не наносит. Разброс урона больше фиксированного
     Math.random, поэтому сравниваем средние по многим ударам. */
  const avg = (passives) => {
    let sum = 0;
    const N = 200;
    for (let k = 0; k < N; k++) {
      const s = mageFight(passives);
      s.bag = { scroll_bolt: 1 };
      s.pouch = ["scroll_bolt"];
      sum += 99999 - withRandom(0.45, () => battle.playerAct(s, { type: "item", id: "scroll_bolt" })).enemy.hp;
    }
    return sum / N;
  };
  const dPlain = avg([]);
  const dFive = avg(["arch_archmage_5"]);
  const dTen = avg(["arch_archmage_5", "arch_archmage_10"]);
  assert.ok(dFive > dPlain * 1.05, `рубеж 5 усиливает магический урон: ${dPlain.toFixed(1)} → ${dFive.toFixed(1)}`);
  assert.ok(dTen > dFive * 1.1, `рубеж 10 усиливает ещё сильнее: ${dFive.toFixed(1)} → ${dTen.toFixed(1)}`);
});

test("Тлеющие угли (ветка A): горящий враг теряет 2 брони", () => {
  const plain = { armor: 10, statuses: { burn: 2, breakRounds: 0 } };
  assert.equal(battle.enemyArmorNow({ armor: 10, statuses: { burn: 0 } }), 10, "без горения броня целая");
  assert.equal(battle.enemyArmorNow({ armor: 10, statuses: { burn: 2, emberShred: 2 } }), 8, "горение −2 брони");
  assert.equal(battle.enemyArmorNow(plain), 10, "горение без ветки не режет броню");
});

test("Встречный клинок: раскол снимает ещё 1 броню до конца раунда", () => {
  const b = mageFight([], { archetype: "duelist" });
  b.p.gearPassives = ["duelist_phantom"];
  b.p.passivePower = { duelist_phantom: { counter: 12, stack: 25, shatter: 1 } };
  b.p.concentration = 5;
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.enemy.statuses.breakExtra, 1);
  assert.equal(battle.enemyArmorNow({ armor: 10, statuses: { breakExtra: 1, breakRounds: 0 } }), 9);
});

test("Запретный канон: 15% шанс повторно применить созданный свиток без траты", () => {
  const b = mageFight([], {});
  b.p.gearPassives = ["archmage_library"];
  b.p.passivePower = { archmage_library: { magic: 12, round: 1, reapply: 100 } };
  b.bag = { scroll_creation: 1 };
  b.pouch = ["scroll_creation"];
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "item", id: "scroll_creation" }));
  assert.ok(next.log.some((l) => l.text.includes("Запретный канон")), "повторное применение без траты записано в лог");
});

test("ветка «Списки» A «Вторая строка»: созданный свиток может появиться дважды", () => {
  const b = mageFight(["skill_scribe_a"]);
  const next = withRandom(0.1, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(next.scrollsMade, 4, "при 20% шансе каждый из двух свитков дублируется");
});

test("ветка «Списки» B «Чтение вслух»: первый созданный свиток в бою применяется дважды", () => {
  const b = mageFight(["skill_scribe_b"]);
  const next = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.ok(next.log.some((l) => l.text.includes("Чтение вслух")));
});

test("ветка «Стужа» B «Ледяная клеть»: обморожение 3+ раунда иногда пропускает ход врага", () => {
  const b = mageFight(["skill_frost_b"]);
  b.enemy.statuses.chill = 3;
  b.queue = ["e", "p"];
  b.idx = 0;
  const next = withRandom(0.1, () => battle.enemyStep(b));
  assert.ok(next.log.some((l) => l.text.includes("ледяной клетью")));
});
