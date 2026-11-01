import type { DuelAction } from "../game/duel";
import type { GearItem, Player } from "../game/types";
import type {
  ChatMessage,
  DuelDetail,
  DuelSummary,
  MarketListing,
  OnlineProfile,
  PlayerSummary,
  TradeOffer,
} from "./protocol";

/** Ошибка API с человекочитаемым текстом от сервера. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/**
 * Адрес API. В браузере берётся из VITE_API_URL, по умолчанию — относительный /api
 * (в dev-режиме его проксирует Vite). Чтение env защищено: в тестах и в среде без
 * Vite объект import.meta.env может отсутствовать.
 */
const ENV = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const BASE = ENV.VITE_API_URL ?? "/api";
const TOKEN_KEY = "sumrak.token";

/** Сервер недоступен или ответил не тем, что ждём (например, HTML-страницей хостинга). */
export const OFFLINE_MESSAGE = "Сервер недоступен";

function looksLikeJson(text: string): boolean {
  const first = text.trimStart()[0];
  return first === "{" || first === "[";
}

/**
 * Разбор ответа: API всегда отвечает JSON, но статический хостинг вроде GitHub Pages
 * на /api отдаёт HTML-страницу. Раньше такой ответ ронял клиент сырым
 * «Unexpected token '<'», теперь он превращается в понятную сетевую ошибку.
 */
function parseJson(text: string): { error?: string } {
  if (!text) return {};
  if (!looksLikeJson(text)) throw new ApiError(0, `${OFFLINE_MESSAGE}: ответ не JSON`);
  try {
    return JSON.parse(text) as { error?: string };
  } catch {
    throw new ApiError(0, `${OFFLINE_MESSAGE}: некорректный JSON`);
  }
}

/**
 * Клиент общего сервера. Работает и с локальным API, и с внешним BaaS:
 * адрес задаётся VITE_API_URL, относительный /api проксируется в dev-режиме.
 */
export class ApiClient {
  private token: string | null = null;

  constructor() {
    try {
      this.token = localStorage.getItem(TOKEN_KEY);
    } catch {
      this.token = null;
    }
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* приватный режим */
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, "Сервер недоступен");
    }
    const text = await response.text();
    // HTML от хостинга — это «сервера нет», а не ошибка конкретного запроса.
    const data = parseJson(text);
    if (!response.ok) throw new ApiError(response.status, data.error ?? "Ошибка сервера");
    return data as T;
  }

  /** Проверка живости API: онлайн-режим включается только при настоящем `{ok:true}`. */
  async health(): Promise<{ ok: boolean }> {
    const res = await this.request<{ ok?: boolean }>("GET", "/health");
    if (res?.ok !== true) throw new ApiError(0, OFFLINE_MESSAGE);
    return { ok: true };
  }

  register(login: string, password: string): Promise<{ token: string; profile: OnlineProfile }> {
    return this.request("POST", "/auth/register", { login, password });
  }

  login(login: string, password: string): Promise<{ token: string; profile: OnlineProfile }> {
    return this.request("POST", "/auth/login", { login, password });
  }

  logout(): Promise<{ ok: boolean }> {
    return this.request("POST", "/auth/logout");
  }

  me(): Promise<{ profile: OnlineProfile & { player: Player } }> {
    return this.request("GET", "/me");
  }

  save(player: Player, unlockedFloor: number, bestFloor: number): Promise<{ profile: OnlineProfile }> {
    return this.request("PUT", "/me", { player, unlockedFloor, bestFloor });
  }

  players(query = ""): Promise<{ players: PlayerSummary[] }> {
    return this.request("GET", `/players${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  }

  friends(): Promise<{ friends: PlayerSummary[] }> {
    return this.request("GET", "/friends");
  }

  addFriend(id: string): Promise<{ friend: PlayerSummary }> {
    return this.request("POST", "/friends", { id });
  }

  removeFriend(id: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", `/friends/${id}`);
  }

  market(): Promise<{ listings: MarketListing[] }> {
    return this.request("GET", "/market");
  }

  sell(itemUid: string, price: number): Promise<{ ok: boolean }> {
    return this.request("POST", "/market", { itemUid, price });
  }

  buy(listingId: string): Promise<{ ok: boolean; item: GearItem }> {
    return this.request("POST", `/market/${listingId}`);
  }

  cancelListing(listingId: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", `/market/${listingId}`);
  }

  trades(): Promise<{ trades: TradeOffer[] }> {
    return this.request("GET", "/trades");
  }

  offerTrade(to: string, itemUids: string[], message: string): Promise<{ ok: boolean }> {
    return this.request("POST", "/trades", { to, itemUids, message });
  }

  counterTrade(id: string, itemUids: string[], message: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/trades/${id}/counter`, { itemUids, message });
  }

  acceptTrade(id: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/trades/${id}/accept`);
  }

  declineTrade(id: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/trades/${id}/decline`);
  }

  cancelTrade(id: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/trades/${id}/cancel`);
  }

  duels(): Promise<{ duels: DuelSummary[] }> {
    return this.request("GET", "/duels");
  }

  duel(id: string): Promise<{ duel: DuelDetail }> {
    return this.request("GET", `/duels/${id}`);
  }

  challenge(opponent: string): Promise<{ ok: boolean; id: string }> {
    return this.request("POST", "/duels", { opponent });
  }

  acceptDuel(id: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/duels/${id}/accept`);
  }

  declineDuel(id: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/duels/${id}/decline`);
  }

  cancelDuel(id: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/duels/${id}/cancel`);
  }

  duelAction(id: string, action: DuelAction): Promise<{ duel: DuelDetail }> {
    return this.request("POST", `/duels/${id}/action`, { action });
  }

  chat(after = 0): Promise<{ messages: ChatMessage[] }> {
    return this.request("GET", `/chat/global?after=${after}`);
  }

  sendChat(body: string): Promise<{ ok: boolean }> {
    return this.request("POST", "/chat/global", { body });
  }

  dm(peerId: string, after = 0): Promise<{ messages: ChatMessage[] }> {
    return this.request("GET", `/chat/dm/${peerId}?after=${after}`);
  }

  sendDm(peerId: string, body: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/chat/dm/${peerId}`, { body });
  }
}
