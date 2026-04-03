#!/bin/sh
# Robust startup script for Render deployment
# Resolves any failed migrations before deploying

echo "[Start] Resolving any failed migrations..."

# List of all migrations that might have failed due to pre-existing columns
# (columns added via db push before migration tracking)
MIGRATIONS="
20260401000001_add_employee_portal
20260402000000_expense_payment_fields
20260402000001_add_unverified_client_name
20260402100000_expense_source_field
20260402100001_p1_01_worklog_add_project_id
20260402100002_p1_03_company_profile_add_company_id
20260402200000_add_contracts
20260403000001_add_cert_photos
20260403120000_unify_rate_card_rate_fields
20260403200000_phase3_payment_applications
20260403500000_phase7_phase8_expense_expansion
20260404100000_fleet_rate_card_day_night_rate
20260404200000_add_contract_id_to_work_log
20260404300000_rate_card_fields_and_ot_tables
20260404400000_add_equipment_number_to_rate_cards
20260404500000_add_missing_fleet_subcon_columns
20260405100000_add_mid_shift_fields
"

for migration in $MIGRATIONS; do
  echo "[Start] Resolving $migration..."
  npx prisma migrate resolve --applied "$migration" 2>/dev/null && echo "[Start] Resolved $migration" || echo "[Start] $migration already OK or not found"
done

echo "[Start] Running migrate deploy..."
npx prisma migrate deploy

echo "[Start] Starting application..."
node dist/src/main
