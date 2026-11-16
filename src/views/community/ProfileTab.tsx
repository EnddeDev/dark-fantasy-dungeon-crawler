import { useRef, useState } from "react";
import { PlayerPortrait } from "../../components/PlayerPortrait";
import { Btn } from "../../components/ui";
import { ApiError } from "../../net/api";
import type { OnlineSession } from "../../net/online";
import { ErrorBar, Panel } from "./shared";

/** Совпадает с лимитом сервера: больше 2 МБ он всё равно не примет. */
const MAX_BYTES = 2_000_000;
const ACCEPT = "image/jpeg,image/png,image/webp";

/** Вкладка «Профиль»: собственный портрет, его загрузка и удаление. */
export function ProfileTab({ online }: { online: OnlineSession }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const profile = online.profile;

  if (!profile) {
    return (
      <Panel title="Профиль" hint="Нужен вход в аккаунт">
        <p className="text-[0.94rem] text-mute">Войдите в аккаунт, чтобы загрузить портрет.</p>
      </Panel>
    );
  }

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await online.reload();
      setNotice(done);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить портрет");
    } finally {
      setBusy(false);
    }
  }

  function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("Файл больше 2 МБ. Возьмите картинку поменьше.");
      return;
    }
    void run(() => online.api.uploadPortrait(file), "Портрет обновлён");
  }

  return (
    <Panel title="Профиль" hint="Портрет виден всем игрокам в списке, чатах, обменах и дуэлях">
      <ErrorBar error={error} onClose={() => setError(null)} />
      {notice && <p className="mb-3 border border-verd/60 bg-verd/10 px-3 py-2 text-[0.94rem] text-verd">{notice}</p>}

      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <PlayerPortrait
          id={profile.id}
          name={profile.name}
          version={profile.portrait ?? null}
          size={224}
          className="self-center md:self-start"
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="font-display text-[1.2rem] uppercase tracking-[0.06em] text-flamehi">{profile.name}</div>
            <div className="mt-0.5 font-mono text-[0.88rem] text-mute">
              ур. {profile.level} · макс. этаж {profile.bestFloor}
            </div>
          </div>

          <p className="text-[0.94rem] text-parch">
            Подойдёт JPEG, PNG или WEBP до 2 МБ. Сервер обрежет картинку по центру до квадрата 256×256 и сохранит её в WEBP.
          </p>

          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Btn tone="flame" disabled={busy} onClick={() => input.current?.click()}>
              {profile.portrait == null ? "Загрузить портрет" : "Заменить портрет"}
            </Btn>
            {profile.portrait != null && (
              <Btn tone="danger" disabled={busy} onClick={() => void run(() => online.api.deletePortrait(), "Портрет удалён")}>
                Удалить
              </Btn>
            )}
            {busy && <span className="self-center font-mono text-[0.85rem] text-mute">сохраняем…</span>}
          </div>
        </div>
      </div>
    </Panel>
  );
}
