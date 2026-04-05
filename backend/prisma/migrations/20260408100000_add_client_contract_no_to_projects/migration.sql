-- Add client_contract_no to projects table
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "client_contract_no" TEXT;
