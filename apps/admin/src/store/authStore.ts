// apps/admin/src/store/authStore.ts
// Backed by @secureexam/shared-frontend. Memory-only — refresh tokens live
// in the httpOnly cookie set by the API. Removes the localStorage XSS
// surface previously created by zustand's persist() middleware.
import { createAuthStore } from '@secureexam/shared-frontend';

export const useAuthStore = createAuthStore();
