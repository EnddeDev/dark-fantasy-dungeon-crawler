import { derived } from "../game/battle";
import { rollShopStock } from "../game/content";
import { BIOMES, biomeHealingAmount, biomeVision, mazeBiome } from "../game/biomes";
import { genMaze, mazeSizeForFloor } from "../game/maze";
import type { Player } from "../game/types";
import { SLOT_ORDER } from "../game/types";
import { GameModel } from "../model/GameModel";
import { PlayerFactory } from "../model/PlayerFactory";
import { SaveRepository } from "../model/SaveRepository";
import type { GameState, LobbyEntry, StorageLike } from "../model/types";
import { BattleController } from "./BattleController";
import { DungeonController } from "./DungeonController";
import { LobbyController } from "./LobbyController";

/**
 * Корневой Controller приложения: экраны, вылазка, смерть, спуск и сохранение.
 * Делегирует доменные команды специализированным контроллерам.
 */
export class GameController {
  readonly model: GameModel;
  readonly lobby: LobbyController;
  readonly dungeon: DungeonController;
  readonly battle: BattleController;
  private saves: SaveRepository;
  private unsubscribe: () => void;

  constructor(storage: StorageLike) {
    this.saves = new SaveRepository(storage);
    const player = PlayerFactory.restore(this.saves.readPlayer());
    const initial: GameState = {
      screen: "title",
      lobbyEntry: "train",
      player,
      shopStock: rollShopStock(this.saves.readShopLevel(), 1),
      run: null,
      battle: null,
      modal: null,
      best: this.saves.readBest(),
      unlockedFloor: this.saves.readUnlockedFloor(),
      path: [],
      pathPaused: false,
      toast: null,
    };
    this.model = new GameModel(initial);
    this.lobby = new LobbyController(this.model);
    this.dungeon = new DungeonController(this.model, this);
    this.battle = new BattleController(this.model, this);
    this.unsubscribe = this.model.subscribe(() => this.persistIfLobby());
  }

  static fromBrowser(): GameController {
    return new GameController(window.localStorage);
  }

  dispose(): void {
    this.unsubscribe();
  }

  enterLobby(entry: LobbyEntry): void {
    this.model.update({ screen: "lobby", lobbyEntry: entry });
  }

  closeModal(): void {
    this.model.setModal(null);
  }

  startRun(floor: number): void {
    const { unlockedFloor, best, player } = this.model.getSnapshot();
    if (!Number.isInteger(floor) || floor < 1 || floor > unlockedFloor) return;
    const maze = genMaze(mazeSizeForFloor(floor), floor);
    const nextPlayer: Player = {
      ...player,
      hp: derived(player).maxHp,
      statuses: { wound: 0, curse: 0, poison: 0, chill: 0, fear: 0, wither: 0, burn: 0 },
    };
    const nextBest = Math.max(best, floor);
    if (floor > best) this.saves.writeBest(floor);
    this.model.update({
      player: nextPlayer,
      run: {
        floor,
        maze,
        pos: { ...maze.start },
        prevPos: { ...maze.start },
        seen: { [`${maze.start.x},${maze.start.y}`]: true },
        gold: 0,
        loot: [],
        gearLoot: [],
        keys: 0,
        steps: 0,
        torchTurns: 0,
        mapRevealed: false,
        burning: 0,
        battleCell: null,
        clearedMonsters: [],
        revealedTraps: [],
        sprungTraps: [],
        log: [
          `Спускаетесь на этаж ${floor}: ${BIOMES[mazeBiome(maze)].name}. Факел освещает круг радиусом ${biomeVision(mazeBiome(maze))}, но стены и запертые двери блокируют свет.`,
          `На ${maze.size}×${maze.size} карте: ${maze.monsters.length} монстров и ${maze.traps.length} ловушек. Монстры видны в свете факела, ловушки обычно скрыты.`,
        ],
      },
      best: nextBest,
      path: [],
      pathPaused: false,
      screen: "dungeon",
      lobbyEntry: "train",
      modal: { kind: "intro" },
    });
  }

  die(cause: string): void {
    const { run, player } = this.model.getSnapshot();
    const lost = run?.gold ?? 0;
    const lostItems = [...(run?.loot ?? [])];
    const lostGearUids = new Set((run?.gearLoot ?? []).map((g) => g.uid));
    const lostGearCount = lostGearUids.size;

    const bag = { ...player.bag };
    lostItems.forEach((id) => {
      bag[id] = (bag[id] ?? 0) - 1;
      if (bag[id] <= 0) delete bag[id];
    });
    const armory = player.armory.filter((g) => !lostGearUids.has(g.uid));
    const equip = { ...player.equip };
    SLOT_ORDER.forEach((slot) => {
      if (equip[slot] && lostGearUids.has(equip[slot]!)) equip[slot] = null;
    });
    const nextPlayer: Player = {
      ...player,
      bag,
      armory,
      equip,
      statuses: { wound: 0, curse: 0, poison: 0, chill: 0, fear: 0, wither: 0, burn: 0 },
    };
    nextPlayer.hp = derived(nextPlayer).maxHp;
    this.model.update({
      player: nextPlayer,
      run: null,
      battle: null,
      screen: "lobby",
      modal: { kind: "death", cause, lost, lostGear: lostGearCount },
    });
  }

  descend(): void {
    const { run, player, best } = this.model.getSnapshot();
    if (!run || !run.maze.bossDefeated) return;
    const nf = run.floor + 1;
    const maze = genMaze(mazeSizeForFloor(nf), nf);
    const d = derived(player);
    const nextBest = Math.max(best, nf);
    if (nf > best) this.saves.writeBest(nf);
    this.model.update({
      run: {
        ...run,
        floor: nf,
        maze,
        pos: { ...maze.start },
        prevPos: { ...maze.start },
        seen: { [`${maze.start.x},${maze.start.y}`]: true },
        keys: 0,
        torchTurns: 0,
        mapRevealed: false,
        burning: 0,
        log: [...run.log, `Спуск на этаж ${nf}: ${BIOMES[mazeBiome(maze)].name}. ${BIOMES[mazeBiome(maze)].effect}`],
      },
      player: { ...player, hp: Math.min(d.maxHp, player.hp + biomeHealingAmount(mazeBiome(maze), 10)) },
      path: [],
      pathPaused: false,
      shopStock: rollShopStock(player.shopLevel, nf),
      best: nextBest,
      modal: null,
    });
  }

  leaveRun(): void {
    const { run, player } = this.model.getSnapshot();
    if (!run) return;
    const d = derived(player);
    this.model.update({
      player: {
        ...player,
        gold: player.gold + run.gold,
        hp: d.maxHp,
        statuses: { wound: 0, curse: 0, poison: 0, chill: 0, fear: 0, wither: 0, burn: 0 },
      },
      path: [],
      pathPaused: false,
      shopStock: rollShopStock(player.shopLevel, run.floor),
      run: null,
      screen: "lobby",
      modal: {
        kind: "note",
        title: "Возвращение в лобби",
        body: `Ты выбрался живым! Сохранено ${run.gold} золота, ${run.loot.length} расходуемых предметов и ${run.gearLoot.length} ед. трофейного снаряжения. Теперь можно распределить очки опыта и исследовать находки.`,
      },
    });
  }

  saveUnlockedFloor(floor: number): void {
    this.saves.writeUnlockedFloor(floor);
  }

  private persistIfLobby(): void {
    const { screen, run, battle, player } = this.model.getSnapshot();
    if (screen !== "lobby" || run || battle) return;
    this.saves.writePlayer(player);
  }
}
