-- AlterTable: change tonnage column from numeric(5,1) to varchar in vehicles table
ALTER TABLE "vehicles" ALTER COLUMN "tonnage" TYPE varchar;

-- AlterTable: change tonnage column from numeric(5,1) to varchar in machinery table
ALTER TABLE "machinery" ALTER COLUMN "tonnage" TYPE varchar;
