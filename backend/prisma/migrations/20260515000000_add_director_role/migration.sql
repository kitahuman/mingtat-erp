-- Add DIRECTOR role support
-- The User.role field is a plain String column, so no schema change is needed.
-- This migration serves as a documentation marker that 'director' is now a valid role value.
-- Application-level validation is handled by the UserRole enum in backend/src/auth/user-role.enum.ts.

-- Add a comment to the role column for documentation
COMMENT ON COLUMN "User"."role" IS 'Valid values: admin, director, manager, clerk, worker';
