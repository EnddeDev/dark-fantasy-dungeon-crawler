import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isAmbientMuted, setAmbientMuted } from "../audio/ambientEngine";

/** Переключатель фонового звука. Выбор сохраняется в localStorage. */
export function AmbientToggle() {
  const [muted, setMuted] = useState(() => isAmbientMuted());
  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setAmbientMuted(next);
  };
  const label = muted ? "Фоновый звук выключен" : "Фоновый звук включён";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!muted}
      title={`${label}. Фон лобби и каждого типа подземелья`}
      className="fixed bottom-4 left-4 z-40 flex items-center gap-2 border border-flamedim bg-slab/95 px-3 py-2 font-display text-[0.85rem] uppercase tracking-[0.1em] text-flamehi shadow-[0_10px_30px_-12px_#000] hover:border-flame hover:bg-flame/15"
    >
      {muted ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
      {muted ? "Звук выкл." : "Звук вкл."}
    </button>
  );
}
