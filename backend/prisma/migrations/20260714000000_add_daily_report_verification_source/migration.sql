-- Add daily_report verification source (id=10)
INSERT INTO "verification_sources" ("source_code", "source_name", "source_type", "source_description", "source_is_active", "source_created_at", "source_updated_at")
VALUES ('daily_report', '工程日報', 'system', '工程日報核對來源，按日期+員工/車牌比對工作記錄', true, NOW(), NOW());
