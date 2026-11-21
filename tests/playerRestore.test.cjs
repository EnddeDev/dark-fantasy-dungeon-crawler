/* Восстановление героя при перезагрузке: прокачка и золото не сбрасываются на уровнях выше 10
   (предел игры — MAX_LEVEL, как на сервере). Некорректное сохранение по-прежнему даёт нового героя. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-restore-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name, externals = []) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: externals });
  return require(outfile);
}
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");
const { MemoryStorage, SaveRepository } = load("src/model/SaveRepository.ts", "save-repository");
const { MAX_LEVEL } = load("src/game/content.ts", "content");

/** Герой выбранного уровня с заметной прокачкой: после перезагрузки всё должно остаться. */
function heroAt(level) {
  const base = PlayerFactory.createInitial();
  return { ...base, level, xp: 0, statPoints: 4, stats: { str: 8, agi: 6, int: 5 }, gold: 900 };
}

/** Записали героя в хранилище, как при выходе в лобби, и прочитали обратно, как при перезагрузке. */
function reload(player) {
  const repo = new SaveRepository(new MemoryStorage());
  repo.writePlayer(player);
  return PlayerFactory.restore(repo.readPlayer());
}

test("предел уровня восстановления совпадает с MAX_LEVEL игры", () => {
  assert.equal(MAX_LEVEL, 15);
});

for (const level of [10, 11, 12, MAX_LEVEL]) {
  test(`герой ${level} уровня после перезагрузки сохраняет характеристики и золото`, () => {
    const restored = reload(heroAt(level));
    assert.equal(restored.level, level);
    assert.deepEqual(restored.stats, { str: 8, agi: 6, int: 5 }, "характеристики не сбрасываются");
    assert.equal(restored.gold, 900, "золото не сбрасывается");
    assert.equal(restored.statPoints, 4);
  });
}

test("сохранение с уровнем выше предела отклоняется: герой создаётся заново", () => {
  const restored = reload(heroAt(MAX_LEVEL + 1));
  assert.equal(restored.level, 1);
  assert.deepEqual(restored.stats, { str: 1, agi: 1, int: 1 });
});
