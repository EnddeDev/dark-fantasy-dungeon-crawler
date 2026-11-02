/**
 * Имя героя: показывается в боковой панели, в сообществе, дуэлях и личных сообщениях.
 * Правила смены имени в игре — здесь, сервер использует те же константы.
 */
export const CHARACTER_NAME_MIN = 2;
export const CHARACTER_NAME_MAX = 24;
export const DEFAULT_CHARACTER_NAME = "Покоритель";

/** Буквы и цифры любого алфавита, внутри можно пробел, дефис, точку и апостроф. */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} '\-.]*$/u;

export type CharacterNameCheck = { ok: true; name: string } | { ok: false; error: string };

/** Приводит имя к виду для хранения (пробелы схлопнуты, края обрезаны) и проверяет правила. */
export function checkCharacterName(raw: string): CharacterNameCheck {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Введите имя" };
  const length = [...name].length;
  if (length < CHARACTER_NAME_MIN) return { ok: false, error: `Имя: минимум ${CHARACTER_NAME_MIN} символа` };
  if (length > CHARACTER_NAME_MAX) return { ok: false, error: `Имя: не длиннее ${CHARACTER_NAME_MAX} символов` };
  if (!NAME_RE.test(name)) {
    return { ok: false, error: "Имя: буквы, цифры, пробел, дефис, точка или апостроф" };
  }
  return { ok: true, name };
}
