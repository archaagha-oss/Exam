import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import type { AuthStore } from './authStore';

export interface ApiClient {
  instance: AxiosInstance;
  /** Force a refresh and replace the access token. Returns true on success. */
  refresh: () => Promise<boolean>;
}

interface CreateApiClientOpts {
  baseURL?: string;
  authStore: AuthStore;
  /** Where to redirect on hard auth failure. Default: /login */
  loginPath?: string;
  /** Custom refresh URL. Default: ${baseURL}/auth/refresh */
  refreshPath?: string;
}

/**
 * Create a shared axios instance with:
 *   - Authorization: Bearer <accessToken> attached from the auth store
 *   - Single in-flight refresh on 401: concurrent 401s coalesce into one
 *     /auth/refresh call, then replay all queued requests with the new token
 *   - On refresh failure: clear auth and bounce to /login
 */
export function createApiClient({
  baseURL = '/api/v1',
  authStore,
  loginPath = '/login',
  refreshPath,
}: CreateApiClientOpts): ApiClient {
  const instance = axios.create({ baseURL, withCredentials: true });

  let refreshInFlight: Promise<boolean> | null = null;

  async function performRefresh(): Promise<boolean> {
    try {
      const url = refreshPath ?? `${baseURL}/auth/refresh`;
      // Use a bare axios call (no interceptors) to avoid recursion
      const { data } = await axios.post(url, null, { withCredentials: true });
      const newToken = data?.data?.accessToken;
      const user = authStore.getState().user;
      if (newToken && user) {
        authStore.getState().setAuth(newToken, user);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  function refresh(): Promise<boolean> {
    if (!refreshInFlight) {
      refreshInFlight = performRefresh().finally(() => {
        // Allow the next 401 to trigger a fresh refresh
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      });
    }
    return refreshInFlight;
  }

  instance.interceptors.request.use((config) => {
    const token = authStore.getState().accessToken;
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (r) => r,
    async (error: AxiosError) => {
      const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
      if (error.response?.status === 401 && original && !original._retry) {
        original._retry = true;
        const ok = await refresh();
        if (ok) {
          const newToken = authStore.getState().accessToken;
          if (newToken) {
            original.headers = original.headers ?? {};
            (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
          }
          return instance.request(original);
        }
        // Hard fail: clear and bounce
        authStore.getState().clearAuth();
        if (typeof window !== 'undefined' && window.location.pathname !== loginPath) {
          window.location.href = loginPath;
        }
      }
      return Promise.reject(error);
    }
  );

  return { instance, refresh };
}
