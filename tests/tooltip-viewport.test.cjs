const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/* Подсказки не должны выходить за край окна: каждая подсказка с role="tooltip" подключает хук сдвига. */
test("every tooltip with role=tooltip is kept inside the window by useFitInViewport", () => {
  const dir = "src/components";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"));
  const offenders = [];
  let checked = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    if (!src.includes('role="tooltip"')) continue;
    checked += 1;
    if (!src.includes("useFitInViewport(")) offenders.push(f);
  }
  assert.ok(checked >= 6, "подсказки найдены в нескольких файлах");
  assert.deepEqual(offenders, [], "без хука сдвига: " + offenders.join(", "));
});

test("the shift hook uses the translate property, so it does not clash with centred tips", () => {
  const src = fs.readFileSync("src/components/useFitInViewport.ts", "utf8");
  assert.match(src, /style\.translate/, "сдвиг через translate");
  assert.doesNotMatch(src, /style\.transform/, "transform не трогаем: он нужен центрированным подсказкам");
});

test("the shift hook also keeps tooltips above the bottom edge of the window", () => {
  const src = fs.readFileSync("src/components/useFitInViewport.ts", "utf8");
  assert.match(src, /clientHeight/, "высота окна учитывается");
  assert.match(src, /rect\.bottom\s*>\s*viewportH/, "подсказка, уходящая вниз, поднимается");
  assert.match(src, /rect\.top\s*\+\s*dy\s*<\s*EDGE_GAP/, "верхний край не уходит за окно");
});
