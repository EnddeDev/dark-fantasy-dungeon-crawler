import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFitInViewport } from "./useFitInViewport";
import { createPortal } from "react-dom";
import {
  ArrowDownUp,
  BookOpen,
  Brain,
  DoorOpen,
  EyeOff,
  Gem,
  PackageSearch,
  Search,
  Shield,
  Sparkles,
  ShoppingBag,
  Sword,
  Users,
  X,
} from "lucide-react";
import {
  EPIC_SKILLS,
  BREW_FAILURE_CHANCE,
  consumableIntReq,
  consumableScaleLabel,
  canBuySupply,
  supplySellPrice,
  slotsForItem,
  ITEMS,
  LEGENDARY_PASSIVES,
  MAX_LEVEL,
  ARCHETYPES,
  ARCHETYPE_ORDER,
  RARITY_META,
  RARE_AFFIXES,
  RECIPES,
  STAT_META,
  STAT_ORDER,
  gearBuyPrice,
  hasIngredients,
  scaledGearStats,
  statPointCost,
  xpForNextLevel,
  type ItemDef,
  type Recipe,
} from "../game/content";
import type { LobbyController } from "../controllers/LobbyController";
import { recipePrice } from "../model/pricing";
import { damageTypeName } from "../game/damageTypes";
import { IMMUNITY_NAMES } from "../game/statusEffects";
import { SLOT_META, SLOT_ORDER } from "../game/types";
import type { RarityTier, Slot } from "../game/types";
import { derived } from "../game/battle";
import { GEAR_BASES, identifyAllPlan } from "../game/content";
import { GEAR_EFFECTS, GEAR_PASSIVES, effectDetail, type GearEffectId } from "../game/gearEffects";
import type { GearItem, Player, StatKey } from "../game/types";
import type { ArchetypeId } from "../game/archetypes";
import { canChooseStatMilestone, chosenStatMilestone, statMilestoneOptions, type StatMilestoneTier } from "../game/statMilestones";
import { SHOP_MAX_LEVEL, shopRarityTable, shopUpgradeCost, shopWearTable } from "../game/world";
import {
  reagentCategoryOf,
  shopReagentList,
  shopSupplyList,
  slotFilterOf,
  supplyLevelOptions,
  type ReagentFilter,
  type SlotFilter,
  type GearClassFilter,
  shopGearMatches,
  type SupplyLevelFilter,
} from "../game/shopFilters";
import { forgeFailChance, forgeOptions, forgeReagentPlan, type ForgeUpgradeKind } from "../game/forge";
import { RITUAL_COSTS, RITUAL_INK_ID, RITUAL_MIN_TRUST, ritualCandidates, ritualEligible, ritualUnlocked, stripReagentCount, type RitualReplaceKind } from "../game/ritual";
import { statResetCost, totalStatPoints } from "../game/progression";
import { WEAR_RANGE } from "../game/types";
import { Guide } from "./Guide";
import { Bestiary } from "./Bestiary";
import { Updates } from "./Updates";
import { LobbyNav, LobbyTopBar, type LobbyAccount } from "./LobbyChrome";
import { ItemArt } from "./ItemArt";
import { GearNote } from "./GearNote";
import { GearCard } from "./GearCard";
import { QuestsTab } from "./Quests";
import { availableQuestCount, couponPreview, logOf, mercenaryPrice, readyQuestCount, recipeMinTrust, stationRecipeList, trustOf } from "../game/quests";
import type { CraftStation } from "../game/content";
import { TRUST_MAX, type QuestGiverId } from "../game/types";
import { Btn, Meter, Modal, Panel, Pips, Tag } from "./ui";
import { PouchSlots } from "./PouchSlots";
import { SkillsPanel } from "./SkillsPanel";


type Tab = "train" | "armory" | "dungeon" | "shop" | "quests" | "about";
/** Разделы «О игре»: бестиарий, как играть, обновления. */
type AboutSection = "bestiary" | "guide" | "updates";
const ABOUT_SECTIONS: { id: AboutSection; label: string }[] = [
  { id: "bestiary", label: "Бестиарий" },
  { id: "guide", label: "Как играть" },
  { id: "updates", label: "Обновления" },
];
export type ShopSection = "equipment" | "supplies" | "reagents";
type SupplyGroup = "potion" | "throwable" | "scroll" | "special";
/** Всплывающая подсказка о припасе / реагенте / рецепте. */
type InfoTip = { kind: "item" | "recipe"; id: string } | null;

const SUPPLY_GROUPS: { id: SupplyGroup; label: string }[] = [
  { id: "potion", label: "Зелья" },
  { id: "throwable", label: "Расходники" },
  { id: "scroll", label: "Свитки" },
  { id: "special", label: "Спец. предметы" },
];

/**
 * Плитка «реагенты» в кузнице: при наведении или фокусе показывает,
 * из каких реагентов и в каких долях складывается набор.
 * Подсказка рисуется порталом, чтобы её не срезал прокручиваемый список.
 */
function ReagentNeedTag({
  total,
  required,
  parts,
  bag,
  tone,
  scrap,
  forbidScrap,
}: {
  total: number;
  required: number;
  parts: { id: string; count: number }[];
  bag: Record<string, number>;
  tone: "mute" | "verd" | "rubric" | "flame";
  scrap: number;
  forbidScrap: boolean;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  useFitInViewport(tipRef, pos !== null);
  const full = required > 0 && total >= required;
  const open = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ x: rect.left, y: rect.bottom + 6 });
  };
  const close = () => setPos(null);
  const width = 288;
  const left = pos ? Math.max(8, Math.min(pos.x, (typeof window === "undefined" ? 1024 : window.innerWidth) - width - 8)) : 0;
  return (
    <span
      ref={ref}
      className="inline-block cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      tabIndex={0}
    >
      <Tag tone={tone}>
        реагенты {total}/{required}
        {scrap > 0 ? ` (металлолом ${scrap})` : forbidScrap ? " (без металлолома)" : ""}
      </Tag>
      {pos &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="pointer-events-none fixed z-[60] border border-line bg-black/95 p-2 text-left shadow-[0_10px_30px_rgba(0,0,0,0.8)]"
            style={{ left, top: pos.y, width }}
          >
            <div className="font-display text-[0.9rem] uppercase tracking-[0.06em] text-flamehi">
              Состав набора · {required}
            </div>
            <div className="mt-1 space-y-0.5 font-mono text-[0.8rem]">
              {parts.map((part) => {
                const have = bag[part.id] ?? 0;
                const enough = have >= part.count;
                return (
                  <div key={part.id} className="flex items-baseline justify-between gap-2">
                    <span className={enough ? "text-verd" : "text-parch/90"}>
                      {ITEMS[part.id]?.name ?? part.id} × {part.count}
                    </span>
                    <span className={enough ? "text-verd" : "text-rubric"}>есть {have}</span>
                  </div>
                );
              })}
            </div>
            {!full && (
              <div className="mt-1 font-mono text-[0.76rem] text-mute">
                Не хватает — набор добьётся другими реагентами из сумки.
              </div>
            )}
            <div className="mt-1 font-mono text-[0.76rem] text-mute">
              Пергамент, магические чернила и фляга в горн не идут.
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}

function groupOfKind(kind: string): SupplyGroup {
  return kind === "scroll" ? "scroll" : kind === "throwable" ? "throwable" : kind === "special" ? "special" : "potion";
}

function intReqLabel(def: ItemDef, discount: number): string {
  const req = consumableIntReq(def, discount);
  return req > 0 ? ` · требуется ИНТ ${req}` : "";
}

/** Человекочитаемое описание действия предмета. */
function effectSummary(def: ItemDef): { what: string; when: string } {
  const u = def.use;
  if (!u) return { what: def.desc, when: "не применяется" };
  const formula = consumableScaleLabel(def);
  const dmg = formula || String(u.power ?? 0);
  switch (u.type) {
    case "heal":
      return {
        what: `Восстанавливает ${u.power ?? 0} здоровья.`,
        when: "Мгновенно. Работает в коридоре и в бою.",
      };
    case "damage":
      return {
        what: `Наносит врагу ${dmg} урона.`,
        when: `Мгновенно. ${u.vs ? `Против существ типа «${u.vs}» урон вдвое.` : "Только в бою."}`,
      };
    case "cleanse":
      return {
        what: "Снимает раны, проклятие и яд, возвращает +8 здоровья.",
        when: "Мгновенно. Работает в коридоре и в бою.",
      };
    case "throw":
      return { what: `Наносит ${dmg} физического урона.`, when: "Мгновенно. Только в бою." };
    case "poison":
      return {
        what: `Наносит ${dmg} урона и отравляет живую цель.`,
        when: `Яд действует ${u.rounds} раунда. Нежить и конструкты невосприимчивы.`,
      };
    case "smoke":
      return {
        what: "Скрывает тебя за дымовой завесой: следующие атаки врага пройдут мимо.",
        when: `Действует ${u.rounds} атаки врага. Это не побег.`,
      };
    case "explosion":
      return {
        what: `Наносит ${dmg} урона, игнорируя броню.`,
        when: "Мгновенно. Только в бою.",
      };
    case "fear":
      return {
        what: "Заставляет врага автоматически держать защиту в свои ходы.",
        when: `Действует ${u.rounds} хода. На нежить и конструкты не действует.`,
      };
    case "rage":
      return {
        what: "+10% урона за каждые 10% недостающего ОЗ.",
        when: `Действует ${u.rounds} раундов.`,
      };
    case "chill":
      return {
        what: `Наносит ${dmg} урона и обморожает врага.`,
        when: `Лечение врага −50% и периодический урон на ${u.rounds} раунда.`,
      };
    case "sunder_damage":
      return {
        what: `Наносит ${dmg} урона сквозь броню и ломает её.`,
        when: "Мгновенно. Броня врага −2 до конца боя.",
      };
    case "flee":
      return {
        what: "Позволяет уйти из боя.",
        when: u.fleeRate === 0 ? "Без потери добычи." : `Потеря до ${Math.round((u.fleeRate ?? 0.5) * 100)}% добычи.`,
      };
    case "acid":
      return {
        what: `Наносит ${dmg} урона сквозь броню и разъедает её на −3.`,
        when: "Мгновенно. Только в бою.",
      };
    case "haste":
      return { what: "+1 ход в каждом раунде.", when: `Действует ${u.rounds} раунда.` };
    case "stone":
      return { what: "Входящий урон снижен на 30%.", when: `Действует ${u.rounds} раунда.` };
    case "terror":
      return { what: "Враг вынужден держать защиту и не атакует.", when: `Действует ${u.rounds} хода.` };
    case "stun_enemy":
      return { what: "Враг теряет ходы в следующем раунде.", when: `Отнимает ${u.rounds} хода. Интеллект не нужен.` };
    case "special_kit":
      return { what: "Позволяет обезвредить ловушку; шанс растёт от Интеллекта.", when: "Тратится при попытке в любом случае." };
    case "special_lockpick":
      return { what: "Шанс открыть запертую дверь без ключа; зависит от Ловкости.", when: "Тратится при попытке в любом случае." };
    case "special_map":
      return { what: "Показывает сундуки, босса и события на карте этажа.", when: "Используется на карте. Действует до конца этажа." };
    case "special_water":
      return { what: "Снимает горение на карте в Огненных недрах.", when: "Используется на карте, когда есть горение." };
    case "special_torch":
      return { what: "+1 к видимости; в Тёмном подземелье снимает штраф мрака.", when: `Действует ${u.rounds ?? 5} ходов по карте.` };
    case "oil":
      return {
        what: `Смазывает оружие: удар накладывает ${u.oil ? damageTypeName(u.oil) : "урон"} на 3 раунда.`,
        when: "Тратит ход. Действует на ближайший раунд; только в бою.",
      };
    case "immunity":
      return {
        what: u.effect ? `Три хода эффект «${IMMUNITY_NAMES[u.effect]}» на тебя не накладывается.` : "Иммунитет к эффекту.",
        when: "Тратит ход. Действует в бою, срок 3 хода.",
      };
    default:
      return { what: def.desc, when: "Мгновенно." };
  }
}



type GearSort = "recent" | "price" | "damage" | "rarity";
type RarityFilter = "all" | "unknown" | RarityTier;

const TAB_ICONS = {
  train: Brain,
  armory: Sword,
  dungeon: DoorOpen,
  shop: ShoppingBag,
  quests: Users,
  about: BookOpen,
} as const;

const RARITY_RANK: Record<RarityTier, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

const TABS: { id: Tab; label: string; badge?: (p: Player) => number; alert?: (p: Player) => number }[] = [
  { id: "train", label: "Развитие", badge: (p) => p.statPoints },
  {
    id: "armory",
    label: "Арсенал",
    badge: (p) => p.armory.filter((g) => !g.identified).length,
  },
  { id: "dungeon", label: "Подземелья" },
  { id: "shop", label: "Магазин" },
  { id: "quests", label: "Жители", badge: (p) => readyQuestCount(p), alert: (p) => availableQuestCount(p) },
  { id: "about", label: "О игре" },
];

export function Lobby({
  player,
  controller,
  shopStock,
  onStart,
  onSetPouch,
  onRestart,
  best,
  unlockedFloor,
  initialTab = "train",
  initialShopSection = "equipment",
  account,
  leftPanel,
}: {
  player: Player;
  controller: LobbyController;
  shopStock: GearItem[];
  onStart: (floor: number) => void;
  onSetPouch?: (index: number, id: string | null) => string | null;
  /** Полный сброс прогресса — кнопка «Начать заново». */
  onRestart: () => void;
  best: number;
  unlockedFloor: number;
  /** Раздел, открываемый сразу. «guide» — «О игре» с разделом «Как играть». */
  initialTab?: Tab | "guide";
  /** Раздел лавки, открываемый сразу (для ссылок и проверок). */
  initialShopSection?: ShopSection;
  /** Кнопка входа в верхней панели. */
  account?: LobbyAccount;
  /** Левая панель героя (слева от выбранного раздела). */
  leftPanel?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(initialTab === "guide" ? "about" : initialTab);
  const [aboutSection, setAboutSection] = useState<AboutSection>("guide");
  const [shopSection, setShopSection] = useState<ShopSection>(initialShopSection);
  const [supplyGroup, setSupplyGroup] = useState<SupplyGroup>("potion");
  /* Сумка арсенала: припасы и реагенты в двух вкладках одной таблицы. */
  const [bagTab, setBagTab] = useState<"supplies" | "reagents">("supplies");
  /* Алхимик и мастер: вкладки «Рецепты» (покупка листов) и «Создание» (варка). */
  const [craftTab, setCraftTab] = useState<"recipes" | "brew">("recipes");
  /* Снаряжение наёмника открывается в том же окне подробностей, что и магазин. */
  const [mercDetail, setMercDetail] = useState<GearItem | null>(null);
  /* «Начать заново»: подтверждение полного сброса прогресса. */
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [infoTip, setInfoTip] = useState<InfoTip>(null);
  const [selectedFloor, setSelectedFloor] = useState<number>(unlockedFloor);
  const [pickArchetype, setPickArchetype] = useState(false);
  const [pick, setPick] = useState<{ stat: StatKey; tier: StatMilestoneTier } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [purchasedUids, setPurchasedUids] = useState<Record<string, boolean>>({});
  const [gearQuery, setGearQuery] = useState("");
  const [gearSlot, setGearSlot] = useState<SlotFilter>("all");
  const [gearRarity, setGearRarity] = useState<RarityFilter>("all");
  const [gearSort, setGearSort] = useState<GearSort>("recent");
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  /** Подробности открываются кнопкой; храним UID, чтобы видеть результат исследования. */
  const [gearDetail, setGearDetail] = useState<{ uid: string; inShop: boolean } | null>(null);
  const [chosenSlot, setChosenSlot] = useState<Slot | null>(null);
  const [supplyLevelFilter, setSupplyLevelFilter] = useState<SupplyLevelFilter>(0);
  const [reagentFilter, setReagentFilter] = useState<ReagentFilter>("all");
  /* Тип брони фильтрует только прилавок магазина. */
  const [shopGearClass, setShopGearClass] = useState<GearClassFilter>("all");
  const [forgeUid, setForgeUid] = useState<string | null>(null);
  const [forgeConfirm, setForgeConfirm] = useState<{ uid: string; kind: ForgeUpgradeKind } | null>(null);
  const [forgeUseReagents, setForgeUseReagents] = useState(true);
  const [ritualUid, setRitualUid] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  const d = derived(player);
  const say = (t: string | null) => {
    if (!t) return;
    setToast(t);
    window.setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 3200);
  };

  /* Команды лобби выполняет Controller; View только показывает результат. */
  const upgradeStat = (k: StatKey) => {
    const res = controller.upgradeStat(k);
    if (!res) return;
    if (res.milestone) setPick(res.milestone);
    else say(res.message);
  };

  const chooseArchetype = (id: ArchetypeId) => {
    say(controller.chooseArchetype(id));
    setPickArchetype(false);
  };

  const pickStatMilestone = (id: string) => {
    if (!pick) return;
    say(controller.pickStatMilestone(pick.stat, pick.tier, id));
    setPick(null);
  };

  const buyConsumable = (def: ItemDef) => say(controller.buyConsumable(def));
  const sellSupply = (def: ItemDef) => say(controller.sellSupply(def));

  const confirmResetStats = () => {
    const msg = controller.resetStats();
    if (!msg) return;
    setResetConfirm(false);
    setPick(null);
    say(msg);
  };

  /* Если Интеллект позволяет — предметы в арсенале исследуются сами.
     Скидка на исследование приходит от «Тайноведа» и легендарной крови,
     поэтому экипировка и пассивки тоже в зависимостях. */
  useEffect(() => {
    say(controller.autoIdentify());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.armory, player.stats.int, player.passives, player.equip, controller]);

  const buyGear = (item: GearItem) => {
    const msg = controller.buyGear(item);
    if (!msg) return;
    setPurchasedUids((prev) => ({ ...prev, [item.uid]: true }));
    say(msg);
  };

  const identifyGear = (uid: string, mode: "int" | "gold") => say(controller.identifyGear(uid, mode));
  const identifyAllGear = () => say(controller.identifyAllGear());
  /* План «Исследовать все» пересчитывается при каждом рендере: это дёшево и всегда свежо. */
  const researchPlan = identifyAllPlan(player, derived(player).intDiscount);
  const canResearchAll = player.gold >= researchPlan.gold;
  const equipGear = (item: GearItem, slot: Slot, grip?: "one" | "two") => say(controller.equipGear(item, slot, grip));
  const takeOff = (slot: Slot) => say(controller.takeOff(slot));
  const sellGear = (item: GearItem) => say(controller.sellGear(item));
  const buyRecipe = (recipe: Recipe) => say(controller.buyRecipe(recipe));
  const brew = (recipeId: string) => say(controller.brew(recipeId));

  const shopSupplies = shopSupplyList(
    Object.values(ITEMS).filter(
      (i) => (i.price ?? 0) > 0 && i.kind !== "reagent" && groupOfKind(i.kind) === supplyGroup,
    ),
    supplyLevelFilter,
  );
  /* Уровни припасов, которые есть в лавке: по ним строятся кнопки фильтра. */
  const supplyLevels = supplyLevelOptions(
    Object.values(ITEMS).filter((i) => (i.price ?? 0) > 0 && i.kind !== "reagent"),
  );
  const shopReagents = shopReagentList(
    Object.values(ITEMS).filter((i) => i.kind === "reagent" && (i.price ?? 0) > 0),
    reagentFilter,
    /* Реагенты в магазине всегда по уровню, потом по цене. */
    "level",
  );
  const wearTable = shopWearTable(player.shopLevel);
  const rarityTable = shopRarityTable(player.shopLevel);
  const upgradeCost = player.shopLevel >= SHOP_MAX_LEVEL ? 0 : shopUpgradeCost(player.shopLevel);
  const xpNeed = xpForNextLevel(player.level);

  /* В магазине сортировки нет: порядок прилавка. В арсенале сортировка из выбора игрока. */
  const filterGear = (items: GearItem[], mode: "shop" | "armory" = "armory") => {
    const sort: GearSort = mode === "shop" ? "recent" : gearSort;
    const q = gearQuery.trim().toLowerCase();
    const filtered = items.filter((g) => {
      const st = scaledGearStats(g);
      if (!shopGearMatches(g, gearSlot, mode === "shop" ? shopGearClass : "all")) return false;
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
        g.identified && g.passive ? GEAR_PASSIVES[g.passive].name : "",
        g.identified && g.rareAffix ? RARE_AFFIXES[g.rareAffix].name : "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
    const sorted = [...filtered];
    if (sort === "price") sorted.sort((a, b) => gearBuyPrice(a) - gearBuyPrice(b));
    if (sort === "damage") {
      const dmg = (g: GearItem) => {
        const r = scaledGearStats(g).dmg;
        return r ? (r[0] + r[1]) / 2 : -1;
      };
      sorted.sort((a, b) => dmg(b) - dmg(a));
    }
    if (sort === "rarity") {
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
    setChosenSlot(null);
  };

  const renderGearFilters = (mode: "shop" | "armory") => (
    <div className="space-y-2.5 border border-line bg-black/30 p-2.5">
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
        <div className="flex flex-wrap gap-1" role="group" aria-label="Слот снаряжения">
          {([
            ["all", "Все", PackageSearch],
            ["mainHand", "Правая рука", Sword],
            ["offHand", "Левая рука", Shield],
            ["head", "Шлем", null],
            ["body", "Тело", null],
            ["wrists", "Наручи", null],
            ["feet", "Ботинки", null],
            ["rings", "Кольца", Gem],
            ["amulet", "Оберег", Sparkles],
          ] as [SlotFilter, string, typeof Gem | null][]).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={gearSlot === value}
              onClick={() => { setGearSlot(value); setChosenSlot(null); }}
              className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[0.92rem] transition-colors ${
                gearSlot === value ? "border-flamedim bg-flame/15 text-flamehi" : "border-line text-mute hover:text-parch"
              }`}
            >
              {Icon && <Icon size={13} aria-hidden />}
              {label}
            </button>
          ))}
        </div>
        {mode === "shop" && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Тип брони">
            {([
              ["all", "Любой тип"],
              ["light", "Лёгкий"],
              ["medium", "Средний"],
              ["heavy", "Тяжёлый"],
            ] as [GearClassFilter, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={shopGearClass === value}
                onClick={() => setShopGearClass(value)}
                className={`border px-2.5 py-1.5 font-mono text-[0.92rem] transition-colors ${
                  shopGearClass === value ? "border-flamedim bg-flame/15 text-flamehi" : "border-line text-mute hover:text-parch"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <select
          value={gearRarity}
          onChange={(e) => setGearRarity(e.target.value as RarityFilter)}
          aria-label="Фильтр редкости"
          className="border border-line bg-soot px-2 py-1.5 font-mono text-[0.92rem] text-parch outline-none focus:border-flamedim"
        >
          <option value="all">Любая редкость</option>
          <option value="unknown">Не исследовано</option>
          <option value="common">Обычное</option>
          <option value="rare">Редкое</option>
          <option value="epic">Эпическое</option>
          <option value="legendary">Легендарное</option>
        </select>
        {mode === "armory" && (
        <label className="flex items-center gap-1.5 border border-line bg-soot px-2 py-1.5 font-mono text-[0.92rem] text-mute">
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
        )}
        <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[0.92rem] text-mute">
          <input type="checkbox" checked={onlyUnknown} onChange={(e) => setOnlyUnknown(e.target.checked)} className="accent-[#e0a33c]" />
          <EyeOff size={13} aria-hidden />
          Только неизвестные
        </label>
      </div>
    </div>
  );

  const wornUids = new Set(SLOT_ORDER.map((slot) => player.equip[slot]).filter((uid): uid is string => !!uid));
  const inventoryItems = player.armory.filter((item) => !wornUids.has(item.uid));
  const bagEntries = Object.entries(player.bag ?? {}).filter(([, n]) => n > 0);
  const bagSupplies = bagEntries.filter(([id]) => ITEMS[id] && ITEMS[id].kind !== "reagent");
  const bagReagents = bagEntries.filter(([id]) => ITEMS[id]?.kind === "reagent");
  const slotCandidates = chosenSlot ? inventoryItems.filter((item) => slotsForItem(item).includes(chosenSlot)) : inventoryItems;
  const visibleInventory = filterGear(slotCandidates);
  const twoHanded = player.armory.find((item) => item.uid === player.equip.mainHand && GEAR_BASES[item.baseId]?.hands === 2);
  const detailItem = gearDetail
    ? (gearDetail.inShop ? shopStock : player.armory).find((item) => item.uid === gearDetail.uid)
    : null;

  const chooseSlot = (slot: Slot) => {
    setChosenSlot(slot);
    setGearQuery("");
    setGearRarity("all");
    setOnlyUnknown(false);
    setGearSlot(slotFilterOf(slot));
    if (window.matchMedia("(max-width: 1199px)").matches) {
      window.requestAnimationFrame(() => document.getElementById("armory-inventory")?.scrollIntoView({ block: "start" }));
    }
  };

  const renderGearCard = (item: GearItem, mode: "equipped" | "inventory" | "shop", slot?: Slot) => (
    <GearCard
      key={`${mode}-${item.uid}-${slot ?? ""}`}
      item={item}
      player={player}
      mode={mode}
      slot={slot}
      preferredSlot={mode === "inventory" ? chosenSlot ?? undefined : undefined}
      purchased={!!purchasedUids[item.uid]}
      buyPrice={mode === "shop" ? couponPreview(player, gearBuyPrice(item)) : undefined}
      onInspect={() => setGearDetail({ uid: item.uid, inShop: mode === "shop" })}
      onEquip={(target, grip) => equipGear(item, chosenSlot && slotsForItem(item).includes(chosenSlot) ? chosenSlot : target, grip)}
      onUnequip={takeOff}
      onSell={() => sellGear(item)}
      onBuy={() => buyGear(item)}
    />
  );

  /* Рецепты, которые продаёт алхимик или мастер. Открываются по доверию к продавцу. */
  const renderRecipeShop = (station: CraftStation) => {
    const giver: QuestGiverId = station === "workshop" ? "master" : "alchemist";
    const trust = trustOf(player, giver);
    const seller = station === "workshop" ? "Мастер" : "Алхимик";
    return (
      <div className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="sc text-flamedim">Листы с рецептами</span>
          <span className="font-mono text-xs text-mute">Доверие {trust}/{TRUST_MAX}</span>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {stationRecipeList(station).map((r, index) => {
            const known = player.knownRecipes.includes(r.id);
            const need = recipeMinTrust(r);
            if (!known && trust < need) {
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                  <div>
                    <span className="sc text-flamedim">Лист {index + 1}</span>
                    <h4 className="font-display text-base uppercase tracking-[0.1em] text-mute">Неизвестный рецепт</h4>
                    <p className="text-xs text-mute">{seller} покажет его при доверии {need}.</p>
                  </div>
                  <Tag tone="mute">доверие {need}</Tag>
                </div>
              );
            }
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
                  <span className="sc text-flamedim">Лист {index + 1} · рецепт</span>
                  <h4 className="cursor-help font-display text-lg uppercase tracking-[0.08em] text-flamehi underline decoration-dotted underline-offset-2">
                    {ITEMS[r.out].name}
                  </h4>
                  <p className="text-xs text-mute">
                    {known ? r.need.map((id) => ITEMS[id].name).join(" + ") : "Состав откроется после покупки"}
                    {" · "}ИНТ {r.intReq}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-flame">{couponPreview(player, price)} зол.</span>
                  {known ? (
                    <Tag tone="verd">изучен навсегда</Tag>
                  ) : (
                    <Btn tone="flame" disabled={player.gold < couponPreview(player, price)} onClick={() => buyRecipe(r)}>
                      Купить рецепт
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* Алхимик и мастер: переключатель между покупкой рецептов и варкой. */
  const renderCraft = (station: CraftStation) => (
    <div>
      <div role="tablist" aria-label="Рецепты и создание" className="mb-4 grid max-w-md grid-cols-2 gap-2">
        {(
          [
            ["recipes", "Рецепты"],
            ["brew", "Создание"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={craftTab === id}
            onClick={() => setCraftTab(id)}
            className={`border px-4 py-2 font-display text-sm uppercase tracking-[0.1em] transition-colors ${
              craftTab === id ? "border-flame bg-flame/10 text-flamehi" : "border-line bg-black/30 text-mute hover:border-flamedim hover:text-parch"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {craftTab === "recipes" ? renderRecipeShop(station) : renderStation(station)}
    </div>
  );

  /* Варка у алхимика и мастера: список листов и кнопки «Создать». Только обработчики вызывают контроллер. */
  const renderStation = (station: CraftStation) => (
              <div>
                <p className="dropcap mb-4 max-w-2xl text-[1.02rem] leading-relaxed text-parch/85">
                  {station === "alchemy"
                    ? "Алхимия варит зелья и свитки. Рецепты нельзя угадать: сначала купи лист у алхимика во вкладке «Рецепты»."
                    : "Мастерская собирает метательные расходники: кинжалы, бомбы и прахи. Чертежи продаёт мастер во вкладке «Рецепты»."}
                  {" "}При создании есть {Math.round(BREW_FAILURE_CHANCE * 100)}% шанс неудачи — ингредиенты сгорят,
                  даже если ничего не выйдет.
                </p>
                <div className="grid gap-3 lg:grid-cols-2">
                  {stationRecipeList(station).map((r, index) => {
                    if (!player.knownRecipes.includes(r.id)) {
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-3 border-b border-line bg-black/25 px-3 py-3">
                          <div>
                            <span className="sc text-flamedim">Лист {index + 1}</span>
                            <h4 className="font-display text-base uppercase tracking-[0.1em] text-mute">
                              Неизвестный рецепт
                            </h4>
                            <p className="text-xs text-mute">Состав не раскрыт. Купи лист у {station === "workshop" ? "мастера" : "алхимика"} во вкладке «Рецепты».</p>
                          </div>
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
                        <p className="text-[0.97rem] italic leading-snug text-mute">{out.desc}</p>
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
                        <p className="mt-2 font-mono text-[0.84rem] text-rubric">
                          Успех 80% · неудача 20% · реагенты тратятся всегда
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className={`font-mono text-[0.86rem] ${intOk ? "text-mute" : "text-rubric"}`}>
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
  );

  /* Кузница у кузнеца. */
  const renderForge = () => (
              <div>
                <p className="dropcap mb-4 max-w-2xl text-[1.02rem] leading-relaxed text-parch/85">
                  Кузница улучшает качество, изношенность и уровень снаряжения. Попытка стоит золота.
                  С реагентами в горне неудача вещь не ломает — сгорают только золото и реагенты,
                  а чем полнее набор, тем ниже риск. Без реагентов неудача уничтожает предмет.
                </p>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                  <Panel title="Выбери предмет" className="p-4">
                    <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                      {player.armory.length === 0 && <p className="text-sm italic text-mute">Арсенал пуст.</p>}
                      {player.armory.map((g) => {
                        const base = GEAR_BASES[g.baseId];
                        const active = forgeUid === g.uid;
                        return (
                          <button
                            key={g.uid}
                            onClick={() => setForgeUid(g.uid)}
                            className={`flex w-full items-center justify-between gap-2 border px-3 py-2 text-left transition-colors ${active ? "border-flame bg-flame/10" : "border-line bg-slab2 hover:border-flamedim"}`}
                          >
                            <span>
                              <span className="block font-display text-[1.02rem] uppercase tracking-[0.08em] text-flamehi">{base?.name ?? g.baseId}</span>
                              <span className="block font-mono text-[0.82rem] text-mute">
                                ур. {g.level} · {RARITY_META[g.rarity].name} · {WEAR_RANGE[g.wear].label}
                              </span>
                            </span>
                            {Object.values(player.equip).includes(g.uid) && <Tag tone="verd">надето</Tag>}
                          </button>
                        );
                      })}
                    </div>
                  </Panel>
                  <Panel title="Горн" className="p-4">
                    {(() => {
                      const item = player.armory.find((g) => g.uid === forgeUid);
                      if (!item) return <p className="text-sm italic text-mute">Выбери предмет слева, чтобы увидеть улучшения.</p>;
                      const useReagents = forgeUseReagents;
                      return (
                        <div className="space-y-3">
                          <button
                            onClick={() => setForgeUseReagents((v) => !v)}
                            className={`flex w-full items-center justify-between gap-2 border px-3 py-2 text-left text-[0.92rem] transition-colors ${useReagents ? "border-flame bg-flame/10 text-parch" : "border-line bg-black/25 text-mute hover:border-flamedim"}`}
                            aria-pressed={useReagents}
                          >
                            <span>
                              <b className="font-display uppercase tracking-[0.08em]">Класть реагенты в горн</b>
                              <span className="block text-[0.84rem] text-mute">
                                Пергамент, магические чернила и фляги в горн не годятся.
                                Металлолом идёт только на изношенность — на качество и уровень его не кладут.
                              </span>
                            </span>
                            <span className="font-mono text-[0.85rem]">{useReagents ? "да" : "нет"}</span>
                          </button>
                          {forgeOptions(item).map((opt) => {
                            const plan = useReagents
                              ? forgeReagentPlan(player.bag, opt)
                              : { picked: {}, total: 0, scrap: 0 };
                            const fail = forgeFailChance(opt, plan.total);
                            const can = opt.available && player.gold >= opt.cost;
                            const toLabel = opt.kind === "rarity" ? RARITY_META[opt.to as RarityTier]?.name ?? opt.to
                              : opt.kind === "wear" ? WEAR_RANGE[opt.to as keyof typeof WEAR_RANGE]?.label ?? opt.to
                              : `ур. ${opt.to}`;
                            const full = plan.total >= opt.reagentTotal;
                            return (
                              <div key={opt.kind} className="border border-line bg-black/25 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-display text-[1.05rem] uppercase tracking-[0.08em] text-flamehi">{opt.label}</span>
                                  <span className="font-mono text-[0.86rem] text-mute">{opt.from} → {toLabel}</span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[0.84rem]">
                                  <Tag tone="flame">{opt.cost} зол.</Tag>
                                  <Tag tone={fail > 0.4 ? "rubric" : "mute"}>шанс неудачи {Math.round(fail * 100)}%</Tag>
                                  {opt.reagentTotal > 0 && (
                                    <ReagentNeedTag
                                      total={plan.total}
                                      required={opt.reagentTotal}
                                      parts={opt.reagentParts}
                                      bag={player.bag}
                                      tone={full && useReagents ? "verd" : "mute"}
                                      scrap={opt.reagentScrap}
                                      forbidScrap={opt.reagentForbidScrap}
                                    />
                                  )}
                                  {plan.total === 0 && <Tag tone="rubric">неудача уничтожит вещь</Tag>}
                                  {!opt.available && <Tag tone="mute">предел</Tag>}
                                </div>
                                <Btn
                                  className="mt-2"
                                  tone={can ? "flame" : "ghost"}
                                  disabled={!can}
                                  onClick={() => setForgeConfirm({ uid: item.uid, kind: opt.kind })}
                                >
                                  Улучшить
                                </Btn>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </Panel>
                </div>
              </div>
  );

  /* Магический ритуал волшебника: замена, хаос-замена и снятие свойств предмета. Открыт с доверием 3. */
  const renderRitual = () => {
    const trust = trustOf(player, "wizard");
    if (!ritualUnlocked(player)) {
      return <p className="text-sm italic text-mute">Магический ритуал открывается при доверии {RITUAL_MIN_TRUST} (сейчас {trust}).</p>;
    }
    const ink = player.bag[RITUAL_INK_ID] ?? 0;
    const eligible = player.armory.filter(ritualEligible);
    const item = eligible.find((g) => g.uid === ritualUid) ?? null;
    const costOf = (kind: RitualReplaceKind | "strip") => RITUAL_COSTS[kind];
    const affordable = (kind: RitualReplaceKind | "strip") => player.gold >= costOf(kind).gold && ink >= costOf(kind).ink;
    return (
      <div>
        <p className="dropcap mb-4 max-w-2xl text-[1.02rem] leading-relaxed text-parch/85">
          Замена меняет свойство на другое той же характеристики. Хаос замены — на свойство любой характеристики.
          Снятие убирает свойство и отдаёт реагенты по уровню предмета. Выбираешь предмет и свойство, новое — случайное.
        </p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Panel title="Выбери предмет" className="p-4">
            <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {eligible.length === 0 && <p className="text-sm italic text-mute">Нет исследованного снаряжения со свойствами.</p>}
              {eligible.map((g) => {
                const base = GEAR_BASES[g.baseId];
                const active = item?.uid === g.uid;
                return (
                  <button
                    key={g.uid}
                    onClick={() => setRitualUid(g.uid)}
                    className={`flex w-full items-center justify-between gap-2 border px-3 py-2 text-left transition-colors ${active ? "border-flame bg-flame/10" : "border-line bg-slab2 hover:border-flamedim"}`}
                  >
                    <span>
                      <span className="block font-display text-[1.02rem] uppercase tracking-[0.08em] text-flamehi">{base?.name ?? g.baseId}</span>
                      <span className="block font-mono text-[0.82rem] text-mute">ур. {g.level} · свойств: {g.effects.length}</span>
                    </span>
                    {Object.values(player.equip).includes(g.uid) && <Tag tone="verd">надето</Tag>}
                  </button>
                );
              })}
            </div>
          </Panel>
          <Panel title="Свойства" className="p-4">
            {!item && <p className="text-sm italic text-mute">Выбери предмет слева, чтобы увидеть свойства.</p>}
            {item && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 font-mono text-[0.84rem]">
                  <Tag tone="flame">золото {player.gold}</Tag>
                  <Tag tone={ink >= 5 ? "verd" : "mute"}>чернила {ink}</Tag>
                </div>
                {item.effects.map((id: GearEffectId) => {
                  const def = GEAR_EFFECTS[id];
                  const replace = ritualCandidates(item, id, "replace").length > 0;
                  const chaos = ritualCandidates(item, id, "chaos").length > 0;
                  const reagents = stripReagentCount(item.level);
                  return (
                    <div key={id} className="border border-line bg-black/25 p-3">
                      <div className="font-display text-[1.02rem] uppercase tracking-[0.08em] text-flamehi">{def.name}</div>
                      <div className="mt-0.5 text-[0.86rem] text-parch/80">{effectDetail(id, item.level, item.effectRolls?.[id])}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Btn
                          tone={replace && affordable("replace") ? "flame" : "ghost"}
                          disabled={!replace || !affordable("replace")}
                          onClick={() => say(controller.ritualReplace(item.uid, id, "replace"))}
                        >
                          Замена · {RITUAL_COSTS.replace.gold} зол. · {RITUAL_COSTS.replace.ink} чернил
                        </Btn>
                        <Btn
                          tone={chaos && affordable("chaos") ? "flame" : "ghost"}
                          disabled={!chaos || !affordable("chaos")}
                          onClick={() => say(controller.ritualReplace(item.uid, id, "chaos"))}
                        >
                          Хаос замены · {RITUAL_COSTS.chaos.gold} зол. · {RITUAL_COSTS.chaos.ink} чернил
                        </Btn>
                        <Btn
                          tone={affordable("strip") ? "flame" : "ghost"}
                          disabled={!affordable("strip")}
                          onClick={() => say(controller.ritualStrip(item.uid, id))}
                        >
                          Снятие · {RITUAL_COSTS.strip.gold} зол. → {reagents} реаг.
                        </Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    );
  };

  /* Содержимое вкладки «Жители» по NPC: рецепты с варкой, кузница и ритуал волшебника. */
  const npcServices = {
    alchemist: renderCraft("alchemy"),
    master: renderCraft("workshop"),
    smith: renderForge(),
    wizard: renderRitual(),
  };

  const questLog = logOf(player);
  const questCounts = {
    active: questLog.active.length,
    ready: readyQuestCount(player),
    available: availableQuestCount(player),
  };
  const navItems = TABS.map((t) => ({
    id: t.id,
    label: t.label,
    Icon: TAB_ICONS[t.id],
    count: t.badge ? t.badge(player) : 0,
    alert: t.alert ? t.alert(player) > 0 : false,
  }));

  return (
    <div className="relative min-h-screen w-full overflow-x-clip">
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

      <LobbyTopBar quests={questCounts} onOpenQuests={() => setTab("quests")} account={account} />
      <div className="relative mx-auto flex max-w-[1600px] flex-col lg:flex-row lg:items-start">
        {leftPanel}
        <section className="order-2 min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-7">
        <header className="mb-6">
          <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-mute">
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
              рекорд глубины: <span className="text-verd">{best}</span> этаж
            </span>
            <span className="tab">
              доступно ярусов: <span className="text-verd">{unlockedFloor}</span>
            </span>
          </div>
        </header>

        <div className="border border-line bg-slab/95 shadow-[0_40px_100px_-40px_#000] backdrop-blur-[2px]">
          <div className="p-5 sm:p-6">
            {tab === "train" && (
              <div className="max-w-3xl space-y-4">
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
                        За каждый новый уровень даётся <b>+3 очка характеристик</b>.
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

                  <Panel className="p-4" title="Перераспределение характеристик">
                    <p className="text-[0.98rem] leading-snug text-parch/85">
                      Полный сброс до <b className="text-flamehi">1 Сила / 1 Ловкость / 1 Интеллект</b>.
                      Все очки за уровни вернутся свободными; выбранные рубежи сбросятся.
                      Стоимость: <b className="text-flamehi">{statResetCost(player.level)} зол.</b> (100 × уровень персонажа).
                    </p>
                    <Btn
                      className="mt-3"
                      tone={player.gold >= statResetCost(player.level) ? "danger" : "ghost"}
                      disabled={player.gold < statResetCost(player.level)}
                      onClick={() => setResetConfirm(true)}
                    >
                      Сбросить характеристики · {statResetCost(player.level)} зол.
                    </Btn>
                  </Panel>

                  <Panel className="p-4" title="Архетип" right={<span className="font-mono text-sm tab text-flame">{player.archetype ? ARCHETYPES[player.archetype].name : "не выбран"}</span>}>
                    <p className="text-[1rem] leading-relaxed text-parch/85">
                      На <b>5 уровне</b> выбери основной архетип. Усиления архетипов открываются на <b>рубежах характеристик 5 и 10</b>:
                      там всегда два варианта — по одному на каждый архетип этой характеристики. Можно усилить свой путь или взять дополнительный для соседнего.
                    </p>
                    {player.archetype ? (
                      <p className="mt-3 border border-flamedim/60 bg-flame/10 px-3 py-2 text-[0.98rem] leading-snug text-parch/85">
                        Основной путь: <b className="text-flamehi">{ARCHETYPES[player.archetype].name}</b>. {ARCHETYPES[player.archetype].desc}
                      </p>
                    ) : (
                      <div className="mt-3">
                        <Btn tone={player.level >= 5 ? "flame" : "ghost"} disabled={player.level < 5} onClick={() => setPickArchetype(true)}>
                          {player.level >= 5 ? "Выбрать архетип" : `Откроется на 5 уровне (${player.level}/5)`}
                        </Btn>
                      </div>
                    )}
                  </Panel>

                  {player.archetype && (
                    <SkillsPanel player={player} onRank={(branch, rank) => say(controller.changeSkillRank(branch, rank))} />
                  )}

                  {STAT_ORDER.map((k) => {
                    const v = player.stats[k];
                    const cost = statPointCost(k, v);
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
                            <span className="font-mono text-[0.84rem] text-mute">{STAT_META[k].gain}</span>
                          </div>
                          <Btn tone={can ? "flame" : "ghost"} disabled={!can} onClick={() => upgradeStat(k)}>
                            {v >= 10 ? "предел (10)" : `+1 (${cost} ${cost === 1 ? "очко" : "очка"})`}
                          </Btn>
                        </div>
                        <p className="mt-2 text-[1rem] leading-snug text-parch/80">{STAT_META[k].blurb}</p>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {([5, 10] as const).map((tier) => {
                            const chosen = chosenStatMilestone(player, k, tier);
                            const unlocked = v >= tier;
                            const canPick = canChooseStatMilestone(player, k, tier);
                            return (
                              <button
                                key={tier}
                                disabled={!unlocked || !!chosen}
                                onClick={() => setPick({ stat: k, tier })}
                                className={`border px-3 py-2 text-left transition-colors ${
                                  chosen
                                    ? "border-flamedim/70 bg-flame/10"
                                    : canPick
                                      ? "border-flamedim/60 bg-slab2 hover:border-flame"
                                      : "border-line/70 bg-black/20"
                                } disabled:cursor-default`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="sc text-[0.71rem]">рубеж {tier}</span>
                                  <span className="font-mono text-[0.76rem] text-flame">
                                    {chosen ? "выбрано" : unlocked ? "выбрать 1 из 2" : `нужно ${tier}`}
                                  </span>
                                </div>
                                <div className={`mt-1 font-display text-[1rem] uppercase tracking-[0.08em] ${chosen ? "text-flamehi" : unlocked ? "text-parch" : "text-mute"}`}>
                                  {chosen ? chosen.name : unlocked ? "Нажмите для выбора" : "Заперто"}
                                </div>
                                {chosen && (
                                  <div className="mt-1 font-mono text-[0.78rem] text-flamedim">{ARCHETYPES[chosen.archetype].name}</div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </Panel>
                    );
                  })}
              </div>
            )}

            {tab === "armory" && (
              <div className="grid items-start gap-5 min-[1200px]:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.35fr)]">
                <section aria-label="Надето на персонаже" className="min-w-0 border border-line bg-black/20 p-3 min-[1200px]:sticky min-[1200px]:top-4 min-[1200px]:max-h-[calc(100dvh-2rem)] min-[1200px]:overflow-y-auto">
                  <div className="mb-3 flex items-end justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <span className="sc text-flamedim">Экипировка</span>
                      <h3 className="mt-1 font-display text-xl uppercase tracking-[0.08em] text-flamehi">Надето на персонаже</h3>
                    </div>
                    <span className="shrink-0 font-mono text-sm tab text-verd">{wornUids.size}/{SLOT_ORDER.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {SLOT_ORDER.map((slot) => {
                      const item = player.armory.find((entry) => entry.uid === player.equip[slot]);
                      if (item) return renderGearCard(item, "equipped", slot);
                      const occupied = slot === "offHand" && twoHanded;
                      return (
                        <div key={slot} className={`flex min-h-[76px] items-center justify-between gap-3 border border-dashed px-3 py-2.5 ${chosenSlot === slot ? "border-flame bg-flame/5" : "border-line"}`}>
                          <div className="min-w-0">
                            <div className="sc text-[0.84rem] text-flamedim">{SLOT_META[slot].name}</div>
                            <p className="mt-1 text-[0.94rem] leading-snug text-mute">{occupied ? "Занято двуручным оружием" : "Пустая ячейка"}</p>
                          </div>
                          <Btn className="shrink-0 px-2.5 py-2 text-[0.84rem]" onClick={() => chooseSlot(slot)}>
                            {occupied ? "Заменить" : "Выбрать"}
                          </Btn>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[0.92rem] leading-relaxed text-mute">Снятая вещь появится в инвентаре справа. Её эффекты сразу перестанут учитываться в листе персонажа.</p>
                  {onSetPouch && (
                    <div className="mt-4">
                      <PouchSlots player={player} onSet={onSetPouch} />
                    </div>
                  )}
                </section>

                <section id="armory-inventory" aria-label="Инвентарь снаряжения" className="min-w-0 scroll-mt-4 border border-line bg-black/20 p-3">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <span className="sc text-flamedim">Свободные вещи</span>
                      <h3 className="mt-1 font-display text-xl uppercase tracking-[0.08em] text-flamehi">Инвентарь</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-[0.92rem] text-mute">{visibleInventory.length} из {inventoryItems.length} · неизвестно: {inventoryItems.filter((item) => !item.identified).length}</span>
                      {researchPlan.count > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Btn tone={canResearchAll ? "flame" : "ghost"} disabled={!canResearchAll} onClick={identifyAllGear}>
                            Исследовать все · {researchPlan.count}{researchPlan.gold > 0 ? ` · ${researchPlan.gold} зол.` : ""}
                          </Btn>
                          {!canResearchAll && <span className="font-mono text-[0.84rem] text-rubric">не хватает {researchPlan.gold - player.gold} зол.</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  {chosenSlot && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-flamedim/60 bg-flame/5 px-3 py-2 text-[0.94rem]">
                      <span className="text-flamehi">Выбрать предмет: {SLOT_META[chosenSlot].name}</span>
                      <button className="text-mute underline underline-offset-2 hover:text-parch" onClick={() => { setChosenSlot(null); setGearSlot("all"); }}>Показать все</button>
                    </div>
                  )}
                  {renderGearFilters("armory")}
                  <p className="my-3 text-[0.92rem] leading-relaxed text-mute">Приёмы, свойства и исследование — в окне «Подробнее».</p>
                  {visibleInventory.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 min-[1600px]:grid-cols-2">
                      {visibleInventory.map((item) => renderGearCard(item, "inventory"))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 border border-dashed border-line px-4 py-12 text-center">
                      <PackageSearch size={30} className="text-mute" aria-hidden />
                      <p className="text-[1rem] leading-relaxed text-mute">{inventoryItems.length === 0 ? "Все вещи надеты или инвентарь пуст. Новое снаряжение можно найти в подземелье или купить в магазине." : "Подходящих вещей нет. Измените фильтры или загляните в магазин."}</p>
                      {(gearQuery || gearSlot !== "all" || gearRarity !== "all" || onlyUnknown || chosenSlot) && <Btn onClick={resetGearFilters}>Сбросить фильтры</Btn>}
                    </div>
                  )}
                </section>

                {/* В арсенале видно, какие припасы и реагенты лежат в сумке; их можно продать. */}
                <section aria-label="Припасы и реагенты" className="min-w-0 border border-line bg-black/20 p-3 min-[1200px]:col-span-2">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <span className="sc text-flamedim">Сумка</span>
                      <h3 className="mt-1 font-display text-xl uppercase tracking-[0.08em] text-flamehi">Припасы и реагенты</h3>
                    </div>
                    <span className="font-mono text-[0.92rem] text-mute">
                      припасов: {bagSupplies.length} · реагентов: {bagReagents.length}
                    </span>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-2">
                    {([
                      ["supplies", `Припасы · ${bagSupplies.length}`],
                      ["reagents", `Реагенты · ${bagReagents.length}`],
                    ] as ["supplies" | "reagents", string][]).map(([id, label]) => (
                      <Btn key={id} tone={bagTab === id ? "flame" : "ghost"} onClick={() => setBagTab(id)}>
                        {label}
                      </Btn>
                    ))}
                    <span className="ml-auto text-xs text-mute">Продажа идёт по половине цены лавки</span>
                  </div>
                  {(() => {
                    const rows = bagTab === "supplies" ? bagSupplies : bagReagents;
                    const empty = bagTab === "supplies"
                      ? "Припасов нет: зелья, свитки и метательное покупаются в лавке."
                      : "Реагентов нет: они нужны для варки и ковки.";
                    if (rows.length === 0) return <p className="text-sm italic text-mute">{empty}</p>;
                    return (
                      <div className="overflow-x-auto border border-line">
                        <table className="w-full min-w-[420px] border-collapse text-[0.96rem]">
                          <thead>
                            <tr className="bg-black/40 text-left">
                              <th className="px-3 py-2 font-display text-[0.86rem] uppercase tracking-[0.08em] text-flamedim">Название</th>
                              <th className="px-3 py-2 text-right font-display text-[0.86rem] uppercase tracking-[0.08em] text-flamedim">Количество</th>
                              <th className="px-3 py-2 text-right font-display text-[0.86rem] uppercase tracking-[0.08em] text-flamedim">Цена продажи</th>
                              <th className="px-3 py-2 text-right font-display text-[0.86rem] uppercase tracking-[0.08em] text-flamedim">Действие</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(([id, n]) => {
                              const def = ITEMS[id];
                              const price = supplySellPrice(def);
                              return (
                                <tr key={id} className="border-t border-line hover:bg-flame/5">
                                  <td className="px-3 py-2 text-parch">{def?.name ?? id}</td>
                                  <td className="px-3 py-2 text-right font-mono text-flame">×{n}</td>
                                  <td className="px-3 py-2 text-right font-mono text-verd">{price} зол.</td>
                                  <td className="px-3 py-2 text-right">
                                    <Btn
                                      className="px-2.5 py-1.5 text-[0.86rem]"
                                      tone="ghost"
                                      disabled={price <= 0}
                                      onClick={() => def && sellSupply(def)}
                                    >
                                      Продать 1
                                    </Btn>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </section>
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
                      <p className="mt-1 max-w-xl text-[0.92rem] leading-snug text-mute">
                        На прилавке появляется снаряжение <b className="text-parch">не выше уровня лавки</b>, и каждая позиция с шансом 15% выходит именно этого уровня. Чем выше
                        уровень — тем меньше изношенной дряни и больше дорогих редкостей.
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Btn
                        tone={upgradeCost > 0 && player.gold >= upgradeCost ? "flame" : "ghost"}
                        disabled={upgradeCost === 0 || player.gold < upgradeCost}
                        onClick={() => controller.upgradeShop()}
                      >
                        {upgradeCost === 0 ? "Предел · уровень 10" : `Вложиться в лавку · ${upgradeCost} зол.`}
                      </Btn>
                      <span className="font-mono text-[0.84rem] text-mute">
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
                            <div key={label} className="grid grid-cols-[112px_1fr_40px] items-center gap-2 text-[0.9rem]">
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
                          controller.refreshShop();
                          say("Прилавок обновлён");
                        }}
                      >
                        Обновить прилавок (25 зол.)
                      </Btn>
                    </div>
                    {renderGearFilters("shop")}
                    {filterGear(shopStock, "shop").length > 0 ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        {filterGear(shopStock, "shop").map((g) => renderGearCard(g, "shop"))}
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
                    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Уровень припаса">
                      <span className="mr-1 font-mono text-[0.86rem] text-mute">Уровень:</span>
                      {[0, ...supplyLevels].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          aria-pressed={supplyLevelFilter === lvl}
                          onClick={() => setSupplyLevelFilter(lvl)}
                          className={`border px-2.5 py-1 font-mono text-[0.92rem] transition-colors ${
                            supplyLevelFilter === lvl ? "border-flamedim bg-flame/15 text-flamehi" : "border-line text-mute hover:text-parch"
                          }`}
                        >
                          {lvl === 0 ? "Все" : `ур. ${lvl}`}
                        </button>
                      ))}
                      <span className="ml-auto font-mono text-[0.86rem] text-mute">Показано: {shopSupplies.length}</span>
                    </div>
                    {shopSupplies.length === 0 && (
                      <p className="mb-3 border border-dashed border-line py-6 text-center text-sm text-mute">
                        В этой группе нет припасов такого уровня.
                      </p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {shopSupplies.map((def) => {
                        const have = player.bag[def.id] ?? 0;
                        const levelOk = canBuySupply(def.id, player.shopLevel);
                        const can = player.gold >= couponPreview(player, def.price ?? 0) && levelOk;
                        const intReq = consumableIntReq(def, d.intDiscount);
                        const info = effectSummary(def);
                        return (
                          <Panel key={def.id} className="flex flex-col p-4">
                            <div className="flex items-start gap-3">
                              <ItemArt id={def.id} name={def.name} size={56} />
                              <div className="min-w-0 flex-1">
                                <h4
                                  className="cursor-help font-display text-[1.08rem] uppercase leading-tight tracking-[0.08em] text-flamehi underline decoration-dotted underline-offset-2"
                                  onMouseEnter={() => setInfoTip({ kind: "item", id: def.id })}
                                  onMouseLeave={() => setInfoTip(null)}
                                  onFocus={() => setInfoTip({ kind: "item", id: def.id })}
                                  onBlur={() => setInfoTip(null)}
                                  tabIndex={0}
                                >
                                  {def.name}
                                </h4>
                                <div className="mt-1 flex flex-wrap justify-end gap-1">
                                  <Tag tone="verd">ур. {def.level ?? 1}</Tag>
                                  {intReq > 0 && (
                                    <Tag tone={player.stats.int >= intReq ? "verd" : "rubric"}>ИНТ {intReq}</Tag>
                                  )}
                                  <Tag tone="mute">
                                    {def.kind === "scroll" ? "свиток" : def.kind === "throwable" ? "расходник" : def.kind === "special" ? "спец. предмет" : "зелье"}
                                  </Tag>
                                  {!levelOk && <Tag tone="rubric">лавка ур. {def.level ?? 1}</Tag>}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex-1 text-[0.94rem] leading-snug">
                              <p className="text-parch/85">{info.what}</p>
                              <p className="mt-1 font-mono text-[0.84rem] text-flamedim">{info.when}</p>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <span className="font-mono text-sm tab text-flamehi">
                                {couponPreview(player, def.price ?? 0)} зол.{have > 0 && <span className="ml-2 text-mute">в сумке: {have}</span>}
                              </span>
                              <div className="flex gap-2">
                                {have > 0 && (
                                  <Btn tone="ghost" onClick={() => sellSupply(def)}>
                                    Продать 1 · {supplySellPrice(def)} зол.
                                  </Btn>
                                )}
                                <Btn tone={can ? "flame" : "ghost"} disabled={!can} onClick={() => buyConsumable(def)}>
                                  {levelOk ? "Купить" : `Нужна лавка ур. ${def.level ?? 1}`}
                                </Btn>
                              </div>
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
                      <p className="text-[0.92rem] text-mute">
                        Реагенты покупаются отдельно от припасов и живут в рюкзаке меж зельями — варка тратит их по спискам.
                      </p>
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Категория реагента">
                      {([
                        ["all", "Все"],
                        ["plant", "Растения"],
                        ["monster", "Части тварей"],
                        ["mineral", "Минералы и камни"],
                        ["cloth", "Ткани"],
                      ] as [ReagentFilter, string][]).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={reagentFilter === value}
                          onClick={() => setReagentFilter(value)}
                          className={`border px-2.5 py-1 font-mono text-[0.92rem] transition-colors ${
                            reagentFilter === value ? "border-flamedim bg-flame/15 text-flamehi" : "border-line text-mute hover:text-parch"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                      <span className="font-mono text-[0.86rem] text-mute">Показано: {shopReagents.length}</span>
                    </div>
                    {shopReagents.length === 0 && (
                      <p className="mb-3 border border-dashed border-line py-6 text-center text-sm text-mute">
                        Реагентов такой категории в лавке нет.
                      </p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {shopReagents.map((def) => {
                        const have = player.bag[def.id] ?? 0;
                        const levelOk = canBuySupply(def.id, player.shopLevel);
                        const can = player.gold >= couponPreview(player, def.price ?? 0) && levelOk;
                        const cat = reagentCategoryOf(def);
                        const catLabel =
                          cat === "mineral" ? "минерал" : cat === "cloth" ? "ткань" : cat === "monster" ? "часть твари" : "растение";
                        return (
                          <Panel key={def.id} className="flex flex-col p-4">
                            <div className="flex items-start gap-3">
                              <ItemArt id={def.id} name={def.name} size={56} />
                              <div className="min-w-0 flex-1">
                                <h4 className="font-display text-[1.08rem] uppercase leading-tight tracking-[0.08em] text-flamehi">
                                  {def.name}
                                </h4>
                                <div className="mt-1 flex flex-wrap justify-end gap-1">
                                  <Tag tone="verd">{catLabel}</Tag>
                                  <Tag tone="mute">ур. {def.level ?? 1}</Tag>
                                  {!levelOk && <Tag tone="rubric">лавка ур. {def.level ?? 1}</Tag>}
                                </div>
                              </div>
                            </div>
                            <p className="mt-2 flex-1 text-[0.97rem] italic leading-snug text-mute">{def.desc}</p>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <span className="font-mono text-sm tab text-flamehi">
                                {couponPreview(player, def.price ?? 0)} зол.{have > 0 && <span className="ml-2 text-mute">в сумке: {have}</span>}
                              </span>
                              <div className="flex gap-2">
                                {have > 0 && (
                                  <Btn tone="ghost" onClick={() => sellSupply(def)}>
                                    Продать 1 · {supplySellPrice(def)} зол.
                                  </Btn>
                                )}
                                <Btn tone={can ? "flame" : "ghost"} disabled={!can} onClick={() => buyConsumable(def)}>
                                  {levelOk ? "Купить" : `Нужна лавка ур. ${def.level ?? 1}`}
                                </Btn>
                              </div>
                            </div>
                          </Panel>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}

            {tab === "quests" && (
              <QuestsTab
                player={player}
                controller={controller}
                unlockedFloor={unlockedFloor}
                say={say}
                services={npcServices}
                onInspectMercenary={setMercDetail}
              />
            )}

            {tab === "dungeon" && (
              <div className="max-w-3xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="sc text-flamedim">Выбор яруса</span>
                  <Btn tone="flame" className="px-6 py-2.5 text-sm" onClick={() => onStart(selectedFloor)}>
                    Начать с этажа {selectedFloor}
                  </Btn>
                </div>
                <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Выбор этажа подземелья">
              {Array.from({ length: unlockedFloor }, (_, i) => i + 1).map((floor) => (
                <button
                  key={floor}
                  type="button"
                  aria-pressed={selectedFloor === floor}
                  onClick={() => setSelectedFloor(floor)}
                  className={`shrink-0 border px-3 py-2 font-mono text-[0.89rem] transition-colors ${
                    selectedFloor === floor
                      ? "border-flame bg-flame/20 text-flamehi"
                      : "border-line text-mute hover:border-flamedim hover:text-parch"
                  }`}
                >
                  {floor}
                </button>
              ))}
                </div>
              </div>
            )}

            {tab === "about" && (
              <div className="space-y-5">
                <div role="tablist" aria-label="О игре" className="flex flex-wrap gap-2 border-b border-line pb-3">
                  {ABOUT_SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      role="tab"
                      aria-selected={aboutSection === section.id}
                      onClick={() => setAboutSection(section.id)}
                      className={`border px-4 py-2 font-display text-[0.9rem] uppercase tracking-[0.12em] transition-colors ${
                        aboutSection === section.id
                          ? "border-flame bg-flame/15 text-flamehi"
                          : "border-line text-mute hover:border-flamedim hover:text-parch"
                      }`}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
                {aboutSection === "bestiary" && <Bestiary />}
                {aboutSection === "guide" && (
                  <Guide
                    onOpenShop={() => setTab("shop")}
                    onOpenArmory={() => setTab("armory")}
                    onOpenBestiary={() => setAboutSection("bestiary")}
                  />
                )}
                {aboutSection === "updates" && <Updates />}
              </div>
            )}
          </div>
        </div>
        </section>
        <LobbyNav
          items={navItems}
          current={tab}
          onSelect={(id) => setTab(id)}
          onRestart={() => setRestartConfirm(true)}
          className="order-none lg:order-3"
        />
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
                      <div className="font-display text-[1.05rem] uppercase tracking-[0.08em] text-flamehi">
                        {def.name}
                      </div>
                      <div className="font-mono text-[0.78rem] text-mute">
                        {def.kind === "scroll" ? "свиток" : def.kind === "throwable" ? "расходник" : "зелье"}
                        {intReqLabel(def, d.intDiscount)}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[0.94rem] leading-snug text-parch/90">{info.what}</p>
                  <p className="mt-1 text-[0.86rem] italic leading-snug text-flamedim">{info.when}</p>
                  <p className="mt-1 text-[0.86rem] italic text-mute">{def.desc}</p>
                </>
              );
            })()
          ) : (
            (() => {
              const r = RECIPES.find((x) => x.id === infoTip.id)!;
              const out = ITEMS[r.out];
              return (
                <>
                  <div className="font-display text-[1.05rem] uppercase tracking-[0.08em] text-flamehi">
                    Рецепт: {out.name}
                  </div>
                  <p className="mt-1 text-[0.92rem] italic text-mute">{out.desc}</p>
                  <div className="mt-2 border-t border-line/70 pt-2">
                    <div className="sc text-flamedim">Нужные реагенты</div>
                    <ul className="mt-1 space-y-1 text-[0.92rem]">
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
                    <p className="mt-2 font-mono text-[0.84rem] text-mute">
                      требуется ИНТ {r.intReq} · цена рецепта {recipePrice(r)} зол. · 20% неудачи при варке
                    </p>
                  </div>
                </>
              );
            })()
          )}
        </div>
      )}

      {resetConfirm && (
        <Modal
          title="Сбросить характеристики?"
          onClose={() => setResetConfirm(false)}
          actions={
            <div className="flex justify-end gap-2">
              <Btn tone="ghost" onClick={() => setResetConfirm(false)}>Отмена</Btn>
              <Btn tone="danger" onClick={confirmResetStats}>Сбросить · {statResetCost(player.level)} зол.</Btn>
            </div>
          }
        >
          <div className="space-y-2 text-[1rem] leading-relaxed text-parch/90">
            <p>Сила, Ловкость и Интеллект станут <b className="text-flamehi">1/1/1</b>.</p>
            <p>Свободных очков после сброса: <b className="text-verd">{totalStatPoints(player.level)}</b>.</p>
            <p>Выбранные рубежи 5/10 сбросятся. Снаряжение, которое герой больше не может носить, будет снято.</p>
            <p>Стоимость: <b className="text-rubric">{statResetCost(player.level)} зол.</b></p>
          </div>
        </Modal>
      )}

      {forgeConfirm && (
        <Modal
          title="Подтвердить улучшение"
          onClose={() => setForgeConfirm(null)}
          actions={
            <div className="flex justify-end gap-2">
              <Btn tone="ghost" onClick={() => setForgeConfirm(null)}>Отмена</Btn>
              <Btn tone="flame" onClick={() => {
                say(controller.forge(forgeConfirm.uid, forgeConfirm.kind, forgeUseReagents));
                setForgeConfirm(null);
              }}>
                В горн
              </Btn>
            </div>
          }
        >
          {(() => {
            const item = player.armory.find((g) => g.uid === forgeConfirm.uid);
            const opt = item ? forgeOptions(item).find((o) => o.kind === forgeConfirm.kind) : null;
            if (!item || !opt) return null;
            const plan = forgeUseReagents
              ? forgeReagentPlan(player.bag, opt)
              : { picked: {}, total: 0, scrap: 0 };
            const fail = forgeFailChance(opt, plan.total);
            return (
              <div className="space-y-2 text-[1rem] leading-relaxed text-parch/90">
                <p>Улучшение «{opt.label.toLowerCase()}» стоит <b className="text-flamehi">{opt.cost} зол.</b></p>
                <p>
                  Шанс неудачи: <b className="text-rubric">{Math.round(fail * 100)}%</b>.{" "}
                  {plan.total === 0
                    ? "Реагенты не вложены, поэтому при неудаче вещь будет уничтожена."
                    : "При неудаче вещь останется целой, но золото и реагенты пропадут."}
                </p>
                <p className="flex flex-wrap items-center gap-2 font-mono text-[0.88rem] text-mute">
                  <span>Реагенты: {plan.total}{opt.reagentTotal > 0 ? ` из ${opt.reagentTotal}` : ""}</span>
                  {opt.reagentTotal > 0 && (
                    <ReagentNeedTag
                      total={plan.total}
                      required={opt.reagentTotal}
                      parts={opt.reagentParts}
                      bag={player.bag}
                      tone={plan.total >= opt.reagentTotal ? "verd" : "mute"}
                      scrap={opt.reagentScrap}
                      forbidScrap={opt.reagentForbidScrap}
                    />
                  )}
                  {opt.reagentTotal > 0 && plan.total < opt.reagentTotal ? (
                    <span>· набора не хватает, риск выше</span>
                  ) : null}
                </p>
              </div>
            );
          })()}
        </Modal>
      )}

      {mercDetail && (
        <GearNote
          item={mercDetail}
          player={player}
          inShop
          buyPrice={couponPreview(player, mercenaryPrice(mercDetail))}
          onClose={() => setMercDetail(null)}
        />
      )}

      {gearDetail && detailItem && (
        <GearNote
          item={detailItem}
          player={player}
          inShop={gearDetail.inShop}
          onClose={() => setGearDetail(null)}
          onIdentify={gearDetail.inShop ? undefined : identifyGear}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
          <div className="rise border border-flamedim bg-slab px-4 py-2 font-display text-sm uppercase tracking-[0.14em] text-flamehi shadow-[0_20px_50px_-20px_#000]">
            {toast}
          </div>
        </div>
      )}

      {pick && (
        <Modal
          title={`Рубеж ${pick.tier}: ${STAT_META[pick.stat].name}`}
          sub="Выбери одно усиление из двух. Оно не меняет основной архетип."
          actions={<span className="font-mono text-[0.84rem] text-mute">Можно усилить свой путь или взять соседний</span>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {statMilestoneOptions(pick.stat, pick.tier).map((o) => {
              const a = ARCHETYPES[o.archetype];
              const own = player.archetype === o.archetype;
              return (
                <button
                  key={o.id}
                  onClick={() => pickStatMilestone(o.id)}
                  className="group border border-line bg-slab2 p-3 text-left transition-all hover:border-flame hover:bg-flame/5"
                >
                  <div className="font-display text-[1.08rem] uppercase tracking-[0.1em] text-flamehi group-hover:text-flame">{o.name}</div>
                  <div className="mt-1 font-mono text-[0.78rem] text-flamedim">
                    {a.name} · {own ? "усиливает твой архетип" : "дополнительно для другого архетипа"}
                  </div>
                  <p className="mt-2 text-[0.98rem] leading-snug text-parch/85">{o.desc}</p>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {pickArchetype && (
        <Modal
          title="Выбор архетипа"
          sub="Рубеж 5 уровня — один путь на всю жизнь"
          actions={<span className="font-mono text-[0.84rem] text-mute">По два архетипа на каждую характеристику</span>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {ARCHETYPE_ORDER.map((id) => {
              const a = ARCHETYPES[id];
              return (
                <button
                  key={id}
                  onClick={() => chooseArchetype(id)}
                  className="group border border-line bg-slab2 p-3 text-left transition-all hover:border-flame hover:bg-flame/5"
                >
                  <div className="font-display text-[1.08rem] uppercase tracking-[0.1em] text-flamehi group-hover:text-flame">{a.name}</div>
                  <div className="mt-1 font-mono text-[0.78rem] text-flamedim">{STAT_META[a.stat].name} · {a.short}</div>
                  <p className="mt-2 text-[0.98rem] leading-snug text-parch/85">{a.desc}</p>
                  <div className="mt-2 border-t border-line/60 pt-2 text-[0.9rem] text-mute">Усиления открываются на рубежах {STAT_META[a.stat].short} 5 и 10</div>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {restartConfirm && (
        <Modal
          title="Начать заново"
          sub="Полный сброс прогресса"
          onClose={() => setRestartConfirm(false)}
          actions={
            <>
              <Btn onClick={() => setRestartConfirm(false)}>Отмена</Btn>
              <Btn tone="flame" onClick={() => { setRestartConfirm(false); onRestart(); }}>
                Стереть и начать
              </Btn>
            </>
          }
        >
          <p className="dropcap text-[1.02rem] leading-relaxed text-parch/85">
            Будут удалены герой, золото, снаряжение, открытые этажи и рекорд. Игра вернётся к титульному экрану с
            новым героем 1 уровня. Отменить это действие нельзя.
          </p>
        </Modal>
      )}
    </div>
  );
}
