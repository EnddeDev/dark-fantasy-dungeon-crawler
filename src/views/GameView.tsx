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
  const lobby = screen === "lobby";
  /* Вход или сообщество: в лобби и на карте с боем — в верхней панели. */
  const account = onOpenCommunity
    ? { label: "Сообщество", title: "Сообщество: игроки, рынок, обмены, дуэли, чат", onClick: onOpenCommunity }
    : onOpenAuth
      ? { label: "Войти", title: "Войти в аккаунт", onClick: onOpenAuth }
      : undefined;
  /* Левая панель: в лобби и на карте. В бою её нет: здоровье и сводка героя уже в карточке боя. */
  const rail = (
    <Rail
      player={player}
      run={run}
      battle={battle}
      onLeaveRun={() => game.leaveRun()}
      onRename={(name) => game.renameHero(name)}
      lobby={lobby}
    />
  );

  return (
    <div className={lobby ? "min-h-screen bg-soot" : "flex min-h-screen flex-col bg-soot lg:flex-row"}>
      {!lobby && screen !== "battle" && rail}
      <main className={lobby ? undefined : "order-2 min-w-0 flex-1"}>
        {lobby && (
          <Lobby
            player={player}
            controller={game.lobby}
            shopStock={shopStock}
            onStart={(floor) => game.startRun(floor)}
            onSetPouch={(index, id) => game.setPouchSlot(index, id)}
            onRestart={() => game.restart()}
            best={best}
            unlockedFloor={unlockedFloor}
            initialTab={lobbyEntry}
            account={account}
            leftPanel={rail}
          />
        )}
        {screen === "dungeon" && run && (
          <Dungeon
            run={run}
            player={player}
            bag={player.bag}
            intStat={player.stats.int}
            intDiscount={d.intDiscount}
            path={path}
            pathPaused={pathPaused}
            onMove={(dx, dy) => game.dungeon.move(dx, dy)}
            onCellClick={(x, y) => game.dungeon.clickCell(x, y)}
            onUseItem={(id) => game.dungeon.useFieldItem(id)}
            onCancelPath={() => game.dungeon.cancelPath()}
            onResumePath={() => game.dungeon.resumePath()}
            onSetPouch={(index, id) => game.setPouchSlot(index, id)}
            onEquip={(uid, slot, grip) => game.dungeon.equip(uid, slot, grip)}
            account={account}
          />
        )}
        {screen === "battle" && battle && (
          <BattleView
            battle={battle}
            onAct={(a) => game.battle.act(a)}
            onEnemyTurn={() => game.battle.enemyTurn()}
            onStunSkip={() => game.battle.skipStunned()}
            onContinue={() => game.battle.continueAfterWin()}
            player={player}
            floor={run?.floor}
            account={account}
          />
        )}
      </main>
      <ModalView game={game} state={state} />
    </div>
  );
}
