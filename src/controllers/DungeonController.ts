import { derived, newBattle, rollConsumableLoot, rollGearDrop } from "../game/battle";
import { biomeHealingAmount, mazeBiome } from "../game/biomes";
import { playSfx } from "../audio/sfx";
import { CHEST_RARITY_WEIGHTS, DUNGEON_GOLD_SHARE, GEAR_BASES, ITEMS, consumableIntReq, consumablePower, equipItem, grantXp, pick, reagentPoolForFloor, scaledGearStats, unequipSlot } from "../game/content";
import { cellIdx, findPath, openDirs, wallBetween } from "../game/maze";
import { pruneRunLoot } from "../game/runLoot";
import { CHILL_HEAL_MULT, curseTickFrom, magicTickFrom, refreshedTick, trapTickFrom } from "../game/statusEffects";
import { applyTrapOutcome, isBattleCurse, lockpickChance, makeTrap, resolveTrap, rollTrapKind, type TrapAction } from "../game/traps";
import type { GearItem, Player, Run, Slot } from "../game/types";
import { SLOT_META } from "../game/types";
import { MAP_EVENTS, choiceChance, mapEventById, type MapEffect, type MapEvent } from "../game/world";
import type { EventSpawn } from "../game/types";
import type { GameModel } from "../model/GameModel";
import type { GameController } from "./GameController";

/** Controller подземелья: шаги, маршрут, двери, ловушки, события и полевые предметы. */
export class DungeonController {
  constructor(private model: GameModel, private game: GameController) {}

  private get state() {
    return this.model.getSnapshot();
  }

  move(dx: number, dy: number, fromPath = false): void {
    if (!fromPath) this.model.setPath([], false);
    const { screen, modal, run } = this.state;
    if (screen !== "dungeon" || modal || !run) return;
    const { x, y } = run.pos;
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= run.maze.size || ny >= run.maze.size) return;
    if (wallBetween(run.maze, x, y, dx, dy)) {
      this.model.logRun("Каменная стена. Сквозь неё ни пройти, ни заглянуть.");
      return;
    }
    const id = cellIdx(nx, ny, run.maze.size);
    if (run.maze.doors.includes(id) && !run.maze.openedDoors.includes(id)) {
      this.model.setModal({ kind: "door", x: nx, y: ny });
      return;
    }
    this.stepInto(nx, ny);
  }

  clickCell(cx: number, cy: number): void {
    const { run, modal, battle, screen } = this.state;
    if (!run || modal || battle || screen !== "dungeon") return;
    if (cx === run.pos.x && cy === run.pos.y) return;
    const route = findPath(run.maze, run.pos, { x: cx, y: cy }, { avoidClosedDoors: run.keys === 0 });
    if (!route || route.length === 0) {
      this.model.setPath([], false);
      this.model.logRun("Туда нет открытого пути.");
      return;
    }
    this.model.setPath(route, false);
  }

  cancelPath(): void {
    this.model.setPath([], false);
  }

  resumePath(): void {
    this.model.update({ pathPaused: false });
  }

  equip(uid: string, slot: Slot): void {
    const player = this.state.player;
    const before = derived(player).maxHp;
    const res = equipItem(player, uid, slot);
    const item = player.armory.find((g) => g.uid === uid);
    const name = item ? GEAR_BASES[item.baseId]?.name ?? "предмет" : "предмет";
    const after = derived(res.player).maxHp;
    this.model.setPlayer({ ...res.player, hp: Math.min(after, res.player.hp + Math.max(0, after - before)) });
    if (res.player !== player) playSfx("equip");
    this.model.logRun(`Смена снаряжения: ${name} → ${SLOT_META[slot].name.toLowerCase()}${res.note ? `. ${res.note}` : "."}`);
  }

  unequip(slot: Slot): void {
    if (this.state.player.equip[slot]) playSfx("unequip");
    this.model.updatePlayer((p) => {
      const before = derived(p).maxHp;
      const next = unequipSlot(p, slot);
      const after = derived(next).maxHp;
      return { ...next, hp: Math.min(after, next.hp + Math.max(0, after - before)) };
    });
    this.model.logRun(`${SLOT_META[slot].name}: снято.`);
  }

  /**
   * Общий расчёт последствий события. Возвращает новые значения, ничего не
   * записывая в модель: этим пользуются и выборы, и негативные события.
   */
  private applyMapEffects(
    effects: MapEffect[],
    ctx: { player: Player; hp: number; statuses: Player["statuses"]; floor: number; run: Run },
  ) {
    const d = derived(ctx.player);
    const biome = mazeBiome(ctx.run.maze);
    let hp = ctx.hp;
    const statuses = { ...ctx.statuses };
    const stats = { ...ctx.player.stats } as Record<string, number>;
    const gainedItems: string[] = [];
    const gainedGear: GearItem[] = [];
    let goldDelta = 0;
    let xpGain = 0;
    let torchDelta = 0;

    for (const e of effects) {
      switch (e.k) {
        case "hp": hp += e.v ?? 0; break;
        case "heal": hp = Math.min(d.maxHp, hp + biomeHealingAmount(biome, e.v ?? 0)); break;
        case "heal_full": hp = d.maxHp; break;
        case "heal_pct": hp = Math.min(d.maxHp, hp + Math.round(d.maxHp * ((e.v ?? 0) / 100))); break;
        case "dmg_pct": hp -= Math.round(d.maxHp * ((e.v ?? 0) / 100)); break;
        case "gold": goldDelta += e.v ?? 0; break;
        case "gold_loss": goldDelta -= e.v ?? 0; break;
        case "gold_pct": goldDelta -= Math.round(ctx.run.gold * ((e.v ?? 0) / 100)); break;
        case "xp": xpGain += e.v ?? 0; break;
        case "curse":
          statuses.curseTick = refreshedTick(statuses.curse > 0, statuses.curseTick ?? 0, curseTickFrom(ctx.floor));
          statuses.curse = Math.max(statuses.curse, e.v ?? 0);
          break;
        case "poison":
          statuses.poisonTick = refreshedTick(statuses.poison > 0, statuses.poisonTick ?? 0, trapTickFrom("poison", ctx.floor));
          statuses.poison = Math.max(statuses.poison, e.v ?? 0);
          break;
        case "cleanse": statuses.curse = 0; statuses.poison = 0; break;
        case "reagent": for (let i = 0; i < (e.v ?? 1); i++) gainedItems.push(pick(reagentPoolForFloor(ctx.floor))); break;
        case "supply": for (let i = 0; i < (e.v ?? 1); i++) gainedItems.push(pick(["potion_s", "antidote", "scroll_spark", "throwing_knife"])); break;
        case "gear": for (let i = 0; i < (e.v ?? 1); i++) gainedGear.push(rollGearDrop(ctx.floor, CHEST_RARITY_WEIGHTS, ctx.floor)); break;
        case "stat": if (e.stat) stats[e.stat] = Math.min(10, (stats[e.stat] ?? 1) + (e.v ?? 1)); break;
        case "torch": torchDelta += e.v ?? 0; break;
      }
    }
    hp = Math.min(hp, derived({ ...ctx.player, stats: stats as Player["stats"] }).maxHp);
    return { hp, statuses, stats: stats as Player["stats"], gainedItems, gainedGear, goldDelta, xpGain, torchDelta };
  }

  resolveEvent(eventId: string, choiceId: string, cell?: number): void {
    const { run, player } = this.state;
    const ev = mapEventById(eventId);
    if (!ev || !run) return;
    const choice = ev.choices.find((c) => c.id === choiceId);
    if (!choice) return;

    /* «Не сейчас»: событие остаётся на карте и ждёт возвращения. */
    if (choice.leave) {
      this.model.setModal(null);
      this.model.logRun(`${ev.name}: оставлено на потом.`);
      return;
    }

    const good = Math.random() < choiceChance(choice, player.stats);
    const effects: MapEffect[] = good ? choice.good : choice.bad;
    const res = this.applyMapEffects(effects, { player, hp: player.hp, statuses: player.statuses, floor: run.floor, run });

    const nextPlayer: Player = {
      ...player,
      hp: res.hp <= 0 ? 0 : Math.max(1, res.hp),
      stats: res.stats,
      statuses: res.statuses,
      bag: (() => {
        const bag = { ...player.bag };
        res.gainedItems.forEach((id) => (bag[id] = (bag[id] ?? 0) + 1));
        return bag;
      })(),
      armory: [...res.gainedGear, ...player.armory],
    };
    this.model.setPlayer(res.xpGain > 0 ? grantXp(nextPlayer, res.xpGain).player : nextPlayer);

    /* Метка комнаты, где стоит герой (или та, что передал интерфейс). */
    const here = cell ?? cellIdx(run.pos.x, run.pos.y, run.maze.size);
    const merged: Run = { ...run };
    if (run.maze.events.includes(here) && !run.maze.usedEvents.includes(here)) {
      merged.maze = { ...run.maze, usedEvents: [...run.maze.usedEvents, here] };
    }
    if (res.goldDelta !== 0) merged.gold = Math.max(0, run.gold + res.goldDelta);
    if (res.gainedItems.length) merged.loot = [...run.loot, ...res.gainedItems];
    if (res.gainedGear.length) merged.gearLoot = [...res.gainedGear, ...run.gearLoot];
    if (res.torchDelta) merged.torchTurns = Math.max(0, (run.torchTurns ?? 0) + res.torchDelta);
    merged.log = [
      ...run.log,
      `${ev.name}: ${good ? "удача" : "неудача"} — ${good ? choice.goodText : choice.badText}`,
    ];
    this.model.setRun(merged);

    if (res.hp <= 0) {
      this.game.die("Событие подземелья забрало последние силы.");
      return;
    }
    this.model.setModal({
      kind: "event",
      eventId,
      cell: here,
      result: good
        ? { title: ev.name, good: choice.goodText }
        : { title: ev.name, good: choice.badText },
    });
  }

  /**
   * Негативное событие: выбора нет, всё случается, когда герой шагает на клетку события.
   * Часть таких событий призывает тварей — бой сразу или стая на карте.
   */
  private fireNegativeEvent(spawn: EventSpawn, ev: MapEvent): void {
    const { run, player } = this.state;
    if (!run) return;
    const res = this.applyMapEffects(ev.effects ?? [], {
      player,
      hp: player.hp,
      statuses: player.statuses,
      floor: run.floor,
      run,
    });

    const nextPlayer: Player = {
      ...player,
      hp: res.hp <= 0 ? 0 : Math.max(1, res.hp),
      statuses: res.statuses,
      stats: res.stats,
      bag: (() => {
        const bag = { ...player.bag };
        res.gainedItems.forEach((id) => (bag[id] = (bag[id] ?? 0) + 1));
        return bag;
      })(),
      armory: [...res.gainedGear, ...player.armory],
    };
    this.model.setPlayer(res.xpGain > 0 ? grantXp(nextPlayer, res.xpGain).player : nextPlayer);

    let next: Run = {
      ...run,
      maze: { ...run.maze, usedEvents: [...run.maze.usedEvents, spawn.cell] },
      gold: res.goldDelta !== 0 ? Math.max(0, run.gold + res.goldDelta) : run.gold,
      loot: res.gainedItems.length ? [...run.loot, ...res.gainedItems] : run.loot,
      gearLoot: res.gainedGear.length ? [...res.gainedGear, ...run.gearLoot] : run.gearLoot,
      torchTurns: res.torchDelta ? Math.max(0, (run.torchTurns ?? 0) + res.torchDelta) : run.torchTurns,
      log: [...run.log, `${ev.name}: ${ev.text ?? "событие сработало."}`],
    };

    /* Стая появляется рядом с героем прямо на карте. */
    if (ev.summon && "pack" in ev.summon) {
      const spawned = this.packCells(next, ev.summon.pack);
      next = {
        ...next,
        maze: { ...next.maze, monsters: [...next.maze.monsters, ...spawned] },
        clearedMonsters: (next.clearedMonsters ?? []).filter((c) => !spawned.includes(c)),
      };
      next.log = [...next.log, spawned.length ? `Рядом объявились твари: ${spawned.length}.` : "Твари рычат где-то рядом, но в комнату не входят."];
    }

    this.model.setRun(next);
    this.model.setPath([]);

    if (res.hp <= 0) {
      this.game.die(`${ev.name}: последние силы остались в этой комнате.`);
      return;
    }

    /* Катастрофа и ужас бьют сразу — это бой, а не значок на карте. */
    if (ev.summon && "battle" in ev.summon) {
      const np = this.state.player;
      this.model.setRun({ ...next, battleCell: null });
      this.model.setBattle(
        newBattle({ ...np, hp: Math.max(1, np.hp) }, next.floor, false, mazeBiome(next.maze), next.torchTurns ?? 0, 0, ev.summon.battle),
      );
      this.model.setScreen("battle");
      return;
    }

    this.model.setModal({ kind: "event", eventId: ev.id, cell: spawn.cell, result: { title: ev.name, good: ev.text ?? "" } });
  }

  /** Свободные клетки в двух-трёх шагах от героя — для стаи из негативного события. */
  private packCells(run: Run, count: number): number[] {
    const m = run.maze;
    const size = m.size;
    const taken = new Set<number>([
      ...m.monsters,
      ...m.traps,
      ...m.events,
      ...m.chests,
      ...m.doors,
      ...m.keys,
      cellIdx(run.pos.x, run.pos.y, size),
      cellIdx(m.boss.x, m.boss.y, size),
      cellIdx(m.stairs.x, m.stairs.y, size),
    ]);
    const cands: { cell: number; dist: number }[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const cell = cellIdx(x, y, size);
        if (taken.has(cell) || openDirs(m, x, y).length === 0) continue;
        const way = findPath(m, run.pos, { x, y });
        if (!way || way.length < 1 || way.length > 3) continue;
        cands.push({ cell, dist: way.length });
      }
    cands.sort((a, b) => a.dist - b.dist || Math.random() - 0.5);
    return cands.slice(0, count).map((c) => c.cell);
  }

  takeTrap(action: TrapAction): void {
    const { modal, run, player } = this.state;
    if (!modal || modal.kind !== "trap" || !run) return;
    const trap = modal.trap;
    const hasKit = (player.bag.sapper_kit ?? 0) > 0;
    if (action === "disarm" && !hasKit) return;
    const outcome = resolveTrap(trap, action, player.stats, hasKit, run.floor);
    this.model.setModal(null);
    const hp = player.hp - outcome.damage;
    const statuses = applyTrapOutcome(player.statuses, trap, outcome);
    this.model.logRun(`${outcome.message}${outcome.damage > 0 ? ` −${outcome.damage} здоровья.` : ""}${outcome.xp > 0 ? ` +${outcome.xp} XP.` : ""}`);
    if (outcome.usedKit) {
      this.model.updateRun((p) => (p ? { ...p, loot: pruneRunLoot(p.loot, { sapper_kit: 1 }) } : p));
    }
    if (hp <= 0) {
      this.model.updatePlayer((p) => ({ ...p, hp: 0, statuses }));
      this.game.die("Ловушка сработала быстрее, чем ты успел отскочить.");
      return;
    }
    this.model.updatePlayer((p) => {
      const bag = { ...p.bag };
      if (outcome.usedKit) {
        bag.sapper_kit = (bag.sapper_kit ?? 0) - 1;
        if (bag.sapper_kit <= 0) delete bag.sapper_kit;
      }
      const next = { ...p, hp, statuses, bag };
      return outcome.xp > 0 ? grantXp(next, outcome.xp).player : next;
    });
  }

  pickDoor(x: number, y: number): void {
    const { run, player } = this.state;
    if (!run || (player.bag.lockpicks ?? 0) <= 0) return;
    const success = Math.random() < lockpickChance(player.stats.agi);
    this.model.updateRun((p) => (p ? { ...p, loot: pruneRunLoot(p.loot, { lockpicks: 1 }) } : p));
    this.model.updatePlayer((p) => {
      const bag: Record<string, number> = { ...p.bag, lockpicks: (p.bag.lockpicks ?? 0) - 1 };
      if (bag.lockpicks <= 0) delete bag.lockpicks;
      return { ...p, bag };
    });
    if (!success) {
      this.model.logRun("Отмычка сломалась в замке. Дверь осталась запертой.");
      this.model.setModal({ kind: "note", title: "Отмычка сломалась", body: "Замок не поддался. Отмычка потрачена, но дверь всё ещё можно открыть ключом или другой отмычкой." });
      return;
    }
    const id = cellIdx(x, y, run.maze.size);
    const next: Run = {
      ...run,
      maze: { ...run.maze, openedDoors: [...run.maze.openedDoors, id] },
      log: [...run.log, "Отмычка щёлкнула. Дверь открыта без ключа."],
    };
    this.model.setRun(next);
    this.model.setModal(null);
    playSfx("door");
    this.stepInto(x, y, next);
    const path = this.model.getSnapshot().path;
    this.model.setPath(path[0]?.x === x && path[0]?.y === y ? path.slice(1) : path, true);
  }

  openDoor(x: number, y: number): void {
    const { run } = this.state;
    if (!run || run.keys <= 0) return;
    const id = cellIdx(x, y, run.maze.size);
    const next: Run = {
      ...run,
      keys: run.keys - 1,
      maze: { ...run.maze, openedDoors: [...run.maze.openedDoors, id] },
      log: [...run.log, "Ключ повёрнут. Дверь открыта."],
    };
    this.model.setRun(next);
    this.model.setModal(null);
    playSfx("door");
    this.stepInto(x, y, next);
    const path = this.model.getSnapshot().path;
    this.model.setPath(path[0]?.x === x && path[0]?.y === y ? path.slice(1) : path, true);
  }

  useFieldItem(id: string): void {
    const { run, player } = this.state;
    const def = ITEMS[id];
    if (!run || !def?.use) return;
    if ((player.bag[id] ?? 0) <= 0) return;
    const u = def.use;
    const d = derived(player);
    const req = consumableIntReq(def, d.intDiscount);
    if (player.stats.int < req) {
      this.model.setModal({ kind: "note", title: "Недостаточно Интеллекта", body: `Для «${def.name}» нужен Интеллект ${req}.` });
      return;
    }
    let hp = player.hp;
    const statuses = { ...player.statuses };
    let msg = "";
    let nextRun = run;
    if (u.type === "heal") {
      const rawAmt = biomeHealingAmount(mazeBiome(run.maze), consumablePower(def, player.stats), def.kind === "potion");
      if ((statuses.wither ?? 0) > 0) {
        const dmg = Math.max(1, Math.round(rawAmt * (1 - d.magicResist)));
        hp = Math.max(0, hp - dmg);
        msg = `${def.name}: увядание обращает лечение в ${dmg} магического урона.`;
      } else {
        const amt = Math.round(rawAmt * ((statuses.chill ?? 0) > 0 ? CHILL_HEAL_MULT : 1));
        hp = Math.min(d.maxHp, hp + amt);
        if (def.kind === "scroll") statuses.wound = 0;
        msg = `${def.name}: +${amt} здоровья.`;
      }
    } else if (u.type === "cleanse") {
      statuses.wound = 0;
      statuses.curse = 0;
      statuses.cursePower = 0;
      statuses.poison = 0;
      hp = Math.min(d.maxHp, hp + 8);
      msg = `${def.name}: раны, проклятие и яд сняты (+8 ОЗ).`;
    } else if (u.type === "special_map") {
      if (run.mapRevealed) {
        this.model.setModal({ kind: "note", title: "Карта уже раскрыта", body: "Сундуки, босс, события, монстры и ловушки этого этажа уже отмечены." });
        return;
      }
      nextRun = {
        ...run,
        mapRevealed: true,
        revealedTraps: [...new Set([...(run.revealedTraps ?? []), ...run.maze.traps])],
        log: [...run.log, "Потрёпанная карта раскрыла сундуки, босса, события, монстров и ловушки."],
      };
      msg = "Потрёпанная карта: сундуки, босс, события, монстры и ловушки отмечены до конца этажа.";
    } else if (u.type === "special_water") {
      if (mazeBiome(run.maze) !== "fire") {
        this.model.setModal({ kind: "note", title: "Здесь не жарко", body: "Бурдюк с водой нужен в Огненных недрах — он снимает горение перед боем." });
        return;
      }
      nextRun = { ...run, burning: 0, log: [...run.log, "Бурдюк с водой смочил плащ: горение перед боем снято."] };
      msg = "Бурдюк с водой: горение перед боем снято.";
    } else if (u.type === "special_torch") {
      nextRun = { ...run, torchTurns: (u.rounds ?? 5) + 1, log: [...run.log, "Факел разгорелся: +1 видимость на 5 ходов по карте."] };
      msg = "Факел: +1 к видимости на 5 ходов по карте. Штраф мрака снят, пока он горит.";
    } else {
      return;
    }
    this.model.update({
      run: { ...nextRun, loot: pruneRunLoot(nextRun.loot, { [id]: 1 }) },
      player: (() => {
        const bag = { ...player.bag };
        bag[id] = (bag[id] ?? 0) - 1;
        if (bag[id] <= 0) delete bag[id];
        return { ...player, bag, hp, statuses };
      })(),
    });
    this.model.logRun(msg);
  }

  private stepInto(nx: number, ny: number, base?: Run): void {
    const { run, player } = this.state;
    const src = base ?? run;
    if (!src) return;
    const m = src.maze;
    const idx = cellIdx(nx, ny, m.size);
    const knownPath = !!src.seen[`${nx},${ny}`];
    const d = derived(player);
    const has = (id: string) => player.passives.includes(id);

    let r: Run = {
      ...src,
      prevPos: { ...src.pos },
      pos: { x: nx, y: ny },
      seen: { ...src.seen, [`${nx},${ny}`]: true },
      steps: src.steps + 1,
      log: [...src.log],
    };
    let hp = player.hp;
    const statuses = { ...player.statuses };
    const stepBag = { ...player.bag };
    const biome = mazeBiome(m);
    if ((r.torchTurns ?? 0) > 0) r.torchTurns = (r.torchTurns ?? 0) - 1;

    if (statuses.wound > 0 && !d.legendaryPassives.includes("titan_heart")) {
      const dmg = Math.max(1, statuses.woundTick ?? 1);
      hp -= dmg;
      statuses.wound -= 1;
      r.log.push(`Кровотечение: −${dmg} здоровья.`);
    }
    if (statuses.curse > 0 && !isBattleCurse(statuses.curse)) {
      const dmg = magicTickFrom(statuses.curseTick ?? 1, d.magicResist);
      hp -= dmg;
      statuses.curse -= 1;
      r.log.push(`Проклятие: −${dmg} здоровья.`);
    }
    if (statuses.poison > 0 && !d.legendaryPassives.includes("titan_heart")) {
      const poisonDmg = Math.max(1, statuses.poisonTick ?? 1);
      hp -= poisonDmg;
      statuses.poison -= 1;
      r.log.push(`Яд в крови: −${poisonDmg} здоровья.`);
    }
    if ((statuses.burn ?? 0) > 0) {
      const dmg = Math.max(1, statuses.burnTick ?? 1);
      hp -= dmg;
      statuses.burn = (statuses.burn ?? 0) - 1;
      r.log.push(`Горение: −${dmg} здоровья.`);
    }
    if ((statuses.chill ?? 0) > 0) {
      const dmg = magicTickFrom(statuses.chillTick ?? 1, d.magicResist);
      hp -= dmg;
      statuses.chill = (statuses.chill ?? 0) - 1;
      r.log.push(`Обморожение: −${dmg} здоровья, лечение −50%.`);
    }
    if ((statuses.wither ?? 0) > 0) statuses.wither = (statuses.wither ?? 0) - 1;

    /* Огненные недра больше не жгут на карте: жар работает только в бою,
       в начале хода героя. */

    if (hp <= 0) {
      this.model.updatePlayer((p) => ({ ...p, hp: 0 }));
      this.game.die("Кровь не сворачивалась, и подземелье забрало своё.");
      return;
    }

    const commitPlayer = () => this.model.setPlayer({ ...player, hp, statuses, bag: stepBag });

    /* Ловушки всегда видны: скрытых механизмов на карте нет. */
    if ((r.revealedTraps ?? []).length !== m.traps.length) {
      r = { ...r, revealedTraps: [...new Set([...(r.revealedTraps ?? []), ...m.traps])] };
    }

    if (m.boss.x === nx && m.boss.y === ny && !m.bossDefeated) {
      r.log.push("Перед лестницей встаёт Страж яруса!");
      r = { ...r, battleCell: null };
      commitPlayer();
      this.model.setRun(r);
      this.model.setBattle(newBattle({ ...player, hp, statuses, bag: stepBag }, r.floor, true, mazeBiome(r.maze), r.torchTurns ?? 0, 0));
      this.model.setScreen("battle");
      return;
    }

    if (m.stairs.x === nx && m.stairs.y === ny) {
      if (!m.bossDefeated) {
        r = { ...r, battleCell: null };
        commitPlayer();
        this.model.setRun(r);
        this.model.setBattle(newBattle({ ...player, hp, statuses, bag: stepBag }, r.floor, true, mazeBiome(r.maze), r.torchTurns ?? 0, 0));
        this.model.setScreen("battle");
        return;
      }
      commitPlayer();
      this.model.setRun(r);
      this.model.setModal({ kind: "stairs" });
      return;
    }

    if (m.chests.includes(idx) && !m.openedChests.includes(idx)) {
      const raw = 35 + Math.floor(Math.random() * 46);
      /* Золото подземелья урезано вдвое: множитель применяем до округления до пяти. */
      const gold = Math.round((raw * DUNGEON_GOLD_SHARE * (1 + (r.floor - 1) * 0.6)) / 5) * 5;
      const items = rollConsumableLoot(r.floor, Math.random() < 0.55 ? 2 : 1);
      /* Из сундука вещь того же уровня, что и этаж: иначе на глубине
         почти всегда выпадал бы мусор 1 уровня. */
      const droppedGear = rollGearDrop(r.floor, CHEST_RARITY_WEIGHTS, r.floor);
      const chestXp = 6 + r.floor * 3;

      r = {
        ...r,
        maze: { ...m, openedChests: [...m.openedChests, idx] },
        gold: r.gold + gold,
        loot: [...r.loot, ...items],
        gearLoot: [...r.gearLoot, droppedGear],
        log: [...r.log, `Сундук вскрыт: +${gold} зол., +${chestXp} XP и неизученный предмет (${scaledGearStats(droppedGear).base.name}).`],
      };
      items.forEach((id) => (stepBag[id] = (stepBag[id] ?? 0) + 1));
      const withLoot: Player = { ...player, hp, statuses, bag: stepBag, armory: [droppedGear, ...player.armory] };
      this.model.setPlayer(grantXp(withLoot, chestXp).player);
      this.model.setRun(r);
      this.model.setModal({ kind: "chest", gold, items, gear: [droppedGear], xp: chestXp });
      playSfx("chest");
      return;
    }

    if (m.keys.includes(idx) && !m.takenKeys.includes(idx)) {
      r = {
        ...r,
        maze: { ...m, takenKeys: [...m.takenKeys, idx] },
        keys: r.keys + 1,
        log: [...r.log, "Подобран ключ от запертой двери."],
      };
      commitPlayer();
      this.model.setRun(r);
      this.model.setModal({ kind: "key" });
      return;
    }

    /* Событие срабатывает, когда герой шагает на его клетку (значок на карте), а не при входе в комнату.
       Негативное срабатывает само, положительное и нейтральное — через выбор. */
    const roomSpawn = m.eventSpawns?.find((sp) => sp.cell === idx) ?? null;
    if (roomSpawn && !m.usedEvents.includes(roomSpawn.cell)) {
      const ev = mapEventById(roomSpawn.eventId);
      if (ev) {
        commitPlayer();
        this.model.setRun(r);
        this.model.setPath([]);
        if (ev.kind === "negative") {
          this.fireNegativeEvent(roomSpawn, ev);
          return;
        }
        this.model.setRun({ ...r, log: [...r.log, `Событие: ${ev.name}.`] });
        this.model.setModal({ kind: "event", eventId: ev.id, cell: roomSpawn.cell });
        return;
      }
    }

    /* Старые карты без привязки к комнатам: событие срабатывает на клетке. */
    if (!m.eventSpawns?.length && m.events.includes(idx) && !m.usedEvents.includes(idx)) {
      const ev = MAP_EVENTS[Math.floor(Math.random() * MAP_EVENTS.length)];
      commitPlayer();
      this.model.setRun({
        ...r,
        maze: { ...m, usedEvents: [...m.usedEvents, idx] },
        log: [...r.log, `Событие: ${ev.name}.`],
      });
      this.model.setPath([]);
      this.model.setModal({ kind: "event", eventId: ev.id, cell: idx });
      return;
    }

    /* Ловушки и монстры стоят на карте заранее: шаг в их клетку запускает событие. */
    if (m.traps.includes(idx) && !(r.sprungTraps ?? []).includes(idx)) {
      const swiftBonus = d.rareAffixes.filter((x) => x === "swift").length * 0.12;
      const bypassBonus = (has("light_step") ? 0.3 : 0) + swiftBonus;
      const trap = makeTrap({ kind: rollTrapKind(), floor: r.floor, stats: player.stats, bypassBonus, stoneSkin: has("stone_skin") });
      r = {
        ...r,
        revealedTraps: [...new Set([...(r.revealedTraps ?? []), idx])],
        sprungTraps: [...(r.sprungTraps ?? []), idx],
        log: [...r.log, "Под ногой щёлкает механизм ловушки."],
      };
      commitPlayer();
      this.model.setRun(r);
      this.model.setModal({ kind: "trap", trap });
      return;
    }

    /* Остатки товарища и живой товарищ: метка задания на клетке, шаг подбирает её. */
    const fetchMark = (r.maze.questMarks ?? []).find(
      (q) => q.cell === idx && (q.kind === "remains" || q.kind === "captive"),
    );
    if (fetchMark) {
      const captive = fetchMark.kind === "captive";
      r = {
        ...r,
        maze: { ...r.maze, questMarks: (r.maze.questMarks ?? []).filter((q) => q !== fetchMark) },
        questCarry: [...(r.questCarry ?? []), { questId: fetchMark.questId, label: fetchMark.label }],
        log: [...r.log, captive ? `${fetchMark.label}: он идёт за тобой.` : `Найдено: ${fetchMark.label}.`],
      };
      commitPlayer();
      this.model.setRun(r);
      this.model.setModal({
        kind: "note",
        title: captive ? "Живой товарищ" : "Остатки товарища",
        body: captive
          ? "Он идёт за тобой, опираясь на плечо. Выведи его из подземелья живым — в лагере он получит помощь, а ты награду."
          : "Ты собираешь то, что осталось. Вернёшься живым — отнесёшь в лагерь.",
      });
      return;
    }

    if (m.monsters.includes(idx) && !(r.clearedMonsters ?? []).includes(idx)) {
      /* Монстр с меткой задания — существо, которое нужно убить или с которого снять трофей. */
      const questMark = (r.maze.questMarks ?? []).find((q) => q.cell === idx && (q.kind === "kill" || q.kind === "drop"));
      r = { ...r, battleCell: idx, log: [...r.log, "Из темноты наперерез выходит обитатель этажа."] };
      commitPlayer();
      this.model.setRun(r);
      this.model.setBattle(
        newBattle({ ...player, hp, statuses, bag: stepBag }, r.floor, false, biome, r.torchTurns ?? 0, 0, undefined, questMark?.enemyId),
      );
      this.model.setScreen("battle");
      return;
    }

    r.log.push(
      knownPath
        ? "Знакомый коридор. Ты помнишь, где потрескался камень."
        : Math.random() < 0.5
        ? "Тишина. Только капли воды да чей-то скрип вдали."
        : "Пустой коридор. Пламя факела тянется на три шага вперёд.",
    );
    commitPlayer();
    this.model.setRun(r);
  }
}
