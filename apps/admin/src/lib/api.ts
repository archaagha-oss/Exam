// apps/admin/src/lib/api.ts
// Axios instance with the shared 401-refresh-queue from
// @secureexam/shared-frontend. Concurrent 401s coalesce into a single
// /auth/refresh and replay; on hard failure, route to /login.
import { createApiClient } from '@secureexam/shared-frontend';
import { useAuthStore } from '../store/authStore';

const { instance: api } = createApiClient({
  baseURL: '/api/v1',
  authStore: useAuthStore,
  loginPath: '/login',
});

export default api;
