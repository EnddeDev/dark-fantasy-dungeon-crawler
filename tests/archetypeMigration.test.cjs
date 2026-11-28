const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-migration-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function bundle(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const migration = bundle("src/game/archetypeMigration.ts", "archetypeMigration");
const save = bundle("server/save.ts", "save");
const { PlayerFactory } = bundle("src/model/PlayerFactory.ts", "PlayerFactory");
const content = bundle("src/game/content.ts", "content");

function hero(extra = {}) {
  return { ...PlayerFactory.createInitial(), ...extra };
}

test("старые id архетипа, пассивов и предметов переводятся на новые", () => {
  assert.equal(migration.migrateLegacyId("ninja"), "duelist");
  assert.equal(migration.migrateLegacyId("sage"), "archmage");
  assert.equal(migration.migrateLegacyId("ninja_kusarigama"), "duelist_kusarigama");
  assert.equal(migration.migrateLegacyId("sage_censer"), "archmage_censer");
  assert.equal(migration.migrateLegacyId("arch_sage_10"), "arch_archmage_10");
  assert.equal(migration.migrateLegacyId("warlock"), "warlock");
  assert.equal(migration.migrateLegacyId("knife"), "knife");
});

test("список пассивов: перевод без дубликатов, чужие значения отбрасываются", () => {
  assert.deepEqual(
    migration.migrateLegacyPassives(["arch_ninja_5", "arch_duelist_5", 7, "arch_sage_10"]),
    ["arch_duelist_5", "arch_archmage_10"],
  );
});

test("сервер: сохранение со старым архетипом и предметом открывается с новыми id", () => {
  const legacyGear = { uid: "g1", baseId: "ninja_kusarigama", wear: "worn", rarity: "common", level: 5, kind: "weapon", gearClass: "light" };
  const player = save.sanitizePlayer(
    hero({
      level: 6,
      archetype: "ninja",
      passives: ["arch_ninja_5"],
      armory: [legacyGear],
      equip: { mainHand: "g1" },
    }),
  );
  assert.equal(player.archetype, "duelist");
  assert.deepEqual(player.passives, ["arch_duelist_5"]);
  assert.equal(player.armory[0].baseId, "duelist_kusarigama");
  assert.equal(player.equip.mainHand, "g1");
});

test("сервер: сохранение со старым архимагом сохраняет свой предмет, а не превращается в нож", () => {
  const player = save.sanitizePlayer(
    hero({
      level: 6,
      archetype: "sage",
      armory: [{ uid: "s1", baseId: "sage_censer", wear: "worn", rarity: "common", level: 5, kind: "weapon", gearClass: "light" }],
    }),
  );
  assert.equal(player.archetype, "archmage");
  assert.equal(player.armory[0].baseId, "archmage_censer");
});

test("клиент: восстановление старого сохранения переводит архетип, пассивы и предметы", () => {
  const restored = PlayerFactory.restore(
    hero({
      level: 10,
      stats: { str: 1, agi: 1, int: 10 },
      archetype: "sage",
      passives: ["arch_sage_5", "arch_sage_10"],
      armory: [{ uid: "s1", baseId: "sage_censer", wear: "worn", rarity: "common", level: 5, kind: "weapon", gearClass: "light" }],
      equip: { mainHand: "s1" },
    }),
  );
  assert.equal(restored.archetype, "archmage");
  assert.deepEqual(restored.passives, ["arch_archmage_5", "arch_archmage_10"]);
  assert.equal(restored.armory[0].baseId, "archmage_censer");
});

test("migrateGearItem: переименованный baseId переводится до поиска базы", () => {
  const renamed = content.migrateGearItem({ uid: "d1", baseId: "ninja_kusarigama", kind: "weapon", level: 5 });
  assert.equal(renamed.baseId, "duelist_kusarigama");
  assert.equal(content.GEAR_BASES[renamed.baseId].name, "Кусаригама тени");
});

test("ранги навыков: старые ветки и узлы чужого архетипа отбрасываются, ранги обрезаются до 3", () => {
  assert.deepEqual(migration.migrateSkillRanks({ wall: 3, rage: 2 }, "bulwark"), {}, "старые ветки не переходят");
  assert.deepEqual(
    migration.migrateSkillRanks({ quill_passive: 3, quill_tech: 1, rage_passive: 2 }, "archmage"),
    { quill_passive: 3, quill_tech: 1 },
    "узлы чужого архетипа не переходят",
  );
  assert.deepEqual(migration.migrateSkillRanks({ rage_passive: 5 }, "barbarian"), { rage_passive: 3 });
  assert.deepEqual(migration.migrateSkillRanks({ rage_passive: -1 }, "barbarian"), {}, "ранг ниже 1 не переносится");
  assert.deepEqual(migration.migrateSkillRanks({ rage_passive: 3 }, null), {}, "без архетипа ранги не переносятся");
});

test("ранги навыков: узел без открытого предка отбрасывается (приём без пассива)", () => {
  assert.deepEqual(
    migration.migrateSkillRanks({ shade_passive: 2, venom_tech: 1, venom_up: 2 }, "duelist"),
    { shade_passive: 2 },
    "приём венома без пассива и усиление без приёма не остаются",
  );
  assert.deepEqual(
    migration.migrateSkillRanks({ venom_passive: 1, venom_tech: 1, venom_up: 2 }, "duelist"),
    { venom_passive: 1, venom_tech: 1, venom_up: 2 },
  );
});

test("клиент: восстановление сохранения переводит архетип, пассивы и ранги", () => {
  const restored = PlayerFactory.restore(
    hero({
      level: 10,
      archetype: "ninja",
      passives: [],
      skillRanks: { smokeveil: 3, poisoner: 2, shade_passive: 2, venom_tech: 1 },
    }),
  );
  assert.equal(restored.archetype, "duelist");
  assert.deepEqual(restored.skillRanks, { shade_passive: 2 });
});
