import { useState } from "react";
import { Coins, Dice5, MessageSquare, Store, Users, X } from "lucide-react";
import type { Player } from "../game/types";
import { useOnline } from "../net/online";
import { ChatTab } from "./community/ChatTab";
import { DuelsTab } from "./community/DuelsTab";
import { MarketTab } from "./community/MarketTab";
import { PlayersTab } from "./community/PlayersTab";
import { TradesTab } from "./community/TradesTab";

export type CommunityTab = "players" | "market" | "trades" | "duels" | "chat";

const TABS: { id: CommunityTab; label: string; Icon: typeof Users }[] = [
  { id: "players", label: "Игроки", Icon: Users },
  { id: "market", label: "Рынок", Icon: Store },
  { id: "trades", label: "Обмены", Icon: Coins },
  { id: "duels", label: "Дуэли", Icon: Dice5 },
  { id: "chat", label: "Чат", Icon: MessageSquare },
];

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

  async function challenge(id: string) {
    try {
      const res = await online.api.challenge(id);
      setOpenDuelId(null);
      setTab("duels");
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
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                if (id !== "duels") setOpenDuelId(null);
              }}
              className={`flex items-center gap-1.5 border px-3 py-1.5 font-display text-[0.9rem] uppercase tracking-[0.08em] ${
                tab === id ? "border-flame bg-flame/15 text-flamehi" : "border-line bg-black/30 text-mute hover:border-flamedim hover:text-parch"
              }`}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        {tab === "players" && (
          <PlayersTab
            online={online}
            player={player}
            onChallenge={challenge}
            onDuelOpen={() => setTab("duels")}
          />
        )}
        {tab === "market" && <MarketTab online={online} player={player} />}
        {tab === "trades" && <TradesTab online={online} player={player} />}
        {tab === "duels" && <DuelsTab online={online} openId={openDuelId} setOpenId={setOpenDuelId} />}
        {tab === "chat" && <ChatTab online={online} />}
      </div>
    </div>
  );
}
