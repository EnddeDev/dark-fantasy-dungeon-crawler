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
export function GameView({ game, state }: { game: GameController; state: GameState }) {
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
    </div>
  );
}
