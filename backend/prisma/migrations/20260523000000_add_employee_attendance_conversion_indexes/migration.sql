-- Add indexes used by attendance-to-work-log conversion and attendance date scans.
CREATE INDEX IF NOT EXISTS "employee_attendances_timestamp_idx" ON "employee_attendances"("timestamp");
CREATE INDEX IF NOT EXISTS "employee_attendances_employee_id_timestamp_idx" ON "employee_attendances"("employee_id", "timestamp");
