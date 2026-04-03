-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "contract_no" VARCHAR(50) NOT NULL,
    "client_id" INTEGER NOT NULL,
    "contract_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sign_date" DATE,
    "start_date" DATE,
    "end_date" DATE,
    "original_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_contract_no_key" ON "contracts"("contract_no");

-- AddForeignKey (Contract -> Partner as client)
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Add contract_id to projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER;

-- AddForeignKey (Project -> Contract)
ALTER TABLE "projects" ADD CONSTRAINT "projects_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (Expense -> Contract) - P0-01 fix
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
