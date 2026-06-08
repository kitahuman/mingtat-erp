-- CreateTable
CREATE TABLE "ai_activity_logs" (
    "id" SERIAL NOT NULL,
    "activity_module_code" VARCHAR(50) NOT NULL,
    "activity_type" VARCHAR(50) NOT NULL,
    "activity_action" VARCHAR(100) NOT NULL,
    "activity_description" TEXT NOT NULL,
    "activity_reason" TEXT,
    "activity_input_summary" TEXT,
    "activity_output_summary" TEXT,
    "activity_result" VARCHAR(30),
    "activity_confidence" DECIMAL(5,2),
    "activity_knowledge_used" JSONB,
    "activity_knowledge_gained" JSONB,
    "activity_entity_type" VARCHAR(50),
    "activity_entity_id" INTEGER,
    "activity_user_id" INTEGER,
    "activity_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_activity_logs_activity_module_code_idx" ON "ai_activity_logs"("activity_module_code");

-- CreateIndex
CREATE INDEX "ai_activity_logs_activity_type_idx" ON "ai_activity_logs"("activity_type");

-- CreateIndex
CREATE INDEX "ai_activity_logs_activity_created_at_idx" ON "ai_activity_logs"("activity_created_at");

-- CreateIndex
CREATE INDEX "ai_activity_logs_activity_entity_type_activity_entity_id_idx" ON "ai_activity_logs"("activity_entity_type", "activity_entity_id");
