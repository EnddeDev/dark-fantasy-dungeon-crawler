import { useEffect, useLayoutEffect, type RefObject } from "react";

/** На сервере и в тестах layout-эффекта нет: берём обычный эффект. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const EDGE_GAP = 8;

/**
 * Сдвигает всплывающую подсказку по горизонтали, если она выходит за край окна.
 * Сдвиг идёт через CSS-свойство translate: оно не мешает transform у подсказок,
 * которые центрируются классом -translate-x-1/2.
 */
export function useFitInViewport(ref: RefObject<HTMLElement | null>, open: boolean): void {
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    el.style.translate = "";
    const rect = el.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    let dx = 0;
    if (rect.right > viewport - EDGE_GAP) dx = viewport - EDGE_GAP - rect.right;
    if (rect.left + dx < EDGE_GAP) dx = EDGE_GAP - rect.left;
    if (dx !== 0) el.style.translate = `${Math.round(dx)}px 0px`;
  }, [open, ref]);
}
