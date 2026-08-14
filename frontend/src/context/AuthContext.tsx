import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { apiFetch, TOKEN_KEY } from "@/src/lib/api";

export type User = {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string;
  city?: string | null;
  state?: string | null;
  role: string;
  is_professional: boolean;
  professional_id?: string | null;
  interests: string[];
  profile_public?: boolean;
  email?: string;
};

type AuthValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await storage.secureGet(TOKEN_KEY, "");
      if (!token) {
        setUser(null);
        return;
      }
      const me = await apiFetch<User>("/auth/me");
      setUser(me);
    } catch {
      await storage.secureRemove(TOKEN_KEY);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    await storage.secureSet(TOKEN_KEY, res.access_token);
    const me = await apiFetch<User>("/auth/me");
    setUser(me);
  }, []);

  const register = useCallback(
    async (email: string, password: string, display_name: string, username: string) => {
      const res = await apiFetch<{ access_token: string; user: User }>("/auth/register", {
        method: "POST",
        auth: false,
        body: { email, password, display_name, username },
      });
      await storage.secureSet(TOKEN_KEY, res.access_token);
      const me = await apiFetch<User>("/auth/me");
      setUser(me);
    },
    []
  );

  const logout = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
