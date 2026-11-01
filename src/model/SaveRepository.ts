import type { Player } from "../game/types";
import { SHOP_MAX_LEVEL } from "../game/world";
import type { StorageLike } from "./types";

export class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** Репозиторий сохранений: единственный слой, который знает о localStorage. */
export class SaveRepository {
  static readonly BEST_KEY = "sumrak.best";
  static readonly UNLOCKED_KEY = "sumrak.unlocked-floor";
  static readonly PLAYER_KEY = "sumrak.player.v2";

  constructor(private storage: StorageLike) {}

  readBest(): number {
    try {
      return Number(this.storage.getItem(SaveRepository.BEST_KEY) ?? 0) || 0;
    } catch {
      return 0;
    }
  }

  writeBest(value: number): void {
    try {
      this.storage.setItem(SaveRepository.BEST_KEY, String(value));
    } catch {
      /* приватный режим */
    }
  }

  readUnlockedFloor(): number {
    try {
      return Math.max(1, this.readBest(), Number(this.storage.getItem(SaveRepository.UNLOCKED_KEY)) || 1);
    } catch {
      return 1;
    }
  }

  writeUnlockedFloor(floor: number): void {
    try {
      this.storage.setItem(SaveRepository.UNLOCKED_KEY, String(floor));
    } catch {
      /* приватный режим */
    }
  }

  readShopLevel(): number {
    try {
      const raw = this.storage.getItem(SaveRepository.PLAYER_KEY);
      if (raw) {
        const lvl = Number((JSON.parse(raw) as Player).shopLevel);
        if (Number.isFinite(lvl)) return Math.max(1, Math.min(SHOP_MAX_LEVEL, Math.round(lvl) || 1));
      }
    } catch {
      /* нет сохранения */
    }
    return 1;
  }

  readPlayer(): Player | null {
    try {
      const raw = this.storage.getItem(SaveRepository.PLAYER_KEY);
      return raw ? (JSON.parse(raw) as Player) : null;
    } catch {
      return null;
    }
  }

  writePlayer(player: Player): void {
    try {
      this.storage.setItem(SaveRepository.PLAYER_KEY, JSON.stringify(player));
    } catch {
      /* игра остаётся доступной без localStorage */
    }
  }
}
