import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiClient, ApiError } from "./api";
import { LiveStream } from "./live";
import type { NotificationItem, NotificationKind, OnlineProfile } from "./protocol";

export type OnlineStatus = "checking" | "offline" | "guest" | "online";
export type NotifyPermission = "granted" | "denied" | "default" | "unsupported";

/** Счётчики непрочитанного по типам: вкладки сообщества и кнопка «Сообщество». */
export type UnreadByKind = Partial<Record<NotificationKind, number>>;

/** Подпись уведомления для браузера и всплывающей подсказки. */
export const NOTIFY_TITLE: Record<NotificationKind, string> = {
  dm: "Новое личное сообщение",
  friend_request: "Заявка в друзья",
  friend_accepted: "Заявка принята",
  trade: "Обмен",
  duel: "Дуэль",
  market_sale: "Рынок",
};

/** Какой раздел сообщества отвечает за тип уведомления. */
export const KIND_TAB: Record<NotificationKind, string> = {
  dm: "chat",
  friend_request: "players",
  friend_accepted: "players",
  trade: "trades",
  duel: "duels",
  market_sale: "market",
};

const COUNT_POLL_MS = 30_000;

function currentPermission(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

export interface OnlineSession {
  status: OnlineStatus;
  /** Открыт экран входа (в том числе когда сервер недоступен). */
  authOpen: boolean;
  /** Сервер не ответил: показываем объяснение вместо формы. */
  retry: () => Promise<void>;
  api: ApiClient;
  profile: OnlineProfile | null;
  error: string | null;
  busy: boolean;
  login: (login: string, password: string) => Promise<boolean>;
  register: (login: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  goOffline: () => void;
  openAuth: () => void;
  closeAuth: () => void;
  clearError: () => void;
  reload: () => Promise<void>;
  /** Поток событий сервера; `connected` = false значит, что разделы опрашивают сервер сами. */
  live: LiveStream;
  unread: number;
  unreadByKind: UnreadByKind;
  /** Пометить прочитанными уведомления разделов, которые игрок открыл. */
  markRead: (kinds: NotificationKind[]) => Promise<void>;
  notifyPermission: NotifyPermission;
  requestNotifyPermission: () => Promise<void>;
  /** Последнее новое уведомление для всплывающей подсказки. */
  toast: NotificationItem | null;
  dismissToast: () => void;
}

const OnlineContext = createContext<OnlineSession | null>(null);

/**
 * Сессия игрока: аккаунт, токен и обращение к серверу.
 * Если сервер недоступен, приложение остаётся в соло-режиме на localStorage.
 */
export function OnlineProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => new ApiClient(), []);
  const [status, setStatus] = useState<OnlineStatus>("checking");
  const [profile, setProfile] = useState<OnlineProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [unreadByKind, setUnreadByKind] = useState<UnreadByKind>({});
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const [notifyPermission, setNotifyPermission] = useState<NotifyPermission>(currentPermission);
  /** Последний уведомление, о котором уже знает клиент: новые показываем, старые — нет. */
  const lastNoticeId = useRef(0);
  const live = useMemo(() => new LiveStream(api.eventsUrl, () => api.getToken()), [api]);

  /** Обновляет только счётчики (дёшево) — для запасного опроса и после отметки прочитанного. */
  const refreshCounts = useCallback(async () => {
    try {
      const feed = await api.notifications(0);
      setUnread(feed.unread);
      setUnreadByKind(feed.byKind);
      if (lastNoticeId.current === 0 && feed.items.length) lastNoticeId.current = Math.max(...feed.items.map((n) => n.id));
    } catch {
      /* сервер недоступен: счётчики остаются прежними */
    }
  }, [api]);

  /** Новые уведомления с прошлой проверки: подсказка в игре и, если вкладка скрыта, браузерное. */
  const pullNotices = useCallback(async () => {
    try {
      const feed = await api.notifications(lastNoticeId.current);
      setUnread(feed.unread);
      setUnreadByKind(feed.byKind);
      // Базовой отметки ещё нет: всё известное считаем виденным, подсказок не показываем.
      if (lastNoticeId.current === 0) {
        if (feed.items.length) lastNoticeId.current = Math.max(...feed.items.map((n) => n.id));
        return;
      }
      const fresh = feed.items.filter((n) => n.id > lastNoticeId.current).sort((a, b) => a.id - b.id);
      if (!fresh.length) return;
      lastNoticeId.current = Math.max(lastNoticeId.current, ...fresh.map((n) => n.id));
      const newest = fresh[fresh.length - 1];
      setToast(newest);
      if (typeof document !== "undefined" && document.hidden && currentPermission() === "granted") {
        try {
          new window.Notification(NOTIFY_TITLE[newest.kind] ?? "СУМРАК", { body: newest.body, tag: newest.kind });
        } catch {
          /* браузер может запретить показ — подсказка в игре всё равно есть */
        }
      }
    } catch {
      /* сеть пропала: повторим при следующем событии или опросе */
    }
  }, [api]);

  // Поток событий: открываем после входа, закрываем при выходе или при недоступном сервере.
  const online = status === "online";
  useEffect(() => {
    if (!online) {
      live.stop();
      setUnread(0);
      setUnreadByKind({});
      lastNoticeId.current = 0;
      return;
    }
    // Первая загрузка: помечаем всё известное как уже виденное, подсказок не показываем.
    lastNoticeId.current = 0;
    void refreshCounts();
    live.start();
    const offNotice = live.on("notification", (payload) => {
      const next = payload as { unread?: number; byKind?: UnreadByKind };
      if (typeof next.unread === "number") setUnread(next.unread);
      if (next.byKind) setUnreadByKind(next.byKind);
      void pullNotices();
    });
    const id = window.setInterval(() => {
      // Запасной опрос только когда поток не работает: иначе счётчики и так приходят push-ом.
      if (!live.connected) void pullNotices();
    }, COUNT_POLL_MS);
    return () => {
      offNotice();
      window.clearInterval(id);
    };
  }, [online, live, refreshCounts, pullNotices]);

  const markRead = useCallback(
    async (kinds: NotificationKind[]) => {
      const present = kinds.filter((k) => (unreadByKind[k] ?? 0) > 0);
      if (!present.length) return;
      try {
        await api.readNotifications(present);
        await refreshCounts();
      } catch {
        /* счётчик обновится при следующем событии */
      }
    },
    [api, refreshCounts, unreadByKind],
  );

  const requestNotifyPermission = useCallback(async () => {
    if (currentPermission() === "unsupported") {
      setNotifyPermission("unsupported");
      return;
    }
    try {
      const result = await window.Notification.requestPermission();
      setNotifyPermission(result);
    } catch {
      setNotifyPermission(currentPermission());
    }
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const reload = useCallback(async () => {
    if (!api.getToken()) {
      setStatus("guest");
      setProfile(null);
      return;
    }
    try {
      const res = await api.me();
      setProfile(res.profile);
      setStatus("online");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        api.setToken(null);
        setStatus("guest");
        setProfile(null);
      } else {
        setStatus("offline");
      }
    }
  }, [api]);

  /** Повторная проверка сервера: кнопка «Повторить» на экране входа. */
  const retry = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      await api.health();
      await reload();
    } catch {
      setStatus("offline");
    }
  }, [api, reload]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await api.health();
        if (!alive) return;
        await reload();
      } catch {
        if (alive) setStatus("offline");
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, reload]);

  const enter = useCallback(
    async (run: () => Promise<{ token: string; profile: OnlineProfile }>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await run();
        api.setToken(res.token);
        const full = await api.me();
        setProfile(full.profile);
        setStatus("online");
        setAuthOpen(false);
        return true;
      } catch (err) {
        // Сетевая ошибка означает, что сервера нет: форму входа прячем за объяснением.
        if (err instanceof ApiError && err.status === 0) setStatus("offline");
        setError(err instanceof Error ? err.message : "Не удалось войти");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [api],
  );

  const login = useCallback((loginName: string, password: string) => enter(() => api.login(loginName, password)), [api, enter]);
  const register = useCallback((loginName: string, password: string) => enter(() => api.register(loginName, password)), [api, enter]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* токен мог истечь */
    }
    api.setToken(null);
    live.stop();
    setProfile(null);
    setStatus("guest");
  }, [api, live]);

  const goOffline = useCallback(() => {
    setAuthOpen(false);
    setStatus("offline");
  }, []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);
  /** Открываем вход и сразу перепроверяем сервер, если он был недоступен. */
  const openAuth = useCallback(() => {
    setAuthOpen(true);
    if (!api.getToken()) {
      setStatus((cur) => {
        if (cur === "checking") return cur;
        return cur === "offline" ? cur : "guest";
      });
    }
  }, [api]);
  const clearError = useCallback(() => setError(null), []);

  const value: OnlineSession = {
    status,
    authOpen,
    retry,
    api,
    profile,
    error,
    busy,
    login,
    register,
    logout,
    goOffline,
    openAuth,
    closeAuth,
    clearError,
    reload,
    live,
    unread,
    unreadByKind,
    markRead,
    notifyPermission,
    requestNotifyPermission,
    toast,
    dismissToast,
  };
  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

export function useOnline(): OnlineSession {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error("useOnline вне OnlineProvider");
  return ctx;
}

/** Короткая отметка «когда» для чата и списков. */
export function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return "только что";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  return new Date(ts).toLocaleDateString("ru-RU");
}
