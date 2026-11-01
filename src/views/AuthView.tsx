import { useState } from "react";
import { Btn } from "../components/ui";
import { useOnline } from "../net/online";

/** Вход и регистрация: логин и пароль, без почты. */
export function AuthView() {
  const online = useOnline();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  const submit = async () => {
    setLocal(null);
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
        <span className="sc text-flamedim">Общий сервер</span>
        <h2 className="font-title text-3xl text-flamehi">Сумрак онлайн</h2>
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
          <p className="mt-3 border border-rubric/60 bg-rubric/10 px-3 py-2 text-[0.92rem] text-rubric">{local ?? online.error}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn tone="flame" disabled={online.busy} onClick={submit}>
            {mode === "login" ? "Войти" : "Создать аккаунт"}
          </Btn>
          <Btn onClick={online.goOffline}>Играть без аккаунта</Btn>
        </div>
      </div>
    </div>
  );
}
