-- Backfill verification_matches from existing manual_match confirmations.
-- Purpose:
--   1. Mark stale automatic verification_matches as rejected when a manual match exists.
--   2. Insert verification_matches rows with match_status = 'manual_match' for existing confirmations.
--
-- This script is idempotent for manual_match inserts: it will not insert a duplicate
-- manual_match row for the same work log, source, and matched target record.

BEGIN;

WITH manual_confirmations AS (
  SELECT
    id AS confirmation_id,
    work_log_id,
    source_code,
    matched_record_id,
    matched_record_type,
    notes,
    confirmed_by,
    confirmed_at
  FROM verification_confirmations
  WHERE status = 'manual_match'
    AND matched_record_id IS NOT NULL
),
source_map AS (
  SELECT * FROM (VALUES
    ('chit', 'receipt'),
    ('receipt', 'receipt'),
    ('delivery_note', 'slip_chit'),
    ('delivery_note', 'slip_no_chit'),
    ('slip_chit', 'slip_chit'),
    ('slip_no_chit', 'slip_no_chit'),
    ('gps', 'gps'),
    ('attendance', 'clock'),
    ('clock', 'clock'),
    ('whatsapp_order', 'whatsapp_order')
  ) AS mapped(confirmation_source_code, verification_source_code)
),
source_ids_to_reject AS (
  SELECT DISTINCT
    c.confirmation_id,
    c.work_log_id,
    c.notes,
    c.confirmed_by,
    c.confirmed_at,
    vs.id AS source_id
  FROM manual_confirmations c
  JOIN source_map sm
    ON sm.confirmation_source_code = c.source_code
  JOIN verification_sources vs
    ON vs.source_code = sm.verification_source_code

  UNION

  SELECT DISTINCT
    c.confirmation_id,
    c.work_log_id,
    c.notes,
    c.confirmed_by,
    c.confirmed_at,
    vr.record_source_id AS source_id
  FROM manual_confirmations c
  JOIN verification_records vr
    ON vr.id = c.matched_record_id
  WHERE c.source_code IN ('chit', 'receipt', 'delivery_note', 'slip_chit', 'slip_no_chit')
     OR c.matched_record_type = 'verification_record'
)
UPDATE verification_matches vm
SET
  match_status = 'rejected',
  match_resolved_by = COALESCE(source_ids_to_reject.confirmed_by, vm.match_resolved_by),
  match_resolved_at = COALESCE(source_ids_to_reject.confirmed_at, NOW()),
  match_resolved_action = 'manual_override',
  match_notes = CASE
    WHEN source_ids_to_reject.notes IS NOT NULL THEN '由歷史手動配對覆蓋：' || source_ids_to_reject.notes
    ELSE '由歷史手動配對覆蓋舊配對結果'
  END
FROM source_ids_to_reject
WHERE vm.match_work_record_id = source_ids_to_reject.work_log_id
  AND vm.match_source_id = source_ids_to_reject.source_id
  AND vm.match_status NOT IN ('rejected', 'manual_match');

WITH manual_confirmations AS (
  SELECT
    id AS confirmation_id,
    work_log_id,
    source_code,
    matched_record_id,
    matched_record_type,
    notes,
    confirmed_by,
    confirmed_at
  FROM verification_confirmations
  WHERE status = 'manual_match'
    AND matched_record_id IS NOT NULL
),
manual_target_ids AS (
  SELECT DISTINCT
    confirmation_id,
    work_log_id,
    source_code,
    matched_record_type,
    notes,
    confirmed_by,
    confirmed_at,
    matched_record_id AS target_id
  FROM manual_confirmations

  UNION

  SELECT DISTINCT
    c.confirmation_id,
    c.work_log_id,
    c.source_code,
    c.matched_record_type,
    c.notes,
    c.confirmed_by,
    c.confirmed_at,
    parsed.value::integer AS target_id
  FROM manual_confirmations c
  CROSS JOIN LATERAL regexp_split_to_table(
    COALESCE(substring(c.notes FROM '記錄ID\s*([0-9,，\s]+)'), c.matched_record_id::text),
    '[,，\s]+'
  ) AS parsed(value)
  WHERE parsed.value ~ '^[0-9]+$'
),
source_map AS (
  SELECT * FROM (VALUES
    ('chit', 'receipt'),
    ('receipt', 'receipt'),
    ('delivery_note', 'slip_chit'),
    ('delivery_note', 'slip_no_chit'),
    ('slip_chit', 'slip_chit'),
    ('slip_no_chit', 'slip_no_chit'),
    ('gps', 'gps'),
    ('attendance', 'clock'),
    ('clock', 'clock'),
    ('whatsapp_order', 'whatsapp_order')
  ) AS mapped(confirmation_source_code, verification_source_code)
),
manual_rows AS (
  SELECT DISTINCT
    m.confirmation_id,
    m.work_log_id,
    m.source_code,
    m.matched_record_type,
    m.notes,
    m.confirmed_by,
    m.confirmed_at,
    m.target_id,
    vr.record_source_id AS source_id,
    vr.id AS match_record_id
  FROM manual_target_ids m
  JOIN verification_records vr
    ON vr.id = m.target_id
  WHERE m.source_code IN ('chit', 'receipt', 'delivery_note', 'slip_chit', 'slip_no_chit')
     OR m.matched_record_type = 'verification_record'

  UNION

  SELECT DISTINCT
    m.confirmation_id,
    m.work_log_id,
    m.source_code,
    m.matched_record_type,
    m.notes,
    m.confirmed_by,
    m.confirmed_at,
    m.target_id,
    vs.id AS source_id,
    NULL::integer AS match_record_id
  FROM manual_target_ids m
  JOIN source_map sm
    ON sm.confirmation_source_code = m.source_code
  JOIN verification_sources vs
    ON vs.source_code = sm.verification_source_code
  WHERE NOT (
    m.source_code IN ('chit', 'receipt', 'delivery_note', 'slip_chit', 'slip_no_chit')
    OR m.matched_record_type = 'verification_record'
  )
)
INSERT INTO verification_matches (
  match_work_record_id,
  match_source_id,
  match_record_id,
  match_status,
  match_confidence,
  match_method,
  match_diff_fields,
  match_diff_count,
  match_notes,
  match_resolved_by,
  match_resolved_at,
  match_resolved_action,
  match_created_at,
  match_updated_at
)
SELECT
  mr.work_log_id,
  mr.source_id,
  mr.match_record_id,
  'manual_match',
  100.00,
  'manual',
  jsonb_build_object(
    'manual_match', true,
    'source_code', mr.source_code,
    'matched_record_id', mr.target_id,
    'matched_record_type', mr.matched_record_type
  ),
  0,
  COALESCE(mr.notes, '手動配對'),
  mr.confirmed_by,
  COALESCE(mr.confirmed_at, NOW()),
  'manual_correct',
  NOW(),
  NOW()
FROM manual_rows mr
WHERE NOT EXISTS (
  SELECT 1
  FROM verification_matches existing
  WHERE existing.match_work_record_id = mr.work_log_id
    AND existing.match_source_id = mr.source_id
    AND existing.match_status = 'manual_match'
    AND (
      existing.match_record_id = mr.match_record_id
      OR existing.match_diff_fields ->> 'matched_record_id' = mr.target_id::text
    )
);

COMMIT;
