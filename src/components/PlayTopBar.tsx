import { Backpack, ScrollText } from "lucide-react";
import { AudioSettings } from "./AudioSettings";
import type { LobbyAccount } from "./LobbyChrome";

/**
 * Верхняя панель игры на карте и в бою: название, задания, рюкзак, звук и вход.
 * Одинаковая на обоих экранах, поэтому переход между картой и боем не меняет шапку.
 */
export function PlayTopBar({
  floor,
  activeQuests,
  onOpenQuests,
  onOpenBag,
  account,
}: {
  floor?: number;
  activeQuests: number;
  onOpenQuests: () => void;
  onOpenBag: () => void;
  account?: LobbyAccount;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-soot/95 backdrop-blur-[2px] lg:h-14">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:h-full lg:py-0">
        <div className="flex items-baseline gap-3">
          <span className="font-title text-2xl leading-none text-flamehi">Сумрак</span>
          {floor !== undefined && (
            <span className="sc hidden text-flamedim md:inline">
              подземелье · этаж <span className="font-mono tab">{floor}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenQuests}
            className="flex items-center gap-2 border border-line bg-black/40 px-3 py-2 font-display text-[0.85rem] uppercase tracking-[0.1em] text-parch transition-colors hover:border-flamedim hover:text-flamehi"
            title="Взятые задания"
          >
            <ScrollText size={15} strokeWidth={1.7} aria-hidden /> Задания
            {activeQuests > 0 && <span className="border border-line px-1.5 py-0.5 font-mono text-[0.78rem] text-mute">{activeQuests}</span>}
          </button>
          <button
            type="button"
            onClick={onOpenBag}
            className="flex items-center gap-2 border border-line bg-black/40 px-3 py-2 font-display text-[0.85rem] uppercase tracking-[0.1em] text-parch transition-colors hover:border-flamedim hover:text-flamehi"
            title="Рюкзак: припасы, реагенты и снаряжение"
          >
            <Backpack size={15} strokeWidth={1.7} aria-hidden /> Рюкзак
          </button>
          <AudioSettings inline />
          {account && (
            <button
              type="button"
              onClick={account.onClick}
              title={account.title}
              className="flex items-center gap-2 border border-flamedim bg-slab/95 px-3 py-2 font-display text-[0.85rem] uppercase tracking-[0.1em] text-flamehi shadow-[0_10px_30px_-12px_#000] hover:border-flame hover:bg-flame/15"
            >
              {account.label}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
