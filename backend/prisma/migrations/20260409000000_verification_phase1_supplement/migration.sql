-- AlterTable: verification_matches — add match_method column
ALTER TABLE "verification_matches" ADD COLUMN "match_method" VARCHAR(30);

-- AlterTable: verification_records — add employee fields for clock sync
ALTER TABLE "verification_records" ADD COLUMN "record_employee_id" INTEGER;
ALTER TABLE "verification_records" ADD COLUMN "record_employee_name" VARCHAR(100);

-- CreateIndex
CREATE INDEX "verification_records_record_employee_id_idx" ON "verification_records"("record_employee_id");
CREATE INDEX "verification_matches_match_method_idx" ON "verification_matches"("match_method");

-- Update clock source type from 'excel' to 'system' (clock records are synced, not uploaded)
UPDATE "verification_sources" SET "source_type" = 'system' WHERE "source_code" = 'clock';
