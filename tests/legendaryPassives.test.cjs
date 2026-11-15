const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-leg-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: ["react", "react-dom", "react/jsx-runtime"] });
  return require(outfile);
}
const gear = load("src/game/gearScaling.ts", "gear-scaling");
const content = load("src/game/content.ts", "content");

test("Поступь вне времени: дополнительные ходы растут целым шагом (1 → 3 на 10 ур.)", () => {
  assert.equal(gear.legendaryMagnitude("time_weaver", "ap", 1), 1);
  assert.equal(gear.legendaryMagnitude("time_weaver", "ap", 10), 3);
  assert.match(content.legendaryPassiveDesc("time_weaver", 10), /только в первом раунде/);
});

test("Кровь архимага: снижение ИНТ растёт целым шагом, урон — по уровню", () => {
  assert.equal(gear.legendaryMagnitude("archmage_blood", "intDiscount", 1), 1);
  assert.equal(gear.legendaryMagnitude("archmage_blood", "intDiscount", 10), 3);
  assert.equal(gear.legendaryMagnitude("archmage_blood", "spellDamage", 1), 30);
});

test("Печать бессмертия: описание про 18 здоровья, без процентов и без базы heal", () => {
  const text = content.legendaryPassiveDesc("immortal_pact", 10);
  assert.match(text, /18 здоровья/);
  assert.ok(!text.includes("%"), text);
  assert.equal(gear.legendaryMagnitude("immortal_pact", "heal", 5), 0, "база heal удалена");
});

test("Статические описания пассивов без чисел, которые не растут с уровнем", () => {
  for (const id of Object.keys(content.LEGENDARY_PASSIVES)) {
    /* Разрешённые числа: 50% у «Приговора слабым» — порог «меньше половины здоровья»;
       18 ОЗ у «Печати бессмертия» — плоское значение, не растёт с уровнем. */
    const allowed = { executioner: ["50%"], immortal_pact: ["18"] }[id] ?? [];
    let text = content.LEGENDARY_PASSIVES[id].desc;
    for (const a of allowed) text = text.replace(a, "");
    assert.ok(!/\d/.test(text), `${id}: число в статическом описании «${content.LEGENDARY_PASSIVES[id].desc}»`);
  }
});

test("Сердце колосса: описание включает кровотечение и яд", () => {
  const text = content.legendaryPassiveDesc("titan_heart", 1);
  assert.match(text, /кровотечени/);
  assert.match(text, /яд/);
});
