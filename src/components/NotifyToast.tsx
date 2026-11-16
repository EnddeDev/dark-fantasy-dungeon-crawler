import { useEffect } from "react";
import { NOTIFY_TITLE } from "../net/online";
import type { NotificationItem } from "../net/protocol";

const SHOW_MS = 6_000;

/** Всплывающая подсказка о новом уведомлении. Не мешает игре: закрывается сама и по клику. */
export function NotifyToast({ toast, onOpen, onClose }: { toast: NotificationItem; onOpen: () => void; onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onClose, SHOW_MS);
    return () => window.clearTimeout(id);
  }, [toast.id, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 top-20 z-[60] flex max-w-xs items-start gap-3 border border-flamedim bg-slab/95 px-3 py-2.5 shadow-[0_10px_30px_-12px_#000]"
    >
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="sc block text-flame">{NOTIFY_TITLE[toast.kind] ?? "Уведомление"}</span>
        <span className="mt-0.5 block text-[0.94rem] text-parch">{toast.body}</span>
      </button>
      <button onClick={onClose} className="shrink-0 text-mute hover:text-parch" aria-label="Скрыть подсказку">
        ×
      </button>
    </div>
  );
}
