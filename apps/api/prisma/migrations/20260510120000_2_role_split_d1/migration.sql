-- Cycle 2.0a / D1: rename Role enum values to match the audience they serve.
--
--   ADMIN        → SCHOOL_ADMIN   (customer-side, scoped to one schoolId)
--   SUPER_ADMIN  → PLATFORM_ADMIN (vendor-side, cross-tenant by design)
--
-- The runtime constraint that PLATFORM_ADMIN may have NULL schoolId and that
-- every other role must NOT have NULL schoolId is enforced at the application
-- layer (apps/api/src/modules/auth/auth.service.ts). A SQL CHECK constraint
-- is intentionally deferred — Prisma does not generate one from the schema
-- and an out-of-band ALTER TABLE would drift the migration history.
--
-- Rename is in-place via ALTER TYPE so existing rows update by reference.
-- Greenfield posture (docs/01-product.md §1.3) means we don't need an
-- online-migration story; this runs once before any external user lands.

ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'SCHOOL_ADMIN';
ALTER TYPE "Role" RENAME VALUE 'SUPER_ADMIN' TO 'PLATFORM_ADMIN';
