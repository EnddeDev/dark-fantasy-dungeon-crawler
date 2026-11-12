const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("левая панель есть в лобби и на карте, в бою её нет", () => {
  const view = fs.readFileSync("src/views/GameView.tsx", "utf8");
  assert.equal((view.match(/<Rail\b/g) || []).length, 1, "Rail вызывается один раз");
  assert.match(view, /screen !== "battle" && rail/, "в бою Rail не выводится");
  assert.match(view, /lg:flex-row/, "панель стоит слева от основного экрана");
});
