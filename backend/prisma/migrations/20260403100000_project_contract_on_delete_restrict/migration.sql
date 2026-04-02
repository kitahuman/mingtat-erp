-- AlterTable: Add onDelete: Restrict to Project → Contract foreign key
-- Drop existing FK and re-add with ON DELETE RESTRICT

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_contract_id_fkey";

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
