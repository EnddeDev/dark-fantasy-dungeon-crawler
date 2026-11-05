/**
 * Задания и торговцы лобби.
 *
 * Шесть NPC дают задания трёх видов: убить существо на этаже, принести из подземелья
 * (трофей с существа, остатки товарища или живого товарища) и отдать реагенты.
 * Награда — золото, припасы или снаряжение. Кузнец и торговец в части заданий дают
 * скидку 25% на одну покупку. Волшебник, наёмник и проходимец продают товары, которые
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
  GEAR_BASES,
  createGearItem,
  scaledGearStats,
  supplyLevel,
  RECIPES,
  type CraftStation,
  type Recipe,
} from "./content";
import { BLESSINGS, blessingPrice, type BlessingId } from "./blessings";
import { recipePrice } from "../model/pricing";
import { cellIdx, openDirs } from "./maze";
import {
  TRUST_MAX,
  type CarriedQuest,
  GearItem,
  RarityTier,
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

export const GIVER_ORDER: QuestGiverId[] = [
  "priest",
  "smith",
  "merchant",
  "wizard",
  "mercenary",
  "villager",
  "alchemist",
  "master",
];

/** Приветствия по уровню доверия: индекс 0 — чужак, 5 — друг. */
export const QUEST_GIVERS: Record<QuestGiverId, { name: string; role: string; desc: string; greetings: string[] }> = {
  priest: {
    name: "Отец Анселм",
    role: "Священник",
    desc: "Благословляет героя на следующий поход. Чем больше доверия, тем сильнее благословение.",
    greetings: [
      "Путник. Благословение дают тем, кто помнит, кому обязан. Что тебе нужно?",
      "Ты приходил с делом. Это уже что-то. Говори.",
      "А, это ты. Заходи, огонь ещё горит.",
      "Рад видеть тебя живым. Таких в деревне немного.",
      "Ты мне как сын. Пусть свет идёт с тобой.",
      "Возвращайся домой, когда бы ни захотел. Эта дверь всегда открыта.",
    ],
  },
  smith: {
    name: "Бран Молотобоец",
    role: "Кузнец",
    desc: "Чинит и улучшает снаряжение в кузнице. Со временем даёт скидку на каждое задание.",
    greetings: [
      "Чего надо? Смотри, не трогай горн.",
      "Ты не из пугливых. Ладно, говори.",
      "А, тот, что приносит железо. Садись.",
      "Для тебя сбавлю цену. Друзьям я не вру.",
      "Лучшую сталь держу для тех, кому верю. Ты в их числе.",
      "Брат по наковальне. Что нужно — сделаю, лишнего не возьму.",
    ],
  },
  merchant: {
    name: "Ильза Весовщица",
    role: "Торговец",
    desc: "Считает каждую монету. Со временем даёт скидку на каждое задание.",
    greetings: [
      "Покупаешь или смотреть пришёл? Весы не ждут.",
      "Ты честный, это видно по весу твоих мешков. Что предложить?",
      "Старые знакомые дешевле. Заходи.",
      "Для тебя у меня всегда найдётся скидка. Не говори никому.",
      "Ты мой лучший покупатель. Бери, что приглянулось.",
      "Нет дела важнее твоего барыша. Считай, что мы в одной лодке.",
    ],
  },
  wizard: {
    name: "Оррин Серый",
    role: "Волшебник",
    desc: "Продаёт редкие свитки и зелья, до трёх штук каждого. С доверием на витрине появляется больше товара.",
    greetings: [
      "Не трогай свитки. Что тебе?",
      "Ты, я вижу, не разобьёшь склянку. Смотри.",
      "Я тебя помню. Могу показать кое-что новое.",
      "Тот, кто возвращается живым, заслуживает большего. Выбирай.",
      "Редкие листы я храню для таких, как ты.",
      "Ты единственный, кому я отдаю последнее. Не растрать зря.",
    ],
  },
  mercenary: {
    name: "Кайл Шрам",
    role: "Наёмник",
    desc: "Продаёт редкое и лучшее снаряжение по двойной цене, не выше уровня этажа. С доверием витрина растёт.",
    greetings: [
      "Деньги вперёд. Остальное меня не касается.",
      "Ты держишься в бою. Это уже не мелочь.",
      "О, а ты тот, кто прикрыл мне спину. Что берёшь?",
      "Я тебе доверяю. Такие вещи я обычно не показываю.",
      "Мой лучший товар — для тебя. Без лишних вопросов.",
      "Если понадобится клинок, тебе отдам первому. Слово.",
    ],
  },
  villager: {
    name: "Ярик Крючок",
    role: "Проходимец",
    desc: "Тащит реагенты с чёрного хода: дешевле лавки, но ограниченно и без вопросов о происхождении. С доверием товара становится больше.",
    greetings: [
      "Тебе чего? Руки держи при себе, и разговор будет короткий.",
      "Ты не из стражи, я вижу. Уже неплохо. Что показать?",
      "А, тот, кто не болтает лишнего. Заходи, только дверь прикрой.",
      "Для своих у меня товар подешевле. Ты, считай, почти свой.",
      "Ты берёшь вниз то, за чем другие не полезут. Это ценно. Бери.",
      "Мы с тобой одной породы: в городе нас не ждут, а мы всё равно возвращаемся. Бери, что нужно.",
    ],
  },
  alchemist: {
    name: "Мирна Склянка",
    role: "Алхимик",
    desc: "Варит зелья и свитки. Новые листы с рецептами продаёт тем, кому доверяет.",
    greetings: [
      "Не трогайте мои колбы. Чего хотите?",
      "Вы не путаете кислоту с водой. Уже хорошо.",
      "А, экспериментатор. Могу показать пару листов.",
      "Редкие рецепты я доверяю не всем. Вы в числе немногих.",
      "Из вас выйдет хороший варщик. Берите, что понадобится.",
      "Мой лучший ученик. Все мои записи теперь ваши.",
    ],
  },
  master: {
    name: "Гуннар Резчик",
    role: "Мастер",
    desc: "Собирает метательные расходники, бомбы и ловушки. Чертежи продаёт тем, кто ему доверяет.",
    greetings: [
      "Смотри под ноги, инструменты острые. Что нужно?",
      "Руки у тебя ничего. Ладно, покажу.",
      "А, тот, кто не сломал мой нож. Заходи.",
      "Работаешь аккуратно. Таким я даю свои чертежи.",
      "Ты почти как мой сын по мастерству. Присаживайся.",
      "Мастерская открыта для тебя в любой час. Бери всё, что нужно.",
    ],
  },
};

const COMRADES = ["Ренар", "Миррен", "Ковал", "Тесса", "Гаррик", "Ивор", "Лисса", "Орм"];
const TROPHY_NAMES = ["Сердце", "Клык", "Коготь", "Печать", "Глаз", "Осколок"];

const KIND_NAME: Record<QuestKind, string> = { kill: "Охота", fetch: "Принести", reagents: "Реагенты" };
export const QUEST_KIND_NAME = KIND_NAME;

/* ─────────────  журнал героя  ───────────── */

/** Доверие ко всем жителям: в начале игры 0. */
export function zeroTrust(): Record<QuestGiverId, number> {
  return Object.fromEntries(GIVER_ORDER.map((id) => [id, 0])) as Record<QuestGiverId, number>;
}

/** Доверие героя к жителю, 0…TRUST_MAX. */
export function trustOf(player: Player, giver: QuestGiverId): number {
  const raw = logOf(player).trust?.[giver] ?? 0;
  return Math.max(0, Math.min(TRUST_MAX, Math.floor(raw)));
}

export function emptyQuestLog(): QuestLog {
  return {
    offers: [],
    active: [],
    carried: [],
    coupons: 0,
    trust: zeroTrust(),
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
    trust: { ...base.trust, ...Object.fromEntries(
      Object.entries(raw.trust ?? {}).map(([id, v]) => [id, Math.max(0, Math.min(TRUST_MAX, Math.floor(Number(v) || 0)))]),
    ) } as Record<QuestGiverId, number>,
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
export function rollQuest(giver: QuestGiverId, floor: number, rng: () => number = Math.random, trust = 0): Quest {
  const f = Math.max(1, Math.floor(floor));
  const kind = pick<QuestKind>(["kill", "fetch", "reagents"], rng);
  /* Кузнец и торговец: половина заданий со скидкой; с доверием 3 и выше — каждое. */
  const coupon = (giver === "smith" || giver === "merchant") && (trust >= 3 || rng() < 0.5);
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
  trust: Partial<Record<QuestGiverId, number>> = {},
): Quest[] {
  const busy = new Set<QuestGiverId>([...offers, ...taken].map((q) => q.giver));
  let free = GIVER_ORDER.filter((g) => !busy.has(g));
  const next = [...offers];
  for (let i = 0; i < count && free.length && next.length < QUEST_OFFER_LIMIT; i++) {
    const giver = pick(free, rng);
    free = free.filter((g) => g !== giver);
    const top = Math.max(1, Math.floor(unlockedFloor));
    const floor = randInt(Math.max(1, top - 2), top, rng);
    next.push(rollQuest(giver, floor, rng, trust[giver] ?? 0));
  }
  return next;
}

function pickMany<T>(list: T[], n: number, rng: () => number): T[] {
  return shuffled(list, rng).slice(0, n);
}

/* Витрины: сколько позиций открыто, зависит от доверия к продавцу. Закрытые видны, но не покупаются. */
export const WIZARD_SHELF = 6;
export const VILLAGER_SHELF = 5;
export const MERCENARY_SHELF = 5;

/** Волшебник: сначала три позиции, по одной за каждый уровень доверия. */
export function wizardSlots(trust: number): number {
  return Math.min(WIZARD_SHELF, 3 + trust);
}

/** Проходимец: две позиции, по одной за уровень доверия. */
export function villagerSlots(trust: number): number {
  return Math.min(VILLAGER_SHELF, 2 + trust);
}

/** Наёмник: три позиции, и ещё одна за каждые два уровня доверия. */
export function mercenarySlots(trust: number): number {
  return Math.min(MERCENARY_SHELF, 3 + Math.floor(trust / 2));
}

/** Позиция витрины открыта, если стоит в первых `slots` позициях. */
export function shelfOpen<T>(list: T[], index: number, slots: number): boolean {
  return index >= 0 && index < Math.min(list.length, slots);
}

/** Волшебник: свитки и зелья выше уровня обычной лавки, по 1–3 штуки. */
export function rollWizardStock(shopLevel: number, unlockedFloor: number, rng: () => number = Math.random): ShopLine[] {
  const cap = Math.max(1, Math.floor(unlockedFloor)) + 1;
  const all = Object.values(ITEMS).filter(
    (i) => (i.kind === "scroll" || i.kind === "potion") && (i.price ?? 0) > 0 && supplyLevel(i.id) <= cap,
  );
  const fresh = all.filter((i) => !canBuySupply(i.id, shopLevel));
  const pool = fresh.length >= WIZARD_SHELF ? fresh : all;
  return pickMany(pool, WIZARD_SHELF, rng).map((d) => ({ id: d.id, qty: randInt(1, WIZARD_MAX_QTY, rng), price: d.price ?? 0 }));
}

/** Проходимец: реагенты по 70% цены, по 1–3 штуки. */
export function rollVillagerStock(rng: () => number = Math.random): ShopLine[] {
  const reagents = Object.values(ITEMS).filter((i) => i.kind === "reagent" && (i.price ?? 0) > 0);
  return pickMany(reagents, VILLAGER_SHELF, rng).map((d) => ({
    id: d.id,
    qty: randInt(1, WIZARD_MAX_QTY, rng),
    price: roundGold((d.price ?? 0) * 0.7),
  }));
}

/** Наёмник продаёт только редкие и выше качества: обычных вещей у него нет. */
const MERCENARY_RARITY: Record<RarityTier, number> = { common: 0, rare: 80, epic: 17, legendary: 3 };

/**
 * Наёмник: исследованные вещи редкого качества или выше.
 * Уровень предмета не выше текущего уровня подземелья (открытого этажа).
 */
export function rollMercenaryStock(floor: number, rng: () => number = Math.random): GearItem[] {
  const top = Math.max(1, Math.floor(floor));
  const pool = Object.values(GEAR_BASES).filter((b) => (b.level ?? 1) <= top);
  return pickMany(pool, MERCENARY_SHELF, rng).map((b) =>
    createGearItem({ baseId: b.id, level: b.level ?? 1, rarityWeights: MERCENARY_RARITY, identified: true, rng }),
  );
}

/** Благословения священника: все, от простых к сильным. Закрытые показываются с замком. */
export function allBlessingOffers(): string[] {
  return (Object.keys(BLESSINGS) as BlessingId[])
    .sort((a, b) => BLESSINGS[a].minTrust - BLESSINGS[b].minTrust || a.localeCompare(b))
    .map((id) => id);
}

/** Новых заданий: три в начале игры и три за каждый новый пройденный этаж. */
export const QUEST_OFFERS_PER_FLOOR = 3;

/** Журнал новой игры: три задания с первого этажа и полный набор товаров. */
export function initialQuestLog(shopLevel: number, rng: () => number = Math.random): QuestLog {
  return {
    ...emptyQuestLog(),
    offers: rollQuestOffers([], [], 1, QUEST_OFFERS_PER_FLOOR, rng),
    blessingOffers: allBlessingOffers(),
    wizard: rollWizardStock(shopLevel, 1, rng),
    villager: rollVillagerStock(rng),
    mercenary: rollMercenaryStock(1, rng),
  };
}

/**
 * Прохождение нового этажа: 1–2 новых задания и обновлённые товары волшебника,
 * проходимца и наёмника. Доверие и купленное на поход не меняются.
 */
export function refreshAfterNewFloor(player: Player, unlockedFloor: number, rng: () => number = Math.random): Player {
  const log = logOf(player);
  const count = QUEST_OFFERS_PER_FLOOR;
  const nextLog: QuestLog = {
    ...log,
    offers: rollQuestOffers(log.offers, log.active, unlockedFloor, count, rng, log.trust),
    blessingOffers: allBlessingOffers(),
    wizard: rollWizardStock(player.shopLevel, unlockedFloor, rng),
    villager: rollVillagerStock(rng),
    mercenary: rollMercenaryStock(unlockedFloor, rng),
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

  const trustNow = log.trust[q.giver] ?? 0;
  const trustNext = Math.min(TRUST_MAX, trustNow + 1);
  const nextLog: QuestLog = {
    ...log,
    active: log.active.filter((x) => x.id !== questId),
    carried: log.carried.filter((id) => id !== questId),
    coupons: log.coupons + (q.coupon ? 1 : 0),
    trust: { ...log.trust, [q.giver]: trustNext },
  };
  const rewardText =
    reward.kind === "gear"
      ? `${scaledGearStats(armory[0]).base.name}`
      : describeReward(reward);
  const trustText =
    trustNext > trustNow
      ? ` ${QUEST_GIVERS[q.giver].name}: доверие ${trustNext}/${TRUST_MAX}.`
      : ` ${QUEST_GIVERS[q.giver].name}: доверие максимальное.`;
  const message = `Задание сдано: ${q.title}. Награда: ${rewardText}.${q.coupon ? " Скидка 25% на следующую покупку." : ""}${trustText}`;
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
  const index = log.wizard.findIndex((l) => l.id === id);
  if (!shelfOpen(log.wizard, index, wizardSlots(trustOf(player, "wizard")))) return null;
  const line = log.wizard[index];
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
  const index = log.villager.findIndex((l) => l.id === id);
  if (!shelfOpen(log.villager, index, villagerSlots(trustOf(player, "villager")))) return null;
  const line = log.villager[index];
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
    message: `Куплено у проходимца: ${ITEMS[id]?.name ?? id}`,
  };
}

export function buyMercenaryItem(player: Player, uid: string): { player: Player; message: string } | null {
  const log = logOf(player);
  const index = log.mercenary.findIndex((g) => g.uid === uid);
  if (!shelfOpen(log.mercenary, index, mercenarySlots(trustOf(player, "mercenary")))) return null;
  const item = log.mercenary[index];
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
  const def = BLESSINGS[id as BlessingId];
  if (!def || def.minTrust > trustOf(player, "priest")) return null;
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

/* ─────────────  рецепты алхимика и мастера  ───────────── */

/** Житель, который продаёт рецепты станции: алхимик или мастер. */
export function recipeGiver(recipe: Recipe): QuestGiverId {
  return (recipe.station ?? "alchemy") === "workshop" ? "master" : "alchemist";
}

/** Рецепты станции в порядке цены: дешёвые открываются первыми. */
export function stationRecipeList(station: CraftStation): Recipe[] {
  return RECIPES.filter((r) => (r.station ?? "alchemy") === station).sort(
    (a, b) => recipePrice(a) - recipePrice(b) || a.id.localeCompare(b.id),
  );
}

/**
 * Минимальное доверие для покупки рецепта. Рецепты делятся по цене на шесть равных частей:
 * доверие 0 открывает самую дешёвую часть, доверие 5 — все.
 */
export function recipeMinTrust(recipe: Recipe): number {
  const list = stationRecipeList(recipe.station ?? "alchemy");
  const rank = list.findIndex((r) => r.id === recipe.id);
  if (rank < 0) return TRUST_MAX;
  return Math.min(TRUST_MAX, Math.floor((rank * (TRUST_MAX + 1)) / list.length));
}

/** Можно ли купить рецепт по текущему доверию (само списание — в контроллере). */
export function canLearnRecipe(player: Player, recipe: Recipe): boolean {
  return trustOf(player, recipeGiver(recipe)) >= recipeMinTrust(recipe);
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

/** Задания, которые можно взять: предложения, ещё не принятые в работу. */
export function availableQuestCount(player: Player): number {
  return logOf(player).offers.length;
}
