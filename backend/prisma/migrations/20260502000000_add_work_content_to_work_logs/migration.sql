-- AlterTable: add work_content column to work_logs
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "work_content" TEXT;
