import { derived } from "../game/battle";
import { checkCharacterName } from "../game/characterName";
import { rollShopStock } from "../game/content";
import { BIOMES, biomeHealingAmount, biomeVision, mazeBiome } from "../game/biomes";
import { genMaze, mazeSizeForFloor } from "../game/maze";
import { applyExitLoss, exitLossCounts, planExitLoss } from "../game/runExit";
import { deathLossRate, escapeLossRate } from "../game/runLoss";
import { setPouchSlot as setPouch } from "../game/pouch";
import { bagAfterDeath, bagAfterReturn, bagMerge, countsOf, departureSplit, type BagCounts } from "../game/runStash";
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

  /** Окно перед походом: выбор из рюкзака. Сам поход — по кнопке «Отправиться». */
  openDeparture(floor: number): void {
    const { unlockedFloor } = this.model.getSnapshot();
    if (!Number.isInteger(floor) || floor < 1 || floor > unlockedFloor) return;
    this.model.update({ modal: { kind: "departure", floor } });
  }

  /**
   * Старт этажа: в поход идут сумка, спец. предметы и выбранное из рюкзака;
   * остальное остаётся в рюкзаке лобби и вернётся при выходе.
   */
  startRun(floor: number, picked: BagCounts = {}): void {
    const { unlockedFloor, best, player } = this.model.getSnapshot();
    if (!Number.isInteger(floor) || floor < 1 || floor > unlockedFloor) return;
    const split = departureSplit(player, picked);
    const introSeen = player.dungeonIntroSeen === true;
    /* Задания этажа ставят метки на карту; благословение священника вступает в силу. */
    const quests = questsForFloor(player, floor);
    const maze = placeQuestMarks(genMaze(mazeSizeForFloor(floor), floor), quests, Math.random, floor);
    const blessed = startRunBlessing(player);
    const nextPlayer: Player = {
      ...blessed,
      bag: split.carried,
      hp: derived(blessed).maxHp,
      stamina: derived(blessed).staminaMax,
      statuses: { wound: 0, curse: 0, poison: 0, chill: 0, fear: 0, wither: 0, burn: 0 },
      dungeonIntroSeen: true,
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
        lobbyBag: split.lobby,
        keptBag: split.kept,
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
        revealedEvents: [],
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
      modal: introSeen ? null : { kind: "intro" },
    });
  }

  die(cause: string): void {
    const { run, player } = this.model.getSnapshot();
    /* Смерть теряет долю найденного за вылазку (см. runLoss); остальное возвращается в кошелёк и рюкзак. */
    const rate = run ? deathLossRate(run) : 0;
    const plan = run ? planExitLoss(run, rate) : { lostGold: 0, droppedItems: [], droppedGear: [] };
    const lostGearUids = new Set(plan.droppedGear.map((g) => g.uid));

    /* Сумка и спец. предметы, как раньше, плюс найденное, которое не потеряно. */
    const found = run ? countsOf(run.loot) : {};
    const dropped = countsOf(plan.droppedItems);
    const foundLeft: BagCounts = {};
    for (const [id, n] of Object.entries(found)) {
      const left = n - (dropped[id] ?? 0);
      if (left > 0) foundLeft[id] = left;
    }
    const bag: BagCounts = run ? bagMerge(bagAfterDeath(player.bag, run), foundLeft) : { ...player.bag };
    const armory = player.armory.filter((g) => !lostGearUids.has(g.uid));
    const equip = { ...player.equip };
    SLOT_ORDER.forEach((slot) => {
      if (equip[slot] && lostGearUids.has(equip[slot]!)) equip[slot] = null;
    });
    /* Смерть гасит благословение похода; принесённое в вылазке пропадает вместе с трофеем. */
    const nextPlayer: Player = {
      ...endRunBlessing(player),
      gold: player.gold + ((run?.gold ?? 0) - plan.lostGold),
      bag,
      armory,
      equip,
      statuses: { wound: 0, curse: 0, poison: 0, chill: 0, fear: 0, wither: 0, burn: 0 },
    };
    nextPlayer.hp = derived(nextPlayer).maxHp;
    nextPlayer.stamina = derived(nextPlayer).staminaMax;
    this.model.update({
      player: nextPlayer,
      run: null,
      battle: null,
      screen: "lobby",
      modal: {
        kind: "death",
        cause,
        lost: plan.lostGold,
        lostGear: plan.droppedGear.length,
        lostItems: plan.droppedItems.length,
        rate,
      },
    });
  }

  descend(): void {
    const { run, player, best } = this.model.getSnapshot();
    if (!run || !run.maze.bossDefeated) return;
    const nf = run.floor + 1;
    const maze = placeQuestMarks(genMaze(mazeSizeForFloor(nf), nf), questsForFloor(player, nf), Math.random, nf);
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
        revealedEvents: [],
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
    /* Правила входа в лабиринт видны один раз на аккаунт: новый герой их не покажет снова. */
    const introSeen = this.model.getSnapshot().player.dungeonIntroSeen === true;
    this.saves.clear();
    const player: Player = { ...PlayerFactory.createInitial(), ...(introSeen ? { dungeonIntroSeen: true } : {}) };
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
   * (доля из escapeLossRate); сначала показываем окно с потерями, уходим после подтверждения.
   */
  leaveRun(confirmed = false, unlockFloor?: number): void {
    const { run, player, unlockedFloor } = this.model.getSnapshot();
    if (!run) return;
    /* Победа над стражем в этом походе (любого яруса) снимает потери при выходе. */
    const rate = escapeLossRate(run);
    if (rate > 0 && !confirmed) {
      const counts = exitLossCounts(run, rate);
      this.model.update({ modal: { kind: "leave", gold: counts.gold, items: counts.items, gear: counts.gear, rate } });
      return;
    }
    const plan = planExitLoss(run, rate);
    const afterLoss = rate > 0 ? applyExitLoss(player, plan) : player;
    /* Рюкзак, оставленный в лобби на входе, возвращается целым. */
    const kept: Player = { ...afterLoss, bag: bagAfterReturn(afterLoss.bag, run) };
    /* Вернувшись живым, герой приносит трофеи и теряет благословение похода. */
    const home = endRunBlessing(deliverCarried(kept, run.questCarry));
    const savedGold = run.gold - plan.lostGold;
    const savedItems = run.loot.length - plan.droppedItems.length;
    const savedGear = run.gearLoot.length - plan.droppedGear.length;
    const lostNote = rate > 0 ? ` Потеряно при уходе с карты: ${plan.lostGold} золота, ${plan.droppedItems.length} расходуемых и ${plan.droppedGear.length} снаряжения.` : "";
    const opened = unlockFloor !== undefined && unlockFloor > unlockedFloor ? unlockFloor : null;
    if (opened !== null) this.saves.writeUnlockedFloor(opened);
    const openedNote = opened !== null ? ` Открыт ярус ${opened}.` : "";
    this.model.update({
      player: {
        ...home,
        gold: home.gold + savedGold,
        hp: derived(home).maxHp,
        stamina: derived(home).staminaMax,
        statuses: { wound: 0, curse: 0, poison: 0, chill: 0, fear: 0, wither: 0, burn: 0 },
      },
      ...(opened !== null ? { unlockedFloor: opened } : {}),
      path: [],
      pathPaused: false,
      shopStock: rollShopStock(player.shopLevel, run.floor),
      run: null,
      screen: "lobby",
      modal: {
        kind: "note",
        title: "Возвращение в лобби",
        body: `Ты выбрался живым! Сохранено ${savedGold} золота, ${savedItems} расходуемых предметов и ${savedGear} ед. трофейного снаряжения.${lostNote}${openedNote} Теперь можно распределить очки опыта и исследовать находки.`,
      },
    });
  }

  /**
   * Выход с лестницы: страж этажа повержен, поэтому уход без потерь. Следующий ярус открывается
   * для лобби, а спуск не делается — герой возвращается в лобби.
   */
  leaveFromStairs(): void {
    const { run } = this.model.getSnapshot();
    if (!run || !run.maze.bossDefeated) return;
    this.leaveRun(true, run.floor + 1);
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
