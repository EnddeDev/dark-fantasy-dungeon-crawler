import type { LucideIcon } from "lucide-react";
import { ScrollText } from "lucide-react";
import { AudioSettings } from "./AudioSettings";

/** Пункт правой панели лобби: раздел, счётчик и признак «есть, что сделать». */
export type LobbyNavItem<T extends string> = {
  id: T;
  label: string;
  Icon: LucideIcon;
  count: number;
  alert: boolean;
};

/** Кнопка входа в аккаунт (или сообщества, если вход выполнен). */
export type LobbyAccount = { label: string; title: string; onClick: () => void };

/** Верхняя панель лобби: название игры, задания, звук и вход. */
export function LobbyTopBar({
  quests,
  onOpenQuests,
  account,
}: {
  quests: { active: number; ready: number; available: number };
  onOpenQuests: () => void;
  account?: LobbyAccount;
}) {
  const hint = `Задания: взято ${quests.active}, готово к сдаче ${quests.ready}, можно взять ${quests.available}`;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-soot/95 backdrop-blur-[2px] lg:h-14">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:h-full lg:py-0">
        <div className="flex items-baseline gap-3">
          <span className="font-title text-2xl leading-none text-flamehi">Сумрак</span>
          <span className="sc hidden text-flamedim md:inline">лобби · лагерь под сводами</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenQuests}
            title={hint}
            className="flex items-center gap-2 border border-line bg-black/40 px-3 py-2 font-display text-[0.85rem] uppercase tracking-[0.1em] text-parch transition-colors hover:border-flamedim hover:text-flamehi"
          >
            <ScrollText size={15} strokeWidth={1.7} aria-hidden />
            Задания
            {quests.ready > 0 && (
              <span className="border border-verd bg-verd/20 px-1.5 py-0.5 font-mono text-[0.78rem] text-verd">{quests.ready}</span>
            )}
            {quests.ready === 0 && quests.active > 0 && (
              <span className="border border-line px-1.5 py-0.5 font-mono text-[0.78rem] text-mute">{quests.active}</span>
            )}
            {quests.available > 0 && (
              <span
                title="Есть задание, которое можно взять"
                className="animate-pulse border border-verd bg-verd/20 px-1.5 py-0.5 font-mono text-[0.78rem] text-verd"
              >
                !
              </span>
            )}
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

/** Правая панель лобби: разделы и «Начать заново» внизу. */
export function LobbyNav<T extends string>({
  items,
  current,
  onSelect,
  onRestart,
  className = "",
}: {
  items: LobbyNavItem<T>[];
  current: T;
  onSelect: (id: T) => void;
  onRestart: () => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Разделы лобби"
      className={`flex flex-col border-line bg-slab lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-l xl:w-64 ${className}`}
    >
      <div className="grid grid-cols-3 gap-px bg-line lg:flex lg:flex-col lg:bg-transparent lg:gap-0">
        {items.map((item) => {
          const active = current === item.id;
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center gap-3 bg-slab px-3 py-3.5 text-left font-display text-[0.88rem] uppercase tracking-[0.12em] transition-colors lg:border-l-2 lg:px-5 lg:py-4 lg:text-[0.95rem] ${
                active ? "bg-slab2 text-flamehi lg:border-flame" : "text-mute hover:bg-black/30 hover:text-parch lg:border-transparent"
              }`}
            >
              <Icon size={16} strokeWidth={1.7} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.count > 0 && (
                <span className="border border-flame bg-flame/20 px-1.5 py-0.5 font-mono text-[0.78rem] text-flamehi">{item.count}</span>
              )}
              {item.alert && (
                <span
                  title="Есть задание, которое можно взять"
                  className="animate-pulse border border-verd bg-verd/20 px-1.5 py-0.5 font-mono text-[0.78rem] text-verd"
                >
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onRestart}
        className="mt-auto border-t border-line px-5 py-3 text-left font-display text-[0.82rem] uppercase tracking-[0.14em] text-mute transition-colors hover:text-rubric"
      >
        Начать заново
      </button>
    </nav>
  );
}
