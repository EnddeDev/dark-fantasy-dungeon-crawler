import { useEffect, useState } from "react";
import {
  ArrowDownUp,
  BookOpen,
  Brain,
  Check,
  Coins,
  Eye,
  EyeOff,
  FlaskConical,
  Gem,
  PackageSearch,
  Search,
  Shield,
  Sparkles,
  ShoppingBag,
  Skull,
  Sword,
  X,
} from "lucide-react";
import {
  EPIC_SKILLS,
  BREW_FAILURE_CHANCE,
  equipItem,
  identifyReqs,
  slotsForItem,
  unequipSlot,
  ITEMS,
  LEGENDARY_PASSIVES,
  MAX_LEVEL,
  PASSIVES,
  RARITY_META,
  RECIPES,
  STAT_META,
  STAT_ORDER,
  WEAR_META,
  attemptBrew,
  gearBuyPrice,
  gearSellPrice,
  hasIngredients,
  scaledGearStats,
  statPointCost,
  xpForNextLevel,
  type ItemDef,
  type Recipe,
} from "../game/content";
import { SLOT_META } from "../game/types";
import type { RarityTier, Slot } from "../game/types";
import { derived } from "../game/battle";
import { mazeSizeForFloor } from "../game/maze";
import { GEAR_CLASS_META, gearStatReqLabel } from "../game/content";
import { GEAR_EFFECTS, GEAR_PASSIVES } from "../game/gearEffects";
import type { GearItem, Player, StatKey } from "../game/types";
import { SHOP_MAX_LEVEL, shopRarityTable, shopWearTable } from "../game/world";
import { Guide } from "./Guide";
import { Bestiary } from "./Bestiary";
import { ItemArt } from "./ItemArt";
import { GearNote } from "./GearNote";
import { Btn, Meter, Modal, Panel, Pips, RARITY_STYLE, RARITY_TEXT, Rune, Tag } from "./ui";


type Tab = "train" | "armory" | "shop" | "brew" | "bestiary" | "guide";
type ShopSection = "equipment" | "supplies" | "reagents" | "recipes";
type SupplyGroup = "potion" | "throwable" | "scroll";
type RecipeGroup = "potion" | "throwable" | "scroll";
/** Всплывающая подсказка о припасе / реагенте / рецепте. */
type InfoTip = { kind: "item" | "recipe"; id: string } | null;

const SUPPLY_GROUPS: { id: SupplyGroup; label: string }[] = [
  { id: "potion", label: "Зелья" },
  { id: "throwable", label: "Расходники" },
  { id: "scroll", label: "Свитки" },
];

const RECIPE_GROUPS: { id: RecipeGroup; label: string }[] = [
  { id: "potion", label: "Зелья" },
  { id: "throwable", label: "Расходники" },
  { id: "scroll", label: "Свитки" },
];

function groupOfKind(kind: string): SupplyGroup {
  return kind === "scroll" ? "scroll" : kind === "throwable" ? "throwable" : "potion";
}

/** Человекочитаемое описание действия предмета. */
function effectSummary(def: ItemDef): { what: string; when: string } {
  const u = def.use;
  if (!u) return { what: def.desc, when: "не применяется" };
  const intPart = u.scale ? ` + ${u.scale}×ИНТ` : "";
  switch (u.type) {
    case "heal":
      return {
        what: `Восстанавливает ${u.power}${intPart} здоровья.`,
        when: "Мгновенно. Работает в коридоре и в бою.",
      };
    case "damage":
      return {
        what: `Наносит врагу ${u.power}${intPart} урона.`,
        when: `Мгновенно. ${u.vs ? `Против существ типа «${u.vs}» урон вдвое.` : "Только в бою."}`,
      };
    case "cleanse":
      return {
        what: "Снимает раны, проклятие и яд, возвращает +8 здоровья.",
        when: "Мгновенно. Работает в коридоре и в бою.",
      };
    case "throw":
      return { what: `Наносит ${u.power}${intPart} физического урона.`, when: "Мгновенно. Только в бою." };
    case "poison":
      return {
        what: `Наносит ${u.power}${intPart} урона и отравляет живую цель.`,
        when: `Яд действует ${u.rounds} раунда. Нежить и конструкты невосприимчивы.`,
      };
    case "smoke":
      return {
        what: "Скрывает тебя за дымовой завесой: следующие атаки врага пройдут мимо.",
        when: `Действует ${u.rounds} атаки врага. Это не побег.`,
      };
    case "explosion":
      return {
        what: `Наносит ${u.power}${intPart} урона, игнорируя броню.`,
        when: "Мгновенно. Только в бою.",
      };
    case "fear":
      return {
        what: "Заставляет врага провести в защитной стойке и пропустить свои ходы.",
        when: `Действует ${u.rounds} хода. На нежить и конструкты не действует.`,
      };
    case "rage":
      return {
        what: "+50% к наносимому урону.",
        when: `Действует ${u.rounds} раундов.`,
      };
    case "chill":
      return {
        what: `Наносит ${u.power}${intPart} урона и сковывает врага.`,
        when: `Урон врага −30% на ${u.rounds} раунда.`,
      };
    case "sunder_damage":
      return {
        what: `Наносит ${u.power}${intPart} урона сквозь броню и ломает её.`,
        when: "Мгновенно. Броня врага −2 до конца боя.",
      };
    case "flee":
      return {
        what: "Позволяет уйти из боя.",
        when: u.fleeRate === 0 ? "Без потери добычи." : `Потеря до ${Math.round((u.fleeRate ?? 0.5) * 100)}% добычи.`,
      };
    default:
      return { what: def.desc, when: "Мгновенно." };
  }
}
type SlotFilter = "all" | "hands" | "armor" | "rings" | "amulet";

/** Слоты, объединённые под одной кнопкой фильтра в арсенале и лавке. */
const SLOT_FILTERS: Record<Exclude<SlotFilter, "all">, Slot[]> = {
  hands: ["mainHand", "offHand"],
  armor: ["head", "body", "feet", "wrists"],
  rings: ["ring1", "ring2"],
  amulet: ["amulet"],
};
type GearSort = "recent" | "price" | "damage" | "rarity";
type RarityFilter = "all" | "unknown" | RarityTier;

const TAB_ICONS = {
  train: Brain,
  armory: Sword,
  shop: ShoppingBag,
  brew: FlaskConical,
  bestiary: Skull,
  guide: BookOpen,
} as const;

const RARITY_RANK: Record<RarityTier, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

const TABS: { id: Tab; label: string; badge?: (p: Player) => number }[] = [
  { id: "train", label: "Развитие", badge: (p) => p.statPoints },
  {
    id: "armory",
    label: "Арсенал",
    badge: (p) => p.armory.filter((g) => !g.identified).length,
  },
  { id: "shop", label: "Магазин" },
  { id: "brew", label: "Алхимия" },
  { id: "bestiary", label: "Бестиарий" },
  { id: "guide", label: "Как играть" },
];

export function Lobby({
  player,
  setPlayer,
  shopStock,
  onRefreshShop,
  onUpgradeShop,
  onPurchaseGear,
  onStart,
  best,
  unlockedFloor,
  initialTab = "train",
}: {
  player: Player;
  setPlayer: (fn: (p: Player) => Player) => void;
  shopStock: GearItem[];
  onRefreshShop: () => void;
  onUpgradeShop: () => void;
  /** Убрать купленный товар с прилавка. */
  onPurchaseGear: (uid: string) => void;
  onStart: (floor: number) => void;
  best: number;
  unlockedFloor: number;
  initialTab?: "train" | "guide";
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [shopSection, setShopSection] = useState<ShopSection>("equipment");
  const [supplyGroup, setSupplyGroup] = useState<SupplyGroup>("potion");
  const [recipeGroup, setRecipeGroup] = useState<RecipeGroup>("potion");
  const [infoTip, setInfoTip] = useState<InfoTip>(null);
  const [selectedFloor, setSelectedFloor] = useState<number>(unlockedFloor);
  const [pick, setPick] = useState<{ stat: StatKey; tier: 5 | 10 } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [purchasedUids, setPurchasedUids] = useState<Record<string, boolean>>({});
  const [gearQuery, setGearQuery] = useState("");
  const [gearSlot, setGearSlot] = useState<SlotFilter>("all");
  const [gearRarity, setGearRarity] = useState<RarityFilter>("all");
  const [gearSort, setGearSort] = useState<GearSort>("recent");
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  /** Карточка снаряжения, над которой наведена мышь: показывает полный разбор. */
  const [gearHover, setGearHover] = useState<GearItem | null>(null);

  const d = derived(player);
  const say = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 3200);
  };

  /* Повышение характеристики за очки уровня */
  const upgradeStat = (k: StatKey) => {
    const cur = player.stats[k];
    if (cur >= 10) return;
    const cost = statPointCost(cur);
    if (player.statPoints < cost) return;
    const next = cur + 1;
    setPlayer((p) => {
      const stats = { ...p.stats, [k]: next };
      const after = derived({ ...p, stats }).maxHp;
      return {
        ...p,
        stats,
        statPoints: p.statPoints - cost,
        hp: after,
      };
    });
    if (next === 5 || next === 10) setPick({ stat: k, tier: next });
    else say(`${STAT_META[k].name}: ${next}/10`);
  };

  const choosePassive = (id: string) => {
    if (!pick) return;
    setPlayer((p) => {
      const passives = [...p.passives, id];
      const after = derived({ ...p, passives }).maxHp;
      return { ...p, passives, hp: after };
    });
    setPick(null);
    say("Пассивная способность записана в лист");
  };

  /* Покупка расходников/свитков */
  const buyConsumable = (def: ItemDef) => {
    const price = def.price ?? 0;
    if (player.gold < price) return;
    setPlayer((p) => ({
      ...p,
      gold: p.gold - price,
      bag: { ...p.bag, [def.id]: (p.bag[def.id] ?? 0) + 1 },
    }));
    say(`Куплено: ${def.name}`);
  };

  /* Если Интеллект позволяет — предметы в арсенале исследуются сами */
  useEffect(() => {
    const pending = player.armory.filter((g) => !g.identified);
    if (!pending.length) return;
    const canDo = pending.filter((g) => player.stats.int >= identifyReqs(g).int);
    if (!canDo.length) return;
    setPlayer((p) => ({
      ...p,
      armory: p.armory.map((g) => (canDo.some((c) => c.uid === g.uid) ? { ...g, identified: true } : g)),
    }));
    say(`Исследовано автоматически: ${canDo.length} предмет(ов)`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.armory, player.stats.int]);

  /* Покупка снаряжения. Если Интеллект позволяет — предмет исследуется сразу,
     а купленная вещь исчезает с прилавка. */
  const buyGear = (item: GearItem) => {
    const price = gearBuyPrice(item);
    if (player.gold < price) return;
    const reqs = identifyReqs(item);
    const auto = player.stats.int >= reqs.int;
    setPlayer((p) => ({
      ...p,
      gold: p.gold - price,
      armory: [{ ...item, identified: auto }, ...p.armory],
    }));
    onPurchaseGear(item.uid);
    setPurchasedUids((prev) => ({ ...prev, [item.uid]: true }));
    say(
      auto
        ? `Куплено и исследовано: ${scaledGearStats(item).base.name}`
        : `Куплено: ${scaledGearStats(item).base.name}`,
    );
  };

  /* Исследование снаряжения (за Интеллект или за Золото) */
  const identifyGear = (uid: string, mode: "int" | "gold") => {
    const target = player.armory.find((g) => g.uid === uid);
    if (!target || target.identified) return;
    const st = scaledGearStats(target);
    const reqs = identifyReqs(target);
    const reqInt = Math.max(1, reqs.int - d.intDiscount);
    const goldCost = reqs.gold;

    if (mode === "int" && player.stats.int < reqInt) return;
    if (mode === "gold" && player.gold < goldCost) return;

    setPlayer((p) => {
      const armory = p.armory.map((g) => (g.uid === uid ? { ...g, identified: true } : g));
      const gold = mode === "gold" ? p.gold - goldCost : p.gold;
      const nextP = { ...p, armory, gold };
      return { ...nextP, hp: derived(nextP).maxHp };
    });

    const rName = RARITY_META[target.rarity].name;
    say(`Исследовано: ${st.base.name} — ${rName}!`);
  };

  const equipGear = (item: GearItem, slot: Slot) => {
    setPlayer((p) => {
      const before = derived(p).maxHp;
      const { player: next, note } = equipItem(p, item.uid, slot);
      const after = derived(next).maxHp;
      if (note) say(note);
      return { ...next, hp: Math.min(after, next.hp + Math.max(0, after - before)) };
    });
    say(`Надето: ${scaledGearStats(item).base.name} · ${SLOT_META[slot].name}`);
  };

  const takeOff = (slot: Slot) => {
    setPlayer((p) => {
      const next = unequipSlot(p, slot);
      return { ...next, hp: Math.min(derived(next).maxHp, next.hp) };
    });
    say(`${SLOT_META[slot].name}: снято`);
  };

  const sellGear = (item: GearItem) => {
    const isEquipped = player.equip[item.slot] === item.uid;
    if (isEquipped) return;
    const price = gearSellPrice(item);
    setPlayer((p) => ({
      ...p,
      gold: p.gold + price,
      armory: p.armory.filter((g) => g.uid !== item.uid),
    }));
    say(`Продано за ${price} зол.`);
  };

  const buyRecipe = (recipe: Recipe) => {
    const price = recipePrice(recipe);
    if (player.knownRecipes.includes(recipe.id) || player.gold < price) return;
    setPlayer((p) => ({
      ...p,
      gold: p.gold - price,
      knownRecipes: [...p.knownRecipes, recipe.id],
    }));
    say(`Рецепт изучен: ${ITEMS[recipe.out].name}`);
  };

  const brew = (recipeId: string) => {
    const r = RECIPES.find((x) => x.id === recipeId);
    if (!r) return;
    const result = attemptBrew(player, r);
    if (!result) return;
    setPlayer(() => result.player);
    say(result.success
      ? `Создано: ${ITEMS[r.out].name}${player.passives.includes("brewer") ? " (+1)" : ""}`
      : "Алхимия не удалась: реагенты потрачены, результата нет.");
  };

  const shopSupplies = Object.values(ITEMS).filter(
    (i) => (i.price ?? 0) > 0 && i.kind !== "reagent" && groupOfKind(i.kind) === supplyGroup,
  );
  const shopReagents = Object.values(ITEMS).filter((i) => i.kind === "reagent" && (i.price ?? 0) > 0);
  /** Рецепты дорожают: лист редкого зелья ценится выше. */
  const recipePrice = (r: Recipe) => Math.round(r.price * 1.8 / 5) * 5;
  const groupedRecipes = RECIPES.filter((r) => groupOfKind(ITEMS[r.out].kind) === recipeGroup);
  const wearTable = shopWearTable(player.shopLevel);
  const rarityTable = shopRarityTable(player.shopLevel);
  const upgradeCost = player.shopLevel >= SHOP_MAX_LEVEL ? 0 : 250 * player.shopLevel;
  const xpNeed = xpForNextLevel(player.level);

  const filterGear = (items: GearItem[]) => {
    const q = gearQuery.trim().toLowerCase();
    const filtered = items.filter((g) => {
      const st = scaledGearStats(g);
      if (gearSlot !== "all" && !SLOT_FILTERS[gearSlot].includes(g.slot)) return false;
      if (onlyUnknown && g.identified) return false;
      if (gearRarity === "unknown" && g.identified) return false;
      if (gearRarity !== "all" && gearRarity !== "unknown" && (!g.identified || g.rarity !== gearRarity)) return false;
      if (!q) return true;
      const haystack = [
        st.base.name,
        st.skill?.name ?? "",
        g.identified ? RARITY_META[g.rarity].name : "",
        g.identified ? (g.effects ?? []).map((e) => GEAR_EFFECTS[e]?.name ?? "").join(" ") : "",
        g.identified && g.epicSkill ? EPIC_SKILLS[g.epicSkill].name : "",
        g.identified && g.legendaryPassive ? LEGENDARY_PASSIVES[g.legendaryPassive].name : "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
    const sorted = [...filtered];
    if (gearSort === "price") sorted.sort((a, b) => gearBuyPrice(a) - gearBuyPrice(b));
    if (gearSort === "damage") {
      const dmg = (g: GearItem) => {
        const r = scaledGearStats(g).dmg;
        return r ? (r[0] + r[1]) / 2 : -1;
      };
      sorted.sort((a, b) => dmg(b) - dmg(a));
    }
    if (gearSort === "rarity") {
      sorted.sort((a, b) => {
        const ra = a.identified ? RARITY_RANK[a.rarity] : -1;
        const rb = b.identified ? RARITY_RANK[b.rarity] : -1;
        return rb - ra;
      });
    }
    return sorted;
  };

  const resetGearFilters = () => {
    setGearQuery("");
    setGearSlot("all");
    setGearRarity("all");
    setGearSort("recent");
    setOnlyUnknown(false);
  };

  const gearFilters = (
    <div className="space-y-3 border border-line bg-black/30 p-3">
      <label className="flex items-center gap-2 border border-line bg-soot px-3 py-2 focus-within:border-flamedim">
        <Search size={16} className="shrink-0 text-mute" aria-hidden />
        <input
          value={gearQuery}
          onChange={(e) => setGearQuery(e.target.value)}
          placeholder="Название, приём или свойство…"
          className="min-w-0 flex-1 bg-transparent text-sm text-parch outline-none placeholder:text-mute/70"
          aria-label="Поиск снаряжения"
        />
        {gearQuery && (
          <button type="button" onClick={() => setGearQuery("")} aria-label="Очистить поиск" className="text-mute hover:text-parch">
            <X size={15} />
          </button>
        )}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Тип предмета">
          {([
            ["all", "Все", PackageSearch],
            ["hands", "Руки", Sword],
            ["armor", "Броня", Shield],
            ["rings", "Кольца", Gem],
            ["amulet", "Обереги", Sparkles],
          ] as [SlotFilter, string, typeof Gem][]).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={gearSlot === value}
              onClick={() => setGearSlot(value)}
              className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[0.7rem] transition-colors ${
                gearSlot === value ? "border-flamedim bg-flame/15 text-flamehi" : "border-line text-mute hover:text-parch"
              }`}
            >
              <Icon size={13} aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <select
          value={gearRarity}
          onChange={(e) => setGearRarity(e.target.value as RarityFilter)}
          aria-label="Фильтр редкости"
          className="border border-line bg-soot px-2 py-1.5 font-mono text-[0.7rem] text-parch outline-none focus:border-flamedim"
        >
          <option value="all">Любая редкость</option>
          <option value="unknown">Не исследовано</option>
          <option value="common">Обычное</option>
          <option value="rare">Редкое</option>
          <option value="epic">Эпическое</option>
          <option value="legendary">Легендарное</option>
        </select>
        <label className="flex items-center gap-1.5 border border-line bg-soot px-2 py-1.5 font-mono text-[0.7rem] text-mute">
          <ArrowDownUp size={13} aria-hidden />
          <select
            value={gearSort}
            onChange={(e) => setGearSort(e.target.value as GearSort)}
            aria-label="Сортировка"
            className="bg-transparent text-parch outline-none"
          >
            <option value="recent">Сначала новые</option>
            <option value="price">Цена</option>
            <option value="damage">Средний урон</option>
            <option value="rarity">Редкость</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[0.7rem] text-mute">
          <input type="checkbox" checked={onlyUnknown} onChange={(e) => setOnlyUnknown(e.target.checked)} className="accent-[#e0a33c]" />
          <EyeOff size={13} aria-hidden />
          Только неизвестные
        </label>
      </div>
    </div>
  );

  const renderGearCard = (item: GearItem, inShop: boolean) => {
    const st = scaledGearStats(item);
    const wMeta = WEAR_META[item.wear];
    const rMeta = RARITY_META[item.rarity];
    const allowedSlots = slotsForItem(item);
    const wornIn = allowedSlots.filter((slot) => player.equip[slot] === item.uid);
    const equipped = !inShop && wornIn.length > 0;
    const compareSlot = wornIn[0] ?? allowedSlots[0];
    const equippedItem = player.armory.find((g) => g.uid === player.equip[compareSlot]);
    const eqStats = equippedItem && equippedItem.uid !== item.uid ? scaledGearStats(equippedItem) : null;
    const avg = (r?: [number, number]) => (r ? (r[0] + r[1]) / 2 : 0);
    const deltas = eqStats ? {
      dmg: Math.round((avg(st.dmg) - avg(eqStats.dmg)) * 10) / 10,
      armor: st.armor - eqStats.armor,
      hp: st.hp - eqStats.hp,
    } : null;
    const reqs = identifyReqs(item);
    const reqIntId = Math.max(1, reqs.int - d.intDiscount);
    const canIdInt = player.stats.int >= reqIntId;
    const canIdGold = player.gold >= reqs.gold;
    const twoHanded = st.base.hands === 2;
    const ws = st.skill;
    const wsReq = ws ? Math.max(1, ws.intReq - d.intDiscount) : 0;
    const wsUnlocked = ws ? player.stats.int >= wsReq : false;

    const buyPrice = gearBuyPrice(item);
    const sellPrice = gearSellPrice(item);
    const alreadyBought = inShop && purchasedUids[item.uid];
    const spread = Math.round((item.statMult - 1) * 100);

    return (
      <Panel
        key={item.uid}
        style={item.identified ? RARITY_STYLE[item.rarity] : RARITY_STYLE.common}
        className={`group relative flex flex-col p-4 transition-colors ${equipped ? "bg-flame/5" : "hover:bg-slab2/70"}`}
        onMouseEnter={() => setGearHover(item)}
        onMouseLeave={() => setGearHover((cur) => (cur?.uid === item.uid ? null : cur))}
      >
        <div className="flex items-start gap-3">
          <ItemArt
            id={item.baseId}
            name={st.base.name}
            size={76}
            rarity={item.identified ? item.rarity : undefined}
            className="transition-transform duration-200 group-hover:scale-[1.03]"
          />
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-[1.02rem] uppercase leading-tight tracking-[0.08em] text-flamehi">
              {st.base.name}
            </h4>
            <span className="sc text-[0.55rem]">
              {GEAR_CLASS_META[item.gearClass ?? "medium"].name} ·{" "}
              {allowedSlots.map((slot) => SLOT_META[slot].short).join(" / ")} · ур. {item.level ?? 1} · требует {gearStatReqLabel(item)}
              {twoHanded ? " · обе руки" : ""}
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              <Tag tone={item.wear === "new" ? "verd" : item.wear === "worn" ? "mute" : "rubric"}>
                {wMeta.name} ×{wMeta.mult}
              </Tag>
              {item.identified ? (
                <span
                  style={RARITY_STYLE[item.rarity]}
                  className={`inline-flex items-center gap-1 border px-1.5 py-[3px] font-mono text-[0.64rem] uppercase leading-none tracking-[0.08em] ${RARITY_TEXT[item.rarity]}`}
                >
                  <Eye size={10} aria-hidden />
                  {rMeta.name}
                </span>
              ) : (
                <Tag tone="flame">Редкость: ???</Tag>
              )}
            </div>
          </div>
        </div>

        <p className="mt-2 text-[0.82rem] italic leading-snug text-mute">{st.base.desc}</p>

        {/* Параметры конкретного экземпляра: разброс урона и ±10% к статам */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {st.dmg && <Tag tone="flame">урон {st.dmg[0]}–{st.dmg[1]}</Tag>}
          {st.armor > 0 && <Tag tone="verd">защита +{st.armor}</Tag>}
          {st.hp > 0 && <Tag tone="mute">здоровье +{st.hp}</Tag>}
          {st.evade > 0 && <Tag tone="verd">уклонение +{Math.round(st.evade * 100)}%</Tag>}
          {spread !== 0 && (
            <Tag tone={spread > 0 ? "flame" : "rubric"}>
              параметры {spread > 0 ? "+" : ""}
              {spread}%
            </Tag>
          )}
        </div>
        {item.dmgRoll && (
          <div className="mt-1 font-mono text-[0.66rem] text-mute">
            разброс клинка: базовый {st.base.dmg?.[0]}–{st.base.dmg?.[1]} → этот {item.dmgRoll[0]}–{item.dmgRoll[1]}
          </div>
        )}
        {deltas && (deltas.dmg !== 0 || deltas.armor !== 0 || deltas.hp !== 0) && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 border-l-2 border-line pl-2 font-mono text-[0.66rem] text-mute">
            <span>к надетому:</span>
            {deltas.dmg !== 0 && <span className={deltas.dmg > 0 ? "text-verd" : "text-rubric"}>урон {deltas.dmg > 0 ? "+" : ""}{deltas.dmg}</span>}
            {deltas.armor !== 0 && <span className={deltas.armor > 0 ? "text-verd" : "text-rubric"}>броня {deltas.armor > 0 ? "+" : ""}{deltas.armor}</span>}
            {deltas.hp !== 0 && <span className={deltas.hp > 0 ? "text-verd" : "text-rubric"}>ОЗ {deltas.hp > 0 ? "+" : ""}{deltas.hp}</span>}
          </div>
        )}

        {/* Оружейный приём (открывается от Интеллекта) */}
        {ws && (
          <div className="mt-2.5 border-l-2 border-flamedim bg-black/35 px-2.5 py-1.5 text-[0.78rem]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display uppercase tracking-[0.08em] text-flamehi">
                Приём: {ws.name}
              </span>
              <span className={`font-mono text-[0.68rem] ${wsUnlocked ? "text-verd" : "text-rubric"}`}>
                ИНТ {wsReq} {wsUnlocked ? "✓ открыт" : "🔒"}
              </span>
            </div>
            <div className="mt-0.5 text-parch/85">{ws.desc}</div>
            <div className="mt-0.5 font-mono text-[0.66rem] text-mute">{ws.passiveNote}</div>
          </div>
        )}

        {/* Свойства качества (Редкое -> Эпическое -> Легендарное) */}
        <div className="mt-2.5 flex-1">
          {!item.identified ? (
            <div className="border border-dashed border-flamedim/60 bg-black/40 p-2.5 text-[0.78rem]">
              <div className="font-display uppercase tracking-[0.1em] text-flame">
                Качество скрыто туманом
              </div>
              <p className="mt-0.5 text-mute">
                {inShop
                  ? "Надень в арсенале — исследование произойдёт само, если хватит Интеллекта."
                  : "Проведите исследование, чтобы узнать редкость и пробудить скрытые свойства предмета."}
              </p>
              <p className="mt-1 font-mono text-[0.66rem] text-flamedim">
                уровень предмета {item.level ?? 1} · исследование: ИНТ {reqIntId} или {reqs.gold} зол.
              </p>
              {!inShop && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Btn
                    tone={canIdInt ? "verd" : "ghost"}
                    disabled={!canIdInt}
                    onClick={() => identifyGear(item.uid, "int")}
                    className="px-2.5 py-1.5 text-[0.68rem]"
                  >
                    Исследовать (ИНТ {reqIntId}) · 0 зол.
                  </Btn>
                  <Btn
                    tone={canIdGold ? "flame" : "ghost"}
                    disabled={!canIdGold}
                    onClick={() => identifyGear(item.uid, "gold")}
                    className="px-2.5 py-1.5 text-[0.68rem]"
                  >
                    Оплатить ({reqs.gold} зол.)
                  </Btn>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5 border border-line/80 bg-black/30 p-2.5 text-[0.78rem]">
              {item.rarity === "common" && (
                <div className="text-mute italic">
                  Обычное качество: без дополнительных чар, полагается на чистую сталь.
                </div>
              )}
              {(item.effects ?? []).map((e, i) => {
                const meta = GEAR_EFFECTS[e];
                return (
                  <div key={e + i}>
                    <span className="font-mono text-[0.66rem] uppercase text-verd">[Эффект] </span>
                    <b className="text-parch">{meta?.name}:</b>{" "}
                    <span className="text-mute">{meta?.detail}</span>
                  </div>
                );
              })}
              {item.epicSkill && (
                <div>
                  <span className="font-mono text-[0.66rem] uppercase text-flame">
                    [Эпическая способность · ИНТ {Math.max(1, EPIC_SKILLS[item.epicSkill].intReq - d.intDiscount)}]{" "}
                  </span>
                  <b className="text-flamehi">{EPIC_SKILLS[item.epicSkill].name}:</b>{" "}
                  <span className="text-mute">{EPIC_SKILLS[item.epicSkill].desc}</span>
                </div>
              )}
              {item.passive && GEAR_PASSIVES[item.passive] && (
                <div>
                  <span className="font-mono text-[0.66rem] uppercase text-rubric">[Легендарная пассивка] </span>
                  <b className="text-flamehi">{GEAR_PASSIVES[item.passive].name}:</b>{" "}
                  <span className="text-mute">{GEAR_PASSIVES[item.passive].detail}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Кнопки управления */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5">
          {inShop ? (
            <>
              <span className="flex items-center gap-1.5 font-mono text-sm tab text-flamehi"><Coins size={14} aria-hidden />{buyPrice} зол.</span>
              {alreadyBought ? (
                <Tag tone="verd">куплено</Tag>
              ) : (
                <Btn
                  tone={player.gold >= buyPrice ? "flame" : "ghost"}
                  disabled={player.gold < buyPrice}
                  onClick={() => buyGear(item)}
                >
                  Купить
                </Btn>
              )}
            </>
          ) : (
            <>
              <span className="font-mono text-xs text-mute">
                цена скупщика: <span className="text-parch">{sellPrice} зол.</span>
              </span>
              <div className="flex items-center gap-1.5">
                {equipped ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {wornIn.map((slot) => (
                      <span key={slot} className="flex items-center gap-1.5 border border-verd/70 px-2 py-1 font-mono text-[0.68rem] text-verd">
                        <Check size={13} aria-hidden />
                        {SLOT_META[slot].short}
                      </span>
                    ))}
                    <Btn tone="danger" className="px-2.5 py-1.5" onClick={() => takeOff(wornIn[0])}>
                      Снять
                    </Btn>
                  </span>
                ) : (
                  <>
                    {allowedSlots.map((slot) => (
                      <Btn key={slot} tone="verd" className="px-3 py-1.5" onClick={() => equipGear(item, slot)}>
                        {allowedSlots.length > 1 ? SLOT_META[slot].short : "Надеть"}
                      </Btn>
                    ))}
                    <Btn tone="danger" className="px-2.5 py-1.5" onClick={() => sellGear(item)}>
                      Продать
                    </Btn>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </Panel>
    );
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden">
      {/* гравюра лобби */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[62vh] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-slab2 via-slab to-soot" />
        <img
          src="images/lobby.jpg"
          alt=""
          className="h-full w-full object-cover object-center opacity-55"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-soot via-soot/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-soot via-transparent to-soot/70" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-10 lg:px-8">
        <header className="max-w-2xl">
          <span className="sc text-flamedim">Лобби · лагерь под сводами</span>
          <h2 className="font-title text-5xl leading-[0.95] text-flamehi sm:text-6xl">Сумрак</h2>
          <p className="dropcap mt-3 max-w-xl text-[0.95rem] leading-relaxed text-parch/90">
            Здесь распределяют очки, исследуют трофейные клинки и покупают забытые рецепты. Выбери знакомый
            ярус для следующей вылазки: коридоры внизу длиннее, а Стражи — сильнее.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4 font-mono text-xs text-mute">
            <span className="tab">
              уровень: <span className="text-flamehi">{player.level}/{MAX_LEVEL}</span>
            </span>
            <span className="tab">
              опыт: <span className="text-parch">{player.level >= MAX_LEVEL ? "МАКС" : `${player.xp}/${xpNeed}`}</span>
            </span>
            <span className="tab">
              очки характеристик: <span className="text-flame">{player.statPoints}</span>
            </span>
            <span className="tab">
              кошель: <span className="text-flamehi">{player.gold}</span> зол.
            </span>
            <span className="tab">
              рекорд глубины: <span className="text-verd">{best}</span> этаж
            </span>
            <span className="tab">
              доступно ярусов: <span className="text-verd">{unlockedFloor}</span>
            </span>
          </div>
        </header>

        {/* накладка-панель */}
        <div className="mt-8 border border-line bg-slab/95 shadow-[0_40px_100px_-40px_#000] backdrop-blur-[2px]">
          <div className="border-b border-line bg-black/40 px-5 py-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="sc text-flamedim">Выбор яруса</span>
                <p className="mt-1 text-[0.83rem] text-mute">
                  Победи Стража, чтобы открыть следующий этаж навсегда. Можно начинать сразу с любого открытого.
                </p>
              </div>
              <span className="font-mono text-[0.76rem] text-flame">
                выбран {selectedFloor}-й · {mazeSizeForFloor(selectedFloor)}×{mazeSizeForFloor(selectedFloor)} · опыт без потолка этажа
              </span>
            </div>
            <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Выбор этажа подземелья">
              {Array.from({ length: unlockedFloor }, (_, i) => i + 1).map((floor) => (
                <button
                  key={floor}
                  type="button"
                  aria-pressed={selectedFloor === floor}
                  onClick={() => setSelectedFloor(floor)}
                  className={`shrink-0 border px-3 py-2 font-mono text-[0.75rem] transition-colors ${
                    selectedFloor === floor
                      ? "border-flame bg-flame/20 text-flamehi"
                      : "border-line text-mute hover:border-flamedim hover:text-parch"
                  }`}
                >
                  {floor} · {mazeSizeForFloor(floor)}×{mazeSizeForFloor(floor)}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <p className="text-[0.82rem] text-mute">
                {player.statPoints > 0
                  ? `Нераспределённые очки характеристик: ${player.statPoints}.`
                  : "В лобби здоровье восстановлено перед вылазкой."}
              </p>
              <Btn tone="flame" className="px-8 py-3 text-sm" onClick={() => onStart(selectedFloor)}>
                Начать с этажа {selectedFloor}
              </Btn>
            </div>
          </div>
          <nav className="flex flex-wrap border-b border-line">
            {TABS.map((t) => {
              const count = t.badge ? t.badge(player) : 0;
              const Icon = TAB_ICONS[t.id];
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`relative flex items-center gap-2 px-4 py-3 font-display text-[0.8rem] uppercase tracking-[0.18em] transition-colors sm:px-6 ${
                    tab === t.id ? "bg-slab2 text-flamehi" : "text-mute hover:text-parch"
                  }`}
                >
                  <Icon size={15} strokeWidth={1.7} aria-hidden />
                  <span>{t.label}</span>
                  {count > 0 && (
                    <span className="border border-flame bg-flame/20 px-1.5 py-0.5 font-mono text-[0.65rem] text-flamehi">
                      {count}
                    </span>
                  )}
                  {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-px bg-flame" />}
                </button>
              );
            })}
          </nav>

          <div className="p-5 sm:p-6">
            {tab === "train" && (
              <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
                <div className="space-y-4">
                  <Panel
                    className="p-4"
                    title={`Уровень ${player.level} из ${MAX_LEVEL}`}
                    right={
                      <span className="font-mono text-xs text-flame">
                        свободных очков: <b>{player.statPoints}</b>
                      </span>
                    }
                  >
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <span className="text-sm text-parch/85">
                        За каждый новый уровень даётся <b>+2 очка характеристик</b>. Опыт добывается в боях, за
                        победу над Боссами этажей и вскрытие сундуков. На этаже N максимум уровень N+1.
                      </span>
                      <span className="font-mono text-xs tab text-flamehi">
                        {player.level >= MAX_LEVEL ? "МАКС" : `${player.xp} / ${xpNeed} XP`}
                      </span>
                    </div>
                    <Meter
                      value={player.level >= MAX_LEVEL ? 1 : player.xp}
                      max={player.level >= MAX_LEVEL ? 1 : xpNeed}
                      tone="flame"
                      className="mt-2.5"
                    />
                  </Panel>

                  {STAT_ORDER.map((k) => {
                    const v = player.stats[k];
                    const cost = statPointCost(v);
                    const can = player.statPoints >= cost && v < 10;
                    return (
                      <Panel
                        key={k}
                        className="p-4"
                        title={STAT_META[k].name}
                        right={
                          <span className="font-mono text-sm tab text-flame">
                            {String(v).padStart(2, "0")}
                            <span className="text-mute">/10</span>
                          </span>
                        }
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <Pips value={v} tone={v >= 5 ? "#e0a33c" : "#ad7a2c"} />
                            <span className="font-mono text-[0.7rem] text-mute">{STAT_META[k].gain}</span>
                          </div>
                          <Btn tone={can ? "flame" : "ghost"} disabled={!can} onClick={() => upgradeStat(k)}>
                            {v >= 10 ? "предел (10)" : `+1 (${cost} ${cost === 1 ? "очко" : "очка"})`}
                          </Btn>
                        </div>
                        <p className="mt-2 text-[0.88rem] leading-snug text-parch/80">{STAT_META[k].blurb}</p>
                        <div className="mt-1 font-mono text-[0.68rem] text-mute">
                          Стоимость повышения: до 5 — <b>1 очко</b>, после 5 (с 5 до 10) — <b>2 очка</b>.
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {(["5", "10"] as const).map((t) => {
                            const threshold = Number(t);
                            const options = PASSIVES[k][t];
                            const chosen = player.passives.find((id) => options.some((o) => o.id === id));
                            const unlocked = v >= threshold;
                            const def = options.find((o) => o.id === chosen);
                            return (
                              <button
                                key={t}
                                disabled={!unlocked || !!chosen}
                                onClick={() => setPick({ stat: k, tier: threshold as 5 | 10 })}
                                className={`border px-3 py-2 text-left transition-colors ${
                                  def
                                    ? "border-flamedim/70 bg-flame/10"
                                    : unlocked
                                      ? "border-flamedim/60 bg-slab2 hover:border-flame"
                                      : "border-line/70 bg-black/20"
                                } disabled:cursor-default`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="sc text-[0.55rem]">рубеж {threshold}</span>
                                  {unlocked ? (
                                    <span className="font-mono text-[0.6rem] text-flame">
                                      {def ? "выбрано" : "выбрать 1 из 2"}
                                    </span>
                                  ) : (
                                    <span className="font-mono text-[0.6rem] text-mute">закрыто</span>
                                  )}
                                </div>
                                <div
                                  className={`mt-1 font-display text-[0.9rem] uppercase tracking-[0.08em] ${
                                    def ? "text-flamehi" : unlocked ? "text-parch" : "text-mute"
                                  }`}
                                >
                                  {def ? def.name : unlocked ? "Нажмите для выбора" : "Заперто"}
                                </div>
                                <div className="text-[0.76rem] leading-snug text-mute">
                                  {def
                                    ? def.desc
                                    : unlocked
                                      ? "Доступны 2 пассивные способности — выберите одну."
                                      : `Откроется при значении ${threshold}.`}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </Panel>
                    );
                  })}
                </div>

                <div className="space-y-4">
                  <Panel className="p-4" title="Правила развития">
                    <ul className="space-y-2 text-[0.85rem] leading-snug text-parch/85">
                      <li>
                        <b className="text-flame">Старт:</b> все характеристики равны 1, даётся <b>4 очка</b> для
                        свободного распределения.
                      </li>
                      <li>
                        <b className="text-flame">Опыт и уровни:</b> максимум 10 уровень. Каждый уровень приносит{" "}
                        <b>+2 очка характеристик</b>. Ограничения по этажу нет, но поздние уровни требуют всё больше вылазок.
                      </li>
                      <li>
                        <b className="text-flame">Порог 5:</b> повышение до 5 стоит 1 очко; после 5 каждое очко
                        характеристики требует <b>2 очка</b>.
                      </li>
                      <li>
                        <b className="text-flame">Интеллект и оружие:</b> открывает особые приёмы у каждого оружия
                        (например, <i>Рапира: Фехтование</i> — доп. урон от ловкости), позволяет читать свитки и
                        бесплатно исследовать редкость снаряжения.
                      </li>
                    </ul>
                    <Rune className="my-3" />
                    <p className="text-[0.8rem] leading-snug text-mute">
                      На 5-м и 10-м значении открывается выбор одной из двух пассивных способностей.
                    </p>
                  </Panel>
                </div>
              </div>
            )}

            {tab === "armory" && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <span className="sc text-flamedim">Только твоё имущество</span>
                    <h3 className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
                      Арсенал · {player.armory.length} предметов
                    </h3>
                  </div>
                  <span className="font-mono text-xs text-mute">
                    Не исследовано: {player.armory.filter((g) => !g.identified).length}
                  </span>
                </div>
                <p className="max-w-2xl text-sm leading-relaxed text-mute">
                  Здесь можно надевать, продавать и исследовать только уже купленное или найденное снаряжение.
                  До исследования качество неизвестно. За Интеллект исследование бесплатно, иначе придётся заплатить.
                </p>
                {player.armory.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
                    <span className="sc mr-1">Недавние поступления</span>
                    {player.armory.slice(0, 4).map((g) => (
                      <button
                        key={g.uid}
                        type="button"
                        onClick={() => {
                          setGearQuery(scaledGearStats(g).base.name);
                          setGearSlot("all");
                          setGearRarity("all");
                          setOnlyUnknown(false);
                        }}
                        className="flex items-center gap-2 border border-line bg-black/30 px-2 py-1 text-left transition-colors hover:border-flamedim"
                        title={`Показать: ${scaledGearStats(g).base.name}`}
                      >
                        <ItemArt id={g.baseId} size={30} rarity={g.identified ? g.rarity : undefined} />
                        <span className="max-w-32 truncate font-mono text-[0.68rem] text-parch">{scaledGearStats(g).base.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {gearFilters}
                {filterGear(player.armory).length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filterGear(player.armory).map((g) => renderGearCard(g, false))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 border border-dashed border-line py-12 text-center">
                    <PackageSearch size={30} className="text-mute" aria-hidden />
                    <p className="text-sm text-mute">Ничего не найдено. Измените фильтры или загляните в магазин.</p>
                    <Btn onClick={resetGearFilters}>Сбросить фильтры</Btn>
                  </div>
                )}
              </div>
            )}

            {tab === "shop" && (
              <div className="space-y-5">
                <div>
                  <span className="sc text-flamedim">Лавка под сводами</span>
                  <h3 className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">Магазин</h3>
                  <p className="mt-1 max-w-2xl text-sm text-mute">
                    Купленный предмет сразу уходит с прилавка в твой арсенал. Припасы разделены на зелья,
                    расходники и свитки; рецепты — на тех же три отдела.
                  </p>
                </div>
                <section className="border border-flamedim/50 bg-black/35 p-4">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <span className="sc text-flamedim">Уровень лавки</span>
                      <div className="flex items-baseline gap-3">
                        <span className="font-title text-3xl leading-none text-flamehi">{player.shopLevel}</span>
                        <span className="font-mono text-sm text-mute">/ {SHOP_MAX_LEVEL}</span>
                      </div>
                      <p className="mt-1 max-w-xl text-[0.78rem] leading-snug text-mute">
                        На прилавке появляется снаряжение <b className="text-parch">не выше уровня лавки</b>. Чем выше
                        уровень — тем меньше изношенной дряни и больше дорогих редкостей.
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Btn
                        tone={upgradeCost > 0 && player.gold >= upgradeCost ? "flame" : "ghost"}
                        disabled={upgradeCost === 0 || player.gold < upgradeCost}
                        onClick={onUpgradeShop}
                      >
                        {upgradeCost === 0 ? "Предел · уровень 10" : `Вложиться в лавку · ${upgradeCost} зол.`}
                      </Btn>
                      <span className="font-mono text-[0.7rem] text-mute">
                        следующий уровень открывает вещи ур. {player.shopLevel + 1}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {([
                      ["Изношенность приходящего", [
                        ["Новое", wearTable.new, "text-verd"],
                        ["Ношенное", wearTable.worn, "text-parch"],
                        ["Изношенное", wearTable.battered, "text-rubric"],
                      ]],
                      ["Качество скрытых редкостей", [
                        ["Обычное", rarityTable.common, "text-parch"],
                        ["Редкое", rarityTable.rare, "text-verd"],
                        ["Эпическое", rarityTable.epic, "text-flame"],
                        ["Легендарное", rarityTable.legendary, "text-flamehi"],
                      ]],
                    ] as [string, [string, number, string][]][]).map(([title, rows]) => (
                      <div key={title}>
                        <div className="sc mb-2">{title}</div>
                        <div className="space-y-1.5">
                          {rows.map(([label, value, tone]) => (
                            <div key={label} className="grid grid-cols-[112px_1fr_40px] items-center gap-2 text-[0.76rem]">
                              <span className={tone}>{label}</span>
                              <span className="h-2 border border-line bg-black/60">
                                <span
                                  className="block h-full bg-flame/80 transition-[width] duration-300"
                                  style={{ width: `${value}%` }}
                                />
                              </span>
                              <span className="text-right font-mono tab text-parch/85">{Math.round(value)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="flex flex-wrap gap-2 border-b border-line pb-3">
                  {([
                    ["equipment", "Снаряжение"],
                    ["supplies", "Припасы"],
                    ["reagents", "Реагенты"],
                    ["recipes", "Рецепты"],
                  ] as [ShopSection, string][]).map(([section, label]) => (
                    <Btn
                      key={section}
                      tone={shopSection === section ? "flame" : "ghost"}
                      onClick={() => setShopSection(section)}
                    >
                      {label}
                    </Btn>
                  ))}
                </div>

                {shopSection === "equipment" && (
                  <div>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-mute">Видны класс, уровень, состояние и требуемая характеристика.</p>
                      <Btn
                        tone="ghost"
                        disabled={player.gold < 25}
                        onClick={() => {
                          setPurchasedUids({});
                          onRefreshShop();
                          say("Прилавок обновлён");
                        }}
                      >
                        Обновить прилавок (25 зол.)
                      </Btn>
                    </div>
                    {gearFilters}
                    {filterGear(shopStock).length > 0 ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {filterGear(shopStock).map((g) => renderGearCard(g, true))}
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-col items-center gap-3 border border-dashed border-line py-12 text-center">
                        <PackageSearch size={30} className="text-mute" aria-hidden />
                        <p className="text-sm text-mute">На прилавке нет подходящих предметов.</p>
                        <Btn onClick={resetGearFilters}>Сбросить фильтры</Btn>
                      </div>
                    )}
                  </div>
                )}

                {shopSection === "supplies" && (
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-2">
                      {SUPPLY_GROUPS.map((g) => (
                        <Btn
                          key={g.id}
                          tone={supplyGroup === g.id ? "flame" : "ghost"}
                          onClick={() => setSupplyGroup(g.id)}
                        >
                          {g.label}
                        </Btn>
                      ))}
                      <span className="ml-auto text-xs text-mute">
                        Наведи на название — описание действия и длительности
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {shopSupplies.map((def) => {
                        const have = player.bag[def.id] ?? 0;
                        const can = player.gold >= (def.price ?? 0);
                        const intReq = def.use?.intReq ? Math.max(1, def.use.intReq - d.intDiscount) : 0;
                        const info = effectSummary(def);
                        return (
                          <Panel key={def.id} className="flex flex-col p-4">
                            <div className="flex items-start gap-3">
                              <ItemArt id={def.id} name={def.name} size={56} />
                              <div className="min-w-0 flex-1">
                                <h4
                                  className="cursor-help font-display text-[1rem] uppercase leading-tight tracking-[0.08em] text-flamehi underline decoration-dotted underline-offset-2"
                                  onMouseEnter={() => setInfoTip({ kind: "item", id: def.id })}
                                  onMouseLeave={() => setInfoTip(null)}
                                  onFocus={() => setInfoTip({ kind: "item", id: def.id })}
                                  onBlur={() => setInfoTip(null)}
                                  tabIndex={0}
                                >
                                  {def.name}
                                </h4>
                                <div className="mt-1 flex flex-wrap justify-end gap-1">
                                  {intReq > 0 && (
                                    <Tag tone={player.stats.int >= intReq ? "verd" : "rubric"}>ИНТ {intReq}</Tag>
                                  )}
                                  <Tag tone="mute">
                                    {def.kind === "scroll" ? "свиток" : def.kind === "throwable" ? "расходник" : "зелье"}
                                  </Tag>
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex-1 text-[0.82rem] leading-snug">
                              <p className="text-parch/85">{info.what}</p>
                              <p className="mt-1 font-mono text-[0.68rem] text-flamedim">{info.when}</p>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <span className="font-mono text-sm tab text-flamehi">
                                {def.price} зол.{have > 0 && <span className="ml-2 text-mute">в сумке: {have}</span>}
                              </span>
                              <Btn tone={can ? "flame" : "ghost"} disabled={!can} onClick={() => buyConsumable(def)}>
                                Купить
                              </Btn>
                            </div>
                          </Panel>
                        );
                      })}
                    </div>
                  </div>
                )}

                {shopSection === "reagents" && (
                  <div>
                    <div className="mb-3 border-b border-line pb-2">
                      <span className="sc text-verd">Отдельный отдел лавки</span>
                      <p className="text-[0.8rem] text-mute">
                        Реагенты покупаются отдельно от припасов и живут в рюкзаке меж зельями — варка тратит их по спискам.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {shopReagents.map((def) => {
                        const have = player.bag[def.id] ?? 0;
                        const can = player.gold >= (def.price ?? 0);
                        const cat = def.reagentCat ?? "plant";
                        const catLabel =
                          cat === "mineral" ? "минерал" : cat === "cloth" ? "ткань" : cat === "monster" ? "часть твари" : "растение";
                        return (
                          <Panel key={def.id} className="flex flex-col p-4">
                            <div className="flex items-start gap-3">
                              <ItemArt id={def.id} name={def.name} size={56} />
                              <div className="min-w-0 flex-1">
                                <h4 className="font-display text-[1rem] uppercase leading-tight tracking-[0.08em] text-flamehi">
                                  {def.name}
                                </h4>
                                <div className="mt-1 flex flex-wrap justify-end gap-1">
                                  <Tag tone="verd">{catLabel}</Tag>
                                </div>
                              </div>
                            </div>
                            <p className="mt-2 flex-1 text-[0.85rem] italic leading-snug text-mute">{def.desc}</p>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <span className="font-mono text-sm tab text-flamehi">
                                {def.price} зол.{have > 0 && <span className="ml-2 text-mute">в сумке: {have}</span>}
                              </span>
                              <Btn tone={can ? "flame" : "ghost"} disabled={!can} onClick={() => buyConsumable(def)}>
                                Купить
                              </Btn>
                            </div>
                          </Panel>
                        );
                      })}
                    </div>
                  </div>
                )}

                {shopSection === "recipes" && (
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-2">
                      {RECIPE_GROUPS.map((g) => (
                        <Btn key={g.id} tone={recipeGroup === g.id ? "flame" : "ghost"} onClick={() => setRecipeGroup(g.id)}>
                          {g.label}
                        </Btn>
                      ))}
                      <span className="ml-auto text-xs text-mute">Наведи на лист — увидишь состав</span>
                    </div>
                    <div className="divide-y divide-line border-y border-line">
                      {groupedRecipes.map((r) => {
                        const known = player.knownRecipes.includes(r.id);
                        const price = recipePrice(r);
                        return (
                          <div
                            key={r.id}
                            className="flex flex-wrap items-center justify-between gap-4 py-3.5"
                            onMouseEnter={() => setInfoTip({ kind: "recipe", id: r.id })}
                            onMouseLeave={() => setInfoTip(null)}
                            onFocus={() => setInfoTip({ kind: "recipe", id: r.id })}
                            onBlur={() => setInfoTip(null)}
                            tabIndex={0}
                          >
                            <div>
                              <span className="sc text-flamedim">Лист {r.id.slice(1)} · рецепт</span>
                              <h4 className="cursor-help font-display text-lg uppercase tracking-[0.08em] text-flamehi underline decoration-dotted underline-offset-2">
                                {ITEMS[r.out].name}
                              </h4>
                              <p className="text-xs text-mute">
                                {known ? r.need.map((id) => ITEMS[id].name).join(" + ") : "Состав откроется после покупки"}
                                {" · "}ИНТ {r.intReq}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm text-flame">{price} зол.</span>
                              {known ? (
                                <Tag tone="verd">изучен навсегда</Tag>
                              ) : (
                                <Btn tone="flame" disabled={player.gold < price} onClick={() => buyRecipe(r)}>
                                  Купить рецепт
                                </Btn>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "brew" && (
              <div>
                <p className="dropcap mb-4 max-w-2xl text-[0.92rem] leading-relaxed text-parch/85">
                  Рецепты нельзя угадать: сперва купи лист у торговца. Изученные рецепты остаются с тобой.
                  При варке есть {Math.round(BREW_FAILURE_CHANCE * 100)}% шанс неудачи — ингредиенты сгорят,
                  даже если ничего не выйдет.
                </p>
                <div className="grid gap-3 lg:grid-cols-2">
                  {RECIPES.map((r, index) => {
                    if (!player.knownRecipes.includes(r.id)) {
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-3 border-b border-line bg-black/25 px-3 py-3">
                          <div>
                            <span className="sc text-flamedim">Лист {index + 1}</span>
                            <h4 className="font-display text-base uppercase tracking-[0.1em] text-mute">
                              Неизвестный рецепт
                            </h4>
                            <p className="text-xs text-mute">Состав не раскрыт. Купи рецепт в магазине.</p>
                          </div>
                          <Btn tone="ghost" onClick={() => { setTab("shop"); setShopSection("recipes"); }}>
                            К рецептам
                          </Btn>
                        </div>
                      );
                    }
                    const out = ITEMS[r.out];
                    const amount = r.count + (player.passives.includes("brewer") ? 1 : 0);
                    const intOk = player.stats.int >= r.intReq;
                    const enough = hasIngredients(player.bag, r.need);
                    const needed = [...new Set(r.need)].map((id) => ({
                      id,
                      count: r.need.filter((entry) => entry === id).length,
                    }));
                    return (
                      <Panel
                        key={r.id}
                        className="p-4"
                        title={out.name}
                        right={<span className="font-mono text-xs tab text-verd">×{amount}</span>}
                      >
                        <p className="text-[0.85rem] italic leading-snug text-mute">{out.desc}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {needed.map(({ id, count }) => {
                            const have = player.bag[id] ?? 0;
                            return (
                              <Tag key={id} tone={have >= count ? "verd" : "rubric"}>
                                {ITEMS[id].name}: {have}/{count}
                              </Tag>
                            );
                          })}
                        </div>
                        <p className="mt-2 font-mono text-[0.68rem] text-rubric">
                          Успех 80% · неудача 20% · реагенты тратятся всегда
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className={`font-mono text-[0.72rem] ${intOk ? "text-mute" : "text-rubric"}`}>
                            требуется ИНТ {r.intReq}
                            {!intOk && " — не хватает"}
                          </span>
                          <Btn
                            tone={intOk && enough ? "verd" : "ghost"}
                            disabled={!intOk || !enough}
                            onClick={() => brew(r.id)}
                          >
                            Создать
                          </Btn>
                        </div>
                      </Panel>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "bestiary" && <Bestiary />}

            {tab === "guide" && (
              <Guide
                onOpenShop={() => setTab("shop")}
                onOpenArmory={() => setTab("armory")}
                onOpenBestiary={() => setTab("bestiary")}
              />
            )}
          </div>

        </div>
      </div>

      {infoTip && (
        <div className="pointer-events-none fixed bottom-20 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] border border-flamedim bg-slab p-3 shadow-[0_20px_60px_-15px_#000]">
          {infoTip.kind === "item" ? (
            (() => {
              const def = ITEMS[infoTip.id];
              const info = effectSummary(def);
              return (
                <>
                  <div className="flex items-start gap-2">
                    <ItemArt id={def.id} name={def.name} size={44} />
                    <div>
                      <div className="font-display text-[0.95rem] uppercase tracking-[0.08em] text-flamehi">
                        {def.name}
                      </div>
                      <div className="font-mono text-[0.62rem] text-mute">
                        {def.kind === "scroll" ? "свиток" : def.kind === "throwable" ? "расходник" : "зелье"}
                        {def.use?.intReq ? ` · требуется ИНТ ${def.use.intReq}` : ""}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[0.82rem] leading-snug text-parch/90">{info.what}</p>
                  <p className="mt-1 text-[0.72rem] italic leading-snug text-flamedim">{info.when}</p>
                  <p className="mt-1 text-[0.72rem] italic text-mute">{def.desc}</p>
                </>
              );
            })()
          ) : (
            (() => {
              const r = RECIPES.find((x) => x.id === infoTip.id)!;
              const out = ITEMS[r.out];
              return (
                <>
                  <div className="font-display text-[0.95rem] uppercase tracking-[0.08em] text-flamehi">
                    Рецепт: {out.name}
                  </div>
                  <p className="mt-1 text-[0.78rem] italic text-mute">{out.desc}</p>
                  <div className="mt-2 border-t border-line/70 pt-2">
                    <div className="sc text-flamedim">Нужные реагенты</div>
                    <ul className="mt-1 space-y-1 text-[0.78rem]">
                      {(() => {
                        const counts: Record<string, number> = {};
                        r.need.forEach((id) => (counts[id] = (counts[id] ?? 0) + 1));
                        return Object.entries(counts).map(([id, count]) => (
                          <li key={id} className="flex items-center justify-between gap-2">
                            <span>{ITEMS[id]?.name ?? id}</span>
                            <span className="font-mono tab text-verd">
                              есть {player.bag[id] ?? 0} / нужно {count}
                            </span>
                          </li>
                        ));
                      })()}
                    </ul>
                    <p className="mt-2 font-mono text-[0.7rem] text-mute">
                      требуется ИНТ {r.intReq} · цена рецепта {recipePrice(r)} зол. · 20% неудачи при варке
                    </p>
                  </div>
                </>
              );
            })()
          )}
        </div>
      )}

      {/* Полный разбор снаряжения при наведении */}
      {gearHover && <GearNote item={gearHover} player={player} />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
          <div className="rise border border-flamedim bg-slab px-4 py-2 font-display text-sm uppercase tracking-[0.14em] text-flamehi shadow-[0_20px_50px_-20px_#000]">
            {toast}
          </div>
        </div>
      )}

      {pick && (
        <Modal
          title="Выбор пассивной способности"
          sub={`${STAT_META[pick.stat].name} достигла ${pick.tier} — выберите 1 способность из 2`}
          actions={<span className="font-mono text-[0.7rem] text-mute">Решение определяет ветку развития</span>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {PASSIVES[pick.stat][String(pick.tier) as "5" | "10"].map((o) => (
              <button
                key={o.id}
                onClick={() => choosePassive(o.id)}
                className="group border border-line bg-slab2 p-3 text-left transition-all hover:border-flame hover:bg-flame/5"
              >
                <div className="font-display text-[1rem] uppercase tracking-[0.1em] text-flamehi group-hover:text-flame">
                  {o.name}
                </div>
                <div className="mt-1 font-mono text-[0.62rem] text-flamedim">
                  {pick.stat.toUpperCase()} · рубеж {pick.tier}
                </div>
                <p className="mt-2 text-[0.86rem] leading-snug text-parch/85">{o.desc}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
