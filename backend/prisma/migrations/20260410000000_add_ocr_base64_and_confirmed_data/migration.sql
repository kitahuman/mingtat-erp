-- AlterTable
ALTER TABLE "verification_ocr_results" ADD COLUMN "ocr_image_base64" TEXT;
ALTER TABLE "verification_ocr_results" ADD COLUMN "ocr_confirmed_data" JSONB;
