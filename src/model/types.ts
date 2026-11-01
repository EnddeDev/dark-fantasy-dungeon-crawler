import type { BattleState } from "../game/battle";
import type { Cell, GearItem, ModalState, Player, Run } from "../game/types";

export type Screen = "title" | "lobby" | "dungeon" | "battle";
export type LobbyEntry = "train" | "guide";

/**
 * Снимок состояния игры для View.
 * Model хранитplain DTO, чтобы сериализация и тесты не зависели от React.
 */
export interface GameState {
  screen: Screen;
  lobbyEntry: LobbyEntry;
  player: Player;
  shopStock: GearItem[];
  run: Run | null;
  battle: BattleState | null;
  modal: ModalState | null;
  best: number;
  unlockedFloor: number;
  path: Cell[];
  pathPaused: boolean;
  toast: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}
