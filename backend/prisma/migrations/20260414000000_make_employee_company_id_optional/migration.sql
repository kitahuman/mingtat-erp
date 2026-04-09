-- Make employees.company_id nullable (temporary employees don't need a company)
ALTER TABLE "employees" ALTER COLUMN "company_id" DROP NOT NULL;
