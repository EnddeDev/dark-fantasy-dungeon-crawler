import { derived, newBattle, rollConsumableLoot, rollGearDrop } from "../game/battle";
import { biomeHealingAmount, mazeBiome } from "../game/biomes";
import { GEAR_BASES, ITEMS, REAGENTS, consumableIntReq, consumablePower, equipItem, grantXp, pick, randInt, scaledGearStats, unequipSlot } from "../game/content";
import { rollStepEvent } from "../game/events";
import { cellIdx, findPath, wallBetween } from "../game/maze";
import { pruneRunLoot } from "../game/runLoot";
import { CHILL_HEAL_MULT, magicTickDamage, statusTickDamage } from "../game/statusEffects";
import { applyTrapOutcome, isBattleCurse, lockpickChance, makeTrap, resolveTrap, rollTrapKind, type TrapAction } from "../game/traps";
import type { GearItem, Player, Run, Slot } from "../game/types";
import { SLOT_META } from "../game/types";
import { MAP_EVENTS, mapEventById, type MapEffect } from "../game/world";
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
    this.model.logRun(`Смена снаряжения: ${name} → ${SLOT_META[slot].name.toLowerCase()}${res.note ? `. ${res.note}` : "."}`);
  }

  unequip(slot: Slot): void {
    this.model.updatePlayer((p) => {
      const before = derived(p).maxHp;
      const next = unequipSlot(p, slot);
      const after = derived(next).maxHp;
      return { ...next, hp: Math.min(after, next.hp + Math.max(0, after - before)) };
    });
    this.model.logRun(`${SLOT_META[slot].name}: снято.`);
  }

  resolveEvent(eventId: string, choiceId: string, cell?: number): void {
    const { run, player } = this.state;
    const ev = mapEventById(eventId);
    if (!ev || !run) return;
    const choice = ev.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    const good = Math.random() < choice.chance;
    const effects: MapEffect[] = good ? choice.good : choice.bad;
    const floor = run.floor;

    let hp = player.hp;
    let xpGain = 0;
    const statuses = { ...player.statuses };
    const gainedItems: string[] = [];
    const gainedGear: GearItem[] = [];
    const statUp: Partial<Record<Slot | string, number>> = {};
    let goldDelta = 0;

    for (const e of effects) {
      switch (e.k) {
        case "hp": hp += e.v ?? 0; break;
        case "heal": hp = Math.min(derived(player).maxHp, hp + biomeHealingAmount(mazeBiome(run.maze), e.v ?? 0)); break;
        case "gold": goldDelta += e.v ?? 0; break;
        case "gold_loss": goldDelta -= e.v ?? 0; break;
        case "xp": xpGain += e.v ?? 0; break;
        case "curse": statuses.curse = Math.max(statuses.curse, e.v ?? 0); break;
        case "poison": statuses.poison = Math.max(statuses.poison, e.v ?? 0); break;
        case "reagent": for (let i = 0; i < (e.v ?? 1); i++) gainedItems.push(pick(REAGENTS)); break;
        case "supply": for (let i = 0; i < (e.v ?? 1); i++) gainedItems.push(pick(["potion_s", "antidote", "scroll_spark", "throwing_knife"])); break;
        case "gear": for (let i = 0; i < (e.v ?? 1); i++) gainedGear.push(rollGearDrop(floor, Math.random() < 0.4)); break;
        case "stat": if (e.stat) statUp[e.stat] = (statUp[e.stat] ?? 0) + (e.v ?? 1); break;
      }
    }

    const stats = { ...player.stats } as Record<string, number>;
    Object.entries(statUp).forEach(([k, v]) => { stats[k] = Math.min(10, (stats[k] ?? 1) + (v ?? 0)); });
    hp = Math.min(hp, derived({ ...player, stats: stats as typeof player.stats }).maxHp);

    const deathCausesHp = hp <= 0;
    const nextPlayer: Player = {
      ...player,
      hp: deathCausesHp ? 0 : Math.max(1, hp),
      stats: stats as typeof player.stats,
      statuses,
      bag: (() => {
        const bag = { ...player.bag };
        gainedItems.forEach((id) => (bag[id] = (bag[id] ?? 0) + 1));
        return bag;
      })(),
      armory: [...gainedGear, ...player.armory],
    };
    const withXp = xpGain > 0 ? grantXp(nextPlayer, xpGain).player : nextPlayer;
    this.model.setPlayer(withXp);

    /* Помечаем ту клетку, где герой стоит (или которую передал интерфейс):
       раньше здесь искалась «первая неиспользованная клетка с тем же
       событием», и при совпадении типов гасилась чужая клетка. */
    const here = cell ?? cellIdx(run.pos.x, run.pos.y, run.maze.size);
    const merged: Run = { ...run };
    if (run.maze.events.includes(here) && !run.maze.usedEvents.includes(here)) {
      merged.maze = { ...run.maze, usedEvents: [...run.maze.usedEvents, here] };
    }
    if (goldDelta !== 0) merged.gold = Math.max(0, run.gold + goldDelta);
    if (gainedItems.length) merged.loot = [...run.loot, ...gainedItems];
    if (gainedGear.length) merged.gearLoot = [...gainedGear, ...run.gearLoot];
    merged.log = [...run.log, `${ev.name}: ${good ? "удача" : "неудача"} — ${good ? choice.goodText : choice.badText}`];
    this.model.setRun(merged);

    if (deathCausesHp) {
      this.game.die("Событие подземелья забрало последние силы.");
      return;
    }
    this.model.setModal({
      kind: "event",
      eventId,
      cell: here,
      result: { title: ev.name, good: choice.goodText, bad: choice.badText },
    });
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
      const dmg = statusTickDamage(d.maxHp, "bleed");
      hp -= dmg;
      statuses.wound -= 1;
      r.log.push(`Кровотечение: −${dmg} здоровья (5% макс. ОЗ).`);
    }
    if (statuses.curse > 0 && !isBattleCurse(statuses.curse)) {
      const dmg = magicTickDamage(d.maxHp, "curse", d.magicResist);
      hp -= dmg;
      statuses.curse -= 1;
      r.log.push(`Проклятие: −${dmg} здоровья.`);
    }
    if (statuses.poison > 0 && !d.legendaryPassives.includes("titan_heart")) {
      const poisonDmg = statusTickDamage(d.maxHp, "poison");
      hp -= poisonDmg;
      statuses.poison -= 1;
      r.log.push(`Яд в крови: −${poisonDmg} здоровья (4% макс. ОЗ).`);
    }
    if ((statuses.burn ?? 0) > 0) {
      const dmg = statusTickDamage(d.maxHp, "burn");
      hp -= dmg;
      statuses.burn = (statuses.burn ?? 0) - 1;
      r.log.push(`Горение: −${dmg} здоровья (5% макс. ОЗ).`);
    }
    if ((statuses.chill ?? 0) > 0) {
      const dmg = magicTickDamage(d.maxHp, "chill", d.magicResist);
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

    if (!knownPath && Math.random() < 0.05) {
      const count = randInt(1, 3);
      const found: string[] = [];
      for (let i = 0; i < count; i++) found.push(pick(REAGENTS));
      r = { ...r, loot: [...r.loot, ...found] };
      r.log.push(`Под камнями найдены реагенты: ${found.map((id) => ITEMS[id].name).join(", ")}.`);
      found.forEach((id) => (stepBag[id] = (stepBag[id] ?? 0) + 1));
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
      const gold = Math.round((raw * (1 + (r.floor - 1) * 0.6)) / 5) * 5;
      const items = rollConsumableLoot(r.floor, Math.random() < 0.55 ? 2 : 1);
      const droppedGear = rollGearDrop(r.floor, Math.random() < 0.35);
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

    if (m.events.includes(idx) && !m.usedEvents.includes(idx)) {
      /* Тип события случаен, а не выводится из индекса клетки: иначе два
         события на этаже слишком часто оказываются одним и тем же. */
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

    if (m.monsters.includes(idx) && !(r.clearedMonsters ?? []).includes(idx)) {
      r = { ...r, battleCell: idx, log: [...r.log, "Из темноты наперерез выходит обитатель этажа."] };
      commitPlayer();
      this.model.setRun(r);
      this.model.setBattle(newBattle({ ...player, hp, statuses, bag: stepBag }, r.floor, false, biome, r.torchTurns ?? 0, 0));
      this.model.setScreen("battle");
      return;
    }

    const event = rollStepEvent(knownPath);
    if (event === "find") {
      if (Math.random() < 0.5) {
        const foundGold = randInt(5 + r.floor * 2, 12 + r.floor * 4);
        r.gold += foundGold;
        r.log.push(`Среди камней найдены ${foundGold} золотых монет.`);
        commitPlayer();
      } else {
        const reagent = pick(REAGENTS);
        r = { ...r, loot: [...r.loot, reagent] };
        r.log.push(`В щели найден реагент: ${ITEMS[reagent].name}.`);
        stepBag[reagent] = (stepBag[reagent] ?? 0) + 1;
        commitPlayer();
      }
      this.model.setRun(r);
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
