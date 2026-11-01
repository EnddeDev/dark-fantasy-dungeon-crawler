import { enemyStep, playerAct, type BattleState, type PlayerAction } from "../game/battle";
import { grantXp } from "../game/content";
import { isBattleCurse } from "../game/traps";
import type { Player } from "../game/types";
import { SLOT_ORDER } from "../game/types";
import type { GameModel } from "../model/GameModel";
import { shuffled } from "../model/utils";
import type { GameController } from "./GameController";

/** Controller боя: действия игрока, ход врага, победа, побег и поражение. */
export class BattleController {
  constructor(private model: GameModel, private game: GameController) {}

  act(action: PlayerAction): void {
    const battle = this.model.getSnapshot().battle;
    if (!battle) return;
    const next = playerAct(battle, action);
    this.model.setBattle(next);
    this.resolveEnd(next);
  }

  enemyTurn(): void {
    const battle = this.model.getSnapshot().battle;
    if (!battle) return;
    const next = enemyStep(battle);
    this.model.setBattle(next);
    this.resolveEnd(next);
  }

  continueAfterWin(): void {
    const { battle, player, run, unlockedFloor } = this.model.getSnapshot();
    if (!battle || battle.over !== "win") return;
    const b = battle;
    const bag = { ...b.bag };
    b.loot.items.forEach((id) => (bag[id] = (bag[id] ?? 0) + 1));
    const withLoot: Player = {
      ...player,
      hp: b.p.hp,
      bag,
      armory: [...b.loot.gear, ...player.armory],
      kills: player.kills + 1,
      statuses: {
        wound: b.p.statuses.wound,
        curse: isBattleCurse(b.p.statuses.curse) ? 0 : b.p.statuses.curse,
        poison: b.p.statuses.poison,
        cursePower: isBattleCurse(b.p.statuses.curse) ? 0 : b.p.statuses.cursePower,
        chill: b.p.statuses.chill,
        fear: b.p.statuses.fear,
        wither: b.p.statuses.wither,
        burn: b.p.statuses.burn,
      },
    };
    const { player: updated, levelsGained } = grantXp(withLoot, b.loot.xp);

    let nextUnlocked = unlockedFloor;
    if (b.isBoss) {
      nextUnlocked = Math.max(unlockedFloor, b.floor + 1);
      this.game.saveUnlockedFloor(nextUnlocked);
    }

    const nextRun = run ? (() => {
      const maze = b.isBoss ? { ...run.maze, bossDefeated: true } : run.maze;
      const lvlNote = levelsGained > 0 ? ` Повышен уровень (+${levelsGained * 2} очк. хар.)!` : "";
      const monsterCell = run.battleCell ?? null;
      return {
        ...run,
        maze,
        battleCell: null,
        clearedMonsters:
          monsterCell === null ? run.clearedMonsters ?? [] : [...(run.clearedMonsters ?? []), monsterCell],
        gold: run.gold + b.loot.gold,
        loot: [...run.loot, ...b.loot.items],
        gearLoot: [...run.gearLoot, ...b.loot.gear],
        burning: 0,
        log: [...run.log, `Победа над ${b.enemy.def.name}: +${b.loot.gold} зол., +${b.loot.xp} XP.${lvlNote}${b.isBoss ? ` Открыт этаж ${b.floor + 1}.` : ""}`],
      };
    })() : null;

    this.model.update({ player: updated, unlockedFloor: nextUnlocked, run: nextRun, battle: null, screen: "dungeon" });
  }

  private resolveEnd(b: BattleState): void {
    if (!b.over || b.over === "win") return;
    if (b.over === "lose") {
      this.game.die("Ты не выдержал последнего удара. Подземелье забрало всё, что ты нашёл на его ярусах.");
      return;
    }
    this.resolveFlee(b);
  }

  private resolveFlee(b: BattleState): void {
    const { run, player } = this.model.getSnapshot();
    const basePlayer: Player = {
      ...player,
      hp: b.p.hp,
      bag: b.bag,
      statuses: {
        wound: b.p.statuses.wound,
        curse: isBattleCurse(b.p.statuses.curse) ? 0 : b.p.statuses.curse,
        poison: b.p.statuses.poison,
        cursePower: isBattleCurse(b.p.statuses.curse) ? 0 : b.p.statuses.cursePower,
        chill: b.p.statuses.chill,
        fear: b.p.statuses.fear,
        wither: b.p.statuses.wither,
        burn: b.p.statuses.burn,
      },
    };
    if (!run) {
      this.model.update({ player: basePlayer, battle: null, screen: "dungeon" });
      return;
    }
    const rate = b.fleeRate;
    const lostGold = Math.round(run.gold * rate);
    const droppedItems = shuffled(run.loot).slice(0, Math.floor(run.loot.length * rate));
    const droppedGear = shuffled(run.gearLoot).slice(0, Math.floor(run.gearLoot.length * rate));
    const droppedGearUids = new Set(droppedGear.map((g) => g.uid));
    const droppedCounts: Record<string, number> = {};
    droppedItems.forEach((id) => (droppedCounts[id] = (droppedCounts[id] ?? 0) + 1));

    const bag = { ...basePlayer.bag };
    Object.entries(droppedCounts).forEach(([id, count]) => {
      bag[id] = (bag[id] ?? 0) - count;
      if (bag[id] <= 0) delete bag[id];
    });
    const armory = basePlayer.armory.filter((g) => !droppedGearUids.has(g.uid));
    const equip = { ...basePlayer.equip };
    SLOT_ORDER.forEach((slot) => {
      if (equip[slot] && droppedGearUids.has(equip[slot]!)) equip[slot] = null;
    });

    const remaining = { ...droppedCounts };
    const nextRun = {
      ...run,
      pos: run.prevPos,
      battleCell: null,
      gold: run.gold - lostGold,
      loot: run.loot.filter((id) => {
        if ((remaining[id] ?? 0) > 0) {
          remaining[id] -= 1;
          return false;
        }
        return true;
      }),
      gearLoot: run.gearLoot.filter((g) => !droppedGearUids.has(g.uid)),
      burning: 0,
      log: [
        ...run.log,
        `Побег из боя: потеряно ${lostGold} зол., ${droppedItems.length} припасов и ${droppedGear.length} снар.` +
          (b.isBoss ? "" : " Ты отступил на шаг назад — тварь осталась на месте."),
      ],
    };

    this.model.update({
      player: { ...basePlayer, bag, armory, equip },
      run: nextRun,
      battle: null,
      screen: "dungeon",
      modal: {
        kind: "note",
        title: "Побег",
        body: lostGold || droppedItems.length || droppedGear.length
          ? `В панике ты выронил ${lostGold} золота и ${droppedItems.length + droppedGear.length} трофеев — около ${Math.round(rate * 100)}% собранного в подземелье.`
          : "Свиток тени унёс тебя без потерь: добыча цела.",
      },
    });
  }
}
