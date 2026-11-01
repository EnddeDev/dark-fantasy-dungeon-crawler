import { useEffect, useRef, useState } from "react";
import type { OnlineSession } from "../../net/online";
import type { ChatMessage, PlayerSummary } from "../../net/protocol";
import { EmptyNote, ErrorBar, OnlineDot, Panel, useLoader, usePoll } from "./shared";

/** Общий чат и личные сообщения — личные доступны только друзьям. */
export function ChatTab({ online }: { online: OnlineSession }) {
  const me = online.profile;
  const [scope, setScope] = useState<"global" | string>("global");
  const [global, setGlobal] = useState<ChatMessage[]>([]);
  const [dm, setDm] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const friends = useLoader(() => online.api.friends(), { friends: [] as PlayerSummary[] });

  const peer = scope === "global" ? null : friends.data.friends.find((f) => f.id === scope) ?? null;

  const loadGlobal = async () => {
    try {
      const last = global[global.length - 1]?.id ?? 0;
      const res = await online.api.chat(last);
      if (res.messages.length) setGlobal((cur) => [...cur, ...res.messages].slice(-200));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Чат недоступен");
    }
  };

  const loadDm = async () => {
    if (!scope || scope === "global") return;
    try {
      const last = dm[dm.length - 1]?.id ?? 0;
      const res = await online.api.dm(scope, last);
      if (res.messages.length) setDm((cur) => [...cur, ...res.messages].slice(-200));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Личные сообщения недоступны");
    }
  };

  usePoll(loadGlobal, 3000, !!me);
  usePoll(loadDm, 3000, !!me && !!peer);

  useEffect(() => {
    friends.refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDm([]);
    if (peer) void loadDm();
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [global, dm, scope]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      if (peer) {
        await online.api.sendDm(peer.id, body);
        setDm([]);
        await loadDm();
      } else {
        await online.api.sendChat(body);
        setGlobal([]);
        await loadGlobal();
      }
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Сообщение не отправлено");
    } finally {
      setBusy(false);
    }
  };

  const messages = peer ? dm : global;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Panel title="Каналы" hint="Личные сообщения — только для друзей">
        <button
          onClick={() => setScope("global")}
          className={`mb-1 w-full border px-2 py-1.5 text-left font-display text-[0.95rem] uppercase tracking-[0.04em] ${
            scope === "global" ? "border-flame bg-flame/15 text-flamehi" : "border-line bg-black/30 text-parch hover:border-flamedim"
          }`}
        >
          Общий чат
        </button>
        <div className="mt-2 sc mb-1">Друзья</div>
        {friends.data.friends.length === 0 ? (
          <p className="text-[0.9rem] italic text-mute">Добавьте друзей во вкладке «Игроки», чтобы писать лично.</p>
        ) : (
          <ul className="space-y-1">
            {friends.data.friends.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => setScope(f.id)}
                  className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left ${
                    scope === f.id ? "border-verd bg-verd/10 text-verd" : "border-line bg-black/30 text-parch hover:border-verd/60"
                  }`}
                >
                  <OnlineDot online={f.online} />
                  <span className="min-w-0 truncate font-display text-[0.92rem] uppercase tracking-[0.03em]">{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={peer ? `Личный чат · ${peer.name}` : "Общий чат"}
        hint={peer ? "Сообщения видят только вы двое" : "Сообщения видят все игроки"}
      >
        <ErrorBar error={error} onClose={() => setError(null)} />
        <div ref={boxRef} className="h-[320px] space-y-1.5 overflow-y-auto border border-line bg-black/40 px-3 py-2">
          {messages.length === 0 && <EmptyNote>Пока тихо. Напишите первым.</EmptyNote>}
          {messages.map((m) => {
            const mine = m.fromId === me?.id;
            return (
              <div key={m.id} className={`text-[0.94rem] leading-snug ${mine ? "text-flamehi" : "text-parch/90"}`}>
                <span className="mr-2 font-mono text-[0.78rem] text-mute">
                  {new Date(m.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className={`mr-1 font-display text-[0.86rem] uppercase tracking-[0.04em] ${mine ? "text-verd" : "text-flame"}`}>
                  {mine ? "вы" : m.fromName}
                </span>
                {m.body}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 400))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={peer ? `Сообщение для ${peer.name}` : "Сообщение в общий чат"}
            className="min-w-0 flex-1 resize-none border border-line bg-soot px-2 py-1.5 text-[0.95rem] text-parch outline-none focus:border-flamedim"
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="border border-flame bg-flame/20 px-4 py-2 font-display text-sm uppercase tracking-[0.1em] text-flamehi disabled:opacity-40"
          >
            отправить
          </button>
        </div>
      </Panel>
    </div>
  );
}
