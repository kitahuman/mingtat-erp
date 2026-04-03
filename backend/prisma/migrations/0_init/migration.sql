-- Baseline migration: create all core tables that existed before migration tracking
-- Using IF NOT EXISTS to safely handle both fresh deployments and existing databases

-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "display_name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'worker',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "last_login_at" TIMESTAMPTZ,
    "created_by" INTEGER,
    "employee_id" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "company_type" TEXT NOT NULL DEFAULT 'internal',
    "internal_prefix" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "company_profiles" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "chinese_name" TEXT NOT NULL,
    "english_name" TEXT,
    "registration_date" TEXT,
    "br_number" TEXT,
    "br_expiry_date" TEXT,
    "cr_number" TEXT,
    "registered_address" TEXT,
    "directors" TEXT,
    "shareholders" TEXT,
    "secretary" TEXT,
    "subcontractor_reg_no" TEXT,
    "subcontractor_reg_date" TEXT,
    "subcontractor_reg_expiry" TEXT,
    "subcontractor_work_types" TEXT,
    "subcontractor_specialties" TEXT,
    "office_phone" TEXT,
    "office_fax" TEXT,
    "office_email" TEXT,
    "office_address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "company_id" INTEGER,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "employees" (
    "id" SERIAL NOT NULL,
    "emp_code" TEXT,
    "name_zh" TEXT NOT NULL,
    "name_en" TEXT,
    "nickname" TEXT,
    "role" TEXT NOT NULL DEFAULT 'worker',
    "phone" TEXT,
    "emergency_contact" TEXT,
    "join_date" DATE,
    "termination_date" DATE,
    "termination_reason" TEXT,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "id_number" TEXT,
    "date_of_birth" DATE,
    "gender" TEXT,
    "address" TEXT,
    "frequent_vehicle" TEXT,
    "mpf_plan" TEXT,
    "mpf_account_number" TEXT,
    "mpf_employment_date" DATE,
    "mpf_old_employment_date" DATE,
    "salary_notes" TEXT,
    "driving_license_no" TEXT,
    "driving_license_expiry" DATE,
    "driving_license_class" TEXT,
    "approved_worker_cert_no" TEXT,
    "approved_worker_cert_expiry" DATE,
    "green_card_no" TEXT,
    "green_card_expiry" DATE,
    "construction_card_no" TEXT,
    "construction_card_expiry" DATE,
    "earth_mover_cert_no" TEXT,
    "earth_mover_cert_expiry" DATE,
    "excavator_cert_no" TEXT,
    "excavator_cert_expiry" DATE,
    "crane_operator_cert_no" TEXT,
    "crane_operator_cert_expiry" DATE,
    "lorry_crane_cert_no" TEXT,
    "lorry_crane_cert_expiry" DATE,
    "crawler_crane_cert_no" TEXT,
    "crawler_crane_cert_expiry" DATE,
    "hydraulic_crane_cert_no" TEXT,
    "hydraulic_crane_cert_expiry" DATE,
    "airport_pass_no" TEXT,
    "airport_pass_expiry" DATE,
    "gammon_pass_no" TEXT,
    "gammon_pass_expiry" DATE,
    "leighton_pass_no" TEXT,
    "leighton_pass_expiry" DATE,
    "confined_space_cert_no" TEXT,
    "confined_space_cert_expiry" DATE,
    "compactor_cert_no" TEXT,
    "compactor_cert_expiry" DATE,
    "slinging_silver_card_no" TEXT,
    "slinging_silver_card_expiry" DATE,
    "craft_test_cert_no" TEXT,
    "craft_test_cert_expiry" DATE,
    "compaction_load_cert_no" TEXT,
    "compaction_load_cert_expiry" DATE,
    "aerial_platform_cert_no" TEXT,
    "aerial_platform_cert_expiry" DATE,
    "site_rigging_a12_cert_no" TEXT,
    "site_rigging_a12_cert_expiry" DATE,
    "slinging_signaler_a12s_cert_no" TEXT,
    "slinging_signaler_a12s_cert_expiry" DATE,
    "zero_injury_cert_no" TEXT,
    "zero_injury_cert_expiry" DATE,
    "designated_trade_safety_cert_no" TEXT,
    "designated_trade_safety_cert_expiry" DATE,
    "small_loader_cert_expiry" DATE,
    "safety_supervisor_cert_expiry" DATE,
    "safe_work_procedure_cert_expiry" DATE,
    "grinding_wheel_cert_expiry" DATE,
    "ship_cargo_cert_expiry" DATE,
    "arc_welding_cert_expiry" DATE,
    "gas_welding_cert_expiry" DATE,
    "clp_safety_cert_expiry" DATE,
    "other_certificates" JSONB,
    "cert_photos" JSONB,
    "company_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "employee_salary_settings" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "effective_date" DATE NOT NULL,
    "base_salary" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "salary_type" TEXT NOT NULL DEFAULT 'daily',
    "allowance_night" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allowance_rent" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allowance_3runway" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ot_rate_standard" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allowance_well" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allowance_machine" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allowance_roller" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allowance_crane" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allowance_move_machine" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allowance_kwh_night" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allowance_mid_shift" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ot_1800_1900" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ot_1900_2000" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ot_0600_0700" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ot_0700_0800" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ot_mid_shift" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "mid_shift_ot_allowance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "custom_allowances" JSONB,
    "is_piece_rate" BOOLEAN NOT NULL DEFAULT false,
    "fleet_rate_card_id" INTEGER,
    "change_type" TEXT,
    "change_amount" DECIMAL(10,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_salary_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "employee_transfers" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "from_company_id" INTEGER NOT NULL,
    "to_company_id" INTEGER NOT NULL,
    "transfer_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "vehicles" (
    "id" SERIAL NOT NULL,
    "plate_number" TEXT NOT NULL,
    "machine_type" TEXT,
    "tonnage" DECIMAL(5,1),
    "owner_company_id" INTEGER NOT NULL,
    "insurance_expiry" DATE,
    "permit_fee_expiry" DATE,
    "inspection_date" DATE,
    "license_expiry" DATE,
    "brand" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "vehicle_plate_history" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "old_plate" TEXT NOT NULL,
    "new_plate" TEXT NOT NULL,
    "change_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_plate_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "vehicle_transfers" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "from_company_id" INTEGER NOT NULL,
    "to_company_id" INTEGER NOT NULL,
    "transfer_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "machinery" (
    "id" SERIAL NOT NULL,
    "machine_code" TEXT NOT NULL,
    "machine_type" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "tonnage" DECIMAL(5,1),
    "serial_number" TEXT,
    "owner_company_id" INTEGER NOT NULL,
    "inspection_cert_expiry" DATE,
    "insurance_expiry" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machinery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "machinery_transfers" (
    "id" SERIAL NOT NULL,
    "machinery_id" INTEGER NOT NULL,
    "from_company_id" INTEGER NOT NULL,
    "to_company_id" INTEGER NOT NULL,
    "transfer_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machinery_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "partners" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "english_code" TEXT,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "partner_type" TEXT NOT NULL,
    "category" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "fax" TEXT,
    "address" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "invoice_title" TEXT,
    "invoice_description" TEXT,
    "quotation_remarks" TEXT,
    "invoice_remarks" TEXT,
    "is_subsidiary" BOOLEAN NOT NULL DEFAULT false,
    "subsidiaries" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "projects" (
    "id" SERIAL NOT NULL,
    "project_no" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "client_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "address" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contract_id" INTEGER,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "project_sequences" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "quotations" (
    "id" SERIAL NOT NULL,
    "quotation_no" TEXT NOT NULL,
    "quotation_type" TEXT NOT NULL DEFAULT 'project',
    "company_id" INTEGER NOT NULL,
    "client_id" INTEGER,
    "quotation_date" DATE NOT NULL,
    "contract_name" TEXT,
    "project_name" TEXT,
    "project_id" INTEGER,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "validity_period" TEXT,
    "payment_terms" TEXT,
    "exclusions" TEXT,
    "external_remark" TEXT,
    "internal_remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "quotation_items" (
    "id" SERIAL NOT NULL,
    "quotation_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 1,
    "item_name" TEXT,
    "item_description" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "quotation_sequences" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "year_month" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quotation_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rate_cards" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "contract_no" TEXT,
    "service_type" TEXT,
    "name" TEXT,
    "description" TEXT,
    "day_night" TEXT,
    "tonnage" TEXT,
    "machine_type" TEXT,
    "equipment_number" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "day_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "day_unit" TEXT,
    "night_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "night_unit" TEXT,
    "mid_shift_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mid_shift_unit" TEXT,
    "ot_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ot_unit" TEXT,
    "effective_date" DATE,
    "expiry_date" DATE,
    "source_quotation_id" INTEGER,
    "project_id" INTEGER,
    "remarks" TEXT,
    "rate_card_type" TEXT NOT NULL DEFAULT 'rental',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rate_card_ot_rates" (
    "id" SERIAL NOT NULL,
    "rate_card_id" INTEGER NOT NULL,
    "time_slot" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT,

    CONSTRAINT "rate_card_ot_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "fleet_rate_cards" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER,
    "client_id" INTEGER,
    "contract_no" TEXT,
    "service_type" TEXT,
    "name" TEXT,
    "description" TEXT,
    "day_night" TEXT,
    "tonnage" TEXT,
    "machine_type" TEXT,
    "equipment_number" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "day_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "night_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mid_shift_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ot_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "effective_date" DATE,
    "expiry_date" DATE,
    "remarks" TEXT,
    "source_quotation_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "subcon_rate_cards" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER,
    "subcon_id" INTEGER,
    "plate_no" TEXT,
    "client_id" INTEGER,
    "contract_no" TEXT,
    "service_type" TEXT,
    "name" TEXT,
    "description" TEXT,
    "day_night" TEXT,
    "tonnage" TEXT,
    "machine_type" TEXT,
    "equipment_number" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "day_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "day_unit" TEXT,
    "night_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "night_unit" TEXT,
    "mid_shift_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mid_shift_unit" TEXT,
    "ot_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ot_unit" TEXT,
    "unit" TEXT,
    "exclude_fuel" BOOLEAN NOT NULL DEFAULT false,
    "effective_date" DATE,
    "expiry_date" DATE,
    "remarks" TEXT,
    "source_quotation_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcon_rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "custom_fields" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "options" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "has_expiry_alert" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "custom_field_values" (
    "id" SERIAL NOT NULL,
    "custom_field_id" INTEGER NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "documents" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "doc_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "expiry_date" DATE,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "field_options" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "work_logs" (
    "id" SERIAL NOT NULL,
    "publisher_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'editing',
    "service_type" TEXT,
    "scheduled_date" DATE,
    "company_profile_id" INTEGER,
    "client_id" INTEGER,
    "quotation_id" INTEGER,
    "contract_id" INTEGER,
    "employee_id" INTEGER,
    "machine_type" TEXT,
    "equipment_number" TEXT,
    "equipment_source" TEXT,
    "tonnage" TEXT,
    "day_night" TEXT,
    "start_location" TEXT,
    "start_time" TEXT,
    "end_location" TEXT,
    "end_time" TEXT,
    "quantity" DECIMAL(10,2),
    "unit" TEXT,
    "ot_quantity" DECIMAL(10,2),
    "ot_unit" TEXT,
    "is_mid_shift" BOOLEAN NOT NULL DEFAULT false,
    "goods_quantity" DECIMAL(10,2),
    "matched_rate_card_id" INTEGER,
    "matched_rate" DECIMAL(12,2),
    "matched_unit" TEXT,
    "matched_ot_rate" DECIMAL(12,2),
    "price_match_status" TEXT,
    "price_match_note" TEXT,
    "receipt_no" TEXT,
    "work_order_no" TEXT,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "unverified_client_name" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" INTEGER,

    CONSTRAINT "work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payrolls" (
    "id" SERIAL NOT NULL,
    "period" TEXT NOT NULL,
    "date_from" DATE,
    "date_to" DATE,
    "employee_id" INTEGER NOT NULL,
    "company_profile_id" INTEGER,
    "salary_type" TEXT NOT NULL DEFAULT 'daily',
    "base_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "work_days" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "base_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "allowance_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ot_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mpf_deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mpf_plan" TEXT,
    "mpf_employer" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustment_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payment_date" DATE,
    "cheque_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_items" (
    "id" SERIAL NOT NULL,
    "payroll_id" INTEGER NOT NULL,
    "item_type" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_work_logs" (
    "id" SERIAL NOT NULL,
    "payroll_id" INTEGER NOT NULL,
    "work_log_id" INTEGER,
    "service_type" TEXT,
    "scheduled_date" DATE,
    "day_night" TEXT,
    "start_location" TEXT,
    "end_location" TEXT,
    "machine_type" TEXT,
    "tonnage" TEXT,
    "equipment_number" TEXT,
    "quantity" DECIMAL(10,2),
    "unit" TEXT,
    "ot_quantity" DECIMAL(10,2),
    "ot_unit" TEXT,
    "is_mid_shift" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "matched_rate_card_id" INTEGER,
    "matched_rate" DECIMAL(12,2),
    "matched_unit" TEXT,
    "matched_ot_rate" DECIMAL(12,2),
    "matched_mid_shift_rate" DECIMAL(12,2),
    "price_match_status" TEXT,
    "price_match_note" TEXT,
    "line_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ot_line_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mid_shift_line_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "group_key" TEXT,
    "client_id" INTEGER,
    "client_name" TEXT,
    "company_profile_id" INTEGER,
    "company_profile_name" TEXT,
    "quotation_id" INTEGER,
    "contract_no" TEXT,
    "is_modified" BOOLEAN NOT NULL DEFAULT false,
    "is_excluded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_adjustments" (
    "id" SERIAL NOT NULL,
    "payroll_id" INTEGER NOT NULL,
    "item_name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "remarks" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_daily_allowances" (
    "id" SERIAL NOT NULL,
    "payroll_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "allowance_key" TEXT NOT NULL,
    "allowance_name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_daily_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "subcontractor_fleet_drivers" (
    "id" SERIAL NOT NULL,
    "subcontractor_id" INTEGER NOT NULL,
    "short_name" TEXT,
    "name_zh" TEXT NOT NULL,
    "name_en" TEXT,
    "id_number" TEXT,
    "machine_type" TEXT,
    "plate_no" TEXT,
    "phone" TEXT,
    "date_of_birth" DATE,
    "yellow_cert_no" TEXT,
    "red_cert_no" TEXT,
    "has_d_cert" BOOLEAN NOT NULL DEFAULT false,
    "is_cert_returned" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontractor_fleet_drivers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "employee_salary_settings" ADD CONSTRAINT "employee_salary_settings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_company_id_fkey" FOREIGN KEY ("owner_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "vehicle_plate_history" ADD CONSTRAINT "vehicle_plate_history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "machinery" ADD CONSTRAINT "machinery_owner_company_id_fkey" FOREIGN KEY ("owner_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "machinery_transfers" ADD CONSTRAINT "machinery_transfers_machinery_id_fkey" FOREIGN KEY ("machinery_id") REFERENCES "machinery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "machinery_transfers" ADD CONSTRAINT "machinery_transfers_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "machinery_transfers" ADD CONSTRAINT "machinery_transfers_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "quotations" ADD CONSTRAINT "quotations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_source_quotation_id_fkey" FOREIGN KEY ("source_quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "rate_card_ot_rates" ADD CONSTRAINT "rate_card_ot_rates_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "fleet_rate_cards" ADD CONSTRAINT "fleet_rate_cards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "fleet_rate_cards" ADD CONSTRAINT "fleet_rate_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "fleet_rate_cards" ADD CONSTRAINT "fleet_rate_cards_source_quotation_id_fkey" FOREIGN KEY ("source_quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" ADD CONSTRAINT "subcon_rate_cards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" ADD CONSTRAINT "subcon_rate_cards_subcon_id_fkey" FOREIGN KEY ("subcon_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" ADD CONSTRAINT "subcon_rate_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" ADD CONSTRAINT "subcon_rate_cards_source_quotation_id_fkey" FOREIGN KEY ("source_quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_custom_field_id_fkey" FOREIGN KEY ("custom_field_id") REFERENCES "custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_company_profile_id_fkey" FOREIGN KEY ("company_profile_id") REFERENCES "company_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_company_profile_id_fkey" FOREIGN KEY ("company_profile_id") REFERENCES "company_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "payroll_work_logs" ADD CONSTRAINT "payroll_work_logs_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "payroll_work_logs" ADD CONSTRAINT "payroll_work_logs_work_log_id_fkey" FOREIGN KEY ("work_log_id") REFERENCES "work_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "payroll_daily_allowances" ADD CONSTRAINT "payroll_daily_allowances_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "subcontractor_fleet_drivers" ADD CONSTRAINT "subcontractor_fleet_drivers_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
