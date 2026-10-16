import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, API_URL, clearTokens, getAccessToken, getRefreshToken, setTokens } from './api';

export type AuthUser = {
  id: string;
  email: string;
  nameAr: string;
  nameEn: string;
  permissions: string[];
  role: { code: string; nameAr: string };
  restaurant: { nameAr: string; currencySymbol: string };
};

type AuthContextValue = {
  ready: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          return;
        }
        const me = await api<AuthUser>('/auth/me');
        if (!cancelled) {
          setUser(me);
        }
      } catch {
        await clearTokens();
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      login: async (email, password) => {
        const data = await api<{ accessToken: string; refreshToken: string; user: AuthUser }>(
          '/auth/login',
          { method: 'POST', body: JSON.stringify({ email, password }) },
        );
        if (!data.user.permissions.includes('pos.access')) {
          await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${data.accessToken}`,
            },
            body: JSON.stringify({ refreshToken: data.refreshToken }),
          }).catch(() => undefined);
          throw new Error('NO_POS_ACCESS');
        }
        await setTokens(data.accessToken, data.refreshToken);
        setUser(data.user);
      },
      logout: async () => {
        try {
          const refreshToken = await getRefreshToken();
          await api('/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refreshToken: refreshToken ?? undefined }),
          });
        } catch {
          // Clear local session even if the API call fails.
        }
        await clearTokens();
        setUser(null);
      },
    }),
    [ready, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
