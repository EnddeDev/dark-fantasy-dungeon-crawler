/* Витрины со снятыми с игры товарами: старое сохранение не отклоняется целиком, строка просто уходит. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-shop-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name, externals = []) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: externals });
  return require(outfile);
}
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");
const { sanitizePlayer } = load("server/save.ts", "save", ["better-sqlite3"]);
const { REMOVED_ITEM_IDS, ITEMS } = load("src/game/content.ts", "content");
const { normalizeQuestLog, withoutRemovedShopLines } = load("src/game/quests.ts", "quests");

const removedId = [...REMOVED_ITEM_IDS].find((id) => !ITEMS[id]) ?? "potion_haste";
const knownId = Object.keys(ITEMS).find((id) => ITEMS[id].kind === "potion" && !REMOVED_ITEM_IDS.has(id));

function playerWithWizard(lines) {
  const base = PlayerFactory.createInitial();
  return JSON.parse(JSON.stringify({ ...base, name: "Тест", questLog: { ...base.questLog, wizard: lines } }));
}

test("сервер: снятый товар в витрине волшебника убирается, сохранение принимается", () => {
  const player = sanitizePlayer(
    playerWithWizard([
      { id: removedId, qty: 1, price: 50 },
      { id: knownId, qty: 2, price: 30 },
    ]),
    1,
  );
  assert.deepEqual(
    player.questLog.wizard.map((l) => l.id),
    [knownId],
  );
});

test("сервер: неизвестный (не снятый) товар по-прежнему отклоняет сохранение", () => {
  assert.throws(() => sanitizePlayer(playerWithWizard([{ id: "no_such_item_xyz", qty: 1, price: 10 }]), 1), /неизвестный товар/);
});

test("клиент: нормализация журнала заданий убирает снятые товары обеих витрин", () => {
  const base = PlayerFactory.createInitial().questLog;
  const log = normalizeQuestLog({
    ...base,
    wizard: [{ id: removedId, qty: 1, price: 50 }, { id: knownId, qty: 1, price: 30 }],
    villager: [{ id: removedId, qty: 1, price: 5 }],
  });
  assert.deepEqual(log.wizard.map((l) => l.id), [knownId]);
  assert.deepEqual(log.villager, []);
});

test("клиент: withoutRemovedShopLines не трогает остальные части журнала", () => {
  const base = PlayerFactory.createInitial().questLog;
  const log = withoutRemovedShopLines({ ...base, coupons: 3, wizard: [{ id: removedId, qty: 1, price: 1 }] });
  assert.equal(log.coupons, 3);
  assert.deepEqual(log.wizard, []);
});
