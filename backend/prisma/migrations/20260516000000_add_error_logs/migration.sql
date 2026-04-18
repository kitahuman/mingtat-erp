-- CreateTable
CREATE TABLE "error_logs" (
    "id" SERIAL NOT NULL,
    "error_log_timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_log_method" VARCHAR(10) NOT NULL,
    "error_log_path" VARCHAR(500) NOT NULL,
    "error_log_status_code" INTEGER NOT NULL,
    "error_log_message" TEXT NOT NULL,
    "error_log_stack" TEXT,
    "error_log_user_id" INTEGER,
    "error_log_username" VARCHAR(100),
    "error_log_request_body" JSONB,
    "error_log_notified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_logs_error_log_timestamp_idx" ON "error_logs"("error_log_timestamp");

-- CreateIndex
CREATE INDEX "error_logs_error_log_status_code_idx" ON "error_logs"("error_log_status_code");

-- CreateIndex
CREATE INDEX "error_logs_error_log_path_idx" ON "error_logs"("error_log_path");
