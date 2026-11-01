import type { BattleState } from "../game/battle";
import type { Cell, GearItem, ModalState, Player, Run } from "../game/types";
import type { GameState, LobbyEntry, Screen } from "./types";

type Listener = () => void;

/**
 * Observable Model всего приложения.
 * Controllers изменяют состояние только через этот класс, View подписывается через useSyncExternalStore.
 */
export class GameModel {
  private state: GameState;
  private listeners = new Set<Listener>();

  constructor(initial: GameState) {
    this.state = initial;
  }

  getSnapshot = (): GameState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  update(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  setScreen(screen: Screen): void {
    this.update({ screen });
  }

  setLobbyEntry(lobbyEntry: LobbyEntry): void {
    this.update({ lobbyEntry });
  }

  setPlayer(player: Player): void {
    this.update({ player });
  }

  updatePlayer(fn: (player: Player) => Player): void {
    this.setPlayer(fn(this.state.player));
  }

  setRun(run: Run | null): void {
    this.update({ run });
  }

  updateRun(fn: (run: Run | null) => Run | null): void {
    this.setRun(fn(this.state.run));
  }

  setBattle(battle: BattleState | null): void {
    this.update({ battle });
  }

  updateBattle(fn: (battle: BattleState | null) => BattleState | null): void {
    this.setBattle(fn(this.state.battle));
  }

  setModal(modal: ModalState | null): void {
    this.update({ modal });
  }

  setShopStock(shopStock: GearItem[]): void {
    this.update({ shopStock });
  }

  setPath(path: Cell[], pathPaused = false): void {
    this.update({ path, pathPaused });
  }

  setToast(toast: string | null): void {
    this.update({ toast });
  }

  logRun(line: string): void {
    this.updateRun((run) => (run ? { ...run, log: [...run.log, line] } : run));
  }
}
