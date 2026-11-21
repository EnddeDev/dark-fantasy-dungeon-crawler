/* Свойства, запрещённые для слота: шлем, оружие, оберег, тело, кольца, ботинки.
   Наручи и щит ограничений не имеют. Правило действует при выпадении, миграции и ритуале. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-slot-excl-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const gearEffects = load("gearEffects");
const content = load("content");
const ritual = load("ritual");

const FORBIDDEN = {
  head: ["crit_chance", "crit_mult", "rage", "armor_damage", "counter"],
  mainHand: ["fortify", "magic_resist", "thorns", "evade", "resist"],
  amulet: ["evade", "counter", "crit_mult", "thorns"],
  body: ["crit_chance", "crit_mult", "armor_damage"],
  ring1: ["counter", "armor_damage", "crit_chance", "evade"],
  ring2: ["counter", "armor_damage", "crit_chance", "evade"],
  feet: ["crit_chance", "crit_mult", "rage", "vamp", "magic_vamp", "counter"],
};

/* Кольца заводятся базой «ring1»; ring2 — та же ячейка-пара. */
function baseOfSlot(slot) {
  const want = slot === "ring2" ? "ring1" : slot;
  return Object.values(content.GEAR_BASES).filter((b) => b.slot === want && !b.set);
}

function rngFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("таблица исключений: шлем, оружие, оберег, тело, кольца, ботинки", () => {
  for (const [group, ids] of Object.entries(gearEffects.EXCLUDED_GEAR_EFFECTS)) {
    assert.ok(Array.isArray(ids) && ids.length > 0, group);
  }
  assert.deepEqual(
    [...gearEffects.EXCLUDED_GEAR_EFFECTS.head].sort(),
    ["armor_damage", "counter", "crit_chance", "crit_mult", "rage"],
  );
  assert.deepEqual(
    [...gearEffects.EXCLUDED_GEAR_EFFECTS.weapon].sort(),
    ["evade", "fortify", "magic_resist", "resist", "thorns"],
  );
  assert.deepEqual(
    [...gearEffects.EXCLUDED_GEAR_EFFECTS.feet].sort(),
    ["counter", "crit_chance", "crit_mult", "magic_vamp", "rage", "vamp"],
  );
});

test("запрет по слоту: проверка для каждого слота и вида предмета", () => {
  for (const [slot, ids] of Object.entries(FORBIDDEN)) {
    const kind = slot === "mainHand" ? "weapon" : "armor";
    for (const id of ids) {
      assert.equal(gearEffects.effectExcludedFor(id, kind, slot), true, `${slot} запрещает ${id}`);
    }
  }
  /* Наручи и щит без ограничений: то, что запрещено на шлеме, там разрешено. */
  assert.equal(gearEffects.effectExcludedFor("crit_chance", "armor", "wrists"), false);
  assert.equal(gearEffects.effectExcludedFor("crit_chance", "armor", "offHand"), false);
  /* Оружие в левой руке — тоже оружие: ограничения «оружия» действуют на обе руки. */
  assert.equal(gearEffects.effectExcludedFor("fortify", "weapon", "offHand"), true);
  /* Аксессуар без слота-оберега не получает кольцевых запретов и наоборот. */
  assert.equal(gearEffects.effectExcludedFor("counter", "accessory", "amulet"), true);
});

test("пул свойств по слотам не содержит запрещённых", () => {
  for (const [slot, ids] of Object.entries(FORBIDDEN)) {
    const kind = slot === "mainHand" ? "weapon" : "armor";
    const pool = gearEffects.effectPoolForGear({
      kind,
      slot,
      weaponType: "sword",
      gearClass: "heavy",
      stat: "str",
      requiresNothing: false,
    });
    assert.ok(pool.length > 0, `пул ${slot} не пуст`);
    for (const id of ids) assert.ok(!pool.includes(id), `${slot}: пул не содержит ${id}`);
  }
});

test("выпадение: ни один новый предмет не получает запрещённое свойство своего слота", () => {
  let seed = 1;
  for (const [slot, ids] of Object.entries(FORBIDDEN)) {
    const bases = baseOfSlot(slot);
    assert.ok(bases.length > 0, `есть базы для ${slot}`);
    for (const base of bases) {
      for (let i = 0; i < 12; i++) {
        const item = content.createGearItem({
          baseId: base.id,
          rarity: ["common", "uncommon", "rare", "epic", "legendary"][i % 5],
          level: 1 + (i % 10),
          rng: rngFrom(seed++),
        });
        for (const id of ids) assert.ok(!item.effects.includes(id), `${base.id} (${slot}) получил ${id}`);
      }
    }
  }
});

test("миграция: запрещённое свойство заменяется случайным из пула, остальное сохраняется", () => {
  const base = baseOfSlot("head")[0];
  const legacy = {
    ...content.createGearItem({ baseId: base.id, rarity: "rare", level: 3, identified: true, rng: rngFrom(7) }),
    effects: ["crit_chance", "vamp", "magic_power"],
    effectRolls: { crit_chance: 2, vamp: 5, magic_power: 4 },
  };
  const migrated = content.migrateGearItem(legacy);
  assert.ok(!migrated.effects.includes("crit_chance"), "шанс крита с шлема снят");
  assert.ok(migrated.effects.includes("vamp"), "допустимое свойство осталось");
  assert.ok(migrated.effects.includes("magic_power"), "допустимое свойство осталось");
  assert.equal(migrated.effectRolls.crit_chance, undefined, "ролл снятого свойства удалён");
  assert.equal(new Set(migrated.effects).size, migrated.effects.length, "без повторов");
  assert.ok(migrated.effects.length >= 3, "число свойств не уменьшилось");
});

test("миграция: кольцо и ботинки не сохраняют свои запрещённые", () => {
  const ring = baseOfSlot("ring1")[0];
  const ringItem = content.migrateGearItem({
    ...content.createGearItem({ baseId: ring.id, rarity: "common", level: 2, rng: rngFrom(11) }),
    effects: ["counter", "evade"],
    effectRolls: { counter: 2, evade: 4 },
  });
  assert.ok(!ringItem.effects.includes("counter"));
  assert.ok(!ringItem.effects.includes("evade"));

  const boots = baseOfSlot("feet")[0];
  const bootsItem = content.migrateGearItem({
    ...content.createGearItem({ baseId: boots.id, rarity: "common", level: 2, rng: rngFrom(12) }),
    effects: ["rage", "vamp"],
    effectRolls: { rage: 4, vamp: 5 },
  });
  assert.ok(!bootsItem.effects.includes("rage"));
  assert.ok(!bootsItem.effects.includes("vamp"));
});

test("ритуал: замена и хаос-замена не подбирают запрещённые свойства слота", () => {
  const base = baseOfSlot("amulet")[0];
  const item = {
    ...content.createGearItem({ baseId: base.id, rarity: "epic", level: 6, identified: true, rng: rngFrom(21) }),
    effects: ["magic_power"],
    effectRolls: { magic_power: 3 },
  };
  for (const kind of ["replace", "chaos"]) {
    const candidates = ritual.ritualCandidates(item, "magic_power", kind);
    assert.ok(candidates.length > 0, `кандидаты есть (${kind})`);
    for (const id of FORBIDDEN.amulet) {
      assert.ok(!candidates.includes(id), `${kind}: не подбирает ${id} для оберега`);
    }
  }
});

test("ритуал: для шлема хаос-замена не даёт шанс крита", () => {
  const base = baseOfSlot("head")[0];
  const item = {
    ...content.createGearItem({ baseId: base.id, rarity: "epic", level: 6, identified: true, rng: rngFrom(31) }),
    effects: ["vamp"],
    effectRolls: { vamp: 5 },
  };
  const candidates = ritual.ritualCandidates(item, "vamp", "chaos");
  assert.ok(!candidates.includes("crit_chance"));
  assert.ok(!candidates.includes("rage"));
  assert.ok(candidates.length > 0, "другие свойства остаются кандидатами");
});
