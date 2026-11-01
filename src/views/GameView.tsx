import { Users } from "lucide-react";
import { BattleView } from "../components/BattleView";
import { Dungeon } from "../components/Dungeon";
import { Lobby } from "../components/Lobby";
import { Rail } from "../components/Rail";
import type { GameController } from "../controllers/GameController";
import { derived } from "../game/battle";
import type { GameState } from "../model/types";
import { ModalView } from "./ModalView";
import { useDungeonInput } from "./hooks/useDungeonInput";

/** Корневой View игрового экрана: компонует представления и передаёт команды Controller. */
export function GameView({
  game,
  state,
  onOpenCommunity,
  onOpenAuth,
}: {
  game: GameController;
  state: GameState;
  onOpenCommunity?: () => void;
  onOpenAuth?: () => void;
}) {
  useDungeonInput(game, state);
  const { screen, player, run, battle, shopStock, best, unlockedFloor, lobbyEntry, path, pathPaused } = state;
  const d = derived(player);

  return (
    <div className="flex min-h-screen flex-col bg-soot lg:flex-row">
      <Rail player={player} run={run} battle={battle} onLeaveRun={() => game.leaveRun()} />
      <main className="order-2 min-w-0 flex-1">
        {screen === "lobby" && (
          <Lobby
            player={player}
            controller={game.lobby}
            shopStock={shopStock}
            onStart={(floor) => game.startRun(floor)}
            best={best}
            unlockedFloor={unlockedFloor}
            initialTab={lobbyEntry}
          />
        )}
        {screen === "dungeon" && run && (
          <Dungeon
            run={run}
            player={player}
            bag={player.bag}
            hp={player.hp}
            maxHp={d.maxHp}
            intStat={player.stats.int}
            intDiscount={d.intDiscount}
            path={path}
            pathPaused={pathPaused}
            onMove={(dx, dy) => game.dungeon.move(dx, dy)}
            onCellClick={(x, y) => game.dungeon.clickCell(x, y)}
            onUseItem={(id) => game.dungeon.useFieldItem(id)}
            onEquip={(uid, slot) => game.dungeon.equip(uid, slot)}
            onUnequip={(slot) => game.dungeon.unequip(slot)}
            onCancelPath={() => game.dungeon.cancelPath()}
            onResumePath={() => game.dungeon.resumePath()}
          />
        )}
        {screen === "battle" && battle && (
          <BattleView
            battle={battle}
            onAct={(a) => game.battle.act(a)}
            onEnemyTurn={() => game.battle.enemyTurn()}
            onContinue={() => game.battle.continueAfterWin()}
          />
        )}
      </main>
      <ModalView game={game} state={state} />
      {(onOpenCommunity || onOpenAuth) && (
        <button
          onClick={onOpenCommunity ?? onOpenAuth}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 border border-flamedim bg-slab/95 px-3 py-2 font-display text-[0.85rem] uppercase tracking-[0.1em] text-flamehi shadow-[0_10px_30px_-12px_#000] hover:border-flame hover:bg-flame/15"
          title={onOpenCommunity ? "Сообщество: игроки, рынок, обмены, дуэли, чат" : "Войти в аккаунт"}
        >
          <Users size={15} aria-hidden />
          {onOpenCommunity ? "Сообщество" : "Войти"}
        </button>
      )}
    </div>
  );
}
