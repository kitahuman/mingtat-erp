-- AlterTable: change default retention_rate from 0.10 to 0.05 (new contracts only)
ALTER TABLE "contracts" ALTER COLUMN "retention_rate" SET DEFAULT 0.05;
