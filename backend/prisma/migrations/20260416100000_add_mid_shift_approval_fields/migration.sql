-- AlterTable
ALTER TABLE "employee_attendances" ADD COLUMN "mid_shift_approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employee_attendances" ADD COLUMN "mid_shift_approved_by" INTEGER;
ALTER TABLE "employee_attendances" ADD COLUMN "mid_shift_approved_at" TIMESTAMP(3);
ALTER TABLE "employee_attendances" ADD COLUMN "mid_shift_approval_signature" TEXT;

-- AddForeignKey
ALTER TABLE "employee_attendances" ADD CONSTRAINT "employee_attendances_mid_shift_approved_by_fkey" FOREIGN KEY ("mid_shift_approved_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
