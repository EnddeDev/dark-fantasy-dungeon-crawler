import { useState } from "react";
import { useOnline } from "./net/online";
import { useSaveSync } from "./net/useSaveSync";
import { AuthView } from "./views/AuthView";
import { CommunityView } from "./views/CommunityView";
import { GameView } from "./views/GameView";
import { TitleView } from "./views/TitleView";
import { useGame } from "./views/hooks/useGame";

/**
 * Composition root.
 * MVC: Model хранит состояние, Controller принимает команды, View только отображает.
 * Онлайн-слой (аккаунт, рынок, обмены, дуэли, чаты) подключается поверх игры и
 * не мешает соло-режиму, если сервер недоступен.
 */
export default function App() {
  const { controller, state } = useGame();
  const online = useOnline();
  const [community, setCommunity] = useState(false);
  useSaveSync(controller, online);

  return (
    <>
      {state.screen === "title" ? (
        <TitleView onEnter={(entry) => controller.enterLobby(entry)} />
      ) : (
        <GameView
          game={controller}
          state={state}
          onOpenCommunity={online.status === "online" ? () => setCommunity(true) : undefined}
          onOpenAuth={online.status === "online" ? undefined : online.openAuth}
        />
      )}
      {community && online.status === "online" && (
        <CommunityView
          player={state.player}
          onClose={() => setCommunity(false)}
          onPlayerChanged={async () => {
            await online.reload();
          }}
        />
      )}
      {/* Форма входа, а при недоступном сервере — объяснение, почему онлайн не работает. */}
      {online.authOpen && <AuthView />}
    </>
  );
}
