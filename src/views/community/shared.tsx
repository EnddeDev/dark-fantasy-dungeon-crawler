import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ItemArt } from "../../components/ItemArt";
import { Btn } from "../../components/ui";
import { GEAR_BASES } from "../../game/content";
import type { GearItem } from "../../game/types";

export function gearName(item: GearItem): string {
  return GEAR_BASES[item.baseId]?.name ?? item.baseId;
}

/** Ошибки сети в одном месте: сервер отвечает по-русски, поэтому текст показываем как есть. */
export function ErrorBar({ error, onClose }: { error: string | null; onClose?: () => void }) {
  if (!error) return null;
  return (
    <div className="mb-3 flex items-start justify-between gap-3 border border-rubric/60 bg-rubric/10 px-3 py-2 text-[0.94rem] text-rubric">
      <span>{error}</span>
      {onClose && (
        <button onClick={onClose} className="shrink-0 text-mute hover:text-parch" aria-label="Скрыть">
          ×
        </button>
      )}
    </div>
  );
}

export function Panel({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-line bg-slab/70">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <div className="sc text-flame">{title}</div>
          {hint && <div className="mt-0.5 text-[0.88rem] text-mute">{hint}</div>}
        </div>
        {actions}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function GearChip({ item, onRemove }: { item: GearItem; onRemove?: () => void }) {
  return (
    <span className="flex min-w-0 items-center gap-2 border border-line bg-black/40 px-2 py-1">
      <ItemArt id={item.baseId} name={gearName(item)} size={26} rarity={item.identified ? item.rarity : undefined} />
      <span className="min-w-0">
        <span className="block truncate font-display text-[0.95rem] uppercase tracking-[0.04em] text-parch">
          {gearName(item)}
        </span>
        <span className="block font-mono text-[0.78rem] text-mute">ур. {item.level ?? 1}</span>
      </span>
      {onRemove && (
        <button onClick={onRemove} className="ml-1 text-mute hover:text-rubric" aria-label="Убрать предмет">
          ×
        </button>
      )}
    </span>
  );
}

/** Выбор снаряжения из арсенала — общий для обмена и рынка. */
export function GearPicker({
  player,
  selected,
  onToggle,
  emptyText = "Арсенал пуст — сначала добудьте снаряжение.",
}: {
  player: { armory: GearItem[]; equip: Record<string, string | null> };
  selected: string[];
  onToggle: (uid: string) => void;
  emptyText?: string;
}) {
  const equipped = new Set(Object.values(player.equip ?? {}).filter((uid): uid is string => typeof uid === "string"));
  if (!player.armory.length) return <p className="text-[0.94rem] italic text-mute">{emptyText}</p>;
  return (
    <div className="grid max-h-64 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
      {player.armory.map((item) => {
        const on = selected.includes(item.uid);
        const busy = equipped.has(item.uid);
        return (
          <button
            key={item.uid}
            onClick={() => !busy && onToggle(item.uid)}
            disabled={busy}
            title={busy ? "Снимите предмет, чтобы выставить его" : undefined}
            className={`flex min-w-0 items-center gap-2 border px-2 py-1.5 text-left transition-colors ${
              on ? "border-flame bg-flame/15" : "border-line bg-black/30 hover:border-flamedim"
            } ${busy ? "cursor-not-allowed opacity-45" : ""}`}
          >
            <ItemArt id={item.baseId} name={gearName(item)} size={28} rarity={item.identified ? item.rarity : undefined} />
            <span className="min-w-0">
              <span className="block truncate font-display text-[0.95rem] uppercase text-parch">{gearName(item)}</span>
              <span className="block font-mono text-[0.78rem] text-mute">
                ур. {item.level ?? 1}
                {busy ? " · надето" : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Простой опрос сервера, который останавливается вместе с компонентом. */
export function usePoll(fn: () => void | Promise<void>, ms: number, enabled = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = () => {
      if (alive) void ref.current();
    };
    tick();
    const id = window.setInterval(tick, ms);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [ms, enabled]);
}

/** Загрузка списка с ручным обновлением и текстом ошибки. */
export function useLoader<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadRef.current();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, error, loading, refresh, setError, setData };
}

export function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${online ? "bg-verd" : "bg-mute/50"}`}
      title={online ? "в игре" : "офлайн"}
    />
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="border border-dashed border-line px-3 py-4 text-center text-[0.94rem] italic text-mute">{children}</p>;
}

export function ConfirmRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">{children}</div>;
}

export { Btn };
