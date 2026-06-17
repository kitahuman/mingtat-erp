-- CreateTable
CREATE TABLE "bank_transaction_matches" (
    "id" SERIAL NOT NULL,
    "bank_transaction_id" INTEGER NOT NULL,
    "matched_type" VARCHAR(30) NOT NULL,
    "matched_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transaction_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_transaction_matches_bank_transaction_id_idx" ON "bank_transaction_matches"("bank_transaction_id");

-- CreateIndex
CREATE INDEX "bank_transaction_matches_matched_type_matched_id_idx" ON "bank_transaction_matches"("matched_type", "matched_id");

-- AddForeignKey
ALTER TABLE "bank_transaction_matches" ADD CONSTRAINT "bank_transaction_matches_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
