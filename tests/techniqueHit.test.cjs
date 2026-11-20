const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-hit-"));
function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  return require(outfile);
}

const dm = load("damageModel");
const content = load("content");
const weapon = load("weaponTechniques");

/** Все записи приёмов оружия, брони и снаряжения с уроном или сопутствующим уроном. */
function allTechniqueRecords() {
  const rows = [];
  for (const t of weapon.NEW_WEAPON_TECHNIQUES) rows.push({ src: "weapon", id: t.id, magic: t.magic, effect: t.effect });
  for (const [id, d] of Object.entries(content.ARMOR_SKILLS)) rows.push({ src: "armor", id, magic: d.dmg?.magic });
  for (const b of Object.values(content.GEAR_BASES)) {
    if (b.weaponSkill) rows.push({ src: "gear", id: b.weaponSkill.id, magic: b.weaponSkill.magic, effect: b.weaponSkill.effect });
  }
  return rows;
}

/**
 * Зафиксированный вид удара каждой записи.
 * Магические: флаг магии (посох, палочка, светлая магия брони, «Слово творения») или эффект пронзить/холод/высасывание.
 */
const MAGIC_IDS = new Set([
  "repeat_last", "bubble", "spark", "eruption", "healing_rain", "life_draw", // палочка и посох
  "light_charm", "light_spark", // броня (лёгкая, ИНТ)
  "void_reap", "pact_drain", // снаряжение: высасывание
  "word_creation", // снаряжение: урон от ИНТ (решение пользователя: магический)
]);

test("вид удара каждого приёма совпадает с зафиксированным", () => {
  const rows = allTechniqueRecords();
  assert.ok(rows.length >= 90, `записей приёмов ${rows.length}`);
  for (const r of rows) {
    const want = MAGIC_IDS.has(r.id) ? "magic" : "phys";
    assert.equal(dm.techniqueHitKind(r), want, `${r.src}:${r.id}`);
  }
});

test("магические приёмы — ровно зафиксированный список", () => {
  /* Один и тот же приём может стоять и в общей таблице, и в снаряжении: сравниваем уникальные id. */
  const magic = [...new Set(allTechniqueRecords().filter((r) => dm.techniqueHitKind(r) === "magic").map((r) => r.id))].sort();
  assert.deepEqual(magic, [...MAGIC_IDS].sort());
});

test("«Слово творения» бьёт уроном от ИНТ и считается магическим", () => {
  const ws = Object.values(content.GEAR_BASES).find((b) => b.weaponSkill?.id === "word_creation")?.weaponSkill;
  assert.ok(ws, "приём word_creation найден");
  assert.equal(ws.scaleStat, "int");
  assert.equal(dm.techniqueHitKind(ws), "magic");
});

test("правило вида удара: флаг, эффекты пронзить/холод/высасывание, остальное физическое", () => {
  assert.equal(dm.techniqueHitKind({ magic: true }), "magic");
  assert.equal(dm.techniqueHitKind({ effect: "pierce" }), "magic");
  assert.equal(dm.techniqueHitKind({ effect: "chill" }), "magic");
  assert.equal(dm.techniqueHitKind({ effect: "leech" }), "magic");
  assert.equal(dm.techniqueHitKind({ effect: "skill_leech" }), "magic");
  assert.equal(dm.techniqueHitKind({ effect: "bleed" }), "phys");
  assert.equal(dm.techniqueHitKind({}), "phys");
  assert.equal(dm.techniqueHitKind({ magic: false, effect: undefined }), "phys");
});

test("эффекты магического удара совпадают с тем, что читает бой", () => {
  assert.deepEqual([...dm.MAGIC_HIT_EFFECTS].sort(), ["chill", "leech", "pierce", "skill_leech"]);
});
