import { GameView } from "./views/GameView";
import { TitleView } from "./views/TitleView";
import { useGame } from "./views/hooks/useGame";

/**
 * Composition root.
 * MVC: Model хранит состояние, Controller принимает команды, View только отображает.
 */
export default function App() {
  const { controller, state } = useGame();
  if (state.screen === "title") {
    return <TitleView onEnter={(entry) => controller.enterLobby(entry)} />;
  }
  return <GameView game={controller} state={state} />;
}
