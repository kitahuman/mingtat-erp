-- AlterTable
ALTER TABLE "payment_outs" ADD COLUMN "subcon_payroll_id" INTEGER;

-- AddForeignKey
ALTER TABLE "payment_outs" ADD CONSTRAINT "payment_outs_subcon_payroll_id_fkey" FOREIGN KEY ("subcon_payroll_id") REFERENCES "subcon_payrolls"("subcon_payroll_id") ON DELETE SET NULL ON UPDATE CASCADE;
