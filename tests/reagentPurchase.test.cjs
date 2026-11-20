const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-reagent-buy-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const purchase = load("src/game/reagentPurchase.ts", "reagentPurchase");
const forge = load("src/game/forge.ts", "forge");
const ritual = load("src/game/ritual.ts", "ritual");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");
const { BuyMissingReagents } = load("src/components/ReagentBuy.tsx", "reagent-buy");

function hero(extra = {}) {
  return { ...PlayerFactory.createInitial(), gold: 1000, shopLevel: 3, bag: {}, ...extra };
}

test("недостающее считается до нужного количества; полные строки не попадают в список", () => {
  const p = hero({ bag: { powder: 2, bone: 5 } });
  const lines = purchase.missingReagents(p, [{ id: "powder", count: 5 }, { id: "bone", count: 4 }]);
  assert.deepEqual(lines.map((l) => [l.id, l.missing]), [["powder", 3]]);
});

test("одинаковые id из разных долей суммируются", () => {
  const p = hero({ bag: { powder: 1 } });
  const lines = purchase.missingReagents(p, [{ id: "powder", count: 2 }, { id: "powder", count: 2 }]);
  assert.equal(lines[0].missing, 3, "нужно 4, есть 1");
});

test("без купонов цена — сумма единиц по цене лавки", () => {
  const p = hero({ bag: { powder: 1 }, questLog: undefined });
  const lines = purchase.missingReagents(p, [{ id: "powder", count: 4 }]);
  const quote = purchase.reagentQuote(p, lines);
  assert.equal(quote.units, 3);
  assert.equal(quote.cost, 3 * 40, "порох стоит 40 за единицу");
  assert.equal(quote.canBuy, true);
});

test("купон действует на одну покупку: единицы идут как в лавке, по одной", () => {
  const p = hero({ bag: {}, questLog: { ...PlayerFactory.createInitial().questLog, coupons: 1 } });
  const lines = purchase.missingReagents(p, [{ id: "powder", count: 2 }]);
  const quote = purchase.reagentQuote(p, lines);
  assert.equal(quote.couponsUsed, 1);
  assert.equal(quote.cost, 30 + 40, "первая единица со скидкой 25%, вторая по полной цене");
});

test("магические чернила на лавке ур. 1 не продаются: покупка закрыта с причиной", () => {
  const p = hero({ shopLevel: 1, bag: {} });
  const lines = purchase.missingReagents(p, [{ id: "magic_ink", count: 5 }]);
  assert.equal(lines[0].sold, false);
  const quote = purchase.reagentQuote(p, lines);
  assert.equal(quote.canBuy, false);
  assert.match(quote.reason, /лавка ур\. 2/);
  assert.equal(purchase.buyMissingReagents(p, [{ id: "magic_ink", count: 5 }]), null);
});

test("не хватает золота — покупки нет, золото и сумка не меняются", () => {
  const p = hero({ gold: 10, bag: {} });
  const lines = purchase.missingReagents(p, [{ id: "powder", count: 3 }]);
  const quote = purchase.reagentQuote(p, lines);
  assert.equal(quote.canBuy, false);
  assert.equal(quote.reason, "не хватает золота");
  assert.equal(purchase.buyMissingReagents(p, [{ id: "powder", count: 3 }]), null);
});

test("покупка: золото списано, реагенты дозаполнили набор, купон потрачен", () => {
  const p = hero({ gold: 500, bag: { powder: 1 }, questLog: { ...PlayerFactory.createInitial().questLog, coupons: 1 } });
  const res = purchase.buyMissingReagents(p, [{ id: "powder", count: 4 }]);
  assert.ok(res, "покупка прошла");
  assert.equal(res.player.bag.powder, 4, "набор полный");
  assert.equal(res.player.gold, 500 - (30 + 40 + 40), "три единицы: первая со скидкой");
  assert.equal(res.player.questLog.coupons, 0, "купон израсходован");
  assert.match(res.message, /Докуплено: Порох ×3/);
});

test("после докупки горн принимает полный набор: неудача не уничтожает вещь", () => {
  const item = { uid: "g1", baseId: "sword", rarity: "common", wear: "battered", level: 1, statMult: 1, effects: [], identified: true, grip: "one" };
  const p = hero({ gold: 2000, armory: [item], bag: {} });
  const opt = forge.forgeOptions(item).find((o) => o.kind === "rarity");
  const bought = purchase.buyMissingReagents(p, opt.reagentParts);
  assert.ok(bought, "набор докуплен");
  const plan = forge.forgeReagentPlan(bought.player.bag, opt);
  assert.equal(plan.total, opt.reagentTotal, "в горн уходит полный набор");
});

test("ритуал: чернила докупаются до цены действия", () => {
  const p = hero({ gold: 1000, bag: { magic_ink: 2 } });
  const lines = purchase.missingReagents(p, [{ id: ritual.RITUAL_INK_ID, count: ritual.RITUAL_COSTS.replace.ink }]);
  assert.equal(lines[0].missing, 3);
  const res = purchase.buyMissingReagents(p, [{ id: ritual.RITUAL_INK_ID, count: ritual.RITUAL_COSTS.replace.ink }]);
  assert.equal(res.player.bag.magic_ink, 5);
  assert.equal(res.player.gold, 1000 - 3 * 48);
});

test("кнопка «Докупить» показывает недостающее и цену; при полном наборе её нет", () => {
  const p = hero({ gold: 1000, bag: { powder: 1 } });
  const html = renderToStaticMarkup(React.createElement(BuyMissingReagents, {
    player: p, needs: [{ id: "powder", count: 4 }], onBuy: () => {},
  }));
  assert.match(html, /Не хватает: <span[^>]*>Порох ×3<\/span>/);
  assert.match(html, /Докупить · 120 зол\./);
  assert.doesNotMatch(html, /disabled=""/);

  const full = renderToStaticMarkup(React.createElement(BuyMissingReagents, {
    player: hero({ bag: { powder: 9 } }), needs: [{ id: "powder", count: 4 }], onBuy: () => {},
  }));
  assert.equal(full, "");
});

test("кнопка «Докупить» выключена, если золота нет, и говорит почему", () => {
  const html = renderToStaticMarkup(React.createElement(BuyMissingReagents, {
    player: hero({ gold: 5, bag: {} }), needs: [{ id: "powder", count: 1 }], onBuy: () => {},
  }));
  assert.match(html, /disabled=""/);
  assert.match(html, /не хватает золота/);
});
