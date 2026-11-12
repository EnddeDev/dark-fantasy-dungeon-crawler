import { useEffect, useLayoutEffect, type RefObject } from "react";

/** На сервере и в тестах layout-эффекта нет: берём обычный эффект. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const EDGE_GAP = 8;

/**
 * Сдвигает всплывающую подсказку, если она выходит за край окна: по горизонтали и по вертикали.
 * Подсказка, открытая вниз у нижнего края, поднимается вверх; если выше тоже нет места,
 * верхний край прижимается к окну. Сдвиг идёт через CSS-свойство translate: оно не мешает
 * transform у подсказок, которые центрируются классом -translate-x-1/2.
 */
export function useFitInViewport(ref: RefObject<HTMLElement | null>, open: boolean): void {
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    el.style.translate = "";
    const rect = el.getBoundingClientRect();
    const viewportW = document.documentElement.clientWidth;
    const viewportH = document.documentElement.clientHeight;

    let dx = 0;
    if (rect.right > viewportW - EDGE_GAP) dx = viewportW - EDGE_GAP - rect.right;
    if (rect.left + dx < EDGE_GAP) dx = EDGE_GAP - rect.left;

    let dy = 0;
    if (rect.bottom > viewportH - EDGE_GAP) dy = viewportH - EDGE_GAP - rect.bottom;
    if (rect.top + dy < EDGE_GAP) dy = EDGE_GAP - rect.top;

    if (dx !== 0 || dy !== 0) el.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
  }, [open, ref]);
}
