-- AlterTable: Add grouped_amount_selections to payrolls
ALTER TABLE "payrolls" ADD COLUMN "grouped_amount_selections" JSONB;
