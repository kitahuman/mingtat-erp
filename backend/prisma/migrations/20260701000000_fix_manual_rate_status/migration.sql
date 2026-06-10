UPDATE payroll_work_logs SET price_match_status = 'manual' WHERE is_manual_rate = true AND price_match_status = 'matched';
