import { useState } from "react";
import { Coins, Package } from "lucide-react";
import { BLESSINGS, blessingPrice, type BlessingId } from "../game/blessings";
import { ITEMS, RARITY_META, WEAR_META, scaledGearStats } from "../game/content";
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
  questReady,
} from "../game/quests";
import type { LobbyController } from "../controllers/LobbyController";
import type { GearItem, Player, Quest, QuestGiverId, ShopLine } from "../game/types";
import { Btn, Panel, Tag } from "./ui";

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

/** Вкладка «Задания» лобби: ряд NPC с портретами и выбранный NPC с его заданиями и товарами. */
export function QuestsTab({
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
  /* Открываем того, у кого уже взято задание; иначе — священника. */
  const [giver, setGiver] = useState<QuestGiverId>(
    () => GIVER_ORDER.find((id) => log.active.some((q) => q.giver === id)) ?? "priest",
  );
  const activeFull = log.active.length >= QUEST_ACTIVE_LIMIT;

  return (
    <div className="space-y-5">
      <div>
        <span className="sc text-flamedim">Гильдия и лавки деревни</span>
        <h3 className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">Задания</h3>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          На карте этажа задания отмечены <b className="text-flamehi">восклицательным знаком</b>. Убийство засчитывается сразу.
          Трофей, остатки и живого товарища несёшь живым до лобби — там и сдаёшь. Реагенты берутся из сумки.
          Новые задания и товары появляются, когда ты проходишь новый этаж.
        </p>
        <p className="mt-2 text-sm text-mute">
          Взято заданий: {log.active.length}/{QUEST_ACTIVE_LIMIT}
          {log.coupons > 0 && <span className="ml-3 text-verd">Скидка 25% на следующую покупку: {log.coupons}</span>}
        </p>
      </div>

      <div role="tablist" aria-label="Жители деревни" className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {GIVER_ORDER.map((id) => (
          <NpcTabButton
            key={id}
            giver={id}
            selected={giver === id}
            ready={log.active.filter((q) => q.giver === id && questReady(q, player)).length}
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
      />
    </div>
  );
}

function NpcTabButton({
  giver,
  selected,
  ready,
  onSelect,
}: {
  giver: QuestGiverId;
  selected: boolean;
  ready: number;
  onSelect: () => void;
}) {
  const meta = QUEST_GIVERS[giver];
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`relative flex flex-col items-center gap-2 border p-2 text-center transition-colors ${
        selected ? "border-flamedim bg-flame/10" : "border-line bg-black/30 hover:border-flamedim"
      }`}
    >
      <NpcPortrait giver={giver} className="h-20 w-20 border border-line" />
      <span className="font-display text-xs uppercase tracking-[0.1em] text-parch">{meta.role}</span>
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
}: {
  giver: QuestGiverId;
  player: Player;
  controller: LobbyController;
  unlockedFloor: number;
  activeFull: boolean;
  say: (text: string | null) => void;
}) {
  const meta = QUEST_GIVERS[giver];
  const log = logOf(player);
  const offers = log.offers.filter((q) => q.giver === giver);
  const active = log.active.filter((q) => q.giver === giver);

  return (
    <Panel title={`${meta.role} · ${meta.name}`}>
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div>
          <NpcPortrait giver={giver} className="aspect-square w-full border border-line" />
        </div>
        <div className="space-y-5">
          <p className="text-sm text-mute">{meta.desc}</p>

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

          <NpcShop giver={giver} player={player} controller={controller} unlockedFloor={unlockedFloor} say={say} />
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
}: {
  giver: QuestGiverId;
  player: Player;
  controller: LobbyController;
  unlockedFloor: number;
  say: (text: string | null) => void;
}) {
  if (giver === "priest") return <BlessingShop player={player} controller={controller} unlockedFloor={unlockedFloor} say={say} />;
  if (giver === "wizard") {
    return (
      <LineShop
        title="Свитки и зелья"
        lines={logOf(player).wizard}
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
        emptyText="Реагенты распроданы. Обновятся при прохождении нового этажа."
        player={player}
        note={(line) => `осталось ${line.qty} · в сумке ${player.bag[line.id] ?? 0}`}
        onBuy={(id) => say(controller.buyVillagerItem(id))}
      />
    );
  }
  if (giver === "mercenary") return <MercenaryShop player={player} controller={controller} say={say} />;
  return (
    <section className="space-y-2">
      <h4 className="sc text-flamedim">Скидка</h4>
      <p className="text-sm text-mute">
        Этот NPC товаров не продаёт. Иногда его задания дают скидку 25% на одну следующую покупку.
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
  emptyText,
  player,
  note,
  onBuy,
}: {
  title: string;
  lines: ShopLine[];
  emptyText: string;
  player: Player;
  note: (line: ShopLine) => string;
  onBuy: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h4 className="sc text-flamedim">{title}</h4>
      {lines.length === 0 ? (
        <p className="text-sm text-mute">{emptyText}</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {lines.map((line) => {
            const def = ITEMS[line.id];
            const shown = couponPreview(player, line.price);
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
}: {
  player: Player;
  controller: LobbyController;
  say: (text: string | null) => void;
}) {
  const items = logOf(player).mercenary;
  return (
    <section className="space-y-3">
      <h4 className="sc text-flamedim">Исследованное снаряжение</h4>
      {items.length === 0 ? (
        <p className="text-sm text-mute">Наёмнику нечего предложить. Обновится при прохождении нового этажа.</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((item) => (
            <MercenaryCard key={item.uid} item={item} player={player} onBuy={() => say(controller.buyMercenaryItem(item.uid))} />
          ))}
        </div>
      )}
    </section>
  );
}

function MercenaryCard({ item, player, onBuy }: { item: GearItem; player: Player; onBuy: () => void }) {
  const st = scaledGearStats(item);
  const price = mercenaryPrice(item);
  const shown = couponPreview(player, price);
  return (
    <div className="flex items-center justify-between gap-3 border border-line bg-black/30 p-3">
      <div>
        <div className="font-display text-sm uppercase tracking-[0.1em] text-parch">{st.base.name}</div>
        <div className="text-xs text-mute">
          {RARITY_META[item.rarity].name} · {WEAR_META[item.wear].name} · уровень {item.level}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="font-mono text-sm text-flame">
          {shown !== price && <span className="mr-2 text-mute line-through">{price}</span>}
          {shown} зол.
        </span>
        <Btn tone={player.gold >= shown ? "flame" : "ghost"} disabled={player.gold < shown} onClick={onBuy}>
          Купить
        </Btn>
      </div>
    </div>
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
