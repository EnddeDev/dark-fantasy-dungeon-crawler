/**
 * Поток событий сервера (Server-Sent Events).
 *
 * Открываем его через fetch, а не EventSource: EventSource не умеет передавать
 * заголовок Authorization, а токен входа живёт в заголовке, как у остальных запросов.
 * При обрыве переподключаемся с нарастающей паузой. Пока поток не работает,
 * разделы продолжают опрашивать сервер (см. useSync в community/shared.tsx).
 */

export type LiveScope = "chat" | "market" | "trade" | "duel" | "friend" | "notification" | "players";

type Listener = (payload: unknown) => void;

const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

/** Разбор одного блока SSE (строки «event:» и «data:», разделённые пустой строкой). */
export function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? "" : line.slice(idx + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (!data.length && event === "message") return null;
  return { event, data: data.join("\n") };
}

export class LiveStream {
  private listeners = new Map<string, Set<Listener>>();
  private statusListeners = new Set<(connected: boolean) => void>();
  private controller: AbortController | null = null;
  private timer: number | null = null;
  private delay = MIN_DELAY_MS;
  private running = false;
  private connectedNow = false;

  constructor(
    private readonly url: string,
    private readonly getToken: () => string | null,
  ) {}

  get connected(): boolean {
    return this.connectedNow;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
    this.setConnected(false);
  }

  /** Подписка на событие. Возвращает функцию отписки. */
  on(scope: LiveScope, fn: Listener): () => void {
    const set = this.listeners.get(scope) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(scope, set);
    return () => set.delete(fn);
  }

  onStatus(fn: (connected: boolean) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setConnected(value: boolean): void {
    if (this.connectedNow === value) return;
    this.connectedNow = value;
    for (const fn of this.statusListeners) fn(value);
  }

  private scheduleRetry(): void {
    if (!this.running) return;
    this.setConnected(false);
    const wait = this.delay;
    this.delay = Math.min(MAX_DELAY_MS, this.delay * 2);
    this.timer = window.setTimeout(() => void this.connect(), wait);
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    const token = this.getToken();
    if (!token) {
      this.running = false;
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    try {
      const res = await fetch(this.url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal: controller.signal,
        cache: "no-store",
      });
      // Вход отозван или поток недоступен на сервере — переподключаться бессмысленно.
      if (res.status === 401) {
        this.running = false;
        this.setConnected(false);
        return;
      }
      if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
      this.delay = MIN_DELAY_MS;
      this.setConnected(true);
      await this.read(res.body, controller.signal);
    } catch {
      /* обрыв сети или отмена — ниже решаем, переподключаться ли */
    }
    if (controller.signal.aborted) return;
    this.scheduleRetry();
  }

  private async read(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const onAbort = () => void reader.cancel().catch(() => undefined);
    signal.addEventListener("abort", onAbort);
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let cut = buffer.indexOf("\n\n");
        while (cut !== -1) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          this.dispatch(block);
          cut = buffer.indexOf("\n\n");
        }
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  private dispatch(block: string): void {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    let payload: unknown = {};
    try {
      payload = parsed.data ? JSON.parse(parsed.data) : {};
    } catch {
      payload = {};
    }
    for (const fn of this.listeners.get(parsed.event) ?? []) {
      try {
        fn(payload);
      } catch {
        /* одна подписка не должна ломать остальные */
      }
    }
  }
}
