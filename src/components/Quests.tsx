import { useState, type ReactNode } from "react";
import { Coins, Info, Package } from "lucide-react";
import { BLESSINGS, blessingPrice, type BlessingId } from "../game/blessings";
import { ITEMS, RECIPES, supplyLevel, type ItemDef } from "../game/content";
import { isForgeReagent } from "../game/forge";
import { reagentCategoryOf } from "../game/shopFilters";
import {
  GIVER_ORDER,
  QUEST_ACTIVE_LIMIT,
  QUEST_GIVERS,
  QUEST_KIND_NAME,
  WIZARD_MAX_QTY,
  couponPreview,
  describeReward,
  logOf,
  mercenaryPrice,
  mercenarySlots,
  questReady,
  recipeMinTrust,
  stationRecipeList,
  trustOf,
  villagerSlots,
  wizardSlots,
} from "../game/quests";
import type { LobbyController } from "../controllers/LobbyController";
import { TRUST_MAX, type GearItem, type Player, type Quest, type QuestGiverId, type ShopLine } from "../game/types";
import { Btn, Modal, Panel, Tag } from "./ui";
import { GearCard } from "./GearCard";
import { ItemArt } from "./ItemArt";

const REAGENT_CAT_LABEL = { mineral: "минерал", cloth: "ткань", monster: "часть твари", plant: "растение" } as const;

/** Портрет NPC из public/images/npcs. Если картины нет, показываем инициал на тёмном фоне. */
export function NpcPortrait({ giver, className = "" }: { giver: QuestGiverId; className?: string }) {
  const [failed, setFailed] = useState(false);
  const meta = QUEST_GIVERS[giver];
  if (failed) {
    return (
      <div
        role="img"
        aria-label={meta.name}
        className={`flex items-center justify-center bg-soot font-display text-flamehi ${className}`}
      >
        {meta.name.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={`images/npcs/${giver}.jpg`}
      alt={meta.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-cover object-top ${className}`}
    />
  );
}

/** Пять точек доверия: заполненные — уже открыто. */
function TrustPips({ value }: { value: number }) {
  return (
    <span className="flex gap-1" aria-hidden>
      {Array.from({ length: TRUST_MAX }, (_, i) => (
        <span key={i} className={`h-2 w-2 border border-flamedim ${i < value ? "bg-flame" : "bg-transparent"}`} />
      ))}
    </span>
  );
}

/** Первый уровень доверия, на котором позиция витрины с номером index открыта. */
function openAtTrust(slots: (trust: number) => number, index: number): number {
  for (let t = 0; t <= TRUST_MAX; t++) if (index < slots(t)) return t;
  return TRUST_MAX;
}

/** Следующий уровень доверия, на котором на витрине появится ещё одна позиция. */
function nextShelfTrust(slots: (trust: number) => number, trust: number): number | null {
  for (let t = trust + 1; t <= TRUST_MAX; t++) if (slots(t) > slots(trust)) return t;
  return null;
}

/** Подсказка: что откроется дальше у этого жителя. */
function unlockNote(giver: QuestGiverId, player: Player): string {
  const t = trustOf(player, giver);
  if (giver === "priest") {
    const locked = Object.values(BLESSINGS)
      .filter((b) => b.minTrust > t)
      .sort((a, b) => a.minTrust - b.minTrust);
    if (locked.length === 0) return "Все благословения открыты.";
    return `Закрыто: ${locked.map((b) => `${b.name} (доверие ${b.minTrust})`).join(", ")}.`;
  }
  if (giver === "wizard" || giver === "villager" || giver === "mercenary") {
    const slots =
      giver === "wizard" ? wizardSlots : giver === "villager" ? villagerSlots : mercenarySlots;
    const next = nextShelfTrust(slots, t);
    return next === null ? "Витрина открыта полностью." : `Следующая позиция на витрине — при доверии ${next}.`;
  }
  if (giver === "smith" || giver === "merchant") {
    return t >= 3
      ? "Каждое задание даёт скидку 25% на следующую покупку."
      : `Скидка 25% на половину заданий. С доверием 3 — на каждое.`;
  }
  if (giver === "alchemist" || giver === "master") {
    const station = giver === "master" ? "workshop" : "alchemy";
    const needs = stationRecipeList(station).map(recipeMinTrust).filter((n) => n > t);
    if (needs.length === 0) return "Все листы открыты.";
    return `Следующий лист — при доверии ${Math.min(...needs)}.`;
  }
  return "";
}

/** Вкладка «Жители» лобби: ряд NPC с портретами и выбранный NPC с его доверием, заданиями, товарами и услугами. */
export function QuestsTab({
  player,
  controller,
  unlockedFloor,
  say,
  services = {},
  onInspectMercenary,
}: {
  player: Player;
  controller: LobbyController;
  unlockedFloor: number;
  say: (text: string | null) => void;
  /** Содержимое NPC, которое живёт в лобби: варка и рецепты алхимика и мастера, кузница. */
  services?: Partial<Record<QuestGiverId, ReactNode>>;
  /** Открывает окно характеристик снаряжения наёмника (живёт в лобби). */
  onInspectMercenary?: (item: GearItem) => void;
}) {
  const log = logOf(player);
  /* Открываем того, у кого уже взято задание; иначе — священника. */
  const [giver, setGiver] = useState<QuestGiverId>(
    () => GIVER_ORDER.find((id) => log.active.some((q) => q.giver === id)) ?? "priest",
  );
  const activeFull = log.active.length >= QUEST_ACTIVE_LIMIT;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">Жители</h3>
        <p className="mt-2 text-sm text-mute">
          Взято заданий: {log.active.length}/{QUEST_ACTIVE_LIMIT}
          {log.coupons > 0 && <span className="ml-3 text-verd">Скидка 25% на следующую покупку: {log.coupons}</span>}
        </p>
      </div>

      <div role="tablist" aria-label="Жители деревни" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {GIVER_ORDER.map((id) => (
          <NpcTabButton
            key={id}
            giver={id}
            selected={giver === id}
            ready={log.active.filter((q) => q.giver === id && questReady(q, player)).length}
            available={log.offers.filter((q) => q.giver === id).length}
            trust={trustOf(player, id)}
            onSelect={() => setGiver(id)}
          />
        ))}
      </div>

      <NpcPanel
        giver={giver}
        player={player}
        controller={controller}
        unlockedFloor={unlockedFloor}
        activeFull={activeFull}
        say={say}
        services={services[giver]}
        onInspectMercenary={onInspectMercenary}
      />
    </div>
  );
}

/** Цвета рамки жителей: выполненное задание — светло-золотой, новое — зелёный (палитра темы). */
const READY_FRAME = "#f6d48a";
const OFFER_FRAME = "#5f8f7a";

function NpcTabButton({
  giver,
  selected,
  ready,
  available,
  trust,
  onSelect,
}: {
  giver: QuestGiverId;
  selected: boolean;
  ready: number;
  available: number;
  trust: number;
  onSelect: () => void;
}) {
  const meta = QUEST_GIVERS[giver];
  /* Рамка: выполненное задание (можно сдать) важнее нового; без заданий — обычная рамка. */
  const frame = ready > 0 ? READY_FRAME : available > 0 ? OFFER_FRAME : selected ? "#ad7a2c" : "#322720";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      style={{ borderColor: frame }}
      className={`relative flex flex-col items-center gap-2 border-2 p-2 text-center transition-colors ${
        selected ? "bg-flame/10" : "bg-black/30 hover:bg-black/40"
      }`}
    >
      <NpcPortrait giver={giver} className="h-20 w-20 border border-line" />
      <span className="font-display text-xs uppercase tracking-[0.1em] text-parch">{meta.role}</span>
      <TrustPips value={trust} />
      {available > 0 && (
        <span
          className="absolute left-1 top-1 animate-pulse border border-verd bg-verd/20 px-1.5 font-mono text-xs text-verd"
          title="Есть задание, которое можно взять"
        >
          !
        </span>
      )}
      {ready > 0 && (
        <span className="absolute right-1 top-1 bg-verd px-1.5 font-mono text-xs text-ink" title="Можно сдать">
          {ready}
        </span>
      )}
    </button>
  );
}

function NpcPanel({
  giver,
  player,
  controller,
  unlockedFloor,
  activeFull,
  say,
  services,
  onInspectMercenary,
}: {
  giver: QuestGiverId;
  player: Player;
  controller: LobbyController;
  unlockedFloor: number;
  activeFull: boolean;
  say: (text: string | null) => void;
  services?: ReactNode;
  onInspectMercenary?: (item: GearItem) => void;
}) {
  const meta = QUEST_GIVERS[giver];
  const log = logOf(player);
  const offers = log.offers.filter((q) => q.giver === giver);
  const active = log.active.filter((q) => q.giver === giver);
  const trust = trustOf(player, giver);

  return (
    <Panel title={`${meta.role} · ${meta.name}`}>
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div>
          <NpcPortrait giver={giver} className="aspect-square w-full border border-line" />
        </div>
        <div className="space-y-5">
          {/* Приветствие звучит при открытии: тон зависит от доверия. */}
          <blockquote className="border-l-2 border-flamedim pl-3 font-display text-[1.02rem] italic leading-snug text-parch">
            «{meta.greetings[trust] ?? meta.greetings[0]}»
          </blockquote>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs text-mute">
              Доверие {trust}/{TRUST_MAX}
            </span>
            <TrustPips value={trust} />
          </div>
          <p className="text-sm text-mute">{meta.desc}</p>
          <p className="text-sm text-mute">{unlockNote(giver, player)}</p>

          <section className="space-y-3">
            <h4 className="sc text-flamedim">Задания</h4>
            {active.length === 0 && offers.length === 0 && (
              <p className="text-sm text-mute">Пока заданий нет. Новые появятся после нового этажа.</p>
            )}
            {active.map((q) => (
              <QuestCard key={q.id} quest={q} player={player} onClaim={() => say(controller.claimQuest(q.id))} />
            ))}
            {offers.map((q) => (
              <OfferCard key={q.id} quest={q} disabled={activeFull} onAccept={() => say(controller.acceptQuest(q.id))} />
            ))}
            {activeFull && offers.length > 0 && (
              <p className="text-sm text-rubric">Одновременно можно вести не больше {QUEST_ACTIVE_LIMIT} заданий.</p>
            )}
          </section>

          <NpcShop
            giver={giver}
            player={player}
            controller={controller}
            unlockedFloor={unlockedFloor}
            say={say}
            onInspectMercenary={onInspectMercenary}
          />

          {services && <section className="space-y-3 border-t border-line pt-4">{services}</section>}
        </div>
      </div>
    </Panel>
  );
}

function NpcShop({
  giver,
  player,
  controller,
  unlockedFloor,
  say,
  onInspectMercenary,
}: {
  giver: QuestGiverId;
  player: Player;
  controller: LobbyController;
  unlockedFloor: number;
  say: (text: string | null) => void;
  onInspectMercenary?: (item: GearItem) => void;
}) {
  const trust = trustOf(player, giver);
  if (giver === "priest") return <BlessingShop player={player} controller={controller} unlockedFloor={unlockedFloor} say={say} />;
  if (giver === "wizard") {
    const slots = wizardSlots(trust);
    return (
      <LineShop
        title="Свитки и зелья"
        lines={logOf(player).wizard}
        slots={slots}
        unlockAt={(index) => openAtTrust(wizardSlots, index)}
        emptyText="Товар распродан. Обновится при прохождении нового этажа."
        player={player}
        note={(line) => `осталось ${line.qty} из ${WIZARD_MAX_QTY} · в сумке ${player.bag[line.id] ?? 0}`}
        onBuy={(id) => say(controller.buyWizardItem(id))}
      />
    );
  }
  if (giver === "villager") {
    return (
      <LineShop
        title="Реагенты"
        lines={logOf(player).villager}
        slots={villagerSlots(trust)}
        unlockAt={(index) => openAtTrust(villagerSlots, index)}
        emptyText="Реагенты распроданы. Обновятся при прохождении нового этажа."
        player={player}
        note={(line) => `осталось ${line.qty} · в сумке ${player.bag[line.id] ?? 0}`}
        onBuy={(id) => say(controller.buyVillagerItem(id))}
        reagents
      />
    );
  }
  if (giver === "mercenary")
    return <MercenaryShop player={player} controller={controller} say={say} onInspect={onInspectMercenary} />;
  /* Алхимик и мастер продают рецепты в своей секции (services), кузнец — кузницу. */
  if (giver === "alchemist" || giver === "master") return null;
  return (
    <section className="space-y-2">
      <h4 className="sc text-flamedim">Скидка</h4>
      <p className="text-sm text-mute">
        {giver === "smith" || giver === "merchant" ? "Товаров не продаёт. " : ""}
        Иногда его задания дают скидку 25% на одну следующую покупку.
      </p>
    </section>
  );
}

function BlessingShop({
  player,
  controller,
  unlockedFloor,
  say,
}: {
  player: Player;
  controller: LobbyController;
  unlockedFloor: number;
  say: (text: string | null) => void;
}) {
  const log = logOf(player);
  const price = blessingPrice(unlockedFloor);
  const shown = couponPreview(player, price);
  return (
    <section className="space-y-3">
      <h4 className="sc text-flamedim">Благословение на поход</h4>
      <div className="grid gap-3 md:grid-cols-2">
        {log.blessingOffers.map((id) => {
          const def = BLESSINGS[id as BlessingId];
          if (!def) return null;
          const bought = log.blessingNext === id;
          const open = def.minTrust <= trustOf(player, "priest");
          if (!open) {
            return (
              <div key={id} className="flex items-center justify-between gap-3 border border-dashed border-line bg-black/20 p-3">
                <div>
                  <div className="font-display text-sm uppercase tracking-[0.12em] text-mute">{def.name}</div>
                  <div className="text-sm text-mute">Откроется при доверии {def.minTrust}.</div>
                </div>
                <Tag tone="mute">доверие {def.minTrust}</Tag>
              </div>
            );
          }
          return (
            <div key={id} className="flex items-center justify-between gap-3 border border-line bg-black/30 p-3">
              <div>
                <div className="font-display text-sm uppercase tracking-[0.12em] text-flamehi">{def.name}</div>
                <div className="text-sm text-mute">{def.desc}</div>
                <div className="mt-1 font-mono text-sm text-flame">
                  {shown !== price && <span className="mr-2 text-mute line-through">{price}</span>}
                  {shown} зол.
                </div>
              </div>
              <Btn
                tone={bought ? "verd" : "flame"}
                disabled={!!log.blessingNext || player.gold < shown}
                onClick={() => say(controller.buyBlessing(id))}
              >
                {bought ? "Куплено" : "Купить"}
              </Btn>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-mute">
        {log.blessingNext
          ? `На следующий поход: ${BLESSINGS[log.blessingNext as BlessingId]?.name ?? "благословение"}. Вступит в силу при спуске.`
          : "Одно благословение за раз. Действует в одном походе: при выходе или смерти гаснет."}
        {player.blessing && (
          <span className="ml-1 text-verd">Сейчас в силе: {BLESSINGS[player.blessing as BlessingId]?.name}.</span>
        )}
      </p>
    </section>
  );
}

function LineShop({
  title,
  lines,
  slots,
  unlockAt,
  emptyText,
  player,
  note,
  onBuy,
  reagents = false,
}: {
  title: string;
  lines: ShopLine[];
  /** Сколько позиций открыто доверием к продавцу. */
  slots: number;
  unlockAt: (index: number) => number;
  emptyText: string;
  player: Player;
  note: (line: ShopLine) => string;
  onBuy: (id: string) => void;
  /** Реагенты: картинка товара и окно характеристик. */
  reagents?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h4 className="sc text-flamedim">{title}</h4>
      {lines.length === 0 ? (
        <p className="text-sm text-mute">{emptyText}</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {lines.map((line, index) => {
            const def = ITEMS[line.id];
            const shown = couponPreview(player, line.price);
            if (index >= slots) return <LockedRow key={line.id} trust={unlockAt(index)} />;
            if (reagents && def) {
              return (
                <ReagentRow
                  key={line.id}
                  def={def}
                  price={line.price}
                  note={note(line)}
                  player={player}
                  onBuy={() => onBuy(line.id)}
                />
              );
            }
            return (
              <div key={line.id} className="flex items-center justify-between gap-3 border border-line bg-black/30 p-3">
                <div>
                  <div className="font-display text-sm uppercase tracking-[0.1em] text-parch">{def?.name ?? line.id}</div>
                  <div className="text-xs text-mute">{def?.desc}</div>
                  <div className="mt-1 font-mono text-xs text-mute">{note(line)}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="font-mono text-sm text-flame">
                    {shown !== line.price && <span className="mr-2 text-mute line-through">{line.price}</span>}
                    {shown} зол.
                  </span>
                  <Btn tone={player.gold >= shown ? "flame" : "ghost"} disabled={player.gold < shown} onClick={() => onBuy(line.id)}>
                    Купить
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MercenaryShop({
  player,
  controller,
  say,
  onInspect,
}: {
  player: Player;
  controller: LobbyController;
  say: (text: string | null) => void;
  onInspect?: (item: GearItem) => void;
}) {
  const items = logOf(player).mercenary;
  return (
    <section className="space-y-3">
      <h4 className="sc text-flamedim">Исследованное снаряжение</h4>
      {items.length === 0 ? (
        <p className="text-sm text-mute">Наёмнику нечего предложить. Обновится при прохождении нового этажа.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item, index) =>
            index < mercenarySlots(trustOf(player, "mercenary")) ? (
              <GearCard
                key={item.uid}
                item={item}
                player={player}
                mode="shop"
                buyPrice={couponPreview(player, mercenaryPrice(item))}
                onInspect={() => onInspect?.(item)}
                onBuy={() => say(controller.buyMercenaryItem(item.uid))}
              />
            ) : (
              <LockedRow key={item.uid} trust={openAtTrust(mercenarySlots, index)} />
            ),
          )}
        </div>
      )}
    </section>
  );
}

/** Позиция витрины, которая откроется при большем доверии. */
function LockedRow({ trust }: { trust: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-dashed border-line bg-black/20 p-3">
      <div>
        <div className="font-display text-sm uppercase tracking-[0.1em] text-mute">Закрыто</div>
        <div className="text-xs text-mute">Откроется при доверии {trust}.</div>
      </div>
      <Tag tone="mute">доверие {trust}</Tag>
    </div>
  );
}

/** Реагент у проходимца: картинка товара, цена и окно характеристик. */
function ReagentRow({
  def,
  price,
  note,
  player,
  onBuy,
}: {
  def: ItemDef;
  price: number;
  note: string;
  player: Player;
  onBuy: () => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = couponPreview(player, price);
  const cat = reagentCategoryOf(def);
  return (
    <>
      <div className="flex flex-col gap-3 border border-line bg-black/30 p-3">
        <div className="flex items-start gap-3">
          <ItemArt id={def.id} name={def.name} size={56} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm uppercase tracking-[0.1em] text-parch">{def.name}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <Tag tone="verd">{REAGENT_CAT_LABEL[cat]}</Tag>
              <Tag tone="mute">ур. {supplyLevel(def.id)}</Tag>
            </div>
          </div>
        </div>
        <p className="text-xs italic text-mute">{def.desc}</p>
        <div className="font-mono text-xs text-mute">{note}</div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Btn className="gap-1.5 px-2.5 py-2 text-[0.86rem]" onClick={() => setOpen(true)} title={`Подробнее: ${def.name}`}>
            <Info size={14} aria-hidden /> Подробнее
          </Btn>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-flame">
              {shown !== price && <span className="mr-2 text-mute line-through">{price}</span>}
              {shown} зол.
            </span>
            <Btn tone={player.gold >= shown ? "flame" : "ghost"} disabled={player.gold < shown} onClick={onBuy}>
              Купить
            </Btn>
          </div>
        </div>
      </div>
      {open && <ReagentInfo def={def} player={player} price={price} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Характеристики реагента: что это, где нужен и годится ли в горн. Рецепты показываются только известные. */
function ReagentInfo({
  def,
  player,
  price,
  onClose,
}: {
  def: ItemDef;
  player: Player;
  price: number;
  onClose: () => void;
}) {
  const cat = reagentCategoryOf(def);
  const shown = couponPreview(player, price);
  const uses = RECIPES.filter((r) => r.need.includes(def.id) && player.knownRecipes.includes(r.id));
  return (
    <Modal
      title={def.name}
      sub={`${REAGENT_CAT_LABEL[cat]} · уровень ${supplyLevel(def.id)}`}
      onClose={onClose}
      actions={<Btn onClick={onClose}>Закрыть</Btn>}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="shrink-0">
          <ItemArt id={def.id} name={def.name} size={120} />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[0.98rem] italic leading-snug text-mute">{def.desc}</p>
          <dl className="space-y-1">
            {[
              ["Категория", REAGENT_CAT_LABEL[cat]],
              ["Уровень", `${supplyLevel(def.id)}`],
              ["Цена", `${shown} зол.`],
              ["В сумке", `${player.bag[def.id] ?? 0}`],
              ["Годится для горна", isForgeReagent(def.id) ? "да" : "нет"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-0.5">
                <dt className="text-[0.98rem] text-mute">{label}</dt>
                <dd className="text-right font-mono text-[0.98rem] tab text-parch">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-line pt-3">
            <h4 className="sc mb-1 text-flamedim">Нужен в рецептах</h4>
            {uses.length > 0 ? (
              <ul className="space-y-1 text-[0.96rem] text-parch/90">
                {uses.map((r) => (
                  <li key={r.id}>{ITEMS[r.out].name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.96rem] text-mute">
                Среди известных рецептов его нет. Состав листов раскрывается после покупки.
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function giverLabel(quest: Quest): string {
  const meta = QUEST_GIVERS[quest.giver];
  return `${meta.role}: ${meta.name}`;
}

function rewardLine(quest: Quest): string {
  const coupon = quest.coupon ? " + скидка 25%" : "";
  return `${describeReward(quest.reward)}${coupon}`;
}

function OfferCard({ quest, disabled, onAccept }: { quest: Quest; disabled: boolean; onAccept: () => void }) {
  return (
    <div className="flex flex-col gap-2 border border-line bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-mute">{giverLabel(quest)}</span>
        <Tag>{QUEST_KIND_NAME[quest.kind]} · этаж {quest.floor}</Tag>
      </div>
      <div className="font-display text-sm uppercase tracking-[0.1em] text-flamehi">{quest.title}</div>
      <p className="text-sm text-mute">{quest.text}</p>
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="flex items-center gap-1 font-mono text-sm text-verd">
          <Package size={14} aria-hidden /> {rewardLine(quest)}
        </span>
        <Btn tone="flame" disabled={disabled} onClick={onAccept}>
          Взять
        </Btn>
      </div>
    </div>
  );
}

function progressText(quest: Quest, player: Player): string {
  if (quest.kind === "kill") return quest.done ? "Существо побеждено — сдай задание" : `Ищи на этаже ${quest.floor}`;
  if (quest.kind === "fetch") {
    if (logOf(player).carried.includes(quest.id)) return "Принесено — сдай задание";
    const where = quest.source === "drop" ? "с существа" : quest.source === "captive" ? "в плену" : "на полу";
    return `${quest.itemName ?? "Предмет"} ${where} на этаже ${quest.floor}`;
  }
  const have = player.bag[quest.reagent ?? ""] ?? 0;
  return `В сумке ${have} из ${quest.amount ?? 0}: ${ITEMS[quest.reagent ?? ""]?.name ?? ""}`;
}

function QuestCard({ quest, player, onClaim }: { quest: Quest; player: Player; onClaim: () => void }) {
  const ready = questReady(quest, player);
  return (
    <div className={`flex flex-col gap-2 border p-3 ${ready ? "border-verd bg-verd/5" : "border-line bg-black/30"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-mute">взято</span>
        <Tag>{QUEST_KIND_NAME[quest.kind]}</Tag>
      </div>
      <div className="font-display text-sm uppercase tracking-[0.1em] text-flamehi">{quest.title}</div>
      <p className="text-sm text-mute">{quest.text}</p>
      <div className="font-mono text-xs text-parch/85">{progressText(quest, player)}</div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="flex items-center gap-1 font-mono text-sm text-verd">
          <Coins size={14} aria-hidden /> {rewardLine(quest)}
        </span>
        <Btn tone={ready ? "verd" : "ghost"} disabled={!ready} onClick={onClaim}>
          Сдать
        </Btn>
      </div>
    </div>
  );
}

/** Взятые задания для карты подземелья: только просмотр. Сдача — в лобби у жителя. */
export function ActiveQuestList({ player }: { player: Player }) {
  const active = logOf(player).active;
  if (active.length === 0) {
    return <p className="text-sm italic text-mute">Взятых заданий нет. Задания берут у жителей в лобби.</p>;
  }
  return (
    <div className="space-y-3">
      {active.map((q) => {
        const ready = questReady(q, player);
        return (
          <div key={q.id} className={`flex flex-col gap-2 border p-3 ${ready ? "border-verd bg-verd/5" : "border-line bg-black/30"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-mute">{giverLabel(q)}</span>
              <Tag>{QUEST_KIND_NAME[q.kind]} · этаж {q.floor}</Tag>
            </div>
            <div className="font-display text-sm uppercase tracking-[0.1em] text-flamehi">{q.title}</div>
            <p className="text-sm text-mute">{q.text}</p>
            <div className="font-mono text-xs text-parch/85">{progressText(q, player)}</div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1 font-mono text-sm text-verd">
                <Coins size={14} aria-hidden /> {rewardLine(q)}
              </span>
              {ready && <Tag tone="verd">готово к сдаче</Tag>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
