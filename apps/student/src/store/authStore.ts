// apps/student/src/store/authStore.ts
// Backed by @secureexam/shared-frontend. Memory-only — refresh tokens live
// in the httpOnly cookie set by the API.
import { createAuthStore } from '@secureexam/shared-frontend';

export const useAuthStore = createAuthStore();
