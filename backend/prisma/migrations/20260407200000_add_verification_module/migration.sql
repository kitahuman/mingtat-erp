-- CreateTable: verification_sources
CREATE TABLE "verification_sources" (
    "id" SERIAL NOT NULL,
    "source_code" VARCHAR(50) NOT NULL,
    "source_name" VARCHAR(100) NOT NULL,
    "source_type" VARCHAR(20) NOT NULL,
    "source_description" TEXT,
    "source_file_format" VARCHAR(100),
    "source_expected_fields" INTEGER,
    "source_is_active" BOOLEAN NOT NULL DEFAULT true,
    "source_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_batches
CREATE TABLE "verification_batches" (
    "id" SERIAL NOT NULL,
    "batch_code" VARCHAR(100) NOT NULL,
    "batch_source_id" INTEGER NOT NULL,
    "batch_file_name" VARCHAR(255),
    "batch_file_size" BIGINT,
    "batch_file_hash" VARCHAR(64),
    "batch_upload_user_id" INTEGER,
    "batch_upload_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batch_period_year" INTEGER,
    "batch_period_month" INTEGER,
    "batch_total_rows" INTEGER,
    "batch_filtered_rows" INTEGER,
    "batch_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "batch_error_message" TEXT,
    "batch_processing_started_at" TIMESTAMP(3),
    "batch_processing_completed_at" TIMESTAMP(3),
    "batch_notes" TEXT,

    CONSTRAINT "verification_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_records
CREATE TABLE "verification_records" (
    "id" SERIAL NOT NULL,
    "record_batch_id" INTEGER NOT NULL,
    "record_source_id" INTEGER NOT NULL,
    "record_source_row_number" INTEGER,
    "record_work_date" DATE,
    "record_vehicle_no" VARCHAR(50),
    "record_driver_name" VARCHAR(100),
    "record_customer" VARCHAR(100),
    "record_location_from" VARCHAR(200),
    "record_location_to" VARCHAR(200),
    "record_time_in" TIME,
    "record_time_out" TIME,
    "record_contract_no" VARCHAR(50),
    "record_slip_no" VARCHAR(50),
    "record_quantity" VARCHAR(50),
    "record_weight_net" DECIMAL(10,2),
    "record_raw_data" JSONB,
    "record_ocr_confidence" DECIMAL(5,2),
    "record_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_record_chits
CREATE TABLE "verification_record_chits" (
    "id" SERIAL NOT NULL,
    "chit_record_id" INTEGER NOT NULL,
    "chit_no" VARCHAR(50) NOT NULL,
    "chit_seq" INTEGER NOT NULL DEFAULT 1,
    "chit_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_record_chits_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_matches
CREATE TABLE "verification_matches" (
    "id" SERIAL NOT NULL,
    "match_work_record_id" INTEGER NOT NULL,
    "match_source_id" INTEGER NOT NULL,
    "match_record_id" INTEGER,
    "match_status" VARCHAR(20) NOT NULL DEFAULT 'unverified',
    "match_confidence" DECIMAL(5,2),
    "match_diff_fields" JSONB,
    "match_diff_count" INTEGER NOT NULL DEFAULT 0,
    "match_notes" TEXT,
    "match_resolved_by" INTEGER,
    "match_resolved_at" TIMESTAMP(3),
    "match_resolved_action" VARCHAR(30),
    "match_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_gps_summaries
CREATE TABLE "verification_gps_summaries" (
    "id" SERIAL NOT NULL,
    "gps_summary_batch_id" INTEGER NOT NULL,
    "gps_summary_vehicle_no" VARCHAR(50),
    "gps_summary_date" DATE,
    "gps_summary_start_time" TIMESTAMP(3),
    "gps_summary_end_time" TIMESTAMP(3),
    "gps_summary_total_distance" DECIMAL(10,2),
    "gps_summary_trip_count" INTEGER,
    "gps_summary_locations" JSONB,
    "gps_summary_raw_points" INTEGER,
    "gps_summary_ai_model" VARCHAR(50),
    "gps_summary_processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_gps_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_ocr_results
CREATE TABLE "verification_ocr_results" (
    "id" SERIAL NOT NULL,
    "ocr_batch_id" INTEGER NOT NULL,
    "ocr_source_id" INTEGER NOT NULL,
    "ocr_file_name" VARCHAR(255),
    "ocr_image_url" VARCHAR(500),
    "ocr_extracted_data" JSONB,
    "ocr_confidence_overall" DECIMAL(5,2),
    "ocr_field_confidence" JSONB,
    "ocr_engine" VARCHAR(50) NOT NULL DEFAULT 'gpt-vision',
    "ocr_raw_text" TEXT,
    "ocr_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "ocr_user_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "ocr_user_corrections" JSONB,
    "ocr_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_ocr_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_wa_messages
CREATE TABLE "verification_wa_messages" (
    "id" SERIAL NOT NULL,
    "wa_msg_remote_id" VARCHAR(100),
    "wa_msg_group_id" VARCHAR(100),
    "wa_msg_group_name" VARCHAR(200),
    "wa_msg_sender_jid" VARCHAR(100),
    "wa_msg_sender_name" VARCHAR(100),
    "wa_msg_timestamp" TIMESTAMP(3),
    "wa_msg_body" TEXT,
    "wa_msg_type" VARCHAR(50),
    "wa_msg_is_forwarded" BOOLEAN NOT NULL DEFAULT false,
    "wa_msg_has_media" BOOLEAN NOT NULL DEFAULT false,
    "wa_msg_media_url" VARCHAR(500),
    "wa_msg_ai_classified" VARCHAR(30),
    "wa_msg_ai_confidence" DECIMAL(5,2),
    "wa_msg_processed" BOOLEAN NOT NULL DEFAULT false,
    "wa_msg_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_wa_orders
CREATE TABLE "verification_wa_orders" (
    "id" SERIAL NOT NULL,
    "wa_order_msg_id" INTEGER,
    "wa_order_date" DATE NOT NULL,
    "wa_order_status" VARCHAR(20) NOT NULL DEFAULT 'tentative',
    "wa_order_version" INTEGER NOT NULL DEFAULT 1,
    "wa_order_sender_name" VARCHAR(100),
    "wa_order_sender_role" VARCHAR(50),
    "wa_order_raw_text" TEXT,
    "wa_order_item_count" INTEGER NOT NULL DEFAULT 0,
    "wa_order_ai_model" VARCHAR(50),
    "wa_order_ai_confidence" DECIMAL(5,2),
    "wa_order_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_wa_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_wa_order_items
CREATE TABLE "verification_wa_order_items" (
    "id" SERIAL NOT NULL,
    "wa_item_order_id" INTEGER NOT NULL,
    "wa_item_seq" INTEGER NOT NULL DEFAULT 1,
    "wa_item_contract_no" VARCHAR(50),
    "wa_item_customer" VARCHAR(100),
    "wa_item_work_desc" VARCHAR(500),
    "wa_item_location" VARCHAR(200),
    "wa_item_driver_nickname" VARCHAR(50),
    "wa_item_driver_id" INTEGER,
    "wa_item_vehicle_no" VARCHAR(50),
    "wa_item_machine_code" VARCHAR(50),
    "wa_item_contact_person" VARCHAR(200),
    "wa_item_slip_write_as" VARCHAR(100),
    "wa_item_is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "wa_item_remarks" TEXT,
    "wa_item_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_wa_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_nickname_mappings
CREATE TABLE "verification_nickname_mappings" (
    "id" SERIAL NOT NULL,
    "nickname_value" VARCHAR(50) NOT NULL,
    "nickname_employee_id" INTEGER,
    "nickname_employee_name" VARCHAR(100),
    "nickname_vehicle_no" VARCHAR(50),
    "nickname_is_active" BOOLEAN NOT NULL DEFAULT true,
    "nickname_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nickname_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_nickname_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: verification_action_logs
CREATE TABLE "verification_action_logs" (
    "id" SERIAL NOT NULL,
    "log_user_id" INTEGER NOT NULL,
    "log_user_name" VARCHAR(100),
    "log_action_type" VARCHAR(30) NOT NULL,
    "log_match_id" INTEGER,
    "log_old_status" VARCHAR(50),
    "log_new_status" VARCHAR(50),
    "log_details" JSONB,
    "log_ip_address" VARCHAR(50),
    "log_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_sources_source_code_key" ON "verification_sources"("source_code");

-- CreateIndex
CREATE UNIQUE INDEX "verification_batches_batch_code_key" ON "verification_batches"("batch_code");
CREATE INDEX "verification_batches_batch_source_id_idx" ON "verification_batches"("batch_source_id");
CREATE INDEX "verification_batches_batch_upload_time_idx" ON "verification_batches"("batch_upload_time");
CREATE INDEX "verification_batches_batch_period_year_batch_period_month_idx" ON "verification_batches"("batch_period_year", "batch_period_month");

-- CreateIndex
CREATE INDEX "verification_records_record_batch_id_idx" ON "verification_records"("record_batch_id");
CREATE INDEX "verification_records_record_vehicle_no_idx" ON "verification_records"("record_vehicle_no");
CREATE INDEX "verification_records_record_work_date_idx" ON "verification_records"("record_work_date");
CREATE INDEX "verification_records_record_slip_no_idx" ON "verification_records"("record_slip_no");
CREATE INDEX "verification_records_record_driver_name_idx" ON "verification_records"("record_driver_name");

-- CreateIndex
CREATE UNIQUE INDEX "verification_record_chits_chit_record_id_chit_no_key" ON "verification_record_chits"("chit_record_id", "chit_no");
CREATE INDEX "verification_record_chits_chit_record_id_idx" ON "verification_record_chits"("chit_record_id");
CREATE INDEX "verification_record_chits_chit_no_idx" ON "verification_record_chits"("chit_no");

-- CreateIndex
CREATE INDEX "verification_matches_match_work_record_id_idx" ON "verification_matches"("match_work_record_id");
CREATE INDEX "verification_matches_match_status_idx" ON "verification_matches"("match_status");
CREATE INDEX "verification_matches_match_source_id_idx" ON "verification_matches"("match_source_id");
CREATE INDEX "verification_matches_match_created_at_idx" ON "verification_matches"("match_created_at");

-- CreateIndex
CREATE INDEX "verification_gps_summaries_gps_summary_vehicle_no_gps_summ_idx" ON "verification_gps_summaries"("gps_summary_vehicle_no", "gps_summary_date");

-- CreateIndex
CREATE INDEX "verification_ocr_results_ocr_batch_id_idx" ON "verification_ocr_results"("ocr_batch_id");
CREATE INDEX "verification_ocr_results_ocr_status_idx" ON "verification_ocr_results"("ocr_status");

-- CreateIndex
CREATE INDEX "verification_wa_messages_wa_msg_group_id_idx" ON "verification_wa_messages"("wa_msg_group_id");
CREATE INDEX "verification_wa_messages_wa_msg_timestamp_idx" ON "verification_wa_messages"("wa_msg_timestamp");
CREATE INDEX "verification_wa_messages_wa_msg_ai_classified_idx" ON "verification_wa_messages"("wa_msg_ai_classified");
CREATE INDEX "verification_wa_messages_wa_msg_remote_id_idx" ON "verification_wa_messages"("wa_msg_remote_id");

-- CreateIndex
CREATE INDEX "verification_wa_orders_wa_order_date_idx" ON "verification_wa_orders"("wa_order_date");
CREATE INDEX "verification_wa_orders_wa_order_status_idx" ON "verification_wa_orders"("wa_order_status");
CREATE INDEX "verification_wa_orders_wa_order_msg_id_idx" ON "verification_wa_orders"("wa_order_msg_id");

-- CreateIndex
CREATE INDEX "verification_wa_order_items_wa_item_order_id_idx" ON "verification_wa_order_items"("wa_item_order_id");
CREATE INDEX "verification_wa_order_items_wa_item_driver_nickname_idx" ON "verification_wa_order_items"("wa_item_driver_nickname");
CREATE INDEX "verification_wa_order_items_wa_item_vehicle_no_idx" ON "verification_wa_order_items"("wa_item_vehicle_no");
CREATE INDEX "verification_wa_order_items_wa_item_contract_no_idx" ON "verification_wa_order_items"("wa_item_contract_no");

-- CreateIndex
CREATE INDEX "verification_nickname_mappings_nickname_value_idx" ON "verification_nickname_mappings"("nickname_value");
CREATE INDEX "verification_nickname_mappings_nickname_employee_id_idx" ON "verification_nickname_mappings"("nickname_employee_id");

-- CreateIndex
CREATE INDEX "verification_action_logs_log_user_id_idx" ON "verification_action_logs"("log_user_id");
CREATE INDEX "verification_action_logs_log_match_id_idx" ON "verification_action_logs"("log_match_id");
CREATE INDEX "verification_action_logs_log_created_at_idx" ON "verification_action_logs"("log_created_at");

-- AddForeignKey
ALTER TABLE "verification_batches" ADD CONSTRAINT "verification_batches_batch_source_id_fkey" FOREIGN KEY ("batch_source_id") REFERENCES "verification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_record_batch_id_fkey" FOREIGN KEY ("record_batch_id") REFERENCES "verification_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_record_source_id_fkey" FOREIGN KEY ("record_source_id") REFERENCES "verification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_record_chits" ADD CONSTRAINT "verification_record_chits_chit_record_id_fkey" FOREIGN KEY ("chit_record_id") REFERENCES "verification_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_matches" ADD CONSTRAINT "verification_matches_match_source_id_fkey" FOREIGN KEY ("match_source_id") REFERENCES "verification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "verification_matches" ADD CONSTRAINT "verification_matches_match_record_id_fkey" FOREIGN KEY ("match_record_id") REFERENCES "verification_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_gps_summaries" ADD CONSTRAINT "verification_gps_summaries_gps_summary_batch_id_fkey" FOREIGN KEY ("gps_summary_batch_id") REFERENCES "verification_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_ocr_results" ADD CONSTRAINT "verification_ocr_results_ocr_batch_id_fkey" FOREIGN KEY ("ocr_batch_id") REFERENCES "verification_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "verification_ocr_results" ADD CONSTRAINT "verification_ocr_results_ocr_source_id_fkey" FOREIGN KEY ("ocr_source_id") REFERENCES "verification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_wa_orders" ADD CONSTRAINT "verification_wa_orders_wa_order_msg_id_fkey" FOREIGN KEY ("wa_order_msg_id") REFERENCES "verification_wa_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_wa_order_items" ADD CONSTRAINT "verification_wa_order_items_wa_item_order_id_fkey" FOREIGN KEY ("wa_item_order_id") REFERENCES "verification_wa_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_action_logs" ADD CONSTRAINT "verification_action_logs_log_match_id_fkey" FOREIGN KEY ("log_match_id") REFERENCES "verification_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: Insert default verification sources
INSERT INTO "verification_sources" ("source_code", "source_name", "source_type", "source_description", "source_is_active", "source_created_at", "source_updated_at") VALUES
  ('system_record', '系統電子報工', 'system', '員工入口系統已錄入的工作紀錄', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('receipt', '政府入帳票 Excel', 'excel', '香港環保署廢物處理設施管理系統匯出的入帳票紀錄', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gps', 'GPS 追蹤報表', 'gps', 'Autotoll 車輛追蹤系統匯出的 GPS 軌跡資料', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('clock', '打卡紀錄', 'excel', '員工出勤打卡紀錄', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('slip_chit', '明達飛仔（有入帳票號）', 'ocr', '堆填區運輸類飛仔，含入帳票號碼', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('slip_no_chit', '明達飛仔（無入帳票號）', 'ocr', '機械/租車類飛仔，無入帳票號碼', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('driver_sheet', '司機功課表', 'ocr', '司機每日工作日報表', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('customer_record', '客戶月租機械紀錄', 'ocr', '客戶月租機械的每日上下班紀錄', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('whatsapp_order', 'WhatsApp Order', 'webhook', 'WhatsApp 群組派工指令', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
