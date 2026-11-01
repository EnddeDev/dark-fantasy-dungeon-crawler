import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiClient, ApiError } from "./api";
import type { OnlineProfile } from "./protocol";

export type OnlineStatus = "checking" | "offline" | "guest" | "online";

export interface OnlineSession {
  status: OnlineStatus;
  api: ApiClient;
  profile: OnlineProfile | null;
  error: string | null;
  busy: boolean;
  login: (login: string, password: string) => Promise<boolean>;
  register: (login: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  goOffline: () => void;
  openAuth: () => void;
  clearError: () => void;
  reload: () => Promise<void>;
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
        return true;
      } catch (err) {
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
    setProfile(null);
    setStatus("guest");
  }, [api]);

  const goOffline = useCallback(() => setStatus("offline"), []);
  const openAuth = useCallback(() => {
    if (!api.getToken()) setStatus("guest");
  }, [api]);
  const clearError = useCallback(() => setError(null), []);

  const value: OnlineSession = {
    status,
    api,
    profile,
    error,
    busy,
    login,
    register,
    logout,
    goOffline,
    openAuth,
    clearError,
    reload,
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
