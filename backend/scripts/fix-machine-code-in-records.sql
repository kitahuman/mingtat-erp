-- Fix script: backfill machine_code into record_vehicle_no for existing whatsapp_order records
-- where record_vehicle_no is NULL but the corresponding wa_order_item has a machine_code
--
-- Run this once after deploying the code fix.

-- Step 1: Show affected records before fix
SELECT
  vr.id AS record_id,
  vr.record_work_date,
  vr.record_vehicle_no,
  vr.record_raw_data->>'machine_code' AS raw_machine_code,
  vs.source_code
FROM verification_records vr
JOIN verification_sources vs ON vs.id = vr.record_source_id
WHERE vs.source_code = 'whatsapp_order'
  AND vr.record_vehicle_no IS NULL
  AND vr.record_raw_data->>'machine_code' IS NOT NULL
  AND vr.record_raw_data->>'machine_code' != ''
ORDER BY vr.record_work_date DESC
LIMIT 100;

-- Step 2: Apply the fix
UPDATE verification_records vr
SET record_vehicle_no = vr.record_raw_data->>'machine_code'
FROM verification_sources vs
WHERE vs.id = vr.record_source_id
  AND vs.source_code = 'whatsapp_order'
  AND vr.record_vehicle_no IS NULL
  AND vr.record_raw_data->>'machine_code' IS NOT NULL
  AND vr.record_raw_data->>'machine_code' != '';

-- Step 3: Show count of fixed records
SELECT COUNT(*) AS fixed_count
FROM verification_records vr
JOIN verification_sources vs ON vs.id = vr.record_source_id
WHERE vs.source_code = 'whatsapp_order'
  AND vr.record_vehicle_no LIKE 'DC%';
