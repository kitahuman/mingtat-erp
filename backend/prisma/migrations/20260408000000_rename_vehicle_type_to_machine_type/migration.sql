-- Rename vehicle_type to machine_type in subcontractor_fleet_drivers
-- The Prisma schema uses machine_type but the DB column was created as vehicle_type
ALTER TABLE "subcontractor_fleet_drivers"
  RENAME COLUMN "vehicle_type" TO "machine_type";
