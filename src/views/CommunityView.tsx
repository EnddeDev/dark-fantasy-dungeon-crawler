import { useEffect, useState } from "react";
import { Coins, Dice5, MessageSquare, Store, UserRound, Users, X } from "lucide-react";
import type { Player } from "../game/types";
import { useOnline } from "../net/online";
import type { NotificationKind, PlayerSummary } from "../net/protocol";
import { ChatTab } from "./community/ChatTab";
import { DuelsTab } from "./community/DuelsTab";
import { MarketTab } from "./community/MarketTab";
import { PlayersTab } from "./community/PlayersTab";
import { ProfileTab } from "./community/ProfileTab";
import { TradesTab } from "./community/TradesTab";

export type CommunityTab = "players" | "market" | "trades" | "duels" | "chat" | "profile";

const TABS: { id: CommunityTab; label: string; Icon: typeof Users; kinds: NotificationKind[] }[] = [
  { id: "players", label: "Игроки", Icon: Users, kinds: ["friend_request", "friend_accepted"] },
  { id: "market", label: "Рынок", Icon: Store, kinds: ["market_sale"] },
  { id: "trades", label: "Обмены", Icon: Coins, kinds: ["trade"] },
  { id: "duels", label: "Дуэли", Icon: Dice5, kinds: ["duel"] },
  { id: "chat", label: "Чат", Icon: MessageSquare, kinds: ["dm"] },
  { id: "profile", label: "Профиль", Icon: UserRound, kinds: [] },
];

const PERMISSION_LABEL: Record<string, string> = {
  default: "включить уведомления",
  granted: "уведомления включены",
  denied: "уведомления запрещены в браузере",
};

/** Общий экран сообщества: игроки, рынок, обмены, дуэли и чаты. */
export function CommunityView({
  player,
  onClose,
  onPlayerChanged,
}: {
  player: Player;
  onClose: () => void;
  onPlayerChanged: () => Promise<void> | void;
}) {
  const online = useOnline();
  const [tab, setTab] = useState<CommunityTab>("players");
  const [openDuelId, setOpenDuelId] = useState<string | null>(null);
  const [chatPeer, setChatPeer] = useState<string | null>(null);

  /** Открыли раздел — его уведомления прочитаны. */
  function openTab(id: CommunityTab) {
    setTab(id);
    if (id !== "duels") setOpenDuelId(null);
    const kinds = TABS.find((t) => t.id === id)?.kinds ?? [];
    void online.markRead(kinds);
  }

  // Сообщество открыто на вкладке «Игроки»: её уведомления считаем прочитанными.
  useEffect(() => {
    void online.markRead(TABS[0].kinds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** «Написать» из профиля: открываем личный чат с этим игроком. */
  function writeTo(peer: PlayerSummary) {
    setChatPeer(peer.id);
    openTab("chat");
  }

  async function challenge(id: string) {
    try {
      const res = await online.api.challenge(id);
      setOpenDuelId(null);
      openTab("duels");
      void res;
    } catch (err) {
      throw err;
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-soot/97 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <span className="sc text-flamedim">Общий сервер</span>
            <h2 className="font-title text-3xl text-flamehi">Сообщество</h2>
            <p className="mt-1 font-mono text-[0.86rem] text-mute">
              {online.profile?.name} · ур. {online.profile?.level} · макс. этаж {online.profile?.bestFloor} ·{" "}
              <span className="text-flame">{player.gold} зол.</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {online.notifyPermission !== "unsupported" && (
              <button
                onClick={() => void online.requestNotifyPermission()}
                disabled={online.notifyPermission !== "default"}
                title="Уведомления о сообщениях, заявках, обменах, дуэлях и сделках, когда вкладка скрыта"
                className="border border-line px-3 py-1.5 font-mono text-[0.82rem] text-mute hover:border-flamedim hover:text-parch disabled:opacity-60"
              >
                {PERMISSION_LABEL[online.notifyPermission] ?? "уведомления недоступны"}
              </button>
            )}
            <button
              onClick={async () => {
                await onPlayerChanged();
              }}
              className="border border-line px-3 py-1.5 font-mono text-[0.82rem] text-mute hover:border-flamedim hover:text-parch"
            >
              синхронизировать
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 border border-line px-3 py-1.5 font-mono text-[0.82rem] text-parch hover:border-rubric hover:text-rubric"
            >
              <X size={14} aria-hidden /> к игре
            </button>
          </div>
        </header>

        <nav className="mb-4 flex flex-wrap gap-1.5">
          {TABS.map(({ id, label, Icon, kinds }) => {
            const count = kinds.reduce((sum, k) => sum + (online.unreadByKind[k] ?? 0), 0);
            return (
              <button
                key={id}
                onClick={() => openTab(id)}
                className={`flex items-center gap-1.5 border px-3 py-1.5 font-display text-[0.9rem] uppercase tracking-[0.08em] ${
                  tab === id ? "border-flame bg-flame/15 text-flamehi" : "border-line bg-black/30 text-mute hover:border-flamedim hover:text-parch"
                }`}
              >
                <Icon size={14} aria-hidden />
                {label}
                {count > 0 && tab !== id && (
                  <span className="ml-1 min-w-[1.25rem] rounded-sm bg-rubric px-1 text-center font-mono text-[0.72rem] leading-5 text-parch" aria-label={`новых: ${count}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {tab === "players" && (
          <PlayersTab
            online={online}
            player={player}
            onChallenge={challenge}
            onDuelOpen={() => openTab("duels")}
            onWrite={writeTo}
          />
        )}
        {tab === "market" && <MarketTab online={online} player={player} />}
        {tab === "trades" && <TradesTab online={online} player={player} />}
        {tab === "duels" && <DuelsTab online={online} openId={openDuelId} setOpenId={setOpenDuelId} />}
        {tab === "chat" && <ChatTab online={online} initialPeer={chatPeer} />}
        {tab === "profile" && <ProfileTab online={online} />}
      </div>
    </div>
  );
}
