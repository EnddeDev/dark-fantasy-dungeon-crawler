const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-r129-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const statFormulas = loadGameModule("game/statFormulas");
const traps = loadGameModule("game/traps");
const mapEvents = loadGameModule("game/mapEvents");
const content = loadGameModule("game/content");
const factory = loadGameModule("model/PlayerFactory");

const BARB = ["arch_barbarian_10"];

test("варвар на 10 рубеже: от СИЛ здоровье ×3, урон ×2, база не меняется", () => {
  assert.equal(statFormulas.statHealth(10, BARB), 310, "10 + 30×10");
  assert.equal(statFormulas.statDamage(10, BARB), 22, "2 + 2×10");
  assert.equal(statFormulas.statHealth(0, BARB), 10, "база 10 ОЗ сохраняется");
  assert.equal(statFormulas.statDamage(0, BARB), 2, "база 2 урона сохраняется");
});

test("без пассива варвара формулы прежние", () => {
  assert.equal(statFormulas.statHealth(10), 110);
  assert.equal(statFormulas.statDamage(10), 12);
  assert.equal(statFormulas.statHealth(10, []), 110);
  assert.equal(statFormulas.statDamage(10, ["other"]), 12);
});

test("обезвреживание: разведанная 100%, скрытая 50%, ИНТ не влияет", () => {
  assert.equal(traps.trapDisarmChance(true), 1);
  assert.equal(traps.trapDisarmChance(false), 0.5);
  const low = traps.makeTrap({ kind: "normal", floor: 1, stats: { str: 1, agi: 1, int: 1 }, maxHp: 100, revealed: false });
  const high = traps.makeTrap({ kind: "normal", floor: 1, stats: { str: 1, agi: 1, int: 10 }, maxHp: 100, revealed: false });
  assert.equal(low.disarmChance, 0.5);
  assert.equal(high.disarmChance, 0.5);
  const seen = traps.makeTrap({ kind: "normal", floor: 1, stats: { str: 1, agi: 1, int: 1 }, maxHp: 100, revealed: true });
  assert.equal(seen.disarmChance, 1);
});

test("событие: значок нейтральный до захода, настоящий после «оставить на потом» или на потрёпанной карте", () => {
  assert.equal(mapEvents.shownEventKind({}, "positive", 7), "neutral");
  assert.equal(mapEvents.shownEventKind({ revealedEvents: [3] }, "negative", 7), "neutral");
  assert.equal(mapEvents.shownEventKind({ revealedEvents: [7] }, "positive", 7), "positive");
  assert.equal(mapEvents.shownEventKind({ mapRevealed: true }, "negative", 7), "negative");
  assert.equal(mapEvents.shownEventKind({}, undefined, 7), "neutral");
});

test("стартовый набор: 2 факела, сапёрный набор, лёгкие ботинки без требования на ногах", () => {
  const p = factory.PlayerFactory.createInitial();
  assert.equal(p.bag.field_torch, 2);
  assert.equal(p.bag.sapper_kit, 1);
  const boots = p.armory.find((g) => g.uid === p.equip.feet);
  assert.ok(boots, "ботинки надеты");
  assert.equal(boots.baseId, "shoes");
  assert.equal(boots.noReq, true);
  assert.equal(content.gearRequiresNothing(boots), true);
  assert.equal(content.gearClassFor(boots), "light");
});

test("бурдюк: +5 ОЗ и снятие горения", () => {
  const water = content.ITEMS.water_skin;
  assert.equal(water.use.type, "special_water");
  assert.match(water.desc, /горение/);
  assert.match(water.desc, /\+5/);
});
