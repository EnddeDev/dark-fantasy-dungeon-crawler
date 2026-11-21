import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFitInViewport } from "./useFitInViewport";
import { ARCHETYPES } from "../game/archetypes";
import type { StatMilestoneOption, StatMilestoneTier } from "../game/statMilestones";

/**
 * Открытый рубеж характеристики во вкладке «Развитие»: при наведении, фокусе или тапе
 * показывает, что именно он даёт. Подсказка выведена порталом, чтобы её не обрезал overflow панели.
 * Без выбранного рубежа подсказки нет: wrapper просто отдаёт детей.
 */
export function MilestoneTip({
  chosen,
  tier,
  children,
}: {
  chosen: StatMilestoneOption | null;
  tier: StatMilestoneTier;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  useFitInViewport(tipRef, pos !== null);
  if (!chosen) return <>{children}</>;
  const open = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ x: rect.left, y: rect.bottom + 6 });
  };
  const close = () => setPos(null);
  const width = 288;
  const left = pos
    ? Math.max(8, Math.min(pos.x, (typeof window === "undefined" ? 1024 : window.innerWidth) - width - 8))
    : 0;
  return (
    <div
      ref={ref}
      className="block"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      {pos &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="pointer-events-none fixed z-[60] border border-flamedim bg-black/95 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.8)]"
            style={{ left, top: pos.y, width }}
          >
            <div className="flex items-center gap-2">
              <span className="font-display text-[0.95rem] uppercase tracking-[0.06em] text-flamehi">{chosen.name}</span>
              <span className="ml-auto font-mono text-[0.72rem] text-mute">
                рубеж {tier} · {ARCHETYPES[chosen.archetype].name}
              </span>
            </div>
            <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[0.86rem] leading-snug text-parch/90">
              <span className="text-parch">Даёт: </span>
              {chosen.desc}
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
