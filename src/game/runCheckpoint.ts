import { heroAfterBattle, type BattleState } from "./battle";
import type { Player, Run } from "./types";

/**
 * Точка сохранения аккаунта: герой и карта похода (null — лобби).
 * Во время боя точка — состояние героя из боя и признак открытого боя (`pendingFight`):
 * выход не откатывает урон, а вход начинает бой заново.
 */
export interface Checkpoint {
  player: Player;
  run: Run | null;
}

/** Минимум полей состояния игры, нужный для выбора точки. */
export interface CheckpointSource {
  screen: string;
  player: Player;
  run: Run | null;
  battle: BattleState | null;
}

/** Карта без признака открытого боя: в модели похода он не живёт. */
function plainRun(run: Run): Run {
  const { pendingFight, ...rest } = run;
  return rest;
}

/**
 * Безопасная точка или null. Лобби и титул — без боя и похода; карта — без боя.
 * Во время боя — герой из боя (здоровье, выносливость, эффекты, сумка) и карта с открытым боем.
 */
export function checkpointOf(state: CheckpointSource): Checkpoint | null {
  if (state.battle) {
    if (!state.run) return null;
    const { battle } = state;
    return {
      player: heroAfterBattle(state.player, battle),
      run: { ...plainRun(state.run), pendingFight: { foe: battle.enemy.def.id, boss: battle.isBoss } },
    };
  }
  if (!state.run) return { player: state.player, run: null };
  if (state.screen === "dungeon") return { player: state.player, run: plainRun(state.run) };
  return null;
}
