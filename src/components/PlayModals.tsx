import { ITEMS, GEAR_BASES, gearStatReqLabel } from "../game/content";
import type { GearItem, Player } from "../game/types";
import { ActiveQuestList } from "./Quests";
import { ItemArt } from "./ItemArt";
import { PouchSlots } from "./PouchSlots";
import { Btn, Modal, Tag } from "./ui";

/** Модалка «Задания»: взятые задания, только просмотр. Сдача — в лобби у жителя. */
export function QuestsModal({ player, onClose }: { player: Player; onClose: () => void }) {
  return (
    <Modal
      title="Задания"
      sub="Взятые задания. Сдать можно в лобби у жителя."
      onClose={onClose}
      actions={<Btn onClick={onClose}>Закрыть</Btn>}
    >
      <ActiveQuestList player={player} />
    </Modal>
  );
}

/** Модалка «Рюкзак»: снаряжение, припасы и реагенты. Слоты сумки меняются, если передан onSetPouch. */
export function BagModal({
  player,
  onSetPouch,
  onInspect,
  onClose,
}: {
  player: Player;
  onSetPouch?: (index: number, id: string | null) => string | null;
  onInspect: (uid: string) => void;
  onClose: () => void;
}) {
  /* Рюкзак: припасы и реагенты из сумки, снаряжение из арсенала. */
  const wornUids = new Set(Object.values(player.equip).filter((uid): uid is string => !!uid));
  const bagEntries = Object.entries(player.bag).filter(([, n]) => n > 0);
  const suppliesBag = bagEntries.filter(([id]) => ITEMS[id] && ITEMS[id].kind !== "reagent");
  const reagentsBag = bagEntries.filter(([id]) => ITEMS[id]?.kind === "reagent");
  return (
    <Modal
      title="Рюкзак"
      sub="Что взято в подземелье"
      onClose={onClose}
      actions={<Btn onClick={onClose}>Закрыть</Btn>}
    >
      <div className="space-y-5">
        {onSetPouch && <PouchSlots player={player} onSet={onSetPouch} />}
        <section aria-label="Снаряжение в рюкзаке">
          <div className="sc mb-2 text-[0.86rem] text-flamedim">Снаряжение · {player.armory.length}</div>
          {player.armory.length === 0 ? (
            <p className="text-sm italic text-mute">Арсенал пуст.</p>
          ) : (
            <ul className="space-y-1.5">
              {player.armory.map((g) => {
                const worn = wornUids.has(g.uid);
                return (
                  <li key={g.uid}>
                    <button
                      type="button"
                      onClick={() => onInspect(g.uid)}
                      className="flex w-full items-center gap-2 border border-line bg-black/20 px-2.5 py-1.5 text-left transition-colors hover:border-flame hover:bg-flame/10"
                    >
                      <ItemArt id={g.baseId} name={stName(g)} size={28} framed={false} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[0.95rem] uppercase tracking-[0.04em] text-parch">{stName(g)}</span>
                        <span className="block font-mono text-[0.8rem] text-mute">
                          {gearStatReqLabel(g)} · ур. {g.level ?? 1}{g.identified ? "" : " · не исследовано"}
                        </span>
                      </span>
                      {worn && <Tag tone="verd">надето</Tag>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Припасы в рюкзаке">
          <div className="sc mb-2 text-[0.86rem] text-flamedim">Припасы</div>
          {suppliesBag.length === 0 ? (
            <p className="text-sm italic text-mute">Припасов нет.</p>
          ) : (
            <ul className="space-y-1">
              {suppliesBag.map(([id, n]) => (
                <li key={id} className="flex items-baseline justify-between gap-2 border border-line bg-black/20 px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-[0.96rem] text-parch">{ITEMS[id]?.name ?? id}</span>
                  <span className="font-mono text-[0.88rem] text-flame">×{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Реагенты в рюкзаке">
          <div className="sc mb-2 text-[0.86rem] text-flamedim">Реагенты</div>
          {reagentsBag.length === 0 ? (
            <p className="text-sm italic text-mute">Реагентов нет.</p>
          ) : (
            <ul className="space-y-1">
              {reagentsBag.map(([id, n]) => (
                <li key={id} className="flex items-baseline justify-between gap-2 border border-line bg-black/20 px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-[0.96rem] text-parch">{ITEMS[id]?.name ?? id}</span>
                  <span className="font-mono text-[0.88rem] text-verd">×{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

/** Быстрый доступ к названию предмета без повторного поиска в словаре. */
const GEAR_NAME_CACHE: Record<string, string> = Object.fromEntries(
  Object.values(GEAR_BASES).map((b) => [b.id, b.name]),
);

function stName(item: GearItem) {
  return GEAR_NAME_CACHE[item.baseId] ?? item.baseId;
}
