-- CreateTable: user_column_preferences
CREATE TABLE "user_column_preferences" (
    "ucp_id" SERIAL NOT NULL,
    "ucp_user_id" INTEGER,
    "ucp_page_key" VARCHAR(100) NOT NULL,
    "ucp_columns_config" JSONB NOT NULL DEFAULT '[]',
    "ucp_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ucp_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_column_preferences_pkey" PRIMARY KEY ("ucp_id")
);

-- CreateIndex: unique per user+page (null user_id = global default)
CREATE UNIQUE INDEX "user_column_preferences_ucp_user_id_ucp_page_key_key"
    ON "user_column_preferences"("ucp_user_id", "ucp_page_key");

-- CreateIndex: index on page_key for fast lookup
CREATE INDEX "user_column_preferences_ucp_page_key_idx"
    ON "user_column_preferences"("ucp_page_key");

-- AddForeignKey
ALTER TABLE "user_column_preferences"
    ADD CONSTRAINT "user_column_preferences_ucp_user_id_fkey"
    FOREIGN KEY ("ucp_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
