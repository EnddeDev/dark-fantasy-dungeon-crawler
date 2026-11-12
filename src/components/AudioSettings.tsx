import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getMusicVolume, getSoundVolume, setMusicVolume, setSoundVolume } from "../audio/ambientEngine";

/** Ползунок громкости в процентах. */
function VolumeSlider({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="font-display text-[0.85rem] uppercase tracking-[0.1em] text-flamehi">
          {label}
        </label>
        <span className="font-mono text-[0.75rem] text-mute" aria-hidden>
          {value}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label}: ${value}%`}
        className="w-full accent-flame"
      />
      <div className="text-[0.7rem] text-mute">{hint}</div>
    </div>
  );
}

/**
 * Настройки звука: отдельные ползунки для звуков (фон сцен и эффекты) и для музыки.
 * Значения сохраняются в localStorage. Ползунок в 0 — полная тишина в этом канале.
 */
export function AudioSettings({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(() => getSoundVolume());
  const [music, setMusic] = useState(() => getMusicVolume());
  const silent = sound === 0 && music === 0;
  /* В лобби настройки живут в верхней панели; в остальных местах плавают в углу. */
  return (
    <div className={inline ? "relative" : "fixed bottom-4 left-4 z-40 flex flex-col items-start gap-2"}>
      {open && (
        <div
          role="dialog"
          aria-label="Настройки звука"
          className={`w-64 border border-flamedim bg-slab p-3 font-body text-[0.85rem] text-parch shadow-[0_10px_30px_-12px_#000] ${
            inline ? "absolute right-0 top-full z-50 mt-2" : "bg-slab/95"
          }`}
        >
          <VolumeSlider
            id="volume-sound"
            label="Звуки"
            hint="Фон локаций, сундуки, снаряжение, торговля"
            value={sound}
            onChange={(v) => {
              setSound(v);
              setSoundVolume(v);
            }}
          />
          <VolumeSlider
            id="volume-music"
            label="Музыка"
            hint="Лобби и классическое подземелье"
            value={music}
            onChange={(v) => {
              setMusic(v);
              setMusicVolume(v);
            }}
          />
          <p className="mt-2 border-t border-flamedim pt-2 text-[0.68rem] leading-snug text-mute">
            Музыка: «Witchcraft» и «Forest», Makoto Hiramatsu,{" "}
            <a
              href="https://makotohiramatsu.itch.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-flamehi underline underline-offset-2"
            >
              makotohiramatsu.itch.io
            </a>
            , лицензия CC BY 4.0.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Настройки звука"
        title="Настройки звука: звуки и музыка"
        className="flex items-center gap-2 border border-flamedim bg-slab/95 px-3 py-2 font-display text-[0.85rem] uppercase tracking-[0.1em] text-flamehi shadow-[0_10px_30px_-12px_#000] hover:border-flame hover:bg-flame/15"
      >
        {silent ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
        Звук
      </button>
    </div>
  );
}
