import {
  SKILL_RANK_MAX,
  skillBranchesOf,
  skillNodeText,
  skillPointsAvailable,
  skillPointsEarned,
  skillPointsSpent,
  skillRankOf,
  type SkillNodeDef,
} from "../game/archetypeSkills";
import { ARCHETYPES } from "../game/archetypes";
import type { Player } from "../game/types";
import { Btn, Panel } from "./ui";

const KIND_LABEL: Record<SkillNodeDef["kind"], string> = {
  passive: "Пассив",
  technique: "Приём",
  upgrade: "Усиление",
  effect: "Эффект",
};

/** Экран «Навыки»: одно дерево архетипа — корень-архетип и три ветки по четыре узла, каждый узел качается до 3. */
export function SkillsPanel({
  player,
  onRank,
}: {
  player: Player;
  onRank: (nodeId: string, rank: number) => void;
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
      {free > 0 && (
        <p className="mb-3 border border-verd/60 bg-verd/10 px-3 py-2 font-mono text-[0.95rem] text-verd">
          Свободно очков навыков: <b>{free}</b>. Распредели их по узлам дерева.
        </p>
      )}
      <p className="text-[1rem] leading-relaxed text-parch/85">
        Дерево {ARCHETYPES[player.archetype].name.toLowerCase()}: три ветки, в каждой пассив, приём оружия, усиление
        приёма и новый эффект. Узел открывается после предыдущего, каждый качается до {SKILL_RANK_MAX}. Очко за каждый
        уровень выше 5; на 15 уровне — 10. Полное дерево стоит 36 очков, выбор важнее.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {branches.map((branch) => (
          <div key={branch.id} className="border border-flamedim/50 bg-black/25 p-3">
            <div className="mb-2">
              <div className="text-[1.02rem] font-semibold text-parch">{branch.name}</div>
              <div className="text-[0.9rem] leading-snug text-parch/70">{branch.desc}</div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {branch.nodes.map((node) => {
                const rank = skillRankOf(player, node.id);
                const parentOpen = !node.requires || skillRankOf(player, node.requires) >= 1;
                const canUp = parentOpen && rank < SKILL_RANK_MAX && free >= 1;
                const canDown = rank > 0;
                return (
                  <div
                    key={node.id}
                    className={`grid grid-cols-[1fr_auto] gap-2 border-l-2 pl-2 ${
                      rank > 0 ? "border-flamehi" : parentOpen ? "border-flamedim/70" : "border-mute/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[0.75rem] uppercase tracking-wide text-mute">
                        {KIND_LABEL[node.kind]}
                        {!parentOpen && " · закрыто"}
                      </div>
                      <div className={`text-[0.98rem] font-semibold ${rank > 0 ? "text-parch" : "text-parch/75"}`}>
                        {node.name}
                      </div>
                      <div className="text-[0.88rem] leading-snug text-parch/75">{skillNodeText(node, Math.max(1, rank))}</div>
                    </div>
                    <div className="flex flex-col items-end justify-between gap-1">
                      <span
                        className="font-mono text-sm tab text-flamehi"
                        aria-label={`Ранг ${rank} из ${SKILL_RANK_MAX}`}
                      >
                        {rank}/{SKILL_RANK_MAX}
                      </span>
                      <div className="flex gap-1">
                        <Btn tone="ghost" disabled={!canDown} onClick={() => onRank(node.id, rank - 1)}>
                          −
                        </Btn>
                        <Btn tone={canUp ? "flame" : "ghost"} disabled={!canUp} onClick={() => onRank(node.id, rank + 1)}>
                          +1
                        </Btn>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
