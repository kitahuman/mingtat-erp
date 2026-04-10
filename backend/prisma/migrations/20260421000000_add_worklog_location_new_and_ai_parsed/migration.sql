-- AlterTable: Add is_location_new and ai_parsed_data to work_logs
ALTER TABLE "work_logs" ADD COLUMN "is_location_new" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "work_logs" ADD COLUMN "ai_parsed_data" JSONB;
