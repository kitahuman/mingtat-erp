-- Add fixed-expense marker to expense categories
ALTER TABLE "expense_categories"
ADD COLUMN "expense_category_is_fixed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "expense_categories_expense_category_is_fixed_idx"
ON "expense_categories"("expense_category_is_fixed");
