import { useEffect, useRef, useState } from "react";
import type { Player } from "../../game/types";
import type { OnlineSession } from "../../net/online";
import type { FriendRequestView, PlayerProfileView, PlayerSummary } from "../../net/protocol";
import { EmptyNote, ErrorBar, GearPicker, OnlineDot, Panel, useLoader, useSync } from "./shared";

const PAGE = 20;

/** Подписи слотов экипировки в порядке, принятом в профиле. */
const PROFILE_SLOTS: { key: string; label: string }[] = [
  { key: "amulet", label: "Оберег" },
  { key: "head", label: "Шлем" },
  { key: "body", label: "Тело" },
  { key: "wrists", label: "Наручи" },
  { key: "mainHand", label: "Правая рука" },
  { key: "offHand", label: "Левая рука" },
  { key: "ring1", label: "Кольцо I" },
  { key: "ring2", label: "Кольцо II" },
  { key: "feet", label: "Ботинки" },
];

/**
 * Список игроков: порции по 20 при прокрутке, заявки в друзья, профиль с экипировкой
 * и быстрые действия: написать, обмен, дуэль.
 */
export function PlayersTab({
  online,
  player,
  onChallenge,
  onDuelOpen,
  onWrite,
}: {
  online: OnlineSession;
  player: Player;
  onChallenge: (id: string) => Promise<void>;
  onDuelOpen: () => void;
  onWrite: (peer: PlayerSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const requests = useLoader(() => online.api.friendRequests(), { incoming: [] as FriendRequestView[], outgoing: [] as FriendRequestView[] });
  const [tradeTarget, setTradeTarget] = useState<PlayerSummary | null>(null);
  const [tradeItems, setTradeItems] = useState<string[]>([]);
  const [tradeMessage, setTradeMessage] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const queryRef = useRef(query);
  queryRef.current = query;
  const loadingRef = useRef(false);
  const countRef = useRef(0);
  countRef.current = players.length;

  /** Первая порция (или обновление первой порции) с текущим поиском. */
  const loadFirst = async () => {
    try {
      const res = await online.api.players(queryRef.current, 0, PAGE);
      setPlayers((cur) => {
        // Обновляем первую порцию, а уже подгруженный хвост оставляем на месте.
        const rest = cur.slice(PAGE).filter((p) => !res.players.some((r) => r.id === p.id));
        return [...res.players, ...rest];
      });
      // Хвост уже подгружен — конец списка знает loadMore, а не первая порция.
      if (countRef.current <= PAGE) setHasMore(res.hasMore);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Список недоступен");
    }
  };

  const loadMore = async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const res = await online.api.players(queryRef.current, players.length, PAGE);
      setPlayers((cur) => [...cur, ...res.players.filter((p) => !cur.some((c) => c.id === p.id))]);
      setHasMore(res.hasMore);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Не удалось подгрузить игроков");
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  };

  // Поиск: новая выборка с первой порции через короткую паузу после ввода.
  useEffect(() => {
    const id = window.setTimeout(() => void loadFirst(), 300);
    return () => window.clearTimeout(id);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useSync(loadFirst, { live: online.live, scopes: ["players"], ms: 30_000, liveMs: 60_000 });
  useSync(() => void requests.refresh(), { live: online.live, scopes: ["friend"], ms: 15_000 });

  // Прокрутка: когда конец списка виден, подгружаем следующую порцию.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, players.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setNotice(ok);
      setListError(null);
      await Promise.all([loadFirst(), requests.refresh()]);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Ошибка");
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

  const incomingFor = (id: string) => requests.data.incoming.find((r) => r.player.id === id);
  const outgoingFor = (id: string) => requests.data.outgoing.find((r) => r.player.id === id);

  /** Кнопка дружбы зависит от состояния заявки. */
  const friendAction = (p: PlayerSummary) => {
    if (p.requestState === "friend") {
      return { label: "убрать из друзей", ok: `${p.name} убран из друзей`, run: () => online.api.removeFriend(p.id), tone: "" };
    }
    if (p.requestState === "incoming") {
      const req = incomingFor(p.id);
      if (!req) return null;
      return { label: "принять заявку", ok: `${p.name} теперь в друзьях`, run: () => online.api.acceptFriendRequest(req.requestId), tone: "verd" };
    }
    if (p.requestState === "outgoing") {
      const req = outgoingFor(p.id);
      if (!req) return null;
      return { label: "отозвать заявку", ok: `Заявка отозвана: ${p.name}`, run: () => online.api.cancelFriendRequest(req.requestId), tone: "" };
    }
    return { label: "в друзья", ok: `Заявка отправлена: ${p.name}`, run: () => online.api.sendFriendRequest(p.id), tone: "verd" };
  };

  const openTrade = (p: PlayerSummary) => {
    setTradeTarget(p);
    setTradeItems([]);
    setTradeMessage("");
    setProfileId(null);
  };

  return (
    <div className="space-y-4">
      <ErrorBar error={listError ?? requests.error} onClose={() => setListError(null)} />
      {notice && <div className="border border-verd/50 bg-verd/10 px-3 py-2 text-[0.94rem] text-verd">{notice}</div>}

      {(requests.data.incoming.length > 0 || requests.data.outgoing.length > 0) && (
        <Panel title="Заявки в друзья" hint="Дружба появляется после подтверждения получателем.">
          <ul className="divide-y divide-line/60">
            {requests.data.incoming.map((r) => (
              <li key={r.requestId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-display text-[1rem] uppercase tracking-[0.04em] text-parch">
                  {r.player.name} <span className="font-mono text-[0.8rem] normal-case text-mute">хочет добавить вас</span>
                </span>
                <span className="flex gap-1.5">
                  <button
                    disabled={busy}
                    onClick={() => act(() => online.api.acceptFriendRequest(r.requestId), `${r.player.name} теперь в друзьях`)}
                    className="border border-verd/60 bg-verd/10 px-2 py-1 font-mono text-[0.8rem] text-verd hover:bg-verd/20 disabled:opacity-40"
                  >
                    принять
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => act(() => online.api.declineFriendRequest(r.requestId), `Заявка отклонена: ${r.player.name}`)}
                    className="border border-line px-2 py-1 font-mono text-[0.8rem] text-mute hover:border-rubric hover:text-rubric disabled:opacity-40"
                  >
                    отклонить
                  </button>
                </span>
              </li>
            ))}
            {requests.data.outgoing.map((r) => (
              <li key={r.requestId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-display text-[1rem] uppercase tracking-[0.04em] text-parch">
                  {r.player.name} <span className="font-mono text-[0.8rem] normal-case text-mute">ждёт ответа</span>
                </span>
                <button
                  disabled={busy}
                  onClick={() => act(() => online.api.cancelFriendRequest(r.requestId), `Заявка отозвана: ${r.player.name}`)}
                  className="border border-line px-2 py-1 font-mono text-[0.8rem] text-mute hover:border-rubric hover:text-rubric disabled:opacity-40"
                >
                  отозвать
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {profileId && (
        <ProfilePanel
          online={online}
          id={profileId}
          busy={busy}
          onClose={() => setProfileId(null)}
          onFriend={(p) => {
            const action = friendAction(p);
            if (action) void act(action.run, action.ok);
          }}
          friendLabel={(p) => friendAction(p)?.label ?? null}
          onWrite={(p) => {
            setProfileId(null);
            onWrite(p);
          }}
          onTrade={openTrade}
          onDuel={async (p) => {
            setProfileId(null);
            await onChallenge(p.id);
            setNotice(`Вызов отправлен: ${p.name}`);
            onDuelOpen();
          }}
        />
      )}

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
        hint={`${players.length}${hasMore ? "+" : ""} в подземелье · по 20, дальше при прокрутке`}
        actions={
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="поиск по имени"
            className="w-40 border border-line bg-soot px-2 py-1.5 font-mono text-[0.86rem] text-parch outline-none focus:border-flamedim"
          />
        }
      >
        {players.length === 0 && !listError ? (
          <EmptyNote>{query ? "Никто не найден." : "Пока никого. Позовите друга — вместе подземелье злее."}</EmptyNote>
        ) : (
          <ul className="divide-y divide-line/60">
            {players.map((p) => {
              const action = friendAction(p);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <OnlineDot online={p.online} />
                    <div className="min-w-0">
                      <button
                        onClick={() => setProfileId(p.id)}
                        className="truncate text-left font-display text-[1.02rem] uppercase tracking-[0.04em] text-parch hover:text-flamehi"
                        title="Открыть профиль"
                      >
                        {p.name}
                      </button>
                      <div className="font-mono text-[0.82rem] text-mute">
                        ур. {p.level} · макс. этаж {p.bestFloor} · побед {p.kills}
                        {p.requestState === "friend" ? " · друг" : ""}
                        {p.requestState === "incoming" ? " · ждёт вашего ответа" : ""}
                        {p.requestState === "outgoing" ? " · заявка отправлена" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {action && (
                      <button
                        onClick={() => act(action.run, action.ok)}
                        disabled={busy}
                        className={`border border-line px-2 py-1 font-mono text-[0.8rem] text-mute disabled:opacity-40 ${
                          action.tone === "verd" ? "hover:border-verd hover:text-verd" : "hover:border-rubric hover:text-rubric"
                        }`}
                      >
                        {action.label}
                      </button>
                    )}
                    <button
                      onClick={() => openTrade(p)}
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
              );
            })}
          </ul>
        )}
        <div ref={sentinel} className="py-2 text-center font-mono text-[0.8rem] text-mute">
          {loadingMore ? "загружаем ещё…" : hasMore ? "прокрутите ниже, чтобы увидеть ещё" : players.length > 0 ? "это все игроки" : ""}
        </div>
      </Panel>
    </div>
  );
}

/** Профиль игрока: экипировка и характеристики. Золота, сундука, сумки, архетипа и рекорда здесь нет. */
function ProfilePanel({
  online,
  id,
  busy,
  onClose,
  onFriend,
  friendLabel,
  onWrite,
  onTrade,
  onDuel,
}: {
  online: OnlineSession;
  id: string;
  busy: boolean;
  onClose: () => void;
  onFriend: (p: PlayerSummary) => void;
  friendLabel: (p: PlayerSummary) => string | null;
  onWrite: (p: PlayerSummary) => void;
  onTrade: (p: PlayerSummary) => void;
  onDuel: (p: PlayerSummary) => Promise<void>;
}) {
  const [profile, setProfile] = useState<PlayerProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setProfile(null);
    online.api
      .playerProfile(id)
      .then((res) => alive && setProfile(res.profile))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Профиль недоступен"));
    return () => {
      alive = false;
    };
  }, [id, online.api]);

  const asSummary = (): PlayerSummary | null =>
    profile
      ? {
          id: profile.id,
          login: "",
          name: profile.name,
          level: profile.level,
          bestFloor: 0,
          online: profile.online,
          friend: profile.friend,
          requestState: profile.requestState,
          kills: 0,
        }
      : null;

  const summary = asSummary();
  const label = summary ? friendLabel(summary) : null;

  return (
    <Panel
      title={profile ? `Профиль: ${profile.name}` : "Профиль"}
      hint={profile ? `ур. ${profile.level} · ${profile.online ? "в игре" : "не в сети"}` : undefined}
      actions={
        <button onClick={onClose} className="sc text-mute hover:text-rubric">
          закрыть
        </button>
      }
    >
      <ErrorBar error={error} />
      {!profile && !error && <p className="font-mono text-[0.9rem] text-mute">загружаем профиль…</p>}
      {profile && summary && (
        <div className="space-y-4">
          <div>
            <div className="sc mb-2 text-flamedim">Характеристики</div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["СИЛ", profile.stats.str],
                  ["ЛОВ", profile.stats.agi],
                  ["ИНТ", profile.stats.int],
                ] as const
              ).map(([name, value]) => (
                <div key={name} className="border border-line bg-black/30 px-2 py-2 text-center">
                  <div className="font-mono text-[0.78rem] text-mute">{name}</div>
                  <div className="font-display text-xl text-parch">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="sc mb-2 text-flamedim">Экипировка</div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {PROFILE_SLOTS.map(({ key, label: slotLabel }) => {
                const item = profile.equip[key];
                return (
                  <li key={key} className="flex min-w-0 items-center justify-between gap-2 border border-line bg-black/30 px-2 py-1.5">
                    <span className="font-mono text-[0.8rem] text-mute">{slotLabel}</span>
                    <span className={`truncate font-display text-[0.95rem] uppercase ${item ? "text-parch" : "italic text-mute/70"}`}>
                      {item ? `${item.name} · ур. ${item.level}` : "пусто"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
            {label && (
              <button
                onClick={() => onFriend(summary)}
                disabled={busy}
                className="border border-line px-2.5 py-1.5 font-mono text-[0.82rem] text-mute hover:border-verd hover:text-verd disabled:opacity-40"
              >
                {label}
              </button>
            )}
            <button
              onClick={() => onWrite(summary)}
              disabled={!summary.friend}
              title={summary.friend ? undefined : "Личные сообщения — только для друзей"}
              className="border border-line px-2.5 py-1.5 font-mono text-[0.82rem] text-mute hover:border-flame hover:text-flamehi disabled:opacity-40"
            >
              написать
            </button>
            <button
              onClick={() => onTrade(summary)}
              className="border border-line px-2.5 py-1.5 font-mono text-[0.82rem] text-mute hover:border-flame hover:text-flamehi"
            >
              предложить обмен
            </button>
            <button
              onClick={() => void onDuel(summary)}
              className="border border-rubric/60 px-2.5 py-1.5 font-mono text-[0.82rem] text-rubric hover:bg-rubric/15"
            >
              вызвать на дуэль
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
