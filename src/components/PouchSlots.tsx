import { useState } from "react";
import { ITEMS } from "../game/content";
import { pouchOf } from "../game/pouch";
import type { Player } from "../game/types";

/** Три слота сумки с зельями. Меняются вне боя: из лобби и из рюкзака в подземелье. */
export function PouchSlots({
  player,
  onSet,
}: {
  player: Player;
  /** Возвращает текст ошибки или null. */
  onSet: (index: number, id: string | null) => string | null;
}) {
  const pouch = pouchOf(player);
  const [message, setMessage] = useState<string | null>(null);
  const potions = Object.entries(player.bag).filter(([id, n]) => n > 0 && ITEMS[id]?.kind === "potion");

  return (
    <section aria-label="Сумка с зельями" className="border border-line bg-black/20 p-3">
      <div className="sc text-[0.86rem] text-flamedim">Сумка с зельями · 3 слота</div>
      <p className="mt-1 text-xs text-mute">
        Зелья из сумки в бою не тратят выносливость. В бою менять нельзя.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {pouch.map((id, i) => (
          <label key={i} className="flex flex-col gap-1">
            <span className="sc text-[0.72rem] text-mute">Слот {i + 1}</span>
            <select
              value={id ?? ""}
              onChange={(e) => setMessage(onSet(i, e.target.value || null))}
              className="border border-line bg-black/40 px-2 py-1.5 text-sm text-parch"
            >
              <option value="">— пусто —</option>
              {potions.map(([pid, n]) => (
                <option key={pid} value={pid} disabled={pouch.some((x, j) => x === pid && j !== i)}>
                  {ITEMS[pid].name} ×{n}
                </option>
              ))}
              {id && !potions.some(([pid]) => pid === id) && (
                <option value={id}>{ITEMS[id]?.name ?? id} ×0</option>
              )}
            </select>
          </label>
        ))}
      </div>
      {message && <p className="mt-2 text-xs text-rubric">{message}</p>}
    </section>
  );
}
