import { Btn } from "../components/ui";
import type { LobbyEntry } from "../model/types";

export function TitleView({ onEnter }: { onEnter: (entry: LobbyEntry) => void }) {
  return (
    <div className="relative flex min-h-screen flex-col justify-end overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-slab2 via-slab to-soot" />
      <img
        src="images/gate.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-soot via-soot/55 to-soot/70" />
      <div className="vignette absolute inset-0" />
      <div className="grain absolute inset-0" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-14 pt-24 sm:px-8">
        <span className="sc text-flame">Хроники покорителя подземелья</span>
        <h1 className="font-title text-[clamp(4rem,17vw,11rem)] leading-[0.8] text-flamehi drop-shadow-[0_10px_40px_rgba(0,0,0,0.9)]">
          Сумрак
        </h1>
        <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,440px)_1fr] md:items-end">
          <p className="dropcap text-[1rem] leading-relaxed text-parch/90">
            Первый ярус — короткий лабиринт 6×6. Дальше коридоры растут до 10×10, но свет факела показывает
            лишь три клетки вперёд. Исследуй снаряжение, читай свитки и победи Стража у лестницы.
          </p>
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <Btn tone="flame" className="px-8 py-3.5 text-sm" onClick={() => onEnter("train")}>
              Войти в лобби
            </Btn>
            <Btn onClick={() => onEnter("guide")}>Как играть</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
