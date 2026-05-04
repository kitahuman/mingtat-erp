-- Normalize legacy WorkLog source value.
-- All historical WhatsApp-created work logs should use the canonical
-- source value "whatsapp_clockin" instead of the legacy "whatsapp".
UPDATE `work_logs`
SET `source` = 'whatsapp_clockin'
WHERE `source` = 'whatsapp';
