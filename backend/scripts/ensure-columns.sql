-- ensure-columns.sql
-- Complete database setup: creates tables if missing, adds columns if missing.
-- Safe to run multiple times (idempotent).
-- Generated from Prisma schema.

-- ============================================================
-- STEP 0: Handle column renames (vehicle_type → machine_type, vehicle_tonnage → tonnage)
-- ============================================================
DO $$ BEGIN ALTER TABLE "rate_cards" RENAME COLUMN "vehicle_type" TO "machine_type"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "rate_cards" RENAME COLUMN "vehicle_tonnage" TO "tonnage"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "fleet_rate_cards" RENAME COLUMN "vehicle_type" TO "machine_type"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "fleet_rate_cards" RENAME COLUMN "vehicle_tonnage" TO "tonnage"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "subcon_rate_cards" RENAME COLUMN "vehicle_type" TO "machine_type"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "subcon_rate_cards" RENAME COLUMN "vehicle_tonnage" TO "tonnage"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
UPDATE "field_options" SET "category" = 'machine_type' WHERE "category" = 'vehicle_type';

-- ============================================================
-- STEP 1: CREATE TABLE IF NOT EXISTS (for tables that may not exist)
-- ============================================================

-- Create table: users
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

-- Create table: companies
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

-- Create table: company_profiles
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

-- Create table: employees
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

-- Create table: employee_salary_settings
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

-- Create table: employee_transfers
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

-- Create table: vehicles
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

-- Create table: vehicle_plate_history
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

-- Create table: vehicle_transfers
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

-- Create table: machinery
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

-- Create table: machinery_transfers
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

-- Create table: partners
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

-- Create table: contracts
CREATE TABLE IF NOT EXISTS "contracts" (
    "id" SERIAL NOT NULL,
    "contract_no" VARCHAR(50) NOT NULL,
    "client_id" INTEGER NOT NULL,
    "contract_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sign_date" DATE,
    "start_date" DATE,
    "end_date" DATE,
    "original_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retention_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "retention_cap_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.05,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- Create table: contract_bq_sections
CREATE TABLE IF NOT EXISTS "contract_bq_sections" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "section_code" VARCHAR(20) NOT NULL,
    "section_name" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_bq_sections_pkey" PRIMARY KEY ("id")
);

-- Create table: contract_bq_items
CREATE TABLE IF NOT EXISTS "contract_bq_items" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "section_id" INTEGER,
    "item_no" VARCHAR(30) NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit" VARCHAR(20),
    "unit_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_bq_items_pkey" PRIMARY KEY ("id")
);

-- Create table: variation_orders
CREATE TABLE IF NOT EXISTS "variation_orders" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "vo_no" VARCHAR(30) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "submitted_date" DATE,
    "approved_date" DATE,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approved_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variation_orders_pkey" PRIMARY KEY ("id")
);

-- Create table: variation_order_items
CREATE TABLE IF NOT EXISTS "variation_order_items" (
    "id" SERIAL NOT NULL,
    "variation_order_id" INTEGER NOT NULL,
    "item_no" VARCHAR(30) NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit" VARCHAR(20),
    "unit_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variation_order_items_pkey" PRIMARY KEY ("id")
);

-- Create table: projects
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

-- Create table: project_sequences
CREATE TABLE IF NOT EXISTS "project_sequences" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_sequences_pkey" PRIMARY KEY ("id")
);

-- Create table: quotations
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

-- Create table: quotation_items
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

-- Create table: quotation_sequences
CREATE TABLE IF NOT EXISTS "quotation_sequences" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "year_month" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quotation_sequences_pkey" PRIMARY KEY ("id")
);

-- Create table: rate_cards
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

-- Create table: rate_card_ot_rates
CREATE TABLE IF NOT EXISTS "rate_card_ot_rates" (
    "id" SERIAL NOT NULL,
    "rate_card_id" INTEGER NOT NULL,
    "time_slot" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT,

    CONSTRAINT "rate_card_ot_rates_pkey" PRIMARY KEY ("id")
);

-- Create table: fleet_rate_cards
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

-- Create table: subcon_rate_cards
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

-- Create table: fleet_rate_card_ot_rates
CREATE TABLE IF NOT EXISTS "fleet_rate_card_ot_rates" (
    "id" SERIAL NOT NULL,
    "fleet_rate_card_id" INTEGER NOT NULL,
    "time_slot" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT,

    CONSTRAINT "fleet_rate_card_ot_rates_pkey" PRIMARY KEY ("id")
);

-- Create table: subcon_rate_card_ot_rates
CREATE TABLE IF NOT EXISTS "subcon_rate_card_ot_rates" (
    "id" SERIAL NOT NULL,
    "subcon_rate_card_id" INTEGER NOT NULL,
    "time_slot" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT,

    CONSTRAINT "subcon_rate_card_ot_rates_pkey" PRIMARY KEY ("id")
);

-- Create table: custom_fields
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

-- Create table: custom_field_values
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

-- Create table: documents
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

-- Create table: field_options
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

-- Create table: work_logs
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

-- Create table: payrolls
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

-- Create table: payroll_items
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

-- Create table: payroll_work_logs
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

-- Create table: payroll_adjustments
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

-- Create table: payroll_daily_allowances
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

-- Create table: subcontractor_fleet_drivers
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

-- Create table: employee_attendances
CREATE TABLE IF NOT EXISTS "employee_attendances" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photo_url" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "address" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_attendances_pkey" PRIMARY KEY ("id")
);

-- Create table: employee_leaves
CREATE TABLE IF NOT EXISTS "employee_leaves" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "leave_type" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "days" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_leaves_pkey" PRIMARY KEY ("id")
);

-- Create table: expense_categories
CREATE TABLE IF NOT EXISTS "expense_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" INTEGER,
    "type" VARCHAR(20),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- Create table: expenses
CREATE TABLE IF NOT EXISTS "expenses" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "company_id" INTEGER,
    "supplier_name" TEXT,
    "supplier_partner_id" INTEGER,
    "category_id" INTEGER,
    "employee_id" INTEGER,
    "item" TEXT,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "payment_method" TEXT,
    "payment_date" DATE,
    "payment_ref" TEXT,
    "remarks" TEXT,
    "source" TEXT DEFAULT 'MANUAL',
    "source_ref_id" INTEGER,
    "machine_code" TEXT,
    "machinery_id" INTEGER,
    "client_id" INTEGER,
    "contract_id" INTEGER,
    "project_id" INTEGER,
    "quotation_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- Create table: expense_items
CREATE TABLE IF NOT EXISTS "expense_items" (
    "id" SERIAL NOT NULL,
    "expense_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id")
);

-- Create table: expense_attachments
CREATE TABLE IF NOT EXISTS "expense_attachments" (
    "id" SERIAL NOT NULL,
    "expense_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_attachments_pkey" PRIMARY KEY ("id")
);

-- Create table: payment_applications
CREATE TABLE IF NOT EXISTS "payment_applications" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "pa_no" INTEGER NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "period_from" DATE,
    "period_to" DATE NOT NULL,
    "submission_date" DATE,
    "certification_date" DATE,
    "payment_due_date" DATE,
    "bq_work_done" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vo_work_done" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cumulative_work_done" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "materials_on_site" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retention_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "after_retention" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "certified_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "prev_certified_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "current_due" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "client_certified_amount" DECIMAL(14,2),
    "client_current_due" DECIMAL(14,2),
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_applications_pkey" PRIMARY KEY ("id")
);

-- Create table: payment_bq_progress
CREATE TABLE IF NOT EXISTS "payment_bq_progress" (
    "id" SERIAL NOT NULL,
    "payment_application_id" INTEGER NOT NULL,
    "bq_item_id" INTEGER NOT NULL,
    "prev_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "current_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "this_period_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "prev_cumulative_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "current_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "this_period_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_bq_progress_pkey" PRIMARY KEY ("id")
);

-- Create table: payment_vo_progress
CREATE TABLE IF NOT EXISTS "payment_vo_progress" (
    "id" SERIAL NOT NULL,
    "payment_application_id" INTEGER NOT NULL,
    "vo_item_id" INTEGER NOT NULL,
    "prev_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "current_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "this_period_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "prev_cumulative_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "current_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "this_period_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_vo_progress_pkey" PRIMARY KEY ("id")
);

-- Create table: payment_deductions
CREATE TABLE IF NOT EXISTS "payment_deductions" (
    "id" SERIAL NOT NULL,
    "payment_application_id" INTEGER NOT NULL,
    "deduction_type" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_deductions_pkey" PRIMARY KEY ("id")
);

-- Create table: payment_materials
CREATE TABLE IF NOT EXISTS "payment_materials" (
    "id" SERIAL NOT NULL,
    "payment_application_id" INTEGER NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_materials_pkey" PRIMARY KEY ("id")
);

-- Create table: payment_ins
CREATE TABLE IF NOT EXISTS "payment_ins" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "source_type" VARCHAR(30) NOT NULL,
    "source_ref_id" INTEGER,
    "project_id" INTEGER,
    "contract_id" INTEGER,
    "bank_account" VARCHAR(100),
    "reference_no" VARCHAR(100),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_ins_pkey" PRIMARY KEY ("id")
);

-- Create table: payment_outs
CREATE TABLE IF NOT EXISTS "payment_outs" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expense_id" INTEGER,
    "project_id" INTEGER,
    "bank_account" VARCHAR(100),
    "reference_no" VARCHAR(100),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_outs_pkey" PRIMARY KEY ("id")
);

-- Create table: invoices
CREATE TABLE IF NOT EXISTS "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "due_date" DATE,
    "client_id" INTEGER,
    "project_id" INTEGER,
    "quotation_id" INTEGER,
    "company_id" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outstanding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_terms" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- Create table: invoice_items
CREATE TABLE IF NOT EXISTS "invoice_items" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- Create table: invoice_sequences
CREATE TABLE IF NOT EXISTS "invoice_sequences" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "year_month" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("id")
);

-- Create table: retention_trackings
CREATE TABLE IF NOT EXISTS "retention_trackings" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "payment_application_id" INTEGER NOT NULL,
    "pa_no" INTEGER NOT NULL,
    "retention_amount" DECIMAL(14,2) NOT NULL,
    "cumulative_retention" DECIMAL(14,2) NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_trackings_pkey" PRIMARY KEY ("id")
);

-- Create table: retention_releases
CREATE TABLE IF NOT EXISTS "retention_releases" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "release_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "payment_in_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_releases_pkey" PRIMARY KEY ("id")
);

-- Create table: bank_accounts
CREATE TABLE IF NOT EXISTS "bank_accounts" (
    "id" SERIAL NOT NULL,
    "account_name" VARCHAR(200) NOT NULL,
    "bank_name" VARCHAR(200) NOT NULL,
    "account_no" VARCHAR(100) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'HKD',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- Create table: bank_transactions
CREATE TABLE IF NOT EXISTS "bank_transactions" (
    "id" SERIAL NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "debit_credit" VARCHAR(10) NOT NULL,
    "balance" DECIMAL(14,2),
    "reference_no" VARCHAR(200),
    "match_status" VARCHAR(20) NOT NULL DEFAULT 'unmatched',
    "matched_type" VARCHAR(30),
    "matched_id" INTEGER,
    "import_batch" VARCHAR(100),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- STEP 2: ADD COLUMN IF NOT EXISTS (for columns added after initial creation)
-- ============================================================

-- Add missing columns: users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password" TEXT NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'worker';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_by" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employee_id" INTEGER;

-- Add missing columns: companies
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "name_en" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "company_type" TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "internal_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "contact_person" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: company_profiles
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "chinese_name" TEXT NOT NULL;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "english_name" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "registration_date" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "br_number" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "br_expiry_date" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "cr_number" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "registered_address" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "directors" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "shareholders" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "secretary" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "subcontractor_reg_no" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "subcontractor_reg_date" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "subcontractor_reg_expiry" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "subcontractor_work_types" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "subcontractor_specialties" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "office_phone" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "office_fax" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "office_email" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "office_address" TEXT;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;

-- Add missing columns: employees
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "emp_code" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "name_zh" TEXT NOT NULL;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "name_en" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "nickname" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'worker';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "emergency_contact" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "join_date" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "termination_date" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "termination_reason" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "bank_name" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "bank_account" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "id_number" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "date_of_birth" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "frequent_vehicle" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "mpf_plan" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "mpf_account_number" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "mpf_employment_date" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "mpf_old_employment_date" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "salary_notes" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "driving_license_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "driving_license_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "driving_license_class" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "approved_worker_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "approved_worker_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "green_card_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "green_card_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "construction_card_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "construction_card_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "earth_mover_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "earth_mover_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "excavator_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "excavator_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "crane_operator_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "crane_operator_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "lorry_crane_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "lorry_crane_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "crawler_crane_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "crawler_crane_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "hydraulic_crane_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "hydraulic_crane_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "airport_pass_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "airport_pass_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gammon_pass_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gammon_pass_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "leighton_pass_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "leighton_pass_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "confined_space_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "confined_space_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "compactor_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "compactor_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "slinging_silver_card_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "slinging_silver_card_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "craft_test_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "craft_test_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "compaction_load_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "compaction_load_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "aerial_platform_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "aerial_platform_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "site_rigging_a12_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "site_rigging_a12_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "slinging_signaler_a12s_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "slinging_signaler_a12s_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "zero_injury_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "zero_injury_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "designated_trade_safety_cert_no" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "designated_trade_safety_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "small_loader_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "safety_supervisor_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "safe_work_procedure_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "grinding_wheel_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "ship_cargo_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "arc_welding_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gas_welding_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "clp_safety_cert_expiry" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "other_certificates" JSONB;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "cert_photos" JSONB;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "company_id" INTEGER NOT NULL;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: employee_salary_settings
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "employee_id" INTEGER NOT NULL;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "effective_date" DATE NOT NULL;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "base_salary" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "salary_type" TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "allowance_night" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "allowance_rent" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "allowance_3runway" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "ot_rate_standard" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "allowance_well" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "allowance_machine" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "allowance_roller" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "allowance_crane" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "allowance_move_machine" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "allowance_kwh_night" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "allowance_mid_shift" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "ot_1800_1900" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "ot_1900_2000" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "ot_0600_0700" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "ot_0700_0800" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "ot_mid_shift" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "mid_shift_ot_allowance" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "custom_allowances" JSONB;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "is_piece_rate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "fleet_rate_card_id" INTEGER;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "change_type" TEXT;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "change_amount" DECIMAL(10,2);
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "employee_salary_settings" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: employee_transfers
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "employee_id" INTEGER NOT NULL;
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "from_company_id" INTEGER NOT NULL;
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "to_company_id" INTEGER NOT NULL;
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "transfer_date" DATE NOT NULL;
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: vehicles
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "plate_number" TEXT NOT NULL;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "machine_type" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "tonnage" DECIMAL(5,1);
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "owner_company_id" INTEGER NOT NULL;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "insurance_expiry" DATE;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "permit_fee_expiry" DATE;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "inspection_date" DATE;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "license_expiry" DATE;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: vehicle_plate_history
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "vehicle_id" INTEGER NOT NULL;
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "old_plate" TEXT NOT NULL;
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "new_plate" TEXT NOT NULL;
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "change_date" DATE NOT NULL;
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: vehicle_transfers
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "vehicle_id" INTEGER NOT NULL;
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "from_company_id" INTEGER NOT NULL;
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "to_company_id" INTEGER NOT NULL;
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "transfer_date" DATE NOT NULL;
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: machinery
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "machine_code" TEXT NOT NULL;
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "machine_type" TEXT;
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "tonnage" DECIMAL(5,1);
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "serial_number" TEXT;
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "owner_company_id" INTEGER NOT NULL;
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "inspection_cert_expiry" DATE;
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "insurance_expiry" DATE;
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "machinery" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: machinery_transfers
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "machinery_id" INTEGER NOT NULL;
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "from_company_id" INTEGER NOT NULL;
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "to_company_id" INTEGER NOT NULL;
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "transfer_date" DATE NOT NULL;
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: partners
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "english_code" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "name_en" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "partner_type" TEXT NOT NULL;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "contact_person" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "mobile" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "fax" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "bank_name" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "bank_account" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "invoice_title" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "invoice_description" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "quotation_remarks" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "invoice_remarks" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "is_subsidiary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "subsidiaries" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: contracts
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "contract_no" VARCHAR(50) NOT NULL;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "client_id" INTEGER NOT NULL;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "contract_name" VARCHAR(200) NOT NULL;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "sign_date" DATE;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "start_date" DATE;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "end_date" DATE;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "original_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "retention_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.10;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "retention_cap_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.05;

-- Add missing columns: contract_bq_sections
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER NOT NULL;
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "section_code" VARCHAR(20) NOT NULL;
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "section_name" VARCHAR(200) NOT NULL;
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: contract_bq_items
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER NOT NULL;
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "section_id" INTEGER;
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "item_no" VARCHAR(30) NOT NULL;
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL;
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "unit" VARCHAR(20);
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "unit_rate" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "contract_bq_items" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: variation_orders
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER NOT NULL;
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "vo_no" VARCHAR(30) NOT NULL;
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "title" VARCHAR(200) NOT NULL;
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "submitted_date" DATE;
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "approved_date" DATE;
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "approved_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "variation_orders" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: variation_order_items
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "variation_order_id" INTEGER NOT NULL;
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "item_no" VARCHAR(30) NOT NULL;
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL;
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "unit" VARCHAR(20);
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "unit_rate" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "variation_order_items" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "project_no" TEXT NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "project_name" TEXT NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "company_id" INTEGER NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "client_id" INTEGER;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "start_date" DATE;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "end_date" DATE;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER;

-- Add missing columns: project_sequences
ALTER TABLE "project_sequences" ADD COLUMN IF NOT EXISTS "prefix" TEXT NOT NULL;
ALTER TABLE "project_sequences" ADD COLUMN IF NOT EXISTS "year" TEXT NOT NULL;
ALTER TABLE "project_sequences" ADD COLUMN IF NOT EXISTS "last_seq" INTEGER NOT NULL DEFAULT 0;

-- Add missing columns: quotations
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "quotation_no" TEXT NOT NULL;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "quotation_type" TEXT NOT NULL DEFAULT 'project';
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "company_id" INTEGER NOT NULL;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "client_id" INTEGER;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "quotation_date" DATE NOT NULL;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "contract_name" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "project_name" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "validity_period" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "payment_terms" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "exclusions" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "external_remark" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "internal_remark" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: quotation_items
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "quotation_id" INTEGER NOT NULL;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "item_name" TEXT;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "item_description" TEXT;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "remarks" TEXT;

-- Add missing columns: quotation_sequences
ALTER TABLE "quotation_sequences" ADD COLUMN IF NOT EXISTS "prefix" TEXT NOT NULL;
ALTER TABLE "quotation_sequences" ADD COLUMN IF NOT EXISTS "year_month" TEXT NOT NULL;
ALTER TABLE "quotation_sequences" ADD COLUMN IF NOT EXISTS "last_seq" INTEGER NOT NULL DEFAULT 0;

-- Add missing columns: rate_cards
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "company_id" INTEGER NOT NULL;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "client_id" INTEGER NOT NULL;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "contract_no" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "day_night" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "tonnage" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "machine_type" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "equipment_number" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "origin" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "destination" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "day_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "day_unit" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "night_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "night_unit" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "mid_shift_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "mid_shift_unit" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "ot_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "ot_unit" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "effective_date" DATE;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "expiry_date" DATE;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "source_quotation_id" INTEGER;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "rate_card_type" TEXT NOT NULL DEFAULT 'rental';
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: rate_card_ot_rates
ALTER TABLE "rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "rate_card_id" INTEGER NOT NULL;
ALTER TABLE "rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "time_slot" TEXT NOT NULL;
ALTER TABLE "rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "unit" TEXT;

-- Add missing columns: fleet_rate_cards
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "client_id" INTEGER;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "contract_no" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "day_night" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "tonnage" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "machine_type" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "equipment_number" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "origin" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "destination" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "day_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "night_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "mid_shift_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "ot_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "effective_date" DATE;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "expiry_date" DATE;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "source_quotation_id" INTEGER;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: subcon_rate_cards
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "subcon_id" INTEGER;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "plate_no" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "client_id" INTEGER;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "contract_no" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "day_night" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "tonnage" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "machine_type" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "equipment_number" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "origin" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "destination" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "day_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "day_unit" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "night_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "night_unit" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "mid_shift_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "mid_shift_unit" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "ot_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "ot_unit" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "exclude_fuel" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "effective_date" DATE;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "expiry_date" DATE;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "source_quotation_id" INTEGER;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: fleet_rate_card_ot_rates
ALTER TABLE "fleet_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "fleet_rate_card_id" INTEGER NOT NULL;
ALTER TABLE "fleet_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "time_slot" TEXT NOT NULL;
ALTER TABLE "fleet_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "fleet_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "unit" TEXT;

-- Add missing columns: subcon_rate_card_ot_rates
ALTER TABLE "subcon_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "subcon_rate_card_id" INTEGER NOT NULL;
ALTER TABLE "subcon_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "time_slot" TEXT NOT NULL;
ALTER TABLE "subcon_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "subcon_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "unit" TEXT;

-- Add missing columns: custom_fields
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "module" TEXT NOT NULL;
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "field_name" TEXT NOT NULL;
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "field_type" TEXT NOT NULL;
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "options" TEXT;
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "is_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "has_expiry_alert" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: custom_field_values
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "custom_field_id" INTEGER NOT NULL;
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "entity_id" INTEGER NOT NULL;
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "module" TEXT NOT NULL;
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "value" TEXT;
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: documents
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "entity_type" TEXT NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "entity_id" INTEGER NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "doc_type" TEXT NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_name" TEXT NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_path" TEXT NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_size" INTEGER;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "expiry_date" DATE;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: field_options
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL;
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "label" TEXT NOT NULL;
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: work_logs
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "publisher_id" INTEGER;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'editing';
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "scheduled_date" DATE;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "company_profile_id" INTEGER;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "client_id" INTEGER;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "quotation_id" INTEGER;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "employee_id" INTEGER;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "machine_type" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "equipment_number" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "equipment_source" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "tonnage" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "day_night" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "start_location" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "start_time" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "end_location" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "end_time" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(10,2);
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "ot_quantity" DECIMAL(10,2);
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "ot_unit" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "is_mid_shift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "goods_quantity" DECIMAL(10,2);
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "matched_rate_card_id" INTEGER;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "matched_rate" DECIMAL(12,2);
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "matched_unit" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "matched_ot_rate" DECIMAL(12,2);
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "price_match_status" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "price_match_note" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "receipt_no" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "work_order_no" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "is_confirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "is_paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "unverified_client_name" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;

-- Add missing columns: payrolls
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "period" TEXT NOT NULL;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "date_from" DATE;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "date_to" DATE;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "employee_id" INTEGER NOT NULL;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "company_profile_id" INTEGER;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "salary_type" TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "base_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "work_days" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "allowance_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "ot_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "commission_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "mpf_deduction" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "mpf_plan" TEXT;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "mpf_employer" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "adjustment_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "payment_date" DATE;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "cheque_number" TEXT;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: payroll_items
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "payroll_id" INTEGER NOT NULL;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "item_type" TEXT NOT NULL;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "item_name" TEXT NOT NULL;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Add missing columns: payroll_work_logs
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "payroll_id" INTEGER NOT NULL;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "work_log_id" INTEGER;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "scheduled_date" DATE;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "day_night" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "start_location" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "end_location" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "machine_type" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "tonnage" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "equipment_number" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(10,2);
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "ot_quantity" DECIMAL(10,2);
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "ot_unit" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "is_mid_shift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "matched_rate_card_id" INTEGER;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "matched_rate" DECIMAL(12,2);
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "matched_unit" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "matched_ot_rate" DECIMAL(12,2);
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "matched_mid_shift_rate" DECIMAL(12,2);
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "price_match_status" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "price_match_note" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "line_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "ot_line_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "mid_shift_line_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "group_key" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "client_id" INTEGER;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "client_name" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "company_profile_id" INTEGER;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "company_profile_name" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "quotation_id" INTEGER;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "contract_no" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "is_modified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "is_excluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: payroll_adjustments
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "payroll_id" INTEGER NOT NULL;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "item_name" TEXT NOT NULL;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: payroll_daily_allowances
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "payroll_id" INTEGER NOT NULL;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "date" DATE NOT NULL;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "allowance_key" TEXT NOT NULL;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "allowance_name" TEXT NOT NULL;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: subcontractor_fleet_drivers
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "subcontractor_id" INTEGER NOT NULL;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "short_name" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "name_zh" TEXT NOT NULL;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "name_en" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "id_number" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "machine_type" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "plate_no" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "date_of_birth" DATE;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "yellow_cert_no" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "red_cert_no" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "has_d_cert" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "is_cert_returned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: employee_attendances
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "employee_id" INTEGER NOT NULL;
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "user_id" INTEGER;
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL;
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "photo_url" TEXT;
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "employee_attendances" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: employee_leaves
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "employee_id" INTEGER NOT NULL;
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "user_id" INTEGER;
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "leave_type" TEXT NOT NULL;
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "date_from" DATE NOT NULL;
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "date_to" DATE NOT NULL;
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "days" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "approved_by" INTEGER;
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "employee_leaves" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: expense_categories
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "parent_id" INTEGER;
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "type" VARCHAR(20);
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: expenses
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "date" DATE NOT NULL;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "supplier_name" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "supplier_partner_id" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "category_id" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "employee_id" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "item" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "is_paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "payment_date" DATE;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "payment_ref" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'MANUAL';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "source_ref_id" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "machine_code" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "machinery_id" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "client_id" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "quotation_id" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: expense_items
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "expense_id" INTEGER NOT NULL;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: expense_attachments
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "expense_id" INTEGER NOT NULL;
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "file_name" TEXT NOT NULL;
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "file_url" TEXT NOT NULL;
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "file_size" INTEGER;
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: payment_applications
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER NOT NULL;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "pa_no" INTEGER NOT NULL;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "reference" VARCHAR(100) NOT NULL;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "period_from" DATE;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "period_to" DATE NOT NULL;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "submission_date" DATE;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "certification_date" DATE;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "payment_due_date" DATE;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "bq_work_done" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "vo_work_done" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "cumulative_work_done" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "materials_on_site" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "gross_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "retention_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "after_retention" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "other_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "certified_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "prev_certified_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "current_due" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "client_certified_amount" DECIMAL(14,2);
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "client_current_due" DECIMAL(14,2);
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "paid_date" DATE;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_applications" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: payment_bq_progress
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "payment_application_id" INTEGER NOT NULL;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "bq_item_id" INTEGER NOT NULL;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "prev_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "current_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "this_period_qty" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "unit_rate" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "prev_cumulative_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "current_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "this_period_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_bq_progress" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: payment_vo_progress
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "payment_application_id" INTEGER NOT NULL;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "vo_item_id" INTEGER NOT NULL;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "prev_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "current_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "this_period_qty" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "unit_rate" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "prev_cumulative_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "current_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "this_period_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_vo_progress" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: payment_deductions
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "payment_application_id" INTEGER NOT NULL;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "deduction_type" VARCHAR(50) NOT NULL;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "description" VARCHAR(500) NOT NULL;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: payment_materials
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "payment_application_id" INTEGER NOT NULL;
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "description" VARCHAR(500) NOT NULL;
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: payment_ins
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "date" DATE NOT NULL;
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL;
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "source_type" VARCHAR(30) NOT NULL;
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "source_ref_id" INTEGER;
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER;
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "bank_account" VARCHAR(100);
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "reference_no" VARCHAR(100);
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: payment_outs
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "date" DATE NOT NULL;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "expense_id" INTEGER;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "bank_account" VARCHAR(100);
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "reference_no" VARCHAR(100);
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "invoice_no" TEXT NOT NULL;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "date" DATE NOT NULL;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "due_date" DATE;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "client_id" INTEGER;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "quotation_id" INTEGER;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "company_id" INTEGER NOT NULL;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "status" VARCHAR(30) NOT NULL DEFAULT 'draft';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "outstanding" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payment_terms" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: invoice_items
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "invoice_id" INTEGER NOT NULL;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Add missing columns: invoice_sequences
ALTER TABLE "invoice_sequences" ADD COLUMN IF NOT EXISTS "prefix" TEXT NOT NULL;
ALTER TABLE "invoice_sequences" ADD COLUMN IF NOT EXISTS "year_month" TEXT NOT NULL;
ALTER TABLE "invoice_sequences" ADD COLUMN IF NOT EXISTS "last_seq" INTEGER NOT NULL DEFAULT 0;

-- Add missing columns: retention_trackings
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER NOT NULL;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "payment_application_id" INTEGER NOT NULL;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "pa_no" INTEGER NOT NULL;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "retention_amount" DECIMAL(14,2) NOT NULL;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "cumulative_retention" DECIMAL(14,2) NOT NULL;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: retention_releases
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER NOT NULL;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "release_date" DATE NOT NULL;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "reason" VARCHAR(200) NOT NULL;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "payment_in_id" INTEGER;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: bank_accounts
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "account_name" VARCHAR(200) NOT NULL;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "bank_name" VARCHAR(200) NOT NULL;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "account_no" VARCHAR(100) NOT NULL;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'HKD';
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns: bank_transactions
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "bank_account_id" INTEGER NOT NULL;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "date" DATE NOT NULL;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "debit_credit" VARCHAR(10) NOT NULL;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "balance" DECIMAL(14,2);
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "reference_no" VARCHAR(200);
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "match_status" VARCHAR(20) NOT NULL DEFAULT 'unmatched';
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "matched_type" VARCHAR(30);
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "matched_id" INTEGER;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "import_batch" VARCHAR(100);
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- STEP 3: Foreign keys (safe - skips if already exists)
-- ============================================================

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "employee_salary_settings" ADD CONSTRAINT "employee_salary_settings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_company_id_fkey" FOREIGN KEY ("owner_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_plate_history" ADD CONSTRAINT "vehicle_plate_history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "machinery" ADD CONSTRAINT "machinery_owner_company_id_fkey" FOREIGN KEY ("owner_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "machinery_transfers" ADD CONSTRAINT "machinery_transfers_machinery_id_fkey" FOREIGN KEY ("machinery_id") REFERENCES "machinery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "machinery_transfers" ADD CONSTRAINT "machinery_transfers_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "machinery_transfers" ADD CONSTRAINT "machinery_transfers_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contract_bq_sections" ADD CONSTRAINT "contract_bq_sections_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contract_bq_items" ADD CONSTRAINT "contract_bq_items_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contract_bq_items" ADD CONSTRAINT "contract_bq_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "contract_bq_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "variation_order_items" ADD CONSTRAINT "variation_order_items_variation_order_id_fkey" FOREIGN KEY ("variation_order_id") REFERENCES "variation_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "quotations" ADD CONSTRAINT "quotations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_source_quotation_id_fkey" FOREIGN KEY ("source_quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "rate_card_ot_rates" ADD CONSTRAINT "rate_card_ot_rates_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "fleet_rate_cards" ADD CONSTRAINT "fleet_rate_cards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "fleet_rate_cards" ADD CONSTRAINT "fleet_rate_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "fleet_rate_cards" ADD CONSTRAINT "fleet_rate_cards_source_quotation_id_fkey" FOREIGN KEY ("source_quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" ADD CONSTRAINT "subcon_rate_cards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" ADD CONSTRAINT "subcon_rate_cards_subcon_id_fkey" FOREIGN KEY ("subcon_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" ADD CONSTRAINT "subcon_rate_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" ADD CONSTRAINT "subcon_rate_cards_source_quotation_id_fkey" FOREIGN KEY ("source_quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "fleet_rate_card_ot_rates" ADD CONSTRAINT "fleet_rate_card_ot_rates_fleet_rate_card_id_fkey" FOREIGN KEY ("fleet_rate_card_id") REFERENCES "fleet_rate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "subcon_rate_card_ot_rates" ADD CONSTRAINT "subcon_rate_card_ot_rates_subcon_rate_card_id_fkey" FOREIGN KEY ("subcon_rate_card_id") REFERENCES "subcon_rate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_custom_field_id_fkey" FOREIGN KEY ("custom_field_id") REFERENCES "custom_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_company_profile_id_fkey" FOREIGN KEY ("company_profile_id") REFERENCES "company_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_company_profile_id_fkey" FOREIGN KEY ("company_profile_id") REFERENCES "company_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payroll_work_logs" ADD CONSTRAINT "payroll_work_logs_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payroll_work_logs" ADD CONSTRAINT "payroll_work_logs_work_log_id_fkey" FOREIGN KEY ("work_log_id") REFERENCES "work_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payroll_daily_allowances" ADD CONSTRAINT "payroll_daily_allowances_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "subcontractor_fleet_drivers" ADD CONSTRAINT "subcontractor_fleet_drivers_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "employee_attendances" ADD CONSTRAINT "employee_attendances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_partner_id_fkey" FOREIGN KEY ("supplier_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_machinery_id_fkey" FOREIGN KEY ("machinery_id") REFERENCES "machinery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_bq_progress" ADD CONSTRAINT "payment_bq_progress_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "payment_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_bq_progress" ADD CONSTRAINT "payment_bq_progress_bq_item_id_fkey" FOREIGN KEY ("bq_item_id") REFERENCES "contract_bq_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_vo_progress" ADD CONSTRAINT "payment_vo_progress_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "payment_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_vo_progress" ADD CONSTRAINT "payment_vo_progress_vo_item_id_fkey" FOREIGN KEY ("vo_item_id") REFERENCES "variation_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_deductions" ADD CONSTRAINT "payment_deductions_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "payment_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_materials" ADD CONSTRAINT "payment_materials_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "payment_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_ins" ADD CONSTRAINT "payment_ins_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_ins" ADD CONSTRAINT "payment_ins_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_outs" ADD CONSTRAINT "payment_outs_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_outs" ADD CONSTRAINT "payment_outs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "retention_trackings" ADD CONSTRAINT "retention_trackings_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "retention_trackings" ADD CONSTRAINT "retention_trackings_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "payment_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "retention_releases" ADD CONSTRAINT "retention_releases_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;