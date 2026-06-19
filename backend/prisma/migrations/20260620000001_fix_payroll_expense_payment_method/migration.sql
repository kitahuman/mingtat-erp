-- Fix payroll-generated expenses to use COMPANY_PAID payment method
UPDATE "expenses" SET "expense_payment_method" = 'COMPANY_PAID' WHERE "source" = 'PAYROLL' AND "expense_payment_method" = 'SELF_PAID';
