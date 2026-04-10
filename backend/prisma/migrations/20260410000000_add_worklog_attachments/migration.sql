-- AlterTable: Add work_log_photo_urls and work_log_signature_url to work_logs
ALTER TABLE "work_logs" ADD COLUMN "work_log_photo_urls" JSONB;
ALTER TABLE "work_logs" ADD COLUMN "work_log_signature_url" TEXT;
