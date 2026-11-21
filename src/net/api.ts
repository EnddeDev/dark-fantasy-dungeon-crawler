import type { DuelAction } from "../game/duel";
import type { GearItem, Player, Run } from "../game/types";
import type {
  ChatMessage,
  DuelDetail,
  DuelSummary,
  MarketListing,
  FriendRequestView,
  NotificationFeed,
  OnlineProfile,
  PlayerProfileView,
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

/** Адрес портрета игрока. Версия в `?v=` сбрасывает кэш браузера после замены. */
export function portraitUrl(playerId: string, version: number): string {
  return `${BASE}/players/${encodeURIComponent(playerId)}/portrait?v=${version}`;
}

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

  /** Адрес API, который использует клиент (для диагностики в окне входа). */
  get baseUrl(): string {
    return BASE;
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

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    raw?: { type: string; data: Blob },
    /** Запрос переживает закрытие вкладки: сохранение при уходе со страницы. */
    keepalive = false,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method,
        keepalive,
        headers: {
          ...(raw ? { "Content-Type": raw.type } : body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: raw ? raw.data : body === undefined ? undefined : JSON.stringify(body),
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

  me(): Promise<{ profile: OnlineProfile & { player: Player; run: Run | null } }> {
    return this.request("GET", "/me");
  }

  /** Сохранение героя; `run` — карта похода, если герой на карте (null — в лобби). */
  save(
    player: Player,
    unlockedFloor: number,
    bestFloor: number,
    run: Run | null = null,
    keepalive = false,
  ): Promise<{ profile: OnlineProfile }> {
    return this.request("PUT", "/me", { player, unlockedFloor, bestFloor, run }, undefined, keepalive);
  }

  /** Порция игроков: по 20 при прокрутке, поиск по имени или логину. */
  /** Загрузка портрета: сырой файл, сервер сам обрезает его до квадрата 256×256. */
  uploadPortrait(file: Blob): Promise<{ ok: boolean; portrait: number }> {
    return this.request("PUT", "/me/portrait", undefined, { type: file.type || "application/octet-stream", data: file });
  }

  deletePortrait(): Promise<{ ok: boolean }> {
    return this.request("DELETE", "/me/portrait");
  }

  players(query = "", offset = 0, limit = 20): Promise<{ players: PlayerSummary[]; hasMore: boolean }> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (query) params.set("q", query);
    return this.request("GET", `/players?${params.toString()}`);
  }

  playerProfile(id: string): Promise<{ profile: PlayerProfileView }> {
    return this.request("GET", `/players/${id}/profile`);
  }

  friends(): Promise<{ friends: PlayerSummary[] }> {
    return this.request("GET", "/friends");
  }

  /** Заявка в друзья: дружба появится после подтверждения получателем. */
  sendFriendRequest(id: string): Promise<{ status: "requested" | "friend"; friend: PlayerSummary | null }> {
    return this.request("POST", "/friends/requests", { id });
  }

  friendRequests(): Promise<{ incoming: FriendRequestView[]; outgoing: FriendRequestView[] }> {
    return this.request("GET", "/friends/requests");
  }

  acceptFriendRequest(requestId: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/friends/requests/${requestId}/accept`);
  }

  declineFriendRequest(requestId: string): Promise<{ ok: boolean }> {
    return this.request("POST", `/friends/requests/${requestId}/decline`);
  }

  cancelFriendRequest(requestId: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", `/friends/requests/${requestId}`);
  }

  removeFriend(id: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", `/friends/${id}`);
  }

  /** Порция лотов: по 20 при прокрутке. */
  market(offset = 0, limit = 20): Promise<{ listings: MarketListing[]; hasMore: boolean }> {
    return this.request("GET", `/market?limit=${limit}&offset=${offset}`);
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

  notifications(since = 0): Promise<NotificationFeed> {
    return this.request("GET", `/notifications?since=${since}`);
  }

  /** Отмечает прочитанными уведомления выбранных разделов (или все, если типы не заданы). */
  readNotifications(kinds?: string[]): Promise<{ ok: boolean }> {
    return this.request("POST", "/notifications/read", kinds ? { kinds } : {});
  }

  /** Адрес потока событий и токен для него: поток открывается через fetch с заголовком. */
  get eventsUrl(): string {
    return `${BASE}/events`;
  }

  get authToken(): string | null {
    return this.token;
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
