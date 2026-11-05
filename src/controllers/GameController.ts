import { derived } from "../game/battle";
import { checkCharacterName } from "../game/characterName";
import { rollShopStock } from "../game/content";
import { BIOMES, biomeHealingAmount, biomeVision, mazeBiome } from "../game/biomes";
import { genMaze, mazeSizeForFloor } from "../game/maze";
import { applyExitLoss, EXIT_LOSS_RATE, exitLossCounts, planExitLoss } from "../game/runExit";
import { setPouchSlot as setPouch } from "../game/pouch";
import { deliverCarried, endRunBlessing, placeQuestMarks, questsForFloor, startRunBlessing } from "../game/quests";
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
    this.unsubscribe = this.model.subscribe(() => {
      this.healInLobby();
      this.persistIfLobby();
    });
  }

  static fromBrowser(): GameController {
    return new GameController(window.localStorage);
  }

  dispose(): void {
    this.unsubscribe();
  }

  enterLobby(entry: LobbyEntry): void {
    const { player } = this.model.getSnapshot();
    /* В лобби герой отдыхает: здоровье всегда полное. */
    this.model.update({ screen: "lobby", lobbyEntry: entry, player: { ...player, hp: derived(player).maxHp } });
  }

  closeModal(): void {
    this.model.setModal(null);
  }

  startRun(floor: number): void {
    const { unlockedFloor, best, player } = this.model.getSnapshot();
    if (!Number.isInteger(floor) || floor < 1 || floor > unlockedFloor) return;
    /* Задания этажа ставят метки на карту; благословение священника вступает в силу. */
    const quests = questsForFloor(player, floor);
    const maze = placeQuestMarks(genMaze(mazeSizeForFloor(floor), floor), quests);
    const blessed = startRunBlessing(player);
    const nextPlayer: Player = {
      ...blessed,
      hp: derived(blessed).maxHp,
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
        /* Ловушки видны сразу: на карте не остаётся скрытых механизмов. */
        revealedTraps: [],
        sprungTraps: [],
        questCarry: [],
        log: [
          ...(quests.length ? [`На этаже задания: ${quests.map((q) => q.title).join("; ")}.`] : []),
          `Спускаетесь на этаж ${floor}: ${BIOMES[mazeBiome(maze)].name}. Факел освещает круг радиусом ${biomeVision(mazeBiome(maze))}, но стены и запертые двери блокируют свет.`,
          `На ${maze.size}×${maze.size} карте: ${maze.monsters.length} монстров и ${maze.traps.length} ловушек. Все ловушки отмечены на карте с самого начала.`,
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
      const left = Math.max(0, (bag[id] ?? 0) - 1);
      if (left > 0) bag[id] = left;
      else delete bag[id];
    });
    const armory = player.armory.filter((g) => !lostGearUids.has(g.uid));
    const equip = { ...player.equip };
    SLOT_ORDER.forEach((slot) => {
      if (equip[slot] && lostGearUids.has(equip[slot]!)) equip[slot] = null;
    });
    /* Смерть гасит благословение похода; принесённое в вылазке пропадает вместе с трофеем. */
    const nextPlayer: Player = {
      ...endRunBlessing(player),
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
    const maze = placeQuestMarks(genMaze(mazeSizeForFloor(nf), nf), questsForFloor(player, nf));
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
        revealedTraps: [],
        sprungTraps: [],
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

  /** «Начать заново»: стирает сохранения и возвращает к титульному экрану. */
  restart(): void {
    this.saves.clear();
    const player = PlayerFactory.createInitial();
    this.model.update({
      screen: "title",
      lobbyEntry: "train",
      player,
      shopStock: rollShopStock(player.shopLevel, 1),
      run: null,
      battle: null,
      path: [],
      pathPaused: false,
      best: 0,
      unlockedFloor: 1,
      modal: null,
      toast: null,
    });
  }

  /** Смена имени героя из боковой панели. Возвращает текст ошибки или null, если имя сохранено. */
  /** Сумка с зельями: меняется вне боя. Возвращает текст ошибки или null. */
  setPouchSlot(index: number, id: string | null): string | null {
    const { battle, player } = this.model.getSnapshot();
    if (battle) return "В бою сумку не переложить.";
    const res = setPouch(player, index, id);
    if (!res.ok) return res.error;
    this.model.updatePlayer((p) => ({ ...p, pouch: res.pouch }));
    return null;
  }

  renameHero(raw: string): string | null {
    const check = checkCharacterName(raw);
    if (!check.ok) return check.error;
    this.model.updatePlayer((p) => ({ ...p, name: check.name }));
    return null;
  }

  /**
   * Выход в лобби. Без победы над стражем текущего яруса теряется доля добытого
   * (EXIT_LOSS_RATE); сначала показываем окно с потерями, уходим после подтверждения.
   */
  leaveRun(confirmed = false): void {
    const { run, player } = this.model.getSnapshot();
    if (!run) return;
    const rate = run.maze.bossDefeated ? 0 : EXIT_LOSS_RATE;
    if (rate > 0 && !confirmed) {
      const counts = exitLossCounts(run, rate);
      this.model.update({ modal: { kind: "leave", gold: counts.gold, items: counts.items, gear: counts.gear } });
      return;
    }
    const plan = planExitLoss(run, rate);
    const kept = rate > 0 ? applyExitLoss(player, plan) : player;
    /* Вернувшись живым, герой приносит трофеи и теряет благословение похода. */
    const home = endRunBlessing(deliverCarried(kept, run.questCarry));
    const savedGold = run.gold - plan.lostGold;
    const savedItems = run.loot.length - plan.droppedItems.length;
    const savedGear = run.gearLoot.length - plan.droppedGear.length;
    const lostNote = rate > 0 ? ` Потеряно при выходе без стража: ${plan.lostGold} золота, ${plan.droppedItems.length} расходуемых и ${plan.droppedGear.length} снаряжения.` : "";
    this.model.update({
      player: {
        ...home,
        gold: home.gold + savedGold,
        hp: derived(home).maxHp,
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
        body: `Ты выбрался живым! Сохранено ${savedGold} золота, ${savedItems} расходуемых предметов и ${savedGear} ед. трофейного снаряжения.${lostNote} Теперь можно распределить очки опыта и исследовать находки.`,
      },
    });
  }

  saveUnlockedFloor(floor: number): void {
    this.saves.writeUnlockedFloor(floor);
  }

  /** В лобби здоровье всегда полное: герой отдыхает между вылазками. */
  private healInLobby(): void {
    const { screen, run, battle, player } = this.model.getSnapshot();
    if (screen !== "lobby" || run || battle) return;
    const maxHp = derived(player).maxHp;
    if (player.hp !== maxHp) this.model.setPlayer({ ...player, hp: maxHp });
  }

  private persistIfLobby(): void {
    const { screen, run, battle, player } = this.model.getSnapshot();
    if (screen !== "lobby" || run || battle) return;
    this.saves.writePlayer(player);
  }
}
