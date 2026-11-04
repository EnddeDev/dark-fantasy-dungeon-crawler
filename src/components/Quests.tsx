import { Coins, Package } from "lucide-react";
import { BLESSINGS, blessingPrice, type BlessingId } from "../game/blessings";
import { ITEMS, RARITY_META, WEAR_META, scaledGearStats } from "../game/content";
import {
  QUEST_ACTIVE_LIMIT,
  QUEST_GIVERS,
  QUEST_KIND_NAME,
  couponPreview,
  describeReward,
  logOf,
  mercenaryPrice,
  questReady,
  WIZARD_MAX_QTY,
} from "../game/quests";
import type { LobbyController } from "../controllers/LobbyController";
import type { Player, Quest, QuestGiverId } from "../game/types";
import { Btn, Panel, Tag } from "./ui";

/** Вкладка «Задания» лобби: доска заданий, взятые задания и товары NPC. */
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
        {log.coupons > 0 && (
          <p className="mt-2 text-sm text-verd">
            Скидка 25% на следующую покупку: {log.coupons}. Действует в магазине, у NPC и на рецепты.
          </p>
        )}
      </div>

      <Panel title={`Взятые задания · ${log.active.length}/${QUEST_ACTIVE_LIMIT}`}>
        {log.active.length === 0 ? (
          <p className="text-sm text-mute">Пока ничего не взято. Выбери задание на доске ниже.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {log.active.map((q) => (
              <QuestCard key={q.id} quest={q} player={player} onClaim={() => say(controller.claimQuest(q.id))} />
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Доска заданий · предложений: ${log.offers.length}`}>
        {log.offers.length === 0 ? (
          <p className="text-sm text-mute">Новых заданий нет. Они появятся, когда пройдёшь новый этаж.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {log.offers.map((q) => (
              <OfferCard
                key={q.id}
                quest={q}
                disabled={activeFull}
                onAccept={() => say(controller.acceptQuest(q.id))}
              />
            ))}
          </div>
        )}
        {activeFull && (
          <p className="mt-3 text-sm text-rubric">Одновременно можно вести не больше {QUEST_ACTIVE_LIMIT} заданий.</p>
        )}
      </Panel>

      <Panel title="Священник · благословение на поход">
        <NpcIntro giver="priest" />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {log.blessingOffers.map((id) => {
            const def = BLESSINGS[id as BlessingId];
            if (!def) return null;
            const price = blessingPrice(unlockedFloor);
            const shown = couponPreview(player, price);
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
        <p className="mt-3 text-sm text-mute">
          {log.blessingNext
            ? `На следующий поход: ${BLESSINGS[log.blessingNext as BlessingId]?.name ?? "благословение"}. Вступит в силу при спуске.`
            : "Одно благословение за раз. Действует в одном походе: при выходе или смерти гаснет."}
          {player.blessing && (
            <span className="ml-1 text-verd">Сейчас в силе: {BLESSINGS[player.blessing as BlessingId]?.name}.</span>
          )}
        </p>
      </Panel>

      <Panel title="Волшебник · свитки и зелья">
        <NpcIntro giver="wizard" />
        {log.wizard.length === 0 ? (
          <p className="mt-3 text-sm text-mute">Товар распродан. Обновится при прохождении нового этажа.</p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {log.wizard.map((line) => {
              const def = ITEMS[line.id];
              const shown = couponPreview(player, line.price);
              return (
                <div key={line.id} className="flex items-center justify-between gap-3 border border-line bg-black/30 p-3">
                  <div>
                    <div className="font-display text-sm uppercase tracking-[0.1em] text-parch">{def?.name ?? line.id}</div>
                    <div className="text-xs text-mute">{def?.desc}</div>
                    <div className="mt-1 font-mono text-xs text-mute">
                      осталось {line.qty} из {WIZARD_MAX_QTY} · в сумке {player.bag[line.id] ?? 0}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="font-mono text-sm text-flame">
                      {shown !== line.price && <span className="mr-2 text-mute line-through">{line.price}</span>}
                      {shown} зол.
                    </span>
                    <Btn tone={player.gold >= shown ? "flame" : "ghost"} disabled={player.gold < shown} onClick={() => say(controller.buyWizardItem(line.id))}>
                      Купить
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Наёмник · исследованное снаряжение">
        <NpcIntro giver="mercenary" />
        {log.mercenary.length === 0 ? (
          <p className="mt-3 text-sm text-mute">Наёмнику нечего предложить. Обновится при прохождении нового этажа.</p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {log.mercenary.map((item) => {
              const st = scaledGearStats(item);
              const price = mercenaryPrice(item);
              const shown = couponPreview(player, price);
              return (
                <div key={item.uid} className="flex items-center justify-between gap-3 border border-line bg-black/30 p-3">
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
                    <Btn tone={player.gold >= shown ? "flame" : "ghost"} disabled={player.gold < shown} onClick={() => say(controller.buyMercenaryItem(item.uid))}>
                      Купить
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Сельчанин · реагенты">
        <NpcIntro giver="villager" />
        {log.villager.length === 0 ? (
          <p className="mt-3 text-sm text-mute">Реагенты распроданы. Обновятся при прохождении нового этажа.</p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {log.villager.map((line) => {
              const def = ITEMS[line.id];
              const shown = couponPreview(player, line.price);
              return (
                <div key={line.id} className="flex items-center justify-between gap-3 border border-line bg-black/30 p-3">
                  <div>
                    <div className="font-display text-sm uppercase tracking-[0.1em] text-parch">{def?.name ?? line.id}</div>
                    <div className="font-mono text-xs text-mute">осталось {line.qty} · в сумке {player.bag[line.id] ?? 0}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="font-mono text-sm text-flame">
                      {shown !== line.price && <span className="mr-2 text-mute line-through">{line.price}</span>}
                      {shown} зол.
                    </span>
                    <Btn tone={player.gold >= shown ? "flame" : "ghost"} disabled={player.gold < shown} onClick={() => say(controller.buyVillagerItem(line.id))}>
                      Купить
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function NpcIntro({ giver }: { giver: QuestGiverId }) {
  const meta = QUEST_GIVERS[giver];
  return (
    <p className="text-sm text-mute">
      <b className="text-parch">{meta.name}</b> · {meta.role}. {meta.desc}
    </p>
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
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-mute">{giverLabel(quest)}</span>
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
