import { useState } from "react";
import { ITEMS } from "../game/content";
import { POUCH_SLOTS, pouchCandidates, pouchCategoryOf, pouchOf, type PouchCategory } from "../game/pouch";
import type { Player } from "../game/types";
import { ItemArt } from "./ItemArt";
import { Btn, Modal } from "./ui";

const CATS: { id: PouchCategory; label: string }[] = [
  { id: "potion", label: "Зелья" },
  { id: "throwable", label: "Расходники" },
  { id: "scroll", label: "Свитки" },
  { id: "special", label: "Спец." },
];

/**
 * Пять слотов сумки: зелья, свитки и расходники. Меняются вне боя: из лобби и из рюкзака в подземелье.
 * Клик по слоту открывает выборку с фильтром по виду; в слот кладётся предмет из рюкзака.
 */
export function PouchSlots({
  player,
  onSet,
}: {
  player: Player;
  /** Возвращает текст ошибки или null. */
  onSet: (index: number, id: string | null) => string | null;
}) {
  const pouch = pouchOf(player);
  const [picker, setPicker] = useState<number | null>(null);
  const [cat, setCat] = useState<PouchCategory>("potion");
  const [error, setError] = useState<string | null>(null);

  const openPicker = (index: number) => {
    setCat(pouchCategoryOf(pouch[index]) ?? "potion");
    setError(null);
    setPicker(index);
  };

  const choose = (index: number, id: string | null) => {
    const err = onSet(index, id);
    if (err) {
      setError(err);
      return;
    }
    setPicker(null);
  };

  const items = pouchCandidates(player, cat);

  return (
    <section aria-label="Сумка" className="border border-line bg-black/20 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="sc text-[0.86rem] text-flamedim">Сумка · {POUCH_SLOTS} слотов</span>
        <span className="font-mono text-[0.76rem] text-mute">зелья, свитки, расходники</span>
      </div>
      <p className="mt-1 text-xs text-mute">В бою предметы из сумки не тратят выносливость. Менять можно только вне боя.</p>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {pouch.map((id, i) => {
          const def = id ? ITEMS[id] : undefined;
          const count = id ? player.bag[id] ?? 0 : 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => openPicker(i)}
              aria-label={id ? `Слот ${i + 1}: ${def?.name ?? id}, в рюкзаке ${count}` : `Слот ${i + 1}: пусто`}
              title={id ? `${def?.name ?? id}: нажмите, чтобы заменить` : `Слот ${i + 1}: нажмите, чтобы положить предмет`}
              className={`flex min-w-0 flex-col items-center gap-1 border px-1 py-2 text-center transition-colors hover:bg-flame/10 ${
                id ? "border-line bg-slab2" : "border-dashed border-line/70 text-mute hover:border-flamedim"
              }`}
            >
              {id ? (
                <ItemArt id={id} name={def?.name ?? id} size={40} framed={false} />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center font-mono text-xl text-mute">+</span>
              )}
              <span className="line-clamp-2 min-h-[2.2em] w-full text-[0.72rem] leading-tight text-parch">
                {id ? def?.name ?? id : "пусто"}
              </span>
              {id && (
                <span className={`font-mono text-[0.74rem] ${count > 0 ? "text-flame" : "text-rubric"}`}>×{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {picker !== null && (
        <Modal
          title={`Слот ${picker + 1}`}
          sub="Выбери предмет из рюкзака. В сумку — зелья, свитки и расходники."
          onClose={() => setPicker(null)}
          actions={
            <>
              {pouch[picker] && (
                <Btn tone="danger" onClick={() => choose(picker, null)}>
                  Очистить слот
                </Btn>
              )}
              <Btn onClick={() => setPicker(null)}>Закрыть</Btn>
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Вид предмета">
              {CATS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={cat === c.id}
                  onClick={() => setCat(c.id)}
                  className={`border px-3 py-1.5 font-display text-[0.9rem] uppercase tracking-[0.1em] transition-colors ${
                    cat === c.id ? "border-flamedim bg-flame/15 text-flamehi" : "border-line text-mute hover:text-parch"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-rubric">{error}</p>}
            {items.length === 0 ? (
              <p className="text-sm italic text-mute">В рюкзаке нет предметов этого вида.</p>
            ) : (
              <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
                {items.map(([id, n]) => {
                  const def = ITEMS[id];
                  const slot = pouch.findIndex((x, j) => x === id && j !== picker);
                  const here = pouch[picker] === id;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        disabled={slot >= 0}
                        onClick={() => choose(picker, id)}
                        className="flex w-full items-center gap-3 border border-line bg-slab2 px-3 py-2 text-left transition-colors enabled:hover:border-flame enabled:hover:bg-flame/10 disabled:opacity-45"
                      >
                        <ItemArt id={id} name={def.name} size={36} framed={false} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[0.95rem] uppercase tracking-[0.08em] text-flamehi">
                            {def.name} <span className="font-mono text-[0.84rem] text-flame">×{n}</span>
                          </span>
                          <span className="block text-[0.84rem] leading-snug text-mute">{def.desc}</span>
                        </span>
                        {here && <span className="shrink-0 font-mono text-[0.76rem] text-verd">в этом слоте</span>}
                        {slot >= 0 && <span className="shrink-0 font-mono text-[0.76rem] text-mute">в слоте {slot + 1}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
