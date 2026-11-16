const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-sets-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const content = loadGameModule("content");
const effects = loadGameModule("gearEffects");
const sets = loadGameModule("gearSets");

const ARCHETYPES = ["bulwark", "barbarian", "assassin", "duelist", "warlock", "archmage"];
const ARMOR_SLOTS = ["head", "body", "feet", "wrists"];

test("24 сета: по 4 на каждый из 6 архетипов, все id и имена уникальны", () => {
  assert.equal(sets.GEAR_SETS.length, 24);
  const ids = new Set(sets.GEAR_SETS.map((s) => s.id));
  assert.equal(ids.size, 24);
  const names = new Set();
  for (const s of sets.GEAR_SETS) {
    assert.ok(names.has(s.name) === false, `дубль имени сета ${s.name}`);
    names.add(s.name);
  }
  for (const arch of ARCHETYPES) {
    assert.equal(sets.GEAR_SETS.filter((s) => s.archetype === arch).length, 4, `сетов у ${arch}`);
  }
});

test("у каждого сета ровно 6 свойств, все из ACTIVE_GEAR_EFFECTS и без дублей", () => {
  for (const s of sets.GEAR_SETS) {
    assert.equal(s.effects.length, 6, `свойств у ${s.id}`);
    assert.equal(new Set(s.effects).size, 6, `дубль свойства у ${s.id}`);
    for (const id of s.effects) {
      assert.ok(effects.ACTIVE_GEAR_EFFECTS.includes(id), `${id} не активно (${s.id})`);
    }
  }
});

test("у каждого сета 4 брони по одной на слот и один аксессуар", () => {
  for (const s of sets.GEAR_SETS) {
    assert.equal(s.armor.length, 4, `брони у ${s.id}`);
    const slots = s.armor.map((id) => content.GEAR_BASES[id]?.slot).sort();
    assert.deepEqual(slots, [...ARMOR_SLOTS].sort(), `слоты у ${s.id}`);
    const acc = content.GEAR_BASES[s.accessory];
    assert.ok(acc, `аксессуар ${s.accessory} не найден`);
    assert.equal(content.gearKindOfBase(acc), "accessory");
  }
});

test("части сетов: 120 баз, каждая привязана к своему сету", () => {
  assert.equal(sets.SET_GEAR_BASES.length, 120);
  const byId = new Map(sets.GEAR_SETS.map((s) => [s.id, s]));
  for (const base of sets.SET_GEAR_BASES) {
    assert.ok(base.set && byId.has(base.set), `у ${base.id} нет сета`);
    const def = byId.get(base.set);
    const own = [...def.armor, def.accessory];
    assert.ok(own.includes(base.id), `${base.id} не входит в состав ${base.set}`);
    assert.equal(content.GEAR_BASES[base.id]?.set, base.set, `${base.id} не попал в GEAR_BASES`);
  }
});

test("аксессуар сета не требует характеристик", () => {
  for (const s of sets.GEAR_SETS) {
    const item = content.createGearItem({ baseId: s.accessory, rarity: "common", level: 5 });
    assert.equal(content.gearRequiresNothing(item), true, `требование у ${s.accessory}`);
  }
});

test("часть сета получает свойство только из 6 свойств своего сета", () => {
  for (const s of sets.GEAR_SETS) {
    const pool = effects.effectPoolForGear({ kind: "armor", gearClass: "heavy", stat: "str", setId: s.id });
    assert.deepEqual([...pool].sort(), [...s.effects].sort(), `пул ${s.id}`);
    for (const baseId of [...s.armor, s.accessory]) {
      for (let i = 0; i < 30; i++) {
        const item = content.createGearItem({ baseId, rarity: "rare", level: 5 });
        for (const id of item.effects) {
          assert.ok(s.effects.includes(id), `${id} не из сета ${s.id} (${baseId})`);
        }
      }
    }
  }
});

test("сет не добавляет бонусов: у сета нет полей с числовыми эффектами", () => {
  const allowed = new Set(["id", "name", "archetype", "stat", "effects", "armor", "accessory"]);
  for (const s of sets.GEAR_SETS) {
    for (const key of Object.keys(s)) assert.ok(allowed.has(key), `лишнее поле ${key} у ${s.id}`);
  }
});

test("gearSetById: неизвестный и пустой id дают null", () => {
  assert.equal(sets.gearSetById(null), null);
  assert.equal(sets.gearSetById("no_such_set"), null);
  assert.equal(sets.gearSetById(sets.GEAR_SETS[0].id).id, sets.GEAR_SETS[0].id);
});
