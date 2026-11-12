import {
  SKILL_RANK_A,
  SKILL_RANK_B,
  SKILL_RANK_MAX,
  skillBranchesOf,
  skillPointsAvailable,
  skillPointsEarned,
  skillPointsSpent,
  skillRankOf,
  type SkillBranchId,
} from "../game/archetypeSkills";
import { ARCHETYPES } from "../game/archetypes";
import type { Player } from "../game/types";
import { Btn, Panel } from "./ui";

/** Экран «Навыки»: три ветки основного архетипа, ранги 0–5, эффекты на рангах 3 и 5. */
export function SkillsPanel({
  player,
  onRank,
}: {
  player: Player;
  onRank: (branch: SkillBranchId, rank: number) => void;
}) {
  if (!player.archetype) return null;
  const branches = skillBranchesOf(player.archetype);
  const earned = skillPointsEarned(player.level);
  const spent = skillPointsSpent(player.skillRanks);
  const free = skillPointsAvailable(player);

  return (
    <Panel
      className="p-4"
      title="Навыки"
      right={
        <span className="font-mono text-sm tab text-flame">
          очки: <span className="text-flamehi">{free}</span>
          <span className="text-mute"> / {earned} (потрачено {spent})</span>
        </span>
      }
    >
      <p className="text-[1rem] leading-relaxed text-parch/85">
        Ветки {ARCHETYPES[player.archetype].name.toLowerCase()}: очко за каждый уровень выше 5. Ранг 3 открывает
        первый эффект ветки, ранг 5 — второй. Очки можно распределять по веткам свободно.
      </p>

      {/* Ветки в одну строку: три рядом на широком экране, на узком — прокрутка вбок. */}
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {branches.map((def) => {
          const rank = skillRankOf(player, def.id);
          const canUp = rank < SKILL_RANK_MAX && free >= 1;
          const canDown = rank > 0;
          return (
            <div key={def.id} className="flex min-w-[16rem] flex-1 flex-col gap-2 border border-flamedim/50 bg-black/25 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[1.02rem] font-semibold text-parch">{def.name}</div>
                  <div className="text-[0.9rem] leading-snug text-parch/70">{def.desc}</div>
                </div>
                <span className="font-mono text-sm tab text-flamehi whitespace-nowrap">{rank}/{SKILL_RANK_MAX}</span>
              </div>

              <div className="flex gap-1" aria-label={`Ранг ${rank} из ${SKILL_RANK_MAX}`}>
                {Array.from({ length: SKILL_RANK_MAX }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 flex-1 border ${i < rank ? "border-flamehi bg-flame" : "border-flamedim/60 bg-transparent"}`}
                  />
                ))}
              </div>

              <EffectLine
                label={`Ранг ${SKILL_RANK_A}`}
                name={def.a.name}
                desc={def.a.desc}
                on={rank >= SKILL_RANK_A}
              />
              <EffectLine
                label={`Ранг ${SKILL_RANK_B}`}
                name={def.b.name}
                desc={def.b.desc}
                on={rank >= SKILL_RANK_B}
              />

              <div className="mt-auto flex items-center gap-2 pt-1">
                <Btn tone="ghost" disabled={!canDown} onClick={() => onRank(def.id, rank - 1)}>
                  −
                </Btn>
                <Btn tone={canUp ? "flame" : "ghost"} disabled={!canUp} onClick={() => onRank(def.id, rank + 1)}>
                  +1 ранг
                </Btn>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function EffectLine({ label, name, desc, on }: { label: string; name: string; desc: string; on: boolean }) {
  return (
    <div className={`border-l-2 pl-2 text-[0.9rem] leading-snug ${on ? "border-flamehi text-parch" : "border-mute/40 text-mute"}`}>
      <div className="font-mono text-[0.78rem] uppercase tracking-wide">
        {label} · {on ? "открыто" : "закрыто"}
      </div>
      <div>
        <b>{name}.</b> {desc}
      </div>
    </div>
  );
}
