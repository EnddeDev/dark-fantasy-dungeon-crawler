import { Activity, Coins } from "lucide-react";
import { MAX_LEVEL } from "../game/content";
import { derived, type BattleState } from "../game/battle";
import type { Player, Run } from "../game/types";
import { Meter } from "./ui";

/**
 * Верхняя полоса героя: имя, кошелёк, здоровье и этаж вылазки.
 * Полного листа здесь нет: он открывается кнопкой «Персонаж» поверх экрана.
 * В бою здоровье не дублируется: оно уже стоит в карточке героя.
 */
export function HeroBar({
  player,
  run,
  battle,
  onOpenSheet,
}: {
  player: Player;
  run: Run | null;
  battle: BattleState | null;
  onOpenSheet: () => void;
}) {
  const d = derived(player);
  const hpNow = battle ? battle.p.hp : player.hp;
  const hpMax = battle ? battle.p.maxHp : d.maxHp;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-flamedim/40 bg-slab/95 px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-title text-[1.3rem] leading-tight text-flamehi">{player.name}</span>
        <span className="shrink-0 font-mono text-sm text-flame">Ур. {player.level}/{MAX_LEVEL}</span>
      </div>

      <span className="flex items-center gap-1.5 font-mono text-[0.98rem] tab text-flamehi">
        <Coins size={16} className="text-flame" aria-hidden />
        {player.gold}
        <span className="text-xs text-mute">зол.</span>
        {run && <span className="text-[0.84rem] text-mute">· в вылазке +{run.gold}</span>}
      </span>

      {!battle && (
        <div className="flex min-w-[10rem] flex-1 items-center gap-2 sm:max-w-xs" aria-label="Здоровье">
          <span className="text-[0.9rem] text-mute">Здоровье</span>
          <Meter value={hpNow} max={hpMax} tone="rubric" className="h-2 flex-1" ticks={8} />
          <span className="font-mono text-[0.9rem] tab text-parch">{hpNow}/{hpMax}</span>
        </div>
      )}

      {run && (
        <span className="font-mono text-[0.88rem] text-mute">
          Этаж <b className="text-parch">{run.floor}</b>
        </span>
      )}

      <button
        type="button"
        onClick={onOpenSheet}
        className="ml-auto flex shrink-0 items-center gap-2 border border-flamedim px-3 py-1.5 font-display text-[0.86rem] uppercase tracking-[0.1em] text-flame transition-colors hover:bg-flame/15 hover:text-flamehi"
      >
        <Activity size={14} aria-hidden />
        Персонаж
      </button>
    </div>
  );
}
