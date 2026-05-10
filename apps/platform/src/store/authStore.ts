// apps/platform/src/store/authStore.ts
// Backed by @secureexam/shared-frontend. Memory-only — refresh tokens live
// in the httpOnly cookie set by the API. Cycle 1.1b kills the localStorage
// pattern that was P0-4 in docs/00-audit.md §8.
import { createAuthStore } from '@secureexam/shared-frontend';

export const useAuthStore = createAuthStore();
