-- Add employee standard photo (base64) for face recognition
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "employee_photo_base64" TEXT;

-- Add attendance photo base64 for company clock-in (stored as base64 since Render filesystem is ephemeral)
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "attendance_photo_base64" TEXT;

-- Add verification_method to track how attendance was verified
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "attendance_verification_method" VARCHAR(50);

-- Add verification_score to store AI face comparison score
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "attendance_verification_score" FLOAT;

-- Add operator_user_id to track which operator performed the company clock-in
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "attendance_operator_user_id" INTEGER;

-- Add is_temporary flag for temporary employees
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "employee_is_temporary" BOOLEAN DEFAULT false;
