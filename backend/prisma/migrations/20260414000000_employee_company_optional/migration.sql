-- Make company_id nullable in employees table (temporary employees do not need a company)
ALTER TABLE "employees" ALTER COLUMN "company_id" DROP NOT NULL;
