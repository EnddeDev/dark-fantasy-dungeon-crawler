import {
  EPIC_SKILLS,
  GEAR_BASES,
  RARITY_META,
  identifyReqs,
  scaledGearStats,
  STAT_META,
  WEAR_RANGE,
  weaponSkillFor,
} from "../game/content";
import { GEAR_EFFECTS, GEAR_PASSIVES } from "../game/gearEffects";
import { SLOT_META } from "../game/types";
import type { GearItem, Player, StatKey } from "../game/types";
import { ItemArt } from "./ItemArt";

const RARITY_COLOR: Record<string, string> = {
  common: "#9a8672",
  rare: "#5aa9e6",
  epic: "#a78bfa",
  legendary: "#f6d48a",
};

/**
 * Сноска с полным разбором предмета: что даёт, чего требует,
 * какая изношенность досталась этому конкретному экземпляру.
 */
export function GearNote({ item, player }: { item: GearItem; player: Player }) {
  const st = scaledGearStats(item);
  const base = GEAR_BASES[item.baseId] ?? { name: "Предмет", desc: "" };
  const level = item.level ?? 1;
  const identified = item.identified;
  const skill = weaponSkillFor(item);
  const req = identifyReqs(item);
  const skillIntReq = skill
    ? Math.max(1, skill.intReq - (player.passives.includes("scribe") ? 1 : 0))
    : 1;
  const range = WEAR_RANGE[item.wear];
  const color = RARITY_COLOR[item.rarity] ?? RARITY_COLOR.common;
  const equipped = Object.values(player.equip).includes(item.uid);

  const statReq = (item.gearClass === "light" ? "int" : item.gearClass === "heavy" ? "str" : "agi") as StatKey;
  const needValue = Math.max(1, Math.min(10, 1 + level));
  const haveValue = player.stats[statReq];
  const statOk = haveValue >= needValue;
  const levelOk = player.level >= level;

  const rows: [string, string][] = [];
  if (st.dmg) rows.push(["Урон оружия", `${st.dmg[0]}–${st.dmg[1]}`]);
  if (st.armor) rows.push(["Защита", `+${st.armor}`]);
  if (st.hp) rows.push(["Здоровье", `+${st.hp}`]);
  if (st.evade) rows.push(["Уклонение", `${st.evade > 0 ? "+" : ""}${Math.round(st.evade * 100)}%`]);
  rows.push(["Состояние", `${range.label} ×${item.wearMult.toFixed(3)}`]);
  rows.push(["Базовый множитель", `×${range.base} (диапазон ${range.lo}–${range.hi})`]);

  const effects = (item.effects ?? []).map((e) => GEAR_EFFECTS[e]).filter(Boolean);
  const passive = item.passive ? GEAR_PASSIVES[item.passive] : null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-40 w-[min(25rem,calc(100vw-2rem))] border bg-slab/98 p-4 shadow-[0_30px_70px_-25px_#000]"
      style={{ borderColor: identified ? color : "#322720" }}
      role="tooltip"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <ItemArt id={item.baseId} name={st.base.name} size={64} framed={identified} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="sc text-[0.58rem]">{SLOT_META[item.slot]?.name ?? "Слот"}</div>
              <h4 className="font-display text-[1.05rem] uppercase leading-tight tracking-[0.06em] text-flamehi">
                {st.base.name}
              </h4>
            </div>
            <span className="shrink-0 font-mono text-[0.7rem] tab text-flame">ур. {level}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1 font-mono text-[0.62rem]">
            <span className="border border-flamedim/70 px-1.5 py-0.5 text-flamedim">
              {base.gearClass === "light" ? "лёгкое" : base.gearClass === "heavy" ? "тяжёлое" : "среднее"}
            </span>
            {identified ? (
              <span className="border px-1.5 py-0.5 uppercase" style={{ borderColor: color, color }}>
                {RARITY_META[item.rarity]?.name ?? "Обычное"}
              </span>
            ) : (
              <span className="border border-line px-1.5 py-0.5 text-mute">редкость ???</span>
            )}
            {equipped && <span className="border border-verd px-1.5 py-0.5 text-verd">надето</span>}
          </div>
        </div>
      </div>

      {/* Требования: характеристика и значение для использования */}
      <div className="mt-3 border-t border-line/70 pt-2">
        <div className="flex items-baseline justify-between gap-2 text-[0.78rem]">
          <span className="sc">Требуется для использования</span>
          <span className={`font-mono font-bold ${statOk && levelOk ? "text-verd" : "text-rubric"}`}>
            {STAT_META[statReq].short} {needValue} · ур. {level}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className={`border px-1.5 py-0.5 font-mono text-[0.66rem] ${statOk ? "border-verd text-verd" : "border-rubric text-rubric"}`}>
            {STAT_META[statReq].name}: {haveValue}/{needValue} {statOk ? "✓" : "✗"}
          </span>
          <span className={`border px-1.5 py-0.5 font-mono text-[0.66rem] ${levelOk ? "border-verd text-verd" : "border-rubric text-rubric"}`}>
            уровень: {player.level}/{level} {levelOk ? "✓" : "✗"}
          </span>
        </div>
        <p className="mt-1.5 text-[0.74rem] italic leading-snug text-mute">{base.desc}</p>
      </div>

      {/* Что даёт предмет */}
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-line/70 pt-2 text-[0.8rem]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-mute">{k}</dt>
            <dd className="text-right font-mono tab text-flamehi">{v}</dd>
          </div>
        ))}
        <dt className="text-mute">Цена</dt>
        <dd className="text-right font-mono tab text-parch/85">{base.price} зол.</dd>
      </dl>

      {skill && (
        <div className="mt-2 border-l-2 border-flamedim bg-black/35 px-2.5 py-1.5 text-[0.74rem]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display uppercase tracking-[0.08em] text-flamehi">Приём: {skill.name}</span>
            <span
              className={`font-mono text-[0.65rem] ${
                player.stats.int >= skillIntReq ? "text-verd" : "text-rubric"
              }`}
            >
              ИНТ {skillIntReq}
            </span>
          </div>
          <div className="mt-0.5 text-parch/85">{skill.desc}</div>
        </div>
      )}

      {identified ? (
        <div className="mt-2 space-y-1 border-t border-line/70 pt-2 text-[0.74rem] leading-snug">
          {effects.length === 0 && item.rarity === "common" && (
            <p className="text-mute italic">Обычное качество: только базовые характеристики.</p>
          )}
          {effects.map((eff, i) => (
            <div key={eff.id + i}>
              <span className="font-mono text-[0.62rem] uppercase text-verd">[эффект] </span>
              <b className="text-parch">{eff.name}:</b> <span className="text-mute">{eff.detail}</span>
            </div>
          ))}
          {item.epicSkill && EPIC_SKILLS[item.epicSkill] && (
            <div>
              <span className="font-mono text-[0.62rem] uppercase text-flame">[боевой приём] </span>
              <b className="text-flamehi">{EPIC_SKILLS[item.epicSkill].name}:</b>{" "}
              <span className="text-mute">{EPIC_SKILLS[item.epicSkill].desc}</span>
            </div>
          )}
          {passive && (
            <div>
              <span className="font-mono text-[0.62rem] uppercase text-rubric">[пассивная способность] </span>
              <b className="text-flamehi">{passive.name}:</b> <span className="text-mute">{passive.detail}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 border-t border-line/70 pt-2 text-[0.74rem] text-mute">
          Исследуется в арсенале: <b className="text-verd">ИНТ {req.int}</b> (сейчас {player.stats.int}) или{" "}
          <b className="text-flame">{req.gold} зол.</b>
        </p>
      )}
    </div>
  );
}
