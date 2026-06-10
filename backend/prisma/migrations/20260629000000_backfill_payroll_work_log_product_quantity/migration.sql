-- Backfill product quantity for existing payroll work logs from linked work logs.
UPDATE "payroll_work_logs" pwl
SET "payroll_work_log_product_quantity" = wl."goods_quantity"
FROM "work_logs" wl
WHERE pwl."work_log_id" = wl."id"
  AND pwl."payroll_work_log_product_quantity" IS NULL
  AND wl."goods_quantity" IS NOT NULL;
