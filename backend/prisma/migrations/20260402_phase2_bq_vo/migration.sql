-- Phase 2: BQ (Bill of Quantities) + VO (Variation Orders)

-- Contract BQ Sections
CREATE TABLE "contract_bq_sections" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "section_code" VARCHAR(20) NOT NULL,
    "section_name" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_bq_sections_pkey" PRIMARY KEY ("id")
);

-- Contract BQ Items
CREATE TABLE "contract_bq_items" (
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

-- Variation Orders
CREATE TABLE "variation_orders" (
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

-- Variation Order Items
CREATE TABLE "variation_order_items" (
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

-- Unique constraints
CREATE UNIQUE INDEX "contract_bq_sections_contract_id_section_code_key" ON "contract_bq_sections"("contract_id", "section_code");
CREATE UNIQUE INDEX "contract_bq_items_contract_id_item_no_key" ON "contract_bq_items"("contract_id", "item_no");
CREATE UNIQUE INDEX "variation_orders_contract_id_vo_no_key" ON "variation_orders"("contract_id", "vo_no");

-- Foreign keys
ALTER TABLE "contract_bq_sections" ADD CONSTRAINT "contract_bq_sections_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_bq_items" ADD CONSTRAINT "contract_bq_items_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_bq_items" ADD CONSTRAINT "contract_bq_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "contract_bq_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "variation_order_items" ADD CONSTRAINT "variation_order_items_variation_order_id_fkey" FOREIGN KEY ("variation_order_id") REFERENCES "variation_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
