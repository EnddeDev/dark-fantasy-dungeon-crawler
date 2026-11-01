import { ItemArt } from "../components/ItemArt";
import { Btn, Modal, Tag } from "../components/ui";
import type { GameController } from "../controllers/GameController";
import { BIOMES, biomeVision, mazeBiome } from "../game/biomes";
import { ITEMS, WEAR_META, scaledGearStats } from "../game/content";
import { lockpickChance, TRAP_META } from "../game/traps";
import { mapEventById } from "../game/world";
import type { GameState } from "../model/types";

/** View модальных окон: только отображение и вызов команд Controller. */
export function ModalView({ game, state }: { game: GameController; state: GameState }) {
  const { modal, player, run } = state;
  if (!modal) return null;
  const close = () => game.closeModal();
  const biome = mazeBiome(run?.maze);

  switch (modal.kind) {
    case "intro":
      return (
        <Modal
          title="Вход в лабиринт"
          sub="Правила подземелья"
          actions={<Btn tone="flame" onClick={close}>В путь</Btn>}
        >
          <ul className="space-y-2">
            <li className="dropcap">
              <b className="text-flame">{BIOMES[biome].name}:</b> {BIOMES[biome].description}
            </li>
            <li>
              <b className="text-flame">План этажа:</b> {run ? `${run.maze.size}×${run.maze.size}` : "8×8"} — каждый
              следующий ярус просторнее, вплоть до 16×16.
            </li>
            <li>
              <b className="text-flame">Туман и стены:</b> открыты только пройденные клетки и круг радиусом{" "}
              <b>{biomeVision(biome)}</b>; стены, углы и запертые двери блокируют свет.
            </li>
            <li>
              <b className="text-flame">Обитатели карты:</b> один монстр на восемь клеток и одна ловушка на
              шестнадцать. Монстры видны, пока их освещает факел, а все ловушки отмечены на карте сразу:
              маршрут остановится перед ними, случайно наступить нельзя.
            </li>
            <li>
              <b className="text-flame">Пустая клетка:</b> 10% небольшая находка, знакомый путь — тишина.
            </li>
            <li>
              <b className="text-rubric">Страж перед лестницей:</b> спуск на следующий ярус охраняет Босс со
              своими способностями.
            </li>
            <li>
              <b className="text-verd">Трофейное снаряжение:</b> найденные вещи скрывают свою редкость, пока ты не
              исследуешь их в арсенале за Интеллект или золото. Уровень растёт без потолка, но каждый следующий
              требует всё больше вылазок.
            </li>
          </ul>
        </Modal>
      );

    case "trap": {
      const trap = modal.trap;
      const hasKit = (player.bag.sapper_kit ?? 0) > 0;
      const prep = Math.max(0.1, 1 - player.stats.str * 0.1);
      return (
        <Modal
          title={TRAP_META[trap.kind].name}
          sub={TRAP_META[trap.kind].desc}
          actions={
            <>
              <Btn tone="flame" onClick={() => game.dungeon.takeTrap("prepare")}>
                Подготовиться и принять · −{Math.round((1 - prep) * 100)}%
              </Btn>
              <Btn tone="verd" onClick={() => game.dungeon.takeTrap("bypass")}>
                Обойти · {Math.round(trap.bypassChance * 100)}%
              </Btn>
              <Btn tone="ghost" disabled={!hasKit} onClick={() => game.dungeon.takeTrap("disarm")}>
                Обезвредить · {Math.round(trap.disarmChance * 100)}%{hasKit ? "" : " (нужен набор)"}
              </Btn>
            </>
          }
        >
          <p>
            Подготовка снижает урон и длительность эффекта на 10% за каждое очко Силы. Обход зависит от Ловкости;
            при провале последствия удваиваются. Обезвреживание требует снаряжения сапёра, растёт от Интеллекта
            и тратит набор в любом случае.
          </p>
          <p className="mt-3 flex flex-wrap gap-2">
            {trap.damage > 0 && <Tag tone="rubric">урон {trap.damage}</Tag>}
            {trap.rounds > 0 && <Tag tone="rubric">эффект {trap.rounds} хода</Tag>}
            {trap.cursePower > 0 && <Tag tone="rubric">проклятие −{trap.cursePower}% урона до конца боя</Tag>}
            <Tag tone="mute">при срыве: ×2</Tag>
            <Tag tone="flame">набор сапёра: {player.bag.sapper_kit ?? 0}</Tag>
          </p>
        </Modal>
      );
    }

    case "door":
      return (
        <Modal
          title="Закрытая дверь"
          sub="Железная решётка преграждает путь и скрывает то, что дальше"
          actions={
            <>
              <Btn onClick={close}>Отступить</Btn>
              <Btn tone="verd" disabled={(run?.keys ?? 0) === 0} onClick={() => game.dungeon.openDoor(modal.x, modal.y)}>
                Использовать ключ ({run?.keys ?? 0})
              </Btn>
              <Btn tone="flame" disabled={(player.bag.lockpicks ?? 0) === 0} onClick={() => game.dungeon.pickDoor(modal.x, modal.y)}>
                Отмычка · {Math.round(lockpickChance(player.stats.agi) * 100)}% ({player.bag.lockpicks ?? 0})
              </Btn>
            </>
          }
        >
          <p>
            Ключей в связке: <b className="text-verd">{run?.keys ?? 0}</b>. Отмычек: <b className="text-flame">{player.bag.lockpicks ?? 0}</b>.
            Отмычка тратится при попытке в любом случае; шанс зависит от Ловкости. Открытая дверь остаётся распахнутой до конца этажа.
          </p>
        </Modal>
      );

    case "chest":
      return (
        <Modal
          title="Сундук сокровищ"
          sub="Внутри звенит золото и лежит неизученное снаряжение"
          actions={<Btn tone="flame" onClick={close}>Забрать всё</Btn>}
        >
          <div className="flex items-baseline justify-between border-b border-line pb-2">
            <span className="sc">Золото и опыт</span>
            <span className="font-mono text-xl tab text-flame">
              +{modal.gold} зол. · <span className="text-verd">+{modal.xp} XP</span>
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {modal.items.map((id, i) => (
              <span key={id + i} className="flex items-center gap-1.5 border border-line bg-black/40 px-2 py-1">
                <ItemArt id={id} name={ITEMS[id]?.name} size={30} framed={false} />
                <span className="font-mono text-[0.68rem] text-parch">{ITEMS[id]?.name ?? id}</span>
              </span>
            ))}
            {modal.gear.map((g) => {
              const st = scaledGearStats(g);
              return (
                <span key={g.uid} className="flex items-center gap-1.5 border border-line bg-black/40 px-2 py-1">
                  <ItemArt id={g.baseId} name={st.base.name} size={32} />
                  <span className="font-mono text-[0.68rem] text-parch">
                    {st.base.name} ({WEAR_META[g.wear].name} ×{WEAR_META[g.wear].mult} · Редкость: ???)
                  </span>
                </span>
              );
            })}
          </div>
          <p className="mt-3 text-sm italic text-mute">
            Редкость найденного снаряжения неизвестна — проведите исследование в лобби за Интеллект или золото.
          </p>
        </Modal>
      );

    case "key":
      return (
        <Modal
          title="Найден ключ"
          sub="Тяжёлый кованый ключ от подземелья"
          actions={<Btn tone="flame" onClick={close}>Взять ключ</Btn>}
        >
          <p>
            Ключей у тебя: <b className="text-verd">{run?.keys ?? 0}</b>. Теперь можно отпереть закрытую дверь на
            этом ярусе.
          </p>
        </Modal>
      );

    case "stairs":
      return (
        <Modal
          title="Лестница на ярус ниже"
          sub={`Страж этажа ${run?.floor ?? 1} повержен — проход свободен`}
          actions={
            <>
              <Btn onClick={close}>Остаться на этаже</Btn>
              <Btn tone="flame" onClick={() => game.descend()}>
                Спуститься на этаж {(run?.floor ?? 1) + 1}
              </Btn>
            </>
          }
        >
          <p>
            Ниже обитают более опасные монстры и новый Босс-страж, но сундуки там богаче, а шанс найти Эпическое
            и Легендарное снаряжение выше. Передышка на ступенях восстановит 10 здоровья.
          </p>
        </Modal>
      );

    case "death":
      return (
        <Modal
          title="Поражение в подземелье"
          actions={
            <Btn
              tone="flame"
              onClick={() => {
                close();
                game.enterLobby("train");
              }}
            >
              Очнуться в лобби
            </Btn>
          }
        >
          <p className="dropcap">{modal.cause}</p>
          <p className="mt-3 text-mute">
            Потеряна вся добыча этой вылазки: <b className="text-rubric">{modal.lost}</b> золота и{" "}
            <b className="text-rubric">{modal.lostGear}</b> ед. невынесенного снаряжения. Уровень, опыт,
            характеристики и сохранённый в лобби арсенал остались с тобой.
          </p>
        </Modal>
      );

    case "event": {
      const ev = mapEventById(modal.eventId);
      if (!ev) return null;
      if (modal.result) {
        return (
          <Modal
            title={modal.result.title}
            sub="Что осталось после твоего выбора"
            actions={<Btn tone="flame" onClick={close}>Продолжить путь</Btn>}
          >
            <p className="dropcap">{modal.result.good}</p>
            <p className="mt-3 border-l-2 border-rubric/70 pl-3 text-mute">{modal.result.bad}</p>
          </Modal>
        );
      }
      return (
        <Modal
          title={ev.name}
          sub="Значок на карте. Выбор один — и у каждого исхода две стороны"
          actions={<span className="font-mono text-[0.7rem] text-mute">Итог смешивает дар и потерю</span>}
        >
          <p className="mb-4 italic text-mute">{ev.prompt}</p>
          <div className="grid gap-2">
            {ev.choices.map((c) => (
              <button
                key={c.id}
                onClick={() => game.dungeon.resolveEvent(ev.id, c.id)}
                className="group border border-line bg-black/30 px-3 py-2.5 text-left transition-colors hover:border-flame hover:bg-flame/10"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-[0.95rem] uppercase tracking-[0.1em] text-flamehi group-hover:text-flame">
                    {c.label}
                  </span>
                  <span className="shrink-0 font-mono text-[0.7rem] text-mute">
                    удача {Math.round(c.chance * 100)}%
                  </span>
                </span>
                <span className="mt-1 block font-mono text-[0.7rem] text-verd">{c.detail}</span>
              </button>
            ))}
          </div>
        </Modal>
      );
    }

    case "note":
      return (
        <Modal
          title={modal.title}
          actions={<Btn tone="flame" onClick={close}>Принято</Btn>}
        >
          <p className="dropcap">{modal.body}</p>
        </Modal>
      );
  }
}
