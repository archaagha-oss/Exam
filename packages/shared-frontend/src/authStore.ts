import { create, type StoreApi, type UseBoundStore } from 'zustand';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'SCHOOL_ADMIN' | 'PLATFORM_ADMIN';
  schoolId: string | null;
}

export interface AuthState {
  accessToken: string | null; // memory-only — never persisted
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
}

export type AuthStore = UseBoundStore<StoreApi<AuthState>>;

/**
 * Build a Zustand auth store. The access token lives in memory only — refresh
 * tokens stay in the httpOnly `refreshToken` cookie set by the API. This
 * makes XSS less impactful: the JS in the page can't read the refresh token,
 * and the access token dies on tab close.
 *
 * The `user` object is intentionally also in memory only. On reload, the
 * shell calls /auth/refresh to get a new access token + user; if that fails,
 * the user is sent to login.
 */
export function createAuthStore(): AuthStore {
  return create<AuthState>((set) => ({
    accessToken: null,
    user: null,
    setAuth: (accessToken, user) => set({ accessToken, user }),
    clearAuth: () => set({ accessToken: null, user: null }),
  }));
}
