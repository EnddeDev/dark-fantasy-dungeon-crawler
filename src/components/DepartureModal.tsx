import { useMemo, useState } from "react";
import { Btn, Modal, Tag } from "./ui";
import { ITEMS } from "../game/content";
import { autoCarriedBag, type BagCounts } from "../game/runStash";
import type { Player } from "../game/types";

/**
 * Окно перед походом: рюкзак героя, из которого выбирается, что взять в подземелье.
 * Сумка и спец. предметы уходят сами; остальное берётся по штукам, а что не взято — остаётся в лобби.
 */
export function DepartureModal({
  player,
  floor,
  onGo,
  onClose,
}: {
  player: Player;
  floor: number;
  onGo: (picked: BagCounts) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<BagCounts>({});
  const auto = useMemo(() => autoCarriedBag(player), [player]);
  const others = useMemo(
    () =>
      Object.entries(player.bag)
        .filter(([id, n]) => n > 0 && auto[id] === undefined)
        .sort(([a], [b]) => (ITEMS[a]?.name ?? a).localeCompare(ITEMS[b]?.name ?? b, "ru")),
    [player.bag, auto],
  );
  const autoList = Object.entries(auto);

  const setCount = (id: string, value: number, max: number) => {
    const next = Math.max(0, Math.min(max, Math.floor(value)));
    setPicked((prev) => {
      const out = { ...prev };
      if (next > 0) out[id] = next;
      else delete out[id];
      return out;
    });
  };

  return (
    <Modal
      title="Снаряжение в поход"
      sub={`Этаж ${floor}. Выбери, что взять из рюкзака; остальное останется в лобби.`}
      onClose={onClose}
      actions={
        <>
          <Btn onClick={onClose}>Назад</Btn>
          <Btn tone="flame" onClick={() => onGo(picked)}>
            Отправиться
          </Btn>
        </>
      }
    >
      <section aria-label="Идёт с тобой без выбора" className="mb-4">
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

      <section aria-label="Рюкзак: выбор для похода">
        <h4 className="sc mb-2 text-flamedim">Рюкзак</h4>
        {others.length === 0 ? (
          <p className="text-sm italic text-mute">В рюкзаке нет предметов, которые можно взять.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
            {others.map(([id, have]) => {
              const count = picked[id] ?? 0;
              return (
                <li key={id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {ITEMS[id]?.name ?? id} <span className="text-mute">в рюкзаке {have}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Btn title={`Убрать ${ITEMS[id]?.name ?? id}`} onClick={() => setCount(id, count - 1, have)} disabled={count <= 0}>
                      −
                    </Btn>
                    <span className="w-8 text-center font-mono tab">{count}</span>
                    <Btn title={`Взять ${ITEMS[id]?.name ?? id}`} onClick={() => setCount(id, count + 1, have)} disabled={count >= have}>
                      +
                    </Btn>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Modal>
  );
}
