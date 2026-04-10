-- CreateTable: employee_nicknames (one employee can have multiple nicknames)
CREATE TABLE IF NOT EXISTS "employee_nicknames" (
    "id" SERIAL NOT NULL,
    "emp_nickname_employee_id" INTEGER NOT NULL,
    "emp_nickname_value" VARCHAR(50) NOT NULL,
    "emp_nickname_source" VARCHAR(30) DEFAULT 'manual',
    "emp_nickname_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_nicknames_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "employee_nicknames_emp_nickname_employee_id_idx" ON "employee_nicknames"("emp_nickname_employee_id");
CREATE INDEX IF NOT EXISTS "employee_nicknames_emp_nickname_value_idx" ON "employee_nicknames"("emp_nickname_value");

-- Add unique constraint to prevent duplicate nicknames for same employee
CREATE UNIQUE INDEX IF NOT EXISTS "employee_nicknames_emp_id_value_key" ON "employee_nicknames"("emp_nickname_employee_id", "emp_nickname_value");

-- AddColumn: pending_review to verification_wa_messages
ALTER TABLE "verification_wa_messages" ADD COLUMN IF NOT EXISTS "wa_msg_pending_review" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn: review_result to verification_wa_messages (confirmed_order | confirmed_chat | null)
ALTER TABLE "verification_wa_messages" ADD COLUMN IF NOT EXISTS "wa_msg_review_result" VARCHAR(30);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "verification_wa_messages_wa_msg_pending_review_idx" ON "verification_wa_messages"("wa_msg_pending_review");

-- AddForeignKey
ALTER TABLE "employee_nicknames" ADD CONSTRAINT "employee_nicknames_emp_nickname_employee_id_fkey" FOREIGN KEY ("emp_nickname_employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
