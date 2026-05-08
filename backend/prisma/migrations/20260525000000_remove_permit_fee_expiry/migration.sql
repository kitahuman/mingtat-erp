-- Merge permit_fee_expiry into license_expiry (keep the newer date)
UPDATE vehicles
SET license_expiry = permit_fee_expiry
WHERE permit_fee_expiry IS NOT NULL
  AND (license_expiry IS NULL OR permit_fee_expiry > license_expiry);

-- Drop the permit_fee_expiry column
ALTER TABLE vehicles DROP COLUMN IF EXISTS permit_fee_expiry;
