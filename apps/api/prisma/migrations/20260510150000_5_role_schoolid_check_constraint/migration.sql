-- Cycle 4.0 / D1 follow-up: SQL CHECK constraint enforcing role↔schoolId pairing.
--
-- The application layer (apps/api/src/modules/auth/auth.service.ts and the
-- platform admin provisioning flow) already enforces:
--   - PLATFORM_ADMIN: schoolId IS NULL (vendor-side, cross-tenant by design)
--   - STUDENT, TEACHER, SCHOOL_ADMIN: schoolId IS NOT NULL (always tenant-scoped)
--
-- This migration adds the database-level guarantee. After this lands, an
-- attempt to create a PLATFORM_ADMIN with a schoolId, or any other role
-- without one, fails with a constraint violation rather than silently
-- producing a row that breaks tenant scoping. Closes the deferred item
-- from docs/04-stage2-prereqs-closure.md §4 ("SQL CHECK constraint
-- enforcing role↔schoolId pairing").
--
-- The constraint is named so the violation message is clear:
--   ERROR:  new row violates check constraint "users_role_schoolId_pair"
-- Application-layer error mapping in admin.router.ts can render that as a
-- 400 with a friendly message if needed; today the boot-time data is
-- consistent so this is purely belt-and-braces.

ALTER TABLE "users"
  ADD CONSTRAINT "users_role_schoolId_pair" CHECK (
    ("role" = 'PLATFORM_ADMIN' AND "schoolId" IS NULL)
    OR
    ("role" <> 'PLATFORM_ADMIN' AND "schoolId" IS NOT NULL)
  );
