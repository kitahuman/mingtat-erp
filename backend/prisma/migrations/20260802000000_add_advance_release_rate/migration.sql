-- AlterTable: add advance_release_rate to contracts (扣回預付款比率, default 10%)
ALTER TABLE "contracts" ADD COLUMN "advance_release_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.10;
