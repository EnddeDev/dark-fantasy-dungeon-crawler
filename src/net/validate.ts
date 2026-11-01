/** Правила полей входа те же, что проверяет сервер: 3–20 символов в логине, пароль от 6. */
export const LOGIN_RE = /^[a-zA-Zа-яА-Я0-9_-]{3,20}$/;
export const MIN_PASSWORD = 6;

export function validateCredentials(login: string, password: string): string | null {
  const name = login.trim();
  if (!name) return "Введите логин";
  if (name.length < 3) return "Логин: минимум 3 символа";
  if (!LOGIN_RE.test(name)) return "Логин: буквы, цифры, дефис или подчёркивание";
  if (password.length < MIN_PASSWORD) return `Пароль должен быть не короче ${MIN_PASSWORD} символов`;
  if (password.length > 128) return "Слишком длинный пароль";
  return null;
}
