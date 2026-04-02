-- P2-03: WorkLog.matched_ot_rate 從 Int 改為 Decimal(12,2)
-- PostgreSQL 會自動將 integer 轉為 decimal，不會丟失資料
ALTER TABLE "work_logs"
  ALTER COLUMN "matched_ot_rate" TYPE DECIMAL(12, 2)
  USING "matched_ot_rate"::DECIMAL(12, 2);
