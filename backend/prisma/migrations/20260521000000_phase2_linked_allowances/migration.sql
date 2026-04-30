-- AlterTable FleetRateCard
ALTER TABLE "fleet_rate_cards" ADD COLUMN "linked_allowances" JSONB;

-- AlterTable PayrollDailyAllowance
ALTER TABLE "payroll_daily_allowances" ADD COLUMN "is_auto" BOOLEAN NOT NULL DEFAULT false;
