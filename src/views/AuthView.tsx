import { useState } from "react";
import { Btn } from "../components/ui";
import { useOnline } from "../net/online";

/**
 * Вход и регистрация: логин и пароль, без почты.
 * Если сервер не ответил (например, статический хостинг вроде GitHub Pages),
 * вместо формы показывается объяснение — иначе запрос вернул бы HTML вместо JSON.
 */
export function AuthView() {
  const online = useOnline();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  const offline = online.status === "offline";
  const checking = online.status === "checking";

  const submit = async () => {
    setLocal(null);
    if (offline) return;
    if (!login.trim() || !password) {
      setLocal("Введите логин и пароль");
      return;
    }
    const ok = mode === "login" ? await online.login(login.trim(), password) : await online.register(login.trim(), password);
    if (!ok) setLocal(online.error);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-soot/95 px-4 py-8 backdrop-blur">
      <div className="w-full max-w-md border border-line bg-slab/95 p-5 shadow-[0_30px_80px_-40px_#000]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="sc text-flamedim">Общий сервер</span>
            <h2 className="font-title text-3xl text-flamehi">Сумрак онлайн</h2>
          </div>
          <button onClick={online.closeAuth} className="text-mute hover:text-parch" aria-label="Закрыть">
            ×
          </button>
        </div>

        {offline || checking ? (
          <div className="mt-3 space-y-3">
            <p className="text-[0.96rem] leading-relaxed text-parch/90">
              {checking ? "Проверяем связь с сервером…" : "Сервер не отвечает."} Аккаунты, друзья, рынок,
              обмены, дуэли и чат работают только при живом API.
            </p>
            <div className="border border-line bg-black/30 px-3 py-2 text-[0.92rem] leading-relaxed text-mute">
              <p>
                Публичная страница на <b className="text-parch">GitHub Pages</b> — статическая: запросы
                <span className="font-mono text-parch"> /api</span> там обслуживает сам хостинг, и вместо JSON
                приходит HTML. Поэтому вход по логину на ней невозможен.
              </p>
              <p className="mt-2">
                Чтобы включить онлайн, разверните сервер из папки <span className="font-mono text-parch">server/</span>{" "}
                (или внешний BaaS) и укажите его адрес в сборке:{" "}
                <span className="font-mono text-parch">VITE_API_URL=https://ваш-сервер/api</span>. Локально достаточно
                команды <span className="font-mono text-parch">npm run server</span> рядом с{" "}
                <span className="font-mono text-parch">npm run dev</span>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Btn tone="flame" disabled={checking} onClick={() => void online.retry()}>
                Повторить подключение
              </Btn>
              <Btn onClick={online.goOffline}>Играть без аккаунта</Btn>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[0.94rem] leading-snug text-mute">
              Аккаунт нужен для друзей, обмена, рынка, дуэлей и чата. Прогресс хранится в базе сервера и
              доступен с любого устройства.
            </p>

            <div className="mt-4 flex gap-1.5">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setLocal(null);
                  }}
                  className={`flex-1 border px-3 py-1.5 font-display text-[0.9rem] uppercase tracking-[0.08em] ${
                    mode === m ? "border-flame bg-flame/15 text-flamehi" : "border-line bg-black/30 text-mute hover:border-flamedim"
                  }`}
                >
                  {m === "login" ? "Вход" : "Регистрация"}
                </button>
              ))}
            </div>

            <label className="mt-3 block">
              <span className="sc mb-1 block">Логин</span>
              <input
                value={login}
                onChange={(e) => setLogin(e.target.value.slice(0, 20))}
                autoComplete="username"
                className="w-full border border-line bg-soot px-2 py-2 font-mono text-sm text-parch outline-none focus:border-flamedim"
              />
            </label>
            <label className="mt-2 block">
              <span className="sc mb-1 block">Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                className="w-full border border-line bg-soot px-2 py-2 font-mono text-sm text-parch outline-none focus:border-flamedim"
              />
            </label>
            <p className="mt-1 font-mono text-[0.8rem] text-mute">Логин 3–20 символов, пароль от 6 символов.</p>

            {(local || online.error) && (
              <p className="mt-3 border border-rubric/60 bg-rubric/10 px-3 py-2 text-[0.92rem] text-rubric">
                {local ?? online.error}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Btn tone="flame" disabled={online.busy} onClick={submit}>
                {mode === "login" ? "Войти" : "Создать аккаунт"}
              </Btn>
              <Btn onClick={online.goOffline}>Играть без аккаунта</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
