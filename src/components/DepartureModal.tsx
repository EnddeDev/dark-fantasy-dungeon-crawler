import { useMemo } from "react";
import { Btn, Modal, Tag } from "./ui";
import { PouchSlots } from "./PouchSlots";
import { ITEMS } from "../game/content";
import { autoCarriedBag } from "../game/runStash";
import type { Player } from "../game/types";

/**
 * Окно перед походом: сумка в том же виде, что в лобби. В подземелье идут слоты сумки
 * и спец. предметы; всё остальное из рюкзака остаётся в лобби.
 */
export function DepartureModal({
  player,
  floor,
  onGo,
  onClose,
  onSetPouch,
}: {
  player: Player;
  floor: number;
  onGo: () => void;
  onClose: () => void;
  /** Возвращает текст ошибки или null. */
  onSetPouch: (index: number, id: string | null) => string | null;
}) {
  const auto = useMemo(() => autoCarriedBag(player), [player]);
  const autoList = Object.entries(auto).sort(([a], [b]) => (ITEMS[a]?.name ?? a).localeCompare(ITEMS[b]?.name ?? b, "ru"));

  return (
    <Modal
      title="Снаряжение в поход"
      sub={`Этаж ${floor}. Положи в сумку то, что возьмёшь в подземелье; остальное останется в лобби.`}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>Назад</Btn>
          <Btn tone="flame" onClick={onGo}>
            Отправиться
          </Btn>
        </>
      }
    >
      <section aria-label="Сумка для похода" className="mb-4">
        <PouchSlots player={player} onSet={onSetPouch} />
      </section>

      <section aria-label="Идёт с тобой без выбора">
        <h4 className="sc mb-2 text-flamedim">Идёт с тобой</h4>
        {autoList.length === 0 ? (
          <p className="text-sm italic text-mute">Сумка пуста, спец. предметов нет.</p>
        ) : (
          <ul className="space-y-1">
            {autoList.map(([id, n]) => (
              <li key={id} className="flex items-center justify-between gap-2 text-sm">
                <span>{ITEMS[id]?.name ?? id}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono tab">×{n}</span>
                  <Tag tone="verd">{player.pouch?.includes(id) ? "в сумке" : "спец"}</Tag>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
