import { useState } from "react";
import type { Player } from "../../game/types";
import type { OnlineSession } from "../../net/online";
import type { PlayerSummary } from "../../net/protocol";
import { EmptyNote, ErrorBar, GearPicker, OnlineDot, Panel, useLoader } from "./shared";

/** Список игроков: рекорд этажа, друзья, вызов на дуэль и предложение обмена. */
export function PlayersTab({
  online,
  player,
  onChallenge,
  onDuelOpen,
}: {
  online: OnlineSession;
  player: Player;
  onChallenge: (id: string) => Promise<void>;
  onDuelOpen: () => void;
}) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const roster = useLoader(() => online.api.players(query), { players: [] as PlayerSummary[] });
  const [tradeTarget, setTradeTarget] = useState<PlayerSummary | null>(null);
  const [tradeItems, setTradeItems] = useState<string[]>([]);
  const [tradeMessage, setTradeMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setNotice(ok);
      roster.setError(null);
      await roster.refresh();
    } catch (err) {
      roster.setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const sendTrade = async () => {
    if (!tradeTarget || !tradeItems.length) return;
    await act(() => online.api.offerTrade(tradeTarget.id, tradeItems, tradeMessage), `Предложение отправлено: ${tradeTarget.name}`);
    setTradeTarget(null);
    setTradeItems([]);
    setTradeMessage("");
  };

  return (
    <div className="space-y-4">
      <ErrorBar error={roster.error} onClose={() => roster.setError(null)} />
      {notice && <div className="border border-verd/50 bg-verd/10 px-3 py-2 text-[0.94rem] text-verd">{notice}</div>}

      {tradeTarget && (
        <Panel
          title={`Обмен с ${tradeTarget.name}`}
          hint="Выберите предметы, которые готовы отдать. Получатель ответит встречным предложением или откажется."
          actions={
            <button onClick={() => setTradeTarget(null)} className="sc text-mute hover:text-rubric">
              закрыть
            </button>
          }
        >
          <GearPicker player={player} selected={tradeItems} onToggle={(uid) => setTradeItems((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]))} />
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-[240px] flex-1">
              <span className="sc mb-1 block">Сообщение</span>
              <input
                value={tradeMessage}
                onChange={(e) => setTradeMessage(e.target.value)}
                maxLength={200}
                placeholder="Зачем нужен обмен"
                className="w-full border border-line bg-soot px-2 py-2 font-mono text-sm text-parch outline-none focus:border-flamedim"
              />
            </label>
            <button
              onClick={sendTrade}
              disabled={busy || tradeItems.length === 0}
              className="border border-flame bg-flame/20 px-4 py-2 font-display text-sm uppercase tracking-[0.1em] text-flamehi disabled:opacity-40"
            >
              Предложить обмен · {tradeItems.length}
            </button>
          </div>
        </Panel>
      )}

      <Panel
        title="Игроки"
        hint={`${roster.data.players.length} в подземелье · сортировка по рекорду этажа`}
        actions={
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && roster.refresh()}
              placeholder="поиск по имени"
              className="w-40 border border-line bg-soot px-2 py-1.5 font-mono text-[0.86rem] text-parch outline-none focus:border-flamedim"
            />
            <button onClick={roster.refresh} className="sc text-mute hover:text-flamehi">
              обновить
            </button>
          </div>
        }
      >
        {roster.data.players.length === 0 ? (
          <EmptyNote>Пока никого. Позовите друга — вместе подземелье злее.</EmptyNote>
        ) : (
          <ul className="divide-y divide-line/60">
            {roster.data.players.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <OnlineDot online={p.online} />
                  <div className="min-w-0">
                    <div className="truncate font-display text-[1.02rem] uppercase tracking-[0.04em] text-parch">{p.name}</div>
                    <div className="font-mono text-[0.82rem] text-mute">
                      ур. {p.level} · макс. этаж {p.bestFloor} · побед {p.kills}
                      {p.friend ? " · друг" : ""}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() =>
                      act(
                        () => (p.friend ? online.api.removeFriend(p.id) : online.api.addFriend(p.id)),
                        p.friend ? `${p.name} убран из друзей` : `${p.name} добавлен в друзья`,
                      )
                    }
                    disabled={busy}
                    className="border border-line px-2 py-1 font-mono text-[0.8rem] text-mute hover:border-verd hover:text-verd disabled:opacity-40"
                  >
                    {p.friend ? "убрать из друзей" : "в друзья"}
                  </button>
                  <button
                    onClick={() => {
                      setTradeTarget(p);
                      setTradeItems([]);
                      setTradeMessage("");
                    }}
                    disabled={busy}
                    className="border border-line px-2 py-1 font-mono text-[0.8rem] text-mute hover:border-flame hover:text-flamehi disabled:opacity-40"
                  >
                    обмен
                  </button>
                  <button
                    onClick={async () => {
                      await onChallenge(p.id);
                      setNotice(`Вызов отправлен: ${p.name}`);
                      onDuelOpen();
                    }}
                    disabled={busy}
                    className="border border-rubric/60 px-2 py-1 font-mono text-[0.8rem] text-rubric hover:bg-rubric/15 disabled:opacity-40"
                  >
                    дуэль
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
