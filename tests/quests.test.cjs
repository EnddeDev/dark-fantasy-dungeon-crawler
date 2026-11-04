const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

/**
 * Задания и торговцы лобби: выдача и лимиты, сдача, купоны, покупки у NPC,
 * метки на карте и их исход после боя, обновление после нового этажа.
 */
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-quests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name, externals = []) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: externals });
  return require(outfile);
}

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

/* UI-сборка лежит внутри node_modules, чтобы react разрешался так же, как в приложении. */
const uiTemp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-quests-ui-"));
process.on("exit", () => fs.rmSync(uiTemp, { recursive: true, force: true }));

function loadUi(entry, name) {
  const outfile = path.join(uiTemp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const quests = load("src/game/quests.ts", "quests");
const blessings = load("src/game/blessings.ts", "blessings");
const content = load("src/game/content.ts", "content");
const maze = load("src/game/maze.ts", "maze");
const battle = load("src/game/battle.ts", "battle");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");
const { GameController } = load("src/controllers/GameController.ts", "game-controller", [
  "react",
  "react-dom",
  "react/jsx-runtime",
]);
const { MemoryStorage } = load("src/model/SaveRepository.ts", "save-repository");

/** Детерминированный генератор: одинаковые значения дают одинаковые задания. */
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

function freshPlayer(overrides = {}) {
  const base = PlayerFactory.createInitial();
  return { ...base, gold: 100000, ...overrides };
}

function questOf(kind, extra = {}) {
  return {
    id: `q-${kind}-${Math.random().toString(36).slice(2, 7)}`,
    giver: "smith",
    kind,
    floor: 2,
    title: "Тест",
    text: "",
    reward: { kind: "gold", amount: 100 },
    coupon: false,
    ...extra,
  };
}

test("новый герой получает журнал заданий с двумя предложениями и полным набором товаров", () => {
  const p = freshPlayer();
  const log = quests.logOf(p);
  assert.equal(log.offers.length, 2, "два задания на старте");
  assert.equal(log.blessingOffers.length, 6, "все шесть благословений у священника, закрытые с замком");
  assert.ok(log.wizard.length > 0 && log.wizard.length <= 6, "волшебник продаёт до шести позиций");
  assert.ok(log.villager.length > 0 && log.villager.length <= 5, "сельчанин продаёт до пяти реагентов");
  assert.ok(log.mercenary.length > 0 && log.mercenary.length <= 5, "наёмник продаёт до пяти вещей");
  assert.deepEqual(log.trust, quests.zeroTrust(), "доверие ко всем жителям стартует с нуля");
  for (const line of log.wizard) assert.ok(line.qty >= 1 && line.qty <= quests.WIZARD_MAX_QTY, "волшебник: не больше трёх штук");
});

test("старое сохранение без журнала загружается с пустым журналом заданий", () => {
  const saved = { ...freshPlayer(), questLog: undefined };
  delete saved.questLog;
  const restored = PlayerFactory.restore(saved);
  const log = quests.logOf(restored);
  assert.ok(Array.isArray(log.offers) && log.offers.length === 2, "журнал создан при загрузке");
  assert.equal(restored.blessing ?? null, null);
});

test("предложения: не больше одного задания от NPC и не больше лимита доски", () => {
  const rng = seq(0.1, 0.4, 0.7, 0.2, 0.9, 0.3, 0.6, 0.05);
  const offers = quests.rollQuestOffers([], [], 4, 9, rng);
  assert.ok(offers.length <= quests.QUEST_OFFER_LIMIT);
  const givers = offers.map((q) => q.giver);
  assert.equal(new Set(givers).size, givers.length, "каждый NPC — одно задание");
  for (const q of offers) assert.ok(q.floor >= 2 && q.floor <= 4, `этаж задания ${q.floor} в пределах открытых`);
});

test("взять задание нельзя сверх лимита активных", () => {
  const offers = Array.from({ length: 5 }, (_, i) => questOf("kill", { id: `o${i}`, giver: quests.GIVER_ORDER[i] }));
  let p = freshPlayer({ questLog: { ...quests.emptyQuestLog(), offers } });
  for (let i = 0; i < quests.QUEST_ACTIVE_LIMIT; i++) {
    const next = quests.acceptQuest(p, `o${i}`);
    assert.ok(next, `задание ${i} взято`);
    p = next;
  }
  assert.equal(quests.acceptQuest(p, "o4"), null, "пятое задание отклонено");
});

test("сдача награды золотом и снятие задания из активных", () => {
  const q = questOf("reagents", { id: "rg", reward: { kind: "gold", amount: 250 } });
  const reagent = Object.keys(content.ITEMS).find((id) => content.ITEMS[id].kind === "reagent");
  const p = freshPlayer({
    bag: { [reagent]: 3 },
    questLog: { ...quests.emptyQuestLog(), active: [{ ...q, reagent, amount: 3 }] },
  });
  assert.equal(quests.readyQuestCount(p), 1);
  const res = quests.claimQuest(p, "rg");
  assert.ok(res, "задание сдано");
  assert.equal(res.player.gold, p.gold + 250);
  assert.equal(res.player.bag[reagent] ?? 0, 0, "реагенты списаны");
  assert.equal(quests.logOf(res.player).active.length, 0);
});

test("сдача задания с купоном дают скидку 25% на следующую покупку", () => {
  const q = questOf("kill", { id: "k1", giver: "merchant", coupon: true, done: true });
  const p = freshPlayer({ questLog: { ...quests.emptyQuestLog(), active: [q] } });
  const res = quests.claimQuest(p, "k1");
  assert.equal(quests.logOf(res.player).coupons, 1);
  const charge = quests.couponCharge(res.player, 200);
  assert.equal(charge.cost, 150, "скидка 25%");
  assert.equal(charge.used, true);
  assert.equal(quests.logOf(charge.log).coupons, 0, "купон списан");
  assert.equal(quests.couponCharge(res.player, 0).cost, 0, "бесплатное не дорожает");
});

test("волшебник: не больше трёх штук, позиция пропадает при распродаже", () => {
  const line = { id: "scroll_fire", qty: 1, price: 80 };
  const p = freshPlayer({ questLog: { ...quests.emptyQuestLog(), wizard: [line] } });
  const res = quests.buyWizardItem(p, "scroll_fire");
  assert.ok(res);
  assert.equal(res.player.bag.scroll_fire, 1);
  assert.equal(quests.logOf(res.player).wizard.length, 0, "распроданная позиция исчезает");
  assert.equal(res.player.gold, p.gold - 80);
  assert.equal(quests.buyWizardItem(p, "unknown"), null);
});

test("наёмник продаёт исследованное снаряжение по двойной цене", () => {
  const item = content.createGearItem({
    baseId: Object.keys(content.GEAR_BASES)[0],
    level: 3,
    floor: 3,
    wear: "new",
    rarityWeights: content.rarityWeightsFor("normal"),
    rng: () => 0.5,
  });
  const unidentified = { ...item, identified: false };
  const price = quests.mercenaryPrice(unidentified);
  const base = content.gearBuyPrice({ ...unidentified, identified: true });
  assert.ok(price >= base * 2 - 5 && price <= base * 2 + 5, `цена ${price} ~ ×2 от ${base}`);
  const p = freshPlayer({ questLog: { ...quests.emptyQuestLog(), mercenary: [{ ...item, identified: true }] } });
  const res = quests.buyMercenaryItem(p, item.uid);
  assert.ok(res);
  assert.equal(res.player.gold, p.gold - quests.mercenaryPrice(item));
});

test("благословение: покупается одно за раз и вступает в силу только в походе", () => {
  const p = freshPlayer({ questLog: { ...quests.emptyQuestLog(), blessingOffers: ["fortitude", "keen"] } });
  const bought = quests.buyBlessing(p, "fortitude", 1);
  assert.ok(bought);
  assert.equal(quests.logOf(bought.player).blessingNext, "fortitude");
  assert.equal(bought.player.blessing ?? null, null, "в лобби ещё не действует");
  assert.equal(quests.buyBlessing(bought.player, "keen", 1), null, "второе за раз нельзя");
  const inRun = quests.startRunBlessing(bought.player);
  assert.equal(inRun.blessing, "fortitude");
  assert.equal(quests.logOf(inRun).blessingNext, null);
  const home = quests.endRunBlessing(inRun);
  assert.equal(home.blessing ?? null, null, "благословение гаснет при выходе");
  assert.ok(blessings.blessingPrice(5) > blessings.blessingPrice(1), "цена растёт с этажом");
  const withCoupon = { ...p, questLog: { ...p.questLog, coupons: 1 } };
  const discounted = quests.buyBlessing(withCoupon, "fortitude", 1);
  assert.equal(discounted.player.gold, p.gold - quests.couponPreview(withCoupon, blessings.blessingPrice(1)), "купон снижает цену благословения");
  assert.ok(discounted.player.gold > p.gold - blessings.blessingPrice(1), "скидка действительно снизила цену");
});

test("благословение «Стойкость» повышает максимум ОЗ в походе", () => {
  const base = freshPlayer();
  const withBless = { ...base, blessing: "fortitude" };
  const d0 = battle.derived(base);
  const d1 = battle.derived(withBless);
  assert.ok(d1.maxHp > d0.maxHp, "ОЗ выше с благословением");
});

test("метки на карте: убийство на монстре, остатки на свободной клетке, не на входе и выходе", () => {
  const m = maze.genMaze(maze.mazeSizeForFloor(3), 3);
  const kill = questOf("kill", { id: "k", floor: 3, enemyId: "vermin", enemyName: "Упырь" });
  const remains = questOf("fetch", { id: "f", floor: 3, source: "remains", itemName: "Остатки: Ренар" });
  const placed = quests.placeQuestMarks(m, [kill, remains], Math.random);
  const killMark = placed.questMarks.find((q) => q.questId === "k");
  const remainsMark = placed.questMarks.find((q) => q.questId === "f");
  assert.ok(killMark && remainsMark, "обе метки поставлены");
  assert.ok(placed.monsters.includes(killMark.cell), "убийство — на монстре этажа");
  assert.ok(!placed.monsters.includes(remainsMark.cell), "остатки — не на монстре");
  for (const mark of placed.questMarks) {
    const x = mark.cell % m.size;
    const y = Math.floor(mark.cell / m.size);
    assert.ok(!(x === m.start.x && y === m.start.y), "не на входе");
    assert.ok(!(x === m.stairs.x && y === m.stairs.y), "не на лестнице");
    assert.ok(!(x === m.boss.x && y === m.boss.y), "не на боссе");
  }
});

test("исход метки: убийство засчитывается, трофей уходит в вылазку, остатки ничего не меняют", () => {
  const kill = questOf("kill", { id: "k" });
  const player = freshPlayer({ questLog: { ...quests.emptyQuestLog(), active: [kill] } });
  const mark = { cell: 1, questId: "k", kind: "kill", enemyId: "vermin", label: "Охота" };
  const killed = quests.applyMarkVictory(mark, player);
  assert.equal(quests.logOf(killed.player).active[0].done, true);
  assert.equal(killed.carry, undefined);

  const drop = { cell: 2, questId: "d", kind: "drop", enemyId: "vermin", label: "Трофей" };
  const carried = quests.applyMarkVictory(drop, player);
  assert.deepEqual(carried.carry, { questId: "d", label: "Трофей" });

  const remainsMark = { cell: 3, questId: "f", kind: "remains", label: "Остатки" };
  assert.equal(quests.applyMarkVictory(remainsMark, player).player, player);
});

test("принесённое в вылазке сдаётся только в лобби и засчитывается", () => {
  const fetch = questOf("fetch", { id: "f", reward: { kind: "gold", amount: 300 }, source: "captive", itemName: "Живой товарищ" });
  const p = freshPlayer({ questLog: { ...quests.emptyQuestLog(), active: [fetch] } });
  assert.equal(quests.questReady(fetch, p), false);
  const delivered = quests.deliverCarried(p, [{ questId: "f", label: "Живой товарищ" }]);
  assert.equal(quests.questReady(fetch, delivered), true);
  const res = quests.claimQuest(delivered, "f");
  assert.equal(res.player.gold, p.gold + 300);
});

test("новый этаж: появляются 1–2 задания и обновляются товары, активные задания и благословение остаются", () => {
  const active = questOf("kill", { id: "a" });
  const before = freshPlayer({
    questLog: {
      ...quests.emptyQuestLog(),
      active: [active],
      blessingNext: "keen",
      wizard: [{ id: "scroll_fire", qty: 1, price: 80 }],
    },
  });
  const after = quests.refreshAfterNewFloor(before, 3, Math.random);
  const log = quests.logOf(after);
  assert.ok(log.offers.length >= 1 && log.offers.length <= 2);
  assert.equal(log.active[0].id, "a", "взятое задание на месте");
  assert.equal(log.blessingNext, "keen", "купленное на поход не теряется");
  assert.ok(log.wizard.length > 0);
});

test("бой с монстром задания: поле forcedEnemyId выбирает существо", () => {
  const p = freshPlayer();
  const enemy = content.ENEMIES[0];
  const state = battle.newBattle(p, enemy.minFloor || 1, false, "classic", 0, 0, undefined, enemy.id);
  assert.equal(state.enemy.def.id, enemy.id);
});

test("сервер: журнал заданий проходит проверку, неизвестные существа и благословения отклоняются", () => {
  const save = load("server/save.ts", "server-save");
  const p = freshPlayer();
  const clean = save.sanitizePlayer(JSON.parse(JSON.stringify(p)));
  assert.ok(clean.questLog, "журнал сохранён");
  assert.equal(clean.questLog.offers.length, p.questLog.offers.length);

  const withBadEnemy = JSON.parse(JSON.stringify(p));
  withBadEnemy.questLog.active = [questOf("kill", { enemyId: "no-such-monster" })];
  assert.throws(() => save.sanitizePlayer(withBadEnemy));

  const withBadBlessing = JSON.parse(JSON.stringify(p));
  withBadBlessing.questLog.blessingNext = "god-mode";
  assert.throws(() => save.sanitizePlayer(withBadBlessing));

  const withBadBlessingField = JSON.parse(JSON.stringify(p));
  withBadBlessingField.blessing = "god-mode";
  assert.equal(save.sanitizePlayer(withBadBlessingField).blessing, null, "неизвестное благословение сбрасывается");
});

test("лобби: вкладка «Жители» показывает доску, взятые задания и купон кузнеца", () => {
  const { Lobby } = loadUi("src/components/Lobby.tsx", "lobby-quests");
  const base = PlayerFactory.createInitial();
  const active = questOf("kill", { id: "live", giver: "smith", title: "Охота: Крысиный поводырь", coupon: true });
  const player = {
    ...base,
    gold: 500,
    questLog: { ...quests.emptyQuestLog(), ...quests.initialQuestLog(1), active: [active], coupons: 1 },
  };
  const html = renderToStaticMarkup(
    React.createElement(Lobby, {
      player,
      controller: {},
      shopStock: [],
      onStart: () => {},
      onRestart: () => {},
      best: 1,
      unlockedFloor: 2,
      initialTab: "quests",
    }),
  );
  assert.ok(html.includes("Взято заданий: 1/4"), "счётчик взятых заданий");
  assert.ok(html.includes("Охота: Крысиный поводырь"), "вкладка открыта на кузнеце, у которого взято задание");
  assert.ok(html.includes("Отец Анселм") && html.includes("Бран Молотобоец"), "все NPC на вкладке");
  assert.ok(html.includes("images/npcs/smith.jpg"), "у кузнеца есть портрет");
  assert.ok(html.includes("Скидка 25% на следующую покупку"), "купон показан");
});

test("лобби: алхимик открывается с приветствием по доверию и листами рецептов; рецептов в магазине нет", () => {
  const { Lobby } = loadUi("src/components/Lobby.tsx", "lobby-alchemist");
  const base = PlayerFactory.createInitial();
  const active = questOf("kill", { id: "alch", giver: "alchemist", title: "Охота: Тестовый монстр" });
  const player = {
    ...base,
    gold: 500,
    questLog: {
      ...quests.emptyQuestLog(),
      ...quests.initialQuestLog(1),
      active: [active],
      trust: { ...quests.zeroTrust(), alchemist: 2 },
    },
  };
  const render = (extra = {}) =>
    renderToStaticMarkup(
      React.createElement(Lobby, {
        player,
        controller: {},
        shopStock: [],
        onStart: () => {},
        onRestart: () => {},
        best: 1,
        unlockedFloor: 2,
        initialTab: "quests",
        ...extra,
      }),
    );
  const html = render();
  assert.ok(html.includes("Мирна Склянка"), "алхимик открыт, у него взято задание");
  assert.ok(html.includes(quests.QUEST_GIVERS.alchemist.greetings[2]), "приветствие при доверии 2");
  assert.ok(html.includes("Доверие 2/5"), "доверие показано");
  assert.ok(html.includes("Листы с рецептами"), "алхимик продаёт рецепты в своей вкладке");
  assert.ok(html.includes("Лист 1"), "первый лист показан");
  assert.ok(html.includes('aria-label="Рецепты и создание"'), "у алхимика есть вкладки рецептов и создания");
  assert.match(html, /aria-selected="true"[^>]*>Рецепты</, "по умолчанию открыты рецепты");
  assert.match(html, /aria-selected="false"[^>]*>Создание</, "вкладка создания есть");
  assert.ok(!html.includes("Алхимия варит зелья"), "варка скрыта, пока не открыта вкладка «Создание»");
  const shop = render({ initialTab: "shop" });
  assert.ok(!shop.includes("Купить рецепт"), "в магазине нет покупки рецептов");
  assert.ok(!shop.includes("Листы с рецептами"), "в магазине нет секции рецептов");
});

test("подземелье: метка принесения видна в тумане, метка убийства — только в круге света", () => {
  const { Dungeon } = loadUi("src/components/Dungeon.tsx", "dungeon-quests");
  const m = maze.genMaze(8, 2);
  /* две самые дальние от входа свободные клетки: вне света факела, в тумане */
  const cells = [];
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      const cell = y * m.size + x;
      if (m.monsters.includes(cell) || m.traps.includes(cell) || m.events.includes(cell)) continue;
      cells.push({ cell, dist: Math.abs(x - m.start.x) + Math.abs(y - m.start.y) });
    }
  }
  cells.sort((a, b) => b.dist - a.dist);
  const far = cells[0].cell;
  const second = cells[1].cell;
  const run = {
    floor: 2, maze: { ...m, questMarks: [
      { cell: far, questId: "r", kind: "remains", label: "Остатки: Ренар" },
      { cell: second, questId: "k", kind: "kill", enemyId: "vermin", label: "Охота: Крысиный поводырь" },
    ] },
    pos: m.start, prevPos: m.start, seen: {}, steps: 0,
    gold: 0, loot: [], gearLoot: [], keys: 0, log: [], torchTurns: 0, mapRevealed: false,
  };
  const html = renderToStaticMarkup(React.createElement(Dungeon, {
    run, player: PlayerFactory.createInitial(), bag: {},
    intStat: 1, intDiscount: 0, path: [], pathPaused: false,
    onMove: () => {}, onCellClick: () => {}, onUseItem: () => {}, onEquip: () => {}, onUnequip: () => {},
    onCancelPath: () => {}, onResumePath: () => {},
  }));
  assert.ok(html.includes("Остатки: Ренар"), "метка принесения видна в тумане");
  assert.ok(!html.includes("Охота: Крысиный поводырь"), "убийство вне света не видно");
});

test("вылазка: задание этажа ставит метку, благословение действует в походе и гаснет при выходе", () => {
  const game = new GameController(new MemoryStorage());
  const enemy = content.ENEMIES[0];
  const kill = questOf("kill", { id: "k1", floor: 1, enemyId: enemy.id, enemyName: enemy.name });
  const before = game.model.getSnapshot().player;
  game.model.setPlayer({
    ...before,
    questLog: { ...quests.emptyQuestLog(), active: [kill], blessingNext: "fortitude" },
  });
  game.startRun(1);
  const inRun = game.model.getSnapshot();
  const mark = inRun.run.maze.questMarks.find((q) => q.questId === "k1");
  assert.ok(mark, "метка убийства стоит на карте");
  assert.ok(inRun.run.maze.monsters.includes(mark.cell), "метка — на монстре этажа");
  assert.equal(inRun.player.blessing, "fortitude", "благословение в силе в походе");
  assert.equal(quests.logOf(inRun.player).blessingNext, null, "купленное на поход потрачено");

  game.model.setPlayer({ ...inRun.player, questLog: { ...quests.logOf(inRun.player), carried: [] } });
  game.model.setRun({ ...inRun.run, questCarry: [{ questId: "k1", label: "Охота" }] });
  game.leaveRun();
  const home = game.model.getSnapshot().player;
  assert.equal(home.blessing ?? null, null, "благословение гаснет при выходе");
  assert.deepEqual(quests.logOf(home).carried, ["k1"], "принесённое сдаётся в лобби");
});

test("наёмник: только редкие и выше качества, уровень не выше текущего этажа", () => {
  for (const floor of [1, 3, 6]) {
    for (let i = 0; i < 40; i++) {
      const stock = quests.rollMercenaryStock(floor);
      assert.equal(stock.length, 5, "пять предметов на витрине");
      for (const item of stock) {
        assert.ok(item.rarity !== "common", `редкость ${item.rarity} не продаётся`);
        assert.ok(item.level <= floor, `уровень ${item.level} выше этажа ${floor}`);
      }
    }
  }
});

test("наёмник обновляется вместе с товарами после нового этажа и держит уровень текущего этажа", () => {
  const p = freshPlayer();
  const after = quests.refreshAfterNewFloor(p, 4);
  for (const item of quests.logOf(after).mercenary) {
    assert.ok(item.level <= 4, "после этажа 4 — уровень не выше 4");
    assert.notEqual(item.rarity, "common");
  }
});

/* ─────────────  доверие, замки и рецепты  ───────────── */

test("восемь жителей, у каждого шесть приветствий по уровню доверия", () => {
  assert.equal(quests.GIVER_ORDER.length, 8);
  assert.ok(quests.GIVER_ORDER.includes("alchemist") && quests.GIVER_ORDER.includes("master"));
  for (const id of quests.GIVER_ORDER) {
    const greetings = quests.QUEST_GIVERS[id].greetings;
    assert.equal(greetings.length, 6, `${id}: шесть приветствий`);
    for (const line of greetings) assert.ok(line.length > 0, `${id}: приветствие не пустое`);
  }
});

test("сдача задания поднимает доверие на один, но не выше пяти", () => {
  const q = (id) => questOf("kill", { id, giver: "priest", done: true });
  const start = freshPlayer({ questLog: { ...quests.emptyQuestLog(), active: [q("t1")] } });
  const once = quests.claimQuest(start, "t1");
  assert.equal(quests.trustOf(once.player, "priest"), 1, "+1 за задание этого NPC");
  assert.equal(quests.trustOf(once.player, "smith"), 0, "чужое доверие не меняется");
  const capped = freshPlayer({
    questLog: { ...quests.emptyQuestLog(), trust: { ...quests.zeroTrust(), priest: 5 }, active: [q("t2")] },
  });
  const res = quests.claimQuest(capped, "t2");
  assert.equal(quests.trustOf(res.player, "priest"), 5, "максимум 5");
  assert.match(res.message, /доверие максимальное/);
});

test("кузнец и торговец: с доверием 3 каждое задание даёт скидку", () => {
  const never = () => 0.99;
  assert.equal(quests.rollQuest("smith", 2, never, 0).coupon, false, "без доверия — только половина");
  assert.equal(quests.rollQuest("smith", 2, never, 3).coupon, true, "с доверием 3 — каждое");
  assert.equal(quests.rollQuest("merchant", 2, never, 5).coupon, true);
  assert.equal(quests.rollQuest("priest", 2, () => 0, 5).coupon, false, "священник скидок не даёт");
});

test("благословение с замком: нужного доверия у священника нет — покупки нет", () => {
  const base = freshPlayer({ questLog: { ...quests.emptyQuestLog(), ...quests.initialQuestLog(1, () => 0.3) } });
  assert.equal(quests.buyBlessing(base, "steel_faith", 1), null, "доверие 0 — Стальная вера закрыта");
  const trusted = freshPlayer({
    questLog: { ...quests.emptyQuestLog(), ...quests.initialQuestLog(1, () => 0.3), trust: { ...quests.zeroTrust(), priest: 4 } },
  });
  assert.ok(quests.buyBlessing(trusted, "steel_faith", 1), "доверие 4 — открыто");
  assert.equal(quests.buyBlessing(trusted, "grace", 1), null, "Благодать открывается при доверии 5");
  assert.ok(quests.buyBlessing(trusted, "ward", 1), "базовые открыты всегда");
});

test("волшебник: позиции витрины открываются по доверию", () => {
  const ids = Object.values(content.ITEMS)
    .filter((i) => (i.kind === "potion" || i.kind === "scroll") && (i.price ?? 0) > 0)
    .slice(0, 6)
    .map((i) => i.id);
  const wizard = ids.map((id) => ({ id, qty: 1, price: 10 }));
  const at = (t) =>
    freshPlayer({ questLog: { ...quests.emptyQuestLog(), wizard, trust: { ...quests.zeroTrust(), wizard: t } } });
  assert.equal(quests.wizardSlots(0), 3);
  assert.equal(quests.buyWizardItem(at(0), ids[3]), null, "четвёртая позиция закрыта при доверии 0");
  assert.ok(quests.buyWizardItem(at(0), ids[2]), "первые три открыты");
  assert.ok(quests.buyWizardItem(at(1), ids[3]), "доверие 1 открывает четвёртую");
  assert.equal(quests.wizardSlots(5), 6, "при доверии 5 весь товар открыт");
});

test("наёмник: витрина растёт с доверием, позиция закрыта — покупки нет", () => {
  const stock = quests.rollMercenaryStock(3);
  const at = (t) =>
    freshPlayer({ questLog: { ...quests.emptyQuestLog(), mercenary: stock, trust: { ...quests.zeroTrust(), mercenary: t } } });
  assert.equal(quests.mercenarySlots(0), 3);
  assert.equal(quests.mercenarySlots(2), 4);
  assert.equal(quests.buyMercenaryItem(at(0), stock[3].uid), null, "четвёртая вещь закрыта при доверии 0");
  assert.ok(quests.buyMercenaryItem(at(2), stock[3].uid), "доверие 2 открывает четвёртую");
});

test("рецепты: делятся по цене на шесть частей, у алхимика и мастера отдельно", () => {
  for (const station of ["alchemy", "workshop"]) {
    const list = quests.stationRecipeList(station);
    assert.ok(list.length >= 6, `${station}: рецептов достаточно для шести уровней`);
    const needs = list.map((r) => quests.recipeMinTrust(r));
    assert.equal(needs[0], 0, `${station}: самый дешёвый открыт сразу`);
    assert.equal(needs[needs.length - 1], 5, `${station}: самый дорогой — при доверии 5`);
    assert.deepEqual([...needs].sort((a, b) => a - b), needs, `${station}: порог не падает с ростом цены`);
  }
  const top = quests.stationRecipeList("workshop").slice(-1)[0];
  const seller = quests.recipeGiver(top);
  assert.equal(seller, "master", "рецепты мастерской продаёт мастер");
  assert.equal(quests.canLearnRecipe(freshPlayer(), top), false, "при доверии 0 дорогой лист закрыт");
  const trusted = freshPlayer({
    questLog: { ...quests.emptyQuestLog(), trust: { ...quests.zeroTrust(), master: 5 } },
  });
  assert.equal(quests.canLearnRecipe(trusted, top), true, "при доверии 5 мастер продаёт все листы");
  const alch = quests.stationRecipeList("alchemy")[0];
  assert.equal(quests.recipeGiver(alch), "alchemist");
  assert.equal(quests.canLearnRecipe(freshPlayer(), alch), true, "самый дешёвый лист алхимика открыт сразу");
});


test("лобби: наёмник показывает картинку и характеристики, сельчанин — картинку и окно реагента", () => {
  const { Lobby } = loadUi("src/components/Lobby.tsx", "lobby-merchant-info");
  const base = PlayerFactory.createInitial();
  const log = {
    ...quests.emptyQuestLog(),
    ...quests.initialQuestLog(1),
    mercenary: quests.rollMercenaryStock(3).slice(0, 3),
    trust: { ...quests.zeroTrust(), mercenary: 3, villager: 3 },
  };
  const render = (giver, extra = {}) => {
    const player = {
      ...base,
      gold: 5000,
      questLog: {
        ...log,
        active: [questOf("kill", { id: `${giver}-q`, giver, title: "Охота" })],
      },
    };
    return renderToStaticMarkup(
      React.createElement(Lobby, {
        player,
        controller: {},
        shopStock: [],
        onStart: () => {},
        onRestart: () => {},
        best: 1,
        unlockedFloor: 3,
        initialTab: "quests",
        ...extra,
      }),
    );
  };

  const merc = render("mercenary");
  const first = quests.logOf({ ...base, questLog: log }).mercenary[0];
  const mercName = content.scaledGearStats(first).base.name;
  assert.ok(merc.includes(`aria-label="${mercName}"`), "карточка наёмника — та же, что в магазине снаряжения");
  assert.ok(merc.includes(`title="Подробнее: ${mercName}"`), "у наёмника есть «Подробнее»");
  assert.ok(merc.includes(`ур. ${first.level ?? 1}`), "в карточке наёмника видны характеристики предмета (уровень, класс, требования)");

  const villager = render("villager");
  const reagent = quests.logOf({ ...base, questLog: log }).villager[0];
  const reagentName = content.ITEMS[reagent.id].name;
  assert.ok(villager.includes(`title="Подробнее: ${reagentName}"`), "у реагента сельчанина есть «Подробнее»");
  assert.ok(villager.includes(reagentName), "карточка реагента с названием и картинкой");
  assert.ok(!villager.includes("Нужен в рецептах"), "окно характеристик закрыто до нажатия");
});
