-- ══════════════════════════════════════════════════════════════
-- 打卡配對功能改進
-- 1. field_options 新增 GPS 座標欄位（位置自動配對）
-- 2. 新增 attendance_anomalies 表（異常記錄）
-- ══════════════════════════════════════════════════════════════

-- 1. field_options 新增 GPS 座標
ALTER TABLE "field_options" ADD COLUMN "field_option_latitude" DOUBLE PRECISION;
ALTER TABLE "field_options" ADD COLUMN "field_option_longitude" DOUBLE PRECISION;

-- 2. 新增 attendance_anomalies 表
CREATE TABLE "attendance_anomalies" (
    "id" SERIAL NOT NULL,
    "anomaly_date" DATE NOT NULL,
    "anomaly_type" VARCHAR(50) NOT NULL,
    "anomaly_employee_id" INTEGER,
    "anomaly_attendance_id" INTEGER,
    "anomaly_work_log_id" INTEGER,
    "anomaly_description" TEXT NOT NULL,
    "anomaly_is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "anomaly_resolved_by" INTEGER,
    "anomaly_resolved_at" TIMESTAMPTZ,
    "anomaly_resolved_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_anomalies_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "attendance_anomalies_anomaly_date_idx" ON "attendance_anomalies"("anomaly_date");
CREATE INDEX "attendance_anomalies_anomaly_type_idx" ON "attendance_anomalies"("anomaly_type");
CREATE INDEX "attendance_anomalies_anomaly_employee_id_idx" ON "attendance_anomalies"("anomaly_employee_id");
CREATE INDEX "attendance_anomalies_anomaly_is_resolved_idx" ON "attendance_anomalies"("anomaly_is_resolved");

-- Foreign keys
ALTER TABLE "attendance_anomalies" ADD CONSTRAINT "attendance_anomalies_anomaly_employee_id_fkey" FOREIGN KEY ("anomaly_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_anomalies" ADD CONSTRAINT "attendance_anomalies_anomaly_attendance_id_fkey" FOREIGN KEY ("anomaly_attendance_id") REFERENCES "employee_attendances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_anomalies" ADD CONSTRAINT "attendance_anomalies_anomaly_work_log_id_fkey" FOREIGN KEY ("anomaly_work_log_id") REFERENCES "work_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_anomalies" ADD CONSTRAINT "attendance_anomalies_anomaly_resolved_by_fkey" FOREIGN KEY ("anomaly_resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
