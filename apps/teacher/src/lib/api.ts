// apps/teacher/src/lib/api.ts
import { createApiClient } from '@secureexam/shared-frontend';
import { useAuthStore } from '../store/authStore';

const { instance: api } = createApiClient({
  baseURL: '/api/v1',
  authStore: useAuthStore,
  loginPath: '/login',
});

export default api;
