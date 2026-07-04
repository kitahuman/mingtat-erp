-- CreateTable: project_cost_rates (工程內部成本單價)
CREATE TABLE "project_cost_rates" (
    "id" SERIAL NOT NULL,
    "project_cost_rate_project_id" INTEGER NOT NULL,
    "project_cost_rate_category" VARCHAR(30) NOT NULL,
    "project_cost_rate_type" VARCHAR(100) NOT NULL,
    "project_cost_rate_tonnage" DECIMAL(5,1),
    "project_cost_rate_day_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "project_cost_rate_ot_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "project_cost_rate_remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_cost_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_cost_rates_project_cost_rate_project_id_project_co_key" ON "project_cost_rates"("project_cost_rate_project_id", "project_cost_rate_category", "project_cost_rate_type");

-- AddForeignKey
ALTER TABLE "project_cost_rates" ADD CONSTRAINT "project_cost_rates_project_cost_rate_project_id_fkey" FOREIGN KEY ("project_cost_rate_project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
