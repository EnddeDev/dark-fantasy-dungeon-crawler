import { useState } from "react";
import { portraitUrl } from "../net/api";

/**
 * Портрет игрока. Если портрета нет или картинка не загрузилась, показываем инициал
 * на тёмном фоне, чтобы в списках не было дыр. Версия из сервера меняет адрес картинки,
 * поэтому после замены браузер берёт новый файл.
 */
export function PlayerPortrait({
  id,
  name,
  version,
  size = 40,
  fill = false,
  className = "",
}: {
  id: string;
  name: string;
  version: number | null | undefined;
  size?: number;
  /** Заполнить родителя целиком (картинка в карточке арены), а не квадрат size×size. */
  fill?: boolean;
  className?: string;
}) {
  const url = version == null ? null : portraitUrl(id, version);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const box = fill ? undefined : { width: size, height: size };

  if (!url || failedUrl === url) {
    const letter = name.trim().charAt(0).toUpperCase() || "?";
    return fill ? (
      <span
        role="img"
        aria-label={name}
        className={`flex h-full w-full select-none items-center justify-center font-display text-[9rem] leading-none text-flame/10 ${className}`}
      >
        {letter}
      </span>
    ) : (
      <span
        role="img"
        aria-label={name}
        title={name}
        style={{ ...box, fontSize: Math.round(size * 0.42) }}
        className={`inline-flex shrink-0 items-center justify-center border border-line bg-soot font-display text-flamehi ${className}`}
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={name}
      title={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailedUrl(url)}
      style={box}
      className={
        fill
          ? `h-full w-full object-cover object-top ${className}`
          : `shrink-0 border border-line object-cover ${className}`
      }
    />
  );
}
