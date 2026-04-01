-- AddColumn: unverified_client_name to work_logs
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "unverified_client_name" TEXT;
