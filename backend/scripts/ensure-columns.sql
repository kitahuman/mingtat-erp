-- ensure-columns.sql
-- Ensures all columns exist in the database.
-- Safe to run multiple times (uses ADD COLUMN IF NOT EXISTS).
-- Generated from Prisma schema.

-- Table: users
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

-- Table: companies
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

-- Table: company_profiles
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

-- Table: employees
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

-- Table: employee_salary_settings
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

-- Table: employee_transfers
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "employee_id" INTEGER NOT NULL;
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "from_company_id" INTEGER NOT NULL;
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "to_company_id" INTEGER NOT NULL;
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "transfer_date" DATE NOT NULL;
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "employee_transfers" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: vehicles
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "plate_number" TEXT NOT NULL;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "vehicle_type" TEXT;
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

-- Table: vehicle_plate_history
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "vehicle_id" INTEGER NOT NULL;
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "old_plate" TEXT NOT NULL;
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "new_plate" TEXT NOT NULL;
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "change_date" DATE NOT NULL;
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "vehicle_plate_history" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: vehicle_transfers
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "vehicle_id" INTEGER NOT NULL;
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "from_company_id" INTEGER NOT NULL;
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "to_company_id" INTEGER NOT NULL;
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "transfer_date" DATE NOT NULL;
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "vehicle_transfers" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: machinery
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

-- Table: machinery_transfers
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "machinery_id" INTEGER NOT NULL;
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "from_company_id" INTEGER NOT NULL;
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "to_company_id" INTEGER NOT NULL;
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "transfer_date" DATE NOT NULL;
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "machinery_transfers" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: partners
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

-- Table: contracts
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

-- Table: contract_bq_sections
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER NOT NULL;
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "section_code" VARCHAR(20) NOT NULL;
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "section_name" VARCHAR(200) NOT NULL;
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "contract_bq_sections" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: contract_bq_items
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

-- Table: variation_orders
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

-- Table: variation_order_items
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

-- Table: projects
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

-- Table: project_sequences
ALTER TABLE "project_sequences" ADD COLUMN IF NOT EXISTS "prefix" TEXT NOT NULL;
ALTER TABLE "project_sequences" ADD COLUMN IF NOT EXISTS "year" TEXT NOT NULL;
ALTER TABLE "project_sequences" ADD COLUMN IF NOT EXISTS "last_seq" INTEGER NOT NULL DEFAULT 0;

-- Table: quotations
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

-- Table: quotation_items
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "quotation_id" INTEGER NOT NULL;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "item_name" TEXT;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "item_description" TEXT;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "remarks" TEXT;

-- Table: quotation_sequences
ALTER TABLE "quotation_sequences" ADD COLUMN IF NOT EXISTS "prefix" TEXT NOT NULL;
ALTER TABLE "quotation_sequences" ADD COLUMN IF NOT EXISTS "year_month" TEXT NOT NULL;
ALTER TABLE "quotation_sequences" ADD COLUMN IF NOT EXISTS "last_seq" INTEGER NOT NULL DEFAULT 0;

-- Table: rate_cards
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "company_id" INTEGER NOT NULL;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "client_id" INTEGER NOT NULL;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "contract_no" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "day_night" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "vehicle_tonnage" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "vehicle_type" TEXT;
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

-- Table: rate_card_ot_rates
ALTER TABLE "rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "rate_card_id" INTEGER NOT NULL;
ALTER TABLE "rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "time_slot" TEXT NOT NULL;
ALTER TABLE "rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "unit" TEXT;

-- Table: fleet_rate_cards
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "client_id" INTEGER;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "contract_no" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "day_night" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "vehicle_tonnage" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "vehicle_type" TEXT;
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

-- Table: subcon_rate_cards
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "subcon_id" INTEGER;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "plate_no" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "client_id" INTEGER;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "contract_no" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "day_night" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "vehicle_tonnage" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "vehicle_type" TEXT;
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

-- Table: fleet_rate_card_ot_rates
ALTER TABLE "fleet_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "fleet_rate_card_id" INTEGER NOT NULL;
ALTER TABLE "fleet_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "time_slot" TEXT NOT NULL;
ALTER TABLE "fleet_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "fleet_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "unit" TEXT;

-- Table: subcon_rate_card_ot_rates
ALTER TABLE "subcon_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "subcon_rate_card_id" INTEGER NOT NULL;
ALTER TABLE "subcon_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "time_slot" TEXT NOT NULL;
ALTER TABLE "subcon_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "subcon_rate_card_ot_rates" ADD COLUMN IF NOT EXISTS "unit" TEXT;

-- Table: custom_fields
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

-- Table: custom_field_values
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "custom_field_id" INTEGER NOT NULL;
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "entity_id" INTEGER NOT NULL;
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "module" TEXT NOT NULL;
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "value" TEXT;
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "custom_field_values" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: documents
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

-- Table: field_options
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL;
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "label" TEXT NOT NULL;
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "field_options" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: work_logs
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

-- Table: payrolls
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

-- Table: payroll_items
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "payroll_id" INTEGER NOT NULL;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "item_type" TEXT NOT NULL;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "item_name" TEXT NOT NULL;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Table: payroll_work_logs
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

-- Table: payroll_adjustments
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "payroll_id" INTEGER NOT NULL;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "item_name" TEXT NOT NULL;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: payroll_daily_allowances
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "payroll_id" INTEGER NOT NULL;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "date" DATE NOT NULL;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "allowance_key" TEXT NOT NULL;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "allowance_name" TEXT NOT NULL;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payroll_daily_allowances" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: subcontractor_fleet_drivers
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "subcontractor_id" INTEGER NOT NULL;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "short_name" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "name_zh" TEXT NOT NULL;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "name_en" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "id_number" TEXT;
ALTER TABLE "subcontractor_fleet_drivers" ADD COLUMN IF NOT EXISTS "vehicle_type" TEXT;
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

-- Table: employee_attendances
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

-- Table: employee_leaves
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

-- Table: expense_categories
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "parent_id" INTEGER;
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "type" VARCHAR(20);
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: expenses
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

-- Table: expense_items
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "expense_id" INTEGER NOT NULL;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "expense_items" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: expense_attachments
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "expense_id" INTEGER NOT NULL;
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "file_name" TEXT NOT NULL;
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "file_url" TEXT NOT NULL;
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "file_size" INTEGER;
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;
ALTER TABLE "expense_attachments" ADD COLUMN IF NOT EXISTS "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: payment_applications
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

-- Table: payment_bq_progress
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

-- Table: payment_vo_progress
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

-- Table: payment_deductions
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "payment_application_id" INTEGER NOT NULL;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "deduction_type" VARCHAR(50) NOT NULL;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "description" VARCHAR(500) NOT NULL;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_deductions" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: payment_materials
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "payment_application_id" INTEGER NOT NULL;
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "description" VARCHAR(500) NOT NULL;
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_materials" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: payment_ins
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

-- Table: payment_outs
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "date" DATE NOT NULL;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "expense_id" INTEGER;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "bank_account" VARCHAR(100);
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "reference_no" VARCHAR(100);
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: invoices
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

-- Table: invoice_items
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "invoice_id" INTEGER NOT NULL;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Table: invoice_sequences
ALTER TABLE "invoice_sequences" ADD COLUMN IF NOT EXISTS "prefix" TEXT NOT NULL;
ALTER TABLE "invoice_sequences" ADD COLUMN IF NOT EXISTS "year_month" TEXT NOT NULL;
ALTER TABLE "invoice_sequences" ADD COLUMN IF NOT EXISTS "last_seq" INTEGER NOT NULL DEFAULT 0;

-- Table: retention_trackings
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER NOT NULL;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "payment_application_id" INTEGER NOT NULL;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "pa_no" INTEGER NOT NULL;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "retention_amount" DECIMAL(14,2) NOT NULL;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "cumulative_retention" DECIMAL(14,2) NOT NULL;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "retention_trackings" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: retention_releases
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER NOT NULL;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "release_date" DATE NOT NULL;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(14,2) NOT NULL;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "reason" VARCHAR(200) NOT NULL;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "payment_in_id" INTEGER;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "retention_releases" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: bank_accounts
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "account_name" VARCHAR(200) NOT NULL;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "bank_name" VARCHAR(200) NOT NULL;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "account_no" VARCHAR(100) NOT NULL;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'HKD';
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Table: bank_transactions
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
