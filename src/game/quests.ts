/**
 * Задания и торговцы лобби.
 *
 * Шесть NPC дают задания трёх видов: убить существо на этаже, принести из подземелья
 * (трофей с существа, остатки товарища или живого товарища) и отдать реагенты.
 * Награда — золото, припасы или снаряжение. Кузнец и торговец в части заданий дают
 * скидку 25% на одну покупку. Волшебник, наёмник и сельчанин продают товары, которые
 * обновляются вместе с новыми заданиями; священник продаёт благословение на поход.
 *
 * Все функции чистые: состояние героя возвращается новым объектом, случайность — через rng.
 */
import {
  ENEMIES,
  ITEMS,
  canBuySupply,
  gearBuyPrice,
  pick,
  questSupplyPool,
  randInt,
  reagentPoolForFloor,
  rollQuestGear,
  rollShopStock,
  scaledGearStats,
  supplyLevel,
} from "./content";
import { BLESSING_IDS, BLESSINGS, blessingPrice, type BlessingId } from "./blessings";
import { cellIdx, openDirs } from "./maze";
import type {
  CarriedQuest,
  GearItem,
  Maze,
  Player,
  Quest,
  QuestGiverId,
  QuestKind,
  QuestLog,
  QuestMark,
  QuestReward,
  ShopLine,
} from "./types";

export const QUEST_ACTIVE_LIMIT = 4;
export const QUEST_OFFER_LIMIT = 6;
/** Волшебник продаёт каждый свиток или зелье не больше чем тремя штуками. */
export const WIZARD_MAX_QTY = 3;
/** Скидка кузнеца и торговца на одну покупку. */
export const COUPON_DISCOUNT = 0.25;

export const GIVER_ORDER: QuestGiverId[] = ["priest", "smith", "merchant", "wizard", "mercenary", "villager"];

export const QUEST_GIVERS: Record<QuestGiverId, { name: string; role: string; desc: string }> = {
  priest: { name: "Отец Анселм", role: "Священник", desc: "Благословляет героя на следующий поход." },
  smith: { name: "Бран Молотобоец", role: "Кузнец", desc: "Иногда отдаёт скидку на следующую покупку." },
  merchant: { name: "Ильза Весовщица", role: "Торговец", desc: "Иногда отдаёт скидку на следующую покупку." },
  wizard: { name: "Оррин Серый", role: "Волшебник", desc: "Продаёт редкие свитки и зелья, до трёх штук каждого." },
  mercenary: { name: "Кайл Шрам", role: "Наёмник", desc: "Продаёт исследованное снаряжение по двойной цене." },
  villager: { name: "Нора Пепельная", role: "Сельчанин", desc: "Продаёт реагенты по сниженной цене, но ограниченно." },
};

const COMRADES = ["Ренар", "Миррен", "Ковал", "Тесса", "Гаррик", "Ивор", "Лисса", "Орм"];
const TROPHY_NAMES = ["Сердце", "Клык", "Коготь", "Печать", "Глаз", "Осколок"];

const KIND_NAME: Record<QuestKind, string> = { kill: "Охота", fetch: "Принести", reagents: "Реагенты" };
export const QUEST_KIND_NAME = KIND_NAME;

/* ─────────────  журнал героя  ───────────── */

export function emptyQuestLog(): QuestLog {
  return {
    offers: [],
    active: [],
    carried: [],
    coupons: 0,
    blessingOffers: [],
    blessingNext: null,
    wizard: [],
    villager: [],
    mercenary: [],
  };
}

/** Журнал героя; у старых сохранений его нет — тогда пустой. */
export function logOf(player: Player): QuestLog {
  return player.questLog ?? emptyQuestLog();
}

/** Дополняет журнал из старого сохранения недостающими полями. */
export function normalizeQuestLog(raw: Partial<QuestLog>): QuestLog {
  const base = emptyQuestLog();
  return {
    offers: Array.isArray(raw.offers) ? raw.offers : base.offers,
    active: Array.isArray(raw.active) ? raw.active : base.active,
    carried: Array.isArray(raw.carried) ? raw.carried : base.carried,
    coupons: Number.isFinite(raw.coupons) ? Math.max(0, Math.floor(raw.coupons as number)) : 0,
    blessingOffers: Array.isArray(raw.blessingOffers) ? raw.blessingOffers : base.blessingOffers,
    blessingNext: typeof raw.blessingNext === "string" ? raw.blessingNext : null,
    wizard: Array.isArray(raw.wizard) ? raw.wizard : base.wizard,
    villager: Array.isArray(raw.villager) ? raw.villager : base.villager,
    mercenary: Array.isArray(raw.mercenary) ? raw.mercenary : base.mercenary,
  };
}

/* ─────────────  генерация  ───────────── */

function shuffled<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function roundGold(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

function newId(rng: () => number): string {
  return `q${Math.floor(rng() * 0x7fffffff).toString(36)}`;
}

function pickEnemy(floor: number, rng: () => number): { id: string; name: string } {
  const pool = ENEMIES.filter((e) => e.minFloor <= floor);
  const enemy = pick(pool.length ? pool : ENEMIES, rng);
  return { id: enemy.id, name: enemy.name };
}

/** Одно задание на этаж: вид, награда и (для принесения) предмет. */
export function rollQuest(giver: QuestGiverId, floor: number, rng: () => number = Math.random): Quest {
  const f = Math.max(1, Math.floor(floor));
  const kind = pick<QuestKind>(["kill", "fetch", "reagents"], rng);
  const coupon = (giver === "smith" || giver === "merchant") && rng() < 0.5;
  const base = { title: "", text: "", gold: 0 };
  const extra: Partial<Quest> = {};

  if (kind === "kill") {
    const enemy = pickEnemy(f, rng);
    extra.enemyId = enemy.id;
    extra.enemyName = enemy.name;
    base.title = `Охота: ${enemy.name}`;
    base.text = `На ${f}-м этаже бродит «${enemy.name}». Найди его и убей — на карте он будет отмечен восклицательным знаком.`;
    base.gold = roundGold(60 + 25 * f);
  } else if (kind === "fetch") {
    const source = pick<"drop" | "remains" | "captive">(["drop", "remains", "captive"], rng);
    extra.source = source;
    if (source === "drop") {
      const enemy = pickEnemy(f, rng);
      extra.enemyId = enemy.id;
      extra.enemyName = enemy.name;
      extra.itemName = `${pick(TROPHY_NAMES, rng)} — ${enemy.name}`;
      base.title = `Трофей: ${enemy.name}`;
      base.text = `С «${enemy.name}» на ${f}-м этаже можно снять уникальный трофей. Принеси его — он уцелеет, только если ты вернёшься живым.`;
    } else {
      const comrade = pick(COMRADES, rng);
      if (source === "remains") {
        extra.itemName = `Остатки товарища: ${comrade}`;
        base.title = `Остатки: ${comrade}`;
        base.text = `На ${f}-м этаже лежат остатки ${comrade}. Найди их на карте и верни в лагерь.`;
      } else {
        extra.itemName = `Живой товарищ: ${comrade}`;
        base.title = `Спасти: ${comrade}`;
        base.text = `На ${f}-м этаже в плену ${comrade}. Выведи его живым — на карте он отмечен восклицательным знаком.`;
      }
    }
    base.gold = roundGold(70 + 30 * f);
  } else {
    const reagent = pick(reagentPoolForFloor(f), rng);
    const amount = randInt(2, f >= 4 ? 4 : 3, rng);
    extra.reagent = reagent;
    extra.amount = amount;
    base.title = `Реагенты: ${ITEMS[reagent]?.name ?? reagent}`;
    base.text = `Принеси ${amount} шт. «${ITEMS[reagent]?.name ?? reagent}». Они берутся из сумки прямо в лобби.`;
    base.gold = roundGold((25 + 10 * f) * amount);
  }

  const roll = rng();
  let reward: QuestReward;
  if (roll < 0.5) {
    reward = { kind: "gold", amount: base.gold };
  } else if (roll < 0.75) {
    const pool = questSupplyPool(f);
    const items = [pick(pool, rng)];
    if (rng() < 0.4) items.push(pick(pool, rng));
    reward = { kind: "supplies", items };
  } else {
    reward = { kind: "gear", level: Math.max(1, Math.min(10, f)) };
  }

  return {
    id: newId(rng),
    giver,
    kind,
    floor: f,
    title: base.title,
    text: base.text,
    reward,
    coupon,
    ...extra,
  };
}

/**
 * Добавляет до `count` новых заданий: не больше одного от каждого NPC и не больше лимита.
 * Этаж берётся из последних открытых (текущий и два предыдущих).
 */
export function rollQuestOffers(
  offers: Quest[],
  taken: Quest[],
  unlockedFloor: number,
  count: number,
  rng: () => number = Math.random,
): Quest[] {
  const busy = new Set<QuestGiverId>([...offers, ...taken].map((q) => q.giver));
  let free = GIVER_ORDER.filter((g) => !busy.has(g));
  const next = [...offers];
  for (let i = 0; i < count && free.length && next.length < QUEST_OFFER_LIMIT; i++) {
    const giver = pick(free, rng);
    free = free.filter((g) => g !== giver);
    const top = Math.max(1, Math.floor(unlockedFloor));
    const floor = randInt(Math.max(1, top - 2), top, rng);
    next.push(rollQuest(giver, floor, rng));
  }
  return next;
}

function pickMany<T>(list: T[], n: number, rng: () => number): T[] {
  return shuffled(list, rng).slice(0, n);
}

/** Волшебник: свитки и зелья выше уровня обычной лавки, по 1–3 штуки. */
export function rollWizardStock(shopLevel: number, unlockedFloor: number, rng: () => number = Math.random): ShopLine[] {
  const cap = Math.max(1, Math.floor(unlockedFloor)) + 1;
  const all = Object.values(ITEMS).filter(
    (i) => (i.kind === "scroll" || i.kind === "potion") && (i.price ?? 0) > 0 && supplyLevel(i.id) <= cap,
  );
  const fresh = all.filter((i) => !canBuySupply(i.id, shopLevel));
  const pool = fresh.length >= 4 ? fresh : all;
  return pickMany(pool, 4, rng).map((d) => ({ id: d.id, qty: randInt(1, WIZARD_MAX_QTY, rng), price: d.price ?? 0 }));
}

/** Сельчанин: реагенты по 70% цены, по 1–3 штуки. */
export function rollVillagerStock(rng: () => number = Math.random): ShopLine[] {
  const reagents = Object.values(ITEMS).filter((i) => i.kind === "reagent" && (i.price ?? 0) > 0);
  return pickMany(reagents, 3, rng).map((d) => ({
    id: d.id,
    qty: randInt(1, WIZARD_MAX_QTY, rng),
    price: roundGold((d.price ?? 0) * 0.7),
  }));
}

/** Наёмник: три исследованные вещи из обычного ассортимента. */
export function rollMercenaryStock(shopLevel: number, floor: number, rng: () => number = Math.random): GearItem[] {
  return pickMany(rollShopStock(shopLevel, floor, rng), 3, rng).map((item) => ({ ...item, identified: true }));
}

/** Благословения священника: четыре из четырёх, порядок случайный. */
export function rollBlessingOffers(rng: () => number = Math.random): string[] {
  return shuffled([...BLESSING_IDS], rng).slice(0, 4);
}

/** Журнал новой игры: два задания с первого этажа и полный набор товаров. */
export function initialQuestLog(shopLevel: number, rng: () => number = Math.random): QuestLog {
  return {
    ...emptyQuestLog(),
    offers: rollQuestOffers([], [], 1, 2, rng),
    blessingOffers: rollBlessingOffers(rng),
    wizard: rollWizardStock(shopLevel, 1, rng),
    villager: rollVillagerStock(rng),
    mercenary: rollMercenaryStock(shopLevel, 1, rng),
  };
}

/**
 * Прохождение нового этажа: 1–2 новых задания и обновлённые товары волшебника,
 * сельчанина и наёмника. Благословения священника тоже меняются; купленное на поход — нет.
 */
export function refreshAfterNewFloor(player: Player, unlockedFloor: number, rng: () => number = Math.random): Player {
  const log = logOf(player);
  const count = rng() < 0.5 ? 1 : 2;
  const nextLog: QuestLog = {
    ...log,
    offers: rollQuestOffers(log.offers, log.active, unlockedFloor, count, rng),
    blessingOffers: rollBlessingOffers(rng),
    wizard: rollWizardStock(player.shopLevel, unlockedFloor, rng),
    villager: rollVillagerStock(rng),
    mercenary: rollMercenaryStock(player.shopLevel, unlockedFloor, rng),
  };
  return { ...player, questLog: nextLog };
}

/* ─────────────  цены и скидка  ───────────── */

/** Цена с учётом скидки: если есть купон, цена падает на 25%. */
export function couponCharge(player: Player, price: number): { cost: number; log: QuestLog; used: boolean } {
  const log = logOf(player);
  if (log.coupons <= 0 || price <= 0) return { cost: price, log, used: false };
  const cost = roundGold(price * (1 - COUPON_DISCOUNT));
  return { cost, log: { ...log, coupons: log.coupons - 1 }, used: true };
}

/** Цена на прилавке для показа (без списания купона). */
export function couponPreview(player: Player, price: number): number {
  return logOf(player).coupons > 0 && price > 0 ? roundGold(price * (1 - COUPON_DISCOUNT)) : price;
}

/** Наёмник продаёт исследованное снаряжение по двойной цене. */
export function mercenaryPrice(item: GearItem): number {
  return roundGold(gearBuyPrice({ ...item, identified: true }) * 2);
}

/* ─────────────  выполнение  ───────────── */

export function questReady(q: Quest, player: Player): boolean {
  if (q.kind === "kill") return !!q.done;
  if (q.kind === "fetch") return logOf(player).carried.includes(q.id);
  return (player.bag[q.reagent ?? ""] ?? 0) >= (q.amount ?? 0);
}

export function describeReward(reward: QuestReward): string {
  if (reward.kind === "gold") return `${reward.amount} зол.`;
  if (reward.kind === "supplies") return reward.items.map((id) => ITEMS[id]?.name ?? id).join(", ");
  return `снаряжение ${reward.level}-го уровня`;
}

/** Взять задание из предложенных. Ограничен числом одновременных заданий. */
export function acceptQuest(player: Player, questId: string): Player | null {
  const log = logOf(player);
  const offer = log.offers.find((q) => q.id === questId);
  if (!offer || log.active.length >= QUEST_ACTIVE_LIMIT) return null;
  return {
    ...player,
    questLog: {
      ...log,
      offers: log.offers.filter((q) => q.id !== questId),
      active: [...log.active, offer],
    },
  };
}

/** Сдать готовое задание: награда, снятие принесённого и реагентов. */
export function claimQuest(
  player: Player,
  questId: string,
  rng: () => number = Math.random,
): { player: Player; message: string } | null {
  const log = logOf(player);
  const q = log.active.find((x) => x.id === questId);
  if (!q || !questReady(q, player)) return null;

  let gold = player.gold;
  const bag = { ...player.bag };
  let armory = player.armory;
  const reward = q.reward;
  if (reward.kind === "gold") gold += reward.amount;
  if (reward.kind === "supplies") reward.items.forEach((id) => (bag[id] = (bag[id] ?? 0) + 1));
  if (reward.kind === "gear") {
    const item = rollQuestGear(reward.level, rng);
    armory = [item, ...armory];
  }
  if (q.kind === "reagents" && q.reagent) {
    const left = (bag[q.reagent] ?? 0) - (q.amount ?? 0);
    if (left > 0) bag[q.reagent] = left;
    else delete bag[q.reagent];
  }

  const nextLog: QuestLog = {
    ...log,
    active: log.active.filter((x) => x.id !== questId),
    carried: log.carried.filter((id) => id !== questId),
    coupons: log.coupons + (q.coupon ? 1 : 0),
  };
  const rewardText =
    reward.kind === "gear"
      ? `${scaledGearStats(armory[0]).base.name}`
      : describeReward(reward);
  const message = `Задание сдано: ${q.title}. Награда: ${rewardText}.${q.coupon ? " Скидка 25% на следующую покупку." : ""}`;
  return { player: { ...player, gold, bag, armory, questLog: nextLog }, message };
}

/** Убийство на этаже: задание засчитано сразу, сдать его можно в лобби. */
export function markQuestKilled(player: Player, questId: string): Player {
  const log = logOf(player);
  if (!log.active.some((q) => q.id === questId)) return player;
  return {
    ...player,
    questLog: { ...log, active: log.active.map((q) => (q.id === questId ? { ...q, done: true } : q)) },
  };
}

/** Принесённое из вылазки попадает в лобби при возвращении. */
export function deliverCarried(player: Player, carry: CarriedQuest[] | undefined): Player {
  if (!carry?.length) return player;
  const log = logOf(player);
  const ids = [...new Set([...log.carried, ...carry.map((c) => c.questId)])];
  return { ...player, questLog: { ...log, carried: ids } };
}

/* ─────────────  покупки у NPC  ───────────── */

export function buyWizardItem(player: Player, id: string): { player: Player; message: string } | null {
  const log = logOf(player);
  const line = log.wizard.find((l) => l.id === id);
  if (!line || line.qty <= 0 || line.qty > WIZARD_MAX_QTY) return null;
  const { cost, log: afterCoupon } = couponCharge(player, line.price);
  if (player.gold < cost) return null;
  const wizard = log.wizard
    .map((l) => (l.id === id ? { ...l, qty: l.qty - 1 } : l))
    .filter((l) => l.qty > 0);
  return {
    player: {
      ...player,
      gold: player.gold - cost,
      bag: { ...player.bag, [id]: (player.bag[id] ?? 0) + 1 },
      questLog: { ...afterCoupon, wizard },
    },
    message: `Куплено у волшебника: ${ITEMS[id]?.name ?? id}`,
  };
}

export function buyVillagerItem(player: Player, id: string): { player: Player; message: string } | null {
  const log = logOf(player);
  const line = log.villager.find((l) => l.id === id);
  if (!line || line.qty <= 0) return null;
  const { cost, log: afterCoupon } = couponCharge(player, line.price);
  if (player.gold < cost) return null;
  const villager = log.villager
    .map((l) => (l.id === id ? { ...l, qty: l.qty - 1 } : l))
    .filter((l) => l.qty > 0);
  return {
    player: {
      ...player,
      gold: player.gold - cost,
      bag: { ...player.bag, [id]: (player.bag[id] ?? 0) + 1 },
      questLog: { ...afterCoupon, villager },
    },
    message: `Куплено у сельчанина: ${ITEMS[id]?.name ?? id}`,
  };
}

export function buyMercenaryItem(player: Player, uid: string): { player: Player; message: string } | null {
  const log = logOf(player);
  const item = log.mercenary.find((g) => g.uid === uid);
  if (!item) return null;
  const { cost, log: afterCoupon } = couponCharge(player, mercenaryPrice(item));
  if (player.gold < cost) return null;
  return {
    player: {
      ...player,
      gold: player.gold - cost,
      armory: [{ ...item, identified: true }, ...player.armory],
      questLog: { ...afterCoupon, mercenary: log.mercenary.filter((g) => g.uid !== uid) },
    },
    message: `Куплено у наёмника: ${scaledGearStats(item).base.name}`,
  };
}

/** Благословение на следующий поход: одно за раз. */
export function buyBlessing(player: Player, id: string, unlockedFloor: number): { player: Player; message: string } | null {
  const log = logOf(player);
  if (!log.blessingOffers.includes(id) || log.blessingNext) return null;
  const { cost, log: afterCoupon, used } = couponCharge(player, blessingPrice(unlockedFloor));
  if (player.gold < cost) return null;
  return {
    player: { ...player, gold: player.gold - cost, questLog: { ...afterCoupon, blessingNext: id } },
    message: `Благословение на следующий поход: ${BLESSINGS[id as BlessingId]?.name ?? id}${used ? " · скидка 25%" : ""}`,
  };
}

/** Спуск в подземелье: благословение, купленное на поход, вступает в силу. */
export function startRunBlessing(player: Player): Player {
  const log = logOf(player);
  return { ...player, blessing: log.blessingNext ?? null, questLog: { ...log, blessingNext: null } };
}

/** Выход из вылазки или смерть: благословение похода гаснет. */
export function endRunBlessing(player: Player): Player {
  return player.blessing ? { ...player, blessing: null } : player;
}

/* ─────────────  метки на карте  ───────────── */

/** Задания этажа, которые нужно отметить на карте: активные, не выполненные и не сданные. */
export function questsForFloor(player: Player, floor: number): Quest[] {
  const log = logOf(player);
  return log.active.filter(
    (q) => q.floor === floor && q.kind !== "reagents" && !q.done && !log.carried.includes(q.id),
  );
}

/**
 * Ставит метки заданий на карту этажа: убийство и трофей — на монстров (monsters),
 * остатки и товарищ — на свободные клетки. Метка не ставится на вход, лестницу и босса.
 */
export function placeQuestMarks(maze: Maze, quests: Quest[], rng: () => number = Math.random): Maze {
  if (!quests.length) return maze;
  const size = maze.size;
  const taken = new Set<number>([
    ...maze.monsters,
    ...maze.traps,
    ...maze.events,
    ...maze.chests,
    ...maze.doors,
    ...maze.keys,
    cellIdx(maze.start.x, maze.start.y, size),
    cellIdx(maze.stairs.x, maze.stairs.y, size),
    cellIdx(maze.boss.x, maze.boss.y, size),
  ]);
  const free: { cell: number; far: boolean }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cellIdx(x, y, size);
      if (taken.has(cell) || openDirs(maze, x, y).length === 0) continue;
      const far = Math.abs(x - maze.start.x) + Math.abs(y - maze.start.y) >= 4;
      free.push({ cell, far });
    }
  }
  /* Сначала дальние от входа клетки, чтобы метка не стояла рядом со стартом. */
  const order = shuffled(free, rng).sort((a, b) => Number(b.far) - Number(a.far));
  const takeCell = (): number | null => order.shift()?.cell ?? null;

  const monsters = [...maze.monsters];
  const marks: QuestMark[] = [...(maze.questMarks ?? [])];
  for (const q of quests) {
    if (q.kind === "kill" && q.enemyId) {
      const cell = takeCell();
      if (cell === null) continue;
      monsters.push(cell);
      marks.push({ cell, questId: q.id, kind: "kill", enemyId: q.enemyId, label: `Охота: ${q.enemyName ?? q.enemyId}` });
    } else if (q.kind === "fetch") {
      const cell = takeCell();
      if (cell === null) continue;
      const label = q.itemName ?? q.title;
      if (q.source === "drop" && q.enemyId) {
        monsters.push(cell);
        marks.push({ cell, questId: q.id, kind: "drop", enemyId: q.enemyId, label });
      } else {
        marks.push({ cell, questId: q.id, kind: q.source === "captive" ? "captive" : "remains", label });
      }
    }
  }
  return { ...maze, monsters, questMarks: marks };
}

/** Метки, которые видны даже в тумане: принесение с этажа. Убийство видно только в круге света. */
export function markAlwaysVisible(mark: QuestMark): boolean {
  return mark.kind === "drop" || mark.kind === "remains" || mark.kind === "captive";
}

/* ─────────────  после вылазки  ───────────── */

/** Отметить победу над существом с меткой: убийство засчитывается, трофей идёт в вылазку. */
export function applyMarkVictory(
  mark: QuestMark | undefined,
  player: Player,
): { player: Player; carry?: CarriedQuest } {
  if (!mark) return { player };
  if (mark.kind === "kill") return { player: markQuestKilled(player, mark.questId) };
  if (mark.kind === "drop") return { player, carry: { questId: mark.questId, label: mark.label } };
  return { player };
}

/** Количество заданий, которые можно сдать прямо сейчас (для значка вкладки). */
export function readyQuestCount(player: Player): number {
  return logOf(player).active.filter((q) => questReady(q, player)).length;
}
