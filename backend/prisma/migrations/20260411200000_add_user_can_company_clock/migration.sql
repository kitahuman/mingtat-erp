-- Add company clock permission to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "user_can_company_clock" BOOLEAN NOT NULL DEFAULT false;
