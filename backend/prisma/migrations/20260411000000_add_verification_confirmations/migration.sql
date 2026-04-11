-- CreateTable
CREATE TABLE "verification_confirmations" (
    "id" SERIAL NOT NULL,
    "work_log_id" INTEGER NOT NULL,
    "source_code" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "matched_record_id" INTEGER,
    "matched_record_type" VARCHAR(50),
    "notes" TEXT,
    "confirmed_by" INTEGER NOT NULL,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_confirmations_work_log_id_idx" ON "verification_confirmations"("work_log_id");

-- CreateIndex
CREATE INDEX "verification_confirmations_status_idx" ON "verification_confirmations"("status");

-- CreateIndex
CREATE INDEX "verification_confirmations_confirmed_at_idx" ON "verification_confirmations"("confirmed_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_confirmations_work_log_id_source_code_key" ON "verification_confirmations"("work_log_id", "source_code");

-- AddForeignKey
ALTER TABLE "verification_confirmations" ADD CONSTRAINT "verification_confirmations_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_confirmations" ADD CONSTRAINT "verification_confirmations_work_log_id_fkey" FOREIGN KEY ("work_log_id") REFERENCES "work_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
