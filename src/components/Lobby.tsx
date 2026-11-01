import { useEffect, useState } from "react";
import {
  ArrowDownUp,
  BookOpen,
  Brain,
  EyeOff,
  FlaskConical,
  Hammer,
  Wrench,
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
import { SLOT_META, SLOT_ORDER } from "../game/types";
import type { RarityTier, Slot } from "../game/types";
import { derived } from "../game/battle";
import { GEAR_BASES } from "../game/content";
import { GEAR_EFFECTS, GEAR_PASSIVES } from "../game/gearEffects";
import type { GearItem, Player, StatKey } from "../game/types";
import type { ArchetypeId } from "../game/archetypes";
import { canChooseStatMilestone, chosenStatMilestone, statMilestoneOptions, type StatMilestoneTier } from "../game/statMilestones";
import { SHOP_MAX_LEVEL, shopRarityTable, shopUpgradeCost, shopWearTable } from "../game/world";
import { forgeOptions, type ForgeUpgradeKind } from "../game/forge";
import { statResetCost, totalStatPoints } from "../game/progression";
import { WEAR_RANGE } from "../game/types";
import { Guide } from "./Guide";
import { Bestiary } from "./Bestiary";
import { ItemArt } from "./ItemArt";
import { GearNote } from "./GearNote";
import { GearCard } from "./GearCard";
import { Btn, Meter, Modal, Panel, Pips, Tag } from "./ui";


type Tab = "train" | "armory" | "shop" | "brew" | "workshop" | "forge" | "bestiary" | "guide";
type ShopSection = "equipment" | "supplies" | "reagents" | "recipes";
type SupplyGroup = "potion" | "throwable" | "scroll" | "special";
type RecipeGroup = "potion" | "throwable" | "scroll" | "special";
/** Всплывающая подсказка о припасе / реагенте / рецепте. */
type InfoTip = { kind: "item" | "recipe"; id: string } | null;

const SUPPLY_GROUPS: { id: SupplyGroup; label: string }[] = [
  { id: "potion", label: "Зелья" },
  { id: "throwable", label: "Расходники" },
  { id: "scroll", label: "Свитки" },
  { id: "special", label: "Спец. предметы" },
];

const RECIPE_GROUPS: { id: RecipeGroup; label: string }[] = [
  { id: "potion", label: "Зелья" },
  { id: "throwable", label: "Расходники" },
  { id: "scroll", label: "Свитки" },
  { id: "special", label: "Спец. предметы" },
];

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
  workshop: Wrench,
  forge: Hammer,
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
  { id: "workshop", label: "Мастерская" },
  { id: "forge", label: "Кузница" },
  { id: "bestiary", label: "Бестиарий" },
  { id: "guide", label: "Как играть" },
];

export function Lobby({
  player,
  controller,
  shopStock,
  onStart,
  onRestart,
  best,
  unlockedFloor,
  initialTab = "train",
}: {
  player: Player;
  controller: LobbyController;
  shopStock: GearItem[];
  onStart: (floor: number) => void;
  /** Полный сброс прогресса — кнопка «Начать заново». */
  onRestart: () => void;
  best: number;
  unlockedFloor: number;
  initialTab?: "train" | "guide";
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [shopSection, setShopSection] = useState<ShopSection>("equipment");
  const [supplyGroup, setSupplyGroup] = useState<SupplyGroup>("potion");
  /* Сумка арсенала: припасы и реагенты в двух вкладках одной таблицы. */
  const [bagTab, setBagTab] = useState<"supplies" | "reagents">("supplies");
  /* «Начать заново»: подтверждение полного сброса прогресса. */
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [recipeGroup, setRecipeGroup] = useState<RecipeGroup>("potion");
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
  const [forgeUid, setForgeUid] = useState<string | null>(null);
  const [forgeConfirm, setForgeConfirm] = useState<{ uid: string; kind: ForgeUpgradeKind } | null>(null);
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

  /* Если Интеллект позволяет — предметы в арсенале исследуются сами. */
  useEffect(() => {
    say(controller.autoIdentify());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.armory, player.stats.int, controller]);

  const buyGear = (item: GearItem) => {
    const msg = controller.buyGear(item);
    if (!msg) return;
    setPurchasedUids((prev) => ({ ...prev, [item.uid]: true }));
    say(msg);
  };

  const identifyGear = (uid: string, mode: "int" | "gold") => say(controller.identifyGear(uid, mode));
  const equipGear = (item: GearItem, slot: Slot, grip?: "one" | "two") => say(controller.equipGear(item, slot, grip));
  const takeOff = (slot: Slot) => say(controller.takeOff(slot));
  const sellGear = (item: GearItem) => say(controller.sellGear(item));
  const buyRecipe = (recipe: Recipe) => say(controller.buyRecipe(recipe));
  const brew = (recipeId: string) => say(controller.brew(recipeId));

  const shopSupplies = Object.values(ITEMS).filter(
    (i) => (i.price ?? 0) > 0 && i.kind !== "reagent" && groupOfKind(i.kind) === supplyGroup,
  );
  const shopReagents = Object.values(ITEMS).filter((i) => i.kind === "reagent" && (i.price ?? 0) > 0);
  const stationRecipes = (station: "alchemy" | "workshop") =>
    RECIPES.filter((r) => (r.station ?? "alchemy") === station);
  const groupedRecipes = RECIPES.filter((r) => groupOfKind(ITEMS[r.out].kind) === recipeGroup);
  const wearTable = shopWearTable(player.shopLevel);
  const rarityTable = shopRarityTable(player.shopLevel);
  const upgradeCost = player.shopLevel >= SHOP_MAX_LEVEL ? 0 : shopUpgradeCost(player.shopLevel);
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
        g.identified && g.passive ? GEAR_PASSIVES[g.passive].name : "",
        g.identified && g.rareAffix ? RARE_AFFIXES[g.rareAffix].name : "",
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
    setChosenSlot(null);
  };

  const gearFilters = (
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
              onClick={() => { setGearSlot(value); setChosenSlot(null); }}
              className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[0.92rem] transition-colors ${
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
          className="border border-line bg-soot px-2 py-1.5 font-mono text-[0.92rem] text-parch outline-none focus:border-flamedim"
        >
          <option value="all">Любая редкость</option>
          <option value="unknown">Не исследовано</option>
          <option value="common">Обычное</option>
          <option value="rare">Редкое</option>
          <option value="epic">Эпическое</option>
          <option value="legendary">Легендарное</option>
        </select>
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
    setGearSlot(slot === "mainHand" || slot === "offHand" ? "hands" : slot === "amulet" ? "amulet" : slot === "ring1" || slot === "ring2" ? "rings" : "armor");
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
      onInspect={() => setGearDetail({ uid: item.uid, inShop: mode === "shop" })}
      onEquip={(target, grip) => equipGear(item, chosenSlot && slotsForItem(item).includes(chosenSlot) ? chosenSlot : target, grip)}
      onUnequip={takeOff}
      onSell={() => sellGear(item)}
      onBuy={() => buyGear(item)}
    />
  );

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

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-7">
        <header className="max-w-2xl">
          <span className="sc text-flamedim">Лобби · лагерь под сводами</span>
          <h2 className="font-title text-4xl leading-[0.95] text-flamehi sm:text-5xl">Сумрак</h2>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="sc text-flamedim">Выбор яруса</span>
              <Btn tone="flame" className="px-6 py-2.5 text-sm" onClick={() => onStart(selectedFloor)}>
                Начать с этажа {selectedFloor}
              </Btn>
            </div>
            <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Выбор этажа подземелья">
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
          <nav className="flex flex-wrap border-b border-line">
            {TABS.map((t) => {
              const count = t.badge ? t.badge(player) : 0;
              const Icon = TAB_ICONS[t.id];
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`relative flex items-center gap-2 px-4 py-3 font-display text-[0.92rem] uppercase tracking-[0.18em] transition-colors sm:px-6 ${
                    tab === t.id ? "bg-slab2 text-flamehi" : "text-mute hover:text-parch"
                  }`}
                >
                  <Icon size={15} strokeWidth={1.7} aria-hidden />
                  <span>{t.label}</span>
                  {count > 0 && (
                    <span className="border border-flame bg-flame/20 px-1.5 py-0.5 font-mono text-[0.81rem] text-flamehi">
                      {count}
                    </span>
                  )}
                  {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-px bg-flame" />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setRestartConfirm(true)}
              className="ml-auto flex items-center gap-2 px-4 py-3 font-display text-[0.9rem] uppercase tracking-[0.16em] text-mute transition-colors hover:text-rubric"
            >
              Начать заново
            </button>
          </nav>

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
                </section>

                <section id="armory-inventory" aria-label="Инвентарь снаряжения" className="min-w-0 scroll-mt-4 border border-line bg-black/20 p-3">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <span className="sc text-flamedim">Свободные вещи</span>
                      <h3 className="mt-1 font-display text-xl uppercase tracking-[0.08em] text-flamehi">Инвентарь</h3>
                    </div>
                    <span className="font-mono text-[0.92rem] text-mute">{visibleInventory.length} из {inventoryItems.length} · неизвестно: {inventoryItems.filter((item) => !item.identified).length}</span>
                  </div>
                  {chosenSlot && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-flamedim/60 bg-flame/5 px-3 py-2 text-[0.94rem]">
                      <span className="text-flamehi">Выбрать предмет: {SLOT_META[chosenSlot].name}</span>
                      <button className="text-mute underline underline-offset-2 hover:text-parch" onClick={() => { setChosenSlot(null); setGearSlot("all"); }}>Показать все</button>
                    </div>
                  )}
                  {gearFilters}
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
                        На прилавке появляется снаряжение <b className="text-parch">не выше уровня лавки</b>. Чем выше
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
                          controller.refreshShop();
                          say("Прилавок обновлён");
                        }}
                      >
                        Обновить прилавок (25 зол.)
                      </Btn>
                    </div>
                    {gearFilters}
                    {filterGear(shopStock).length > 0 ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        {filterGear(shopStock).map((g) => renderGearCard(g, "shop"))}
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
                        const levelOk = canBuySupply(def.id, player.shopLevel);
                        const can = player.gold >= (def.price ?? 0) && levelOk;
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
                                {def.price} зол.{have > 0 && <span className="ml-2 text-mute">в сумке: {have}</span>}
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
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {shopReagents.map((def) => {
                        const have = player.bag[def.id] ?? 0;
                        const levelOk = canBuySupply(def.id, player.shopLevel);
                        const can = player.gold >= (def.price ?? 0) && levelOk;
                        const cat = def.reagentCat ?? "plant";
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
                                {def.price} зол.{have > 0 && <span className="ml-2 text-mute">в сумке: {have}</span>}
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

            {(tab === "brew" || tab === "workshop") && (
              <div>
                <p className="dropcap mb-4 max-w-2xl text-[1.02rem] leading-relaxed text-parch/85">
                  {tab === "brew"
                    ? "Алхимия варит зелья и свитки. Рецепты нельзя угадать: сперва купи лист у торговца."
                    : "Мастерская собирает метательные расходники: кинжалы, бомбы и прахи. Рецепты продаются у торговца."}
                  {" "}При создании есть {Math.round(BREW_FAILURE_CHANCE * 100)}% шанс неудачи — ингредиенты сгорят,
                  даже если ничего не выйдет.
                </p>
                <div className="grid gap-3 lg:grid-cols-2">
                  {stationRecipes(tab === "workshop" ? "workshop" : "alchemy").map((r, index) => {
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
            )}

            {tab === "forge" && (
              <div>
                <p className="dropcap mb-4 max-w-2xl text-[1.02rem] leading-relaxed text-parch/85">
                  Кузница улучшает качество, изношенность и уровень снаряжения. Каждая попытка стоит золота
                  и может уничтожить предмет: чем выше цель, тем страшнее риск.
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
                      return (
                        <div className="space-y-3">
                          {forgeOptions(item).map((opt) => {
                            const can = opt.available && player.gold >= opt.cost;
                            const toLabel = opt.kind === "rarity" ? RARITY_META[opt.to as RarityTier]?.name ?? opt.to
                              : opt.kind === "wear" ? WEAR_RANGE[opt.to as keyof typeof WEAR_RANGE]?.label ?? opt.to
                              : `ур. ${opt.to}`;
                            return (
                              <div key={opt.kind} className="border border-line bg-black/25 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-display text-[1.05rem] uppercase tracking-[0.08em] text-flamehi">{opt.label}</span>
                                  <span className="font-mono text-[0.86rem] text-mute">{opt.from} → {toLabel}</span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[0.84rem]">
                                  <Tag tone="flame">{opt.cost} зол.</Tag>
                                  <Tag tone="rubric">риск уничтожения {Math.round(opt.destroyChance * 100)}%</Tag>
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
                say(controller.forge(forgeConfirm.uid, forgeConfirm.kind));
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
            return (
              <div className="space-y-2 text-[1rem] leading-relaxed text-parch/90">
                <p>Улучшение «{opt.label.toLowerCase()}» стоит <b className="text-flamehi">{opt.cost} зол.</b></p>
                <p>Риск уничтожения: <b className="text-rubric">{Math.round(opt.destroyChance * 100)}%</b>. Если предмет уцелеет, улучшение гарантировано. Золото списывается даже при уничтожении.</p>
              </div>
            );
          })()}
        </Modal>
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
