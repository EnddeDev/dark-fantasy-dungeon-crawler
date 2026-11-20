const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-pure-"));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = loadGameModule("battle");
const content = loadGameModule("content");
const damageTypes = loadGameModule("damageTypes");

function player(over = {}) {
  const gear = content.createGearItem({ baseId: "sword", rarity: "rare", wear: "new", identified: true, level: 4 });
  return {
    name: "П", level: 4, xp: 0, statPoints: 0, stats: { str: 4, agi: 3, int: 3 }, hp: 400, gold: 0,
    bag: {}, knownRecipes: [], armory: [gear],
    equip: { mainHand: gear.uid, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    passives: [], statuses: { wound: 0, curse: 0, poison: 0 }, kills: 0, shopLevel: 1, ...over,
  };
}

/** Герой ходит первым против безобидной мишени без рода и без пассивов. */
function heroBattle(over = {}) {
  const b = battle.newBattle(player(over), 1, false, undefined, 20, false);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0; b.enemy.passive = null;
  b.enemy.effects = []; b.enemy.effectPower = {};
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile", moves: ["attack"] };
  b.enemy.moves = ["attack"];
  b.enemy.stats = { str: 0, agi: 0, int: 0 };
  b.p.hp = 400; b.p.maxHp = 400;
  return b;
}

test("чистый урон есть в справочнике: прямой, без школы, с пояснением про иммунитет", () => {
  const info = damageTypes.DAMAGE_TYPES.find((t) => t.id === "pure");
  assert.ok(info, "вид pure в справочнике");
  assert.equal(info.group, "direct");
  assert.equal(info.school, undefined);
  assert.match(info.text, /иммунитет/i);
  assert.equal(damageTypes.damageTypeName("pure"), "Чистый");
});

/** Враг с сильным магическим сопротивлением (эффект рода/предмета). */
function resistantEnemy() {
  const b = heroBattle();
  b.enemy.armor = 50;
  b.enemy.effects = ["magic_resist", "magic_resist", "magic_resist"];
  b.enemy.level = 20;
  return b;
}

test("чистый удар героя по врагу: броня и магическое сопротивление не режут урон", () => {
  const b = resistantEnemy();
  const before = b.enemy.hp;
  battle.hitEnemy(b, 100, "pure", "");
  assert.equal(before - b.enemy.hp, 100, "урон 100 целиком");
});

test("контроль: магический удар по тому же врагу режется сопротивлением", () => {
  const b = resistantEnemy();
  const before = b.enemy.hp;
  battle.hitEnemy(b, 100, "magic", "");
  assert.ok(before - b.enemy.hp < 60, `сопротивление срезало урон: ${before - b.enemy.hp}`);
});

test("контроль: тот же удар физическим режется бронёй", () => {
  const b = heroBattle();
  b.enemy.armor = 50;
  const before = b.enemy.hp;
  battle.hitEnemy(b, 100, "phys", "");
  assert.ok(before - b.enemy.hp < 100, "броня срезала урон");
});

test("чистый урон по герою: броня, стойка, каменная кожа и барьер не работают", () => {
  const b = heroBattle();
  b.p.armor = 500;
  b.p.guard = true;
  b.p.statuses.stone = 1;
  b.p.statuses.stonePct = 0.9;
  b.p.barrier = 50;
  const hpBefore = b.p.hp;
  battle.incoming(b, 100, "pure", "тест");
  assert.equal(hpBefore - b.p.hp, 100, "урон 100 целиком");
  assert.equal(b.p.barrier, 50, "барьер не тронут");
});

test("чистый урон по герою проходит полную защиту и неуязвимость", () => {
  const b = heroBattle();
  b.p.statuses.fullGuard = 1;
  b.p.statuses.invulnerable = 1;
  const hpBefore = b.p.hp;
  battle.incoming(b, 40, "pure", "тест");
  assert.equal(hpBefore - b.p.hp, 40);
});

test("контроль: тот же удар физическим при полной защите не наносит урона", () => {
  const b = heroBattle();
  b.p.statuses.fullGuard = 1;
  const hpBefore = b.p.hp;
  battle.incoming(b, 40, "phys", "тест");
  assert.equal(hpBefore - b.p.hp, 0);
});
