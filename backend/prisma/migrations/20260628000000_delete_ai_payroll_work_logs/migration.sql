-- 清理早前錯誤由 AI 計糧生成流程建立的工作紀錄。
-- AI 計糧流程只應直接生成 payroll / payroll_work_logs，不應寫入 work_logs。
DELETE FROM "work_logs"
WHERE "source" = 'ai_payroll';
