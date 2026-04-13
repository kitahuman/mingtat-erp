-- AlterTable
ALTER TABLE "work_logs" ADD COLUMN "work_log_fleet_driver_id" INTEGER;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_work_log_fleet_driver_id_fkey" FOREIGN KEY ("work_log_fleet_driver_id") REFERENCES "subcontractor_fleet_drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
