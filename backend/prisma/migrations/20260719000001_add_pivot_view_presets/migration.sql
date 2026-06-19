-- CreateTable: pivot_view_presets
CREATE TABLE "pivot_view_presets" (
    "pvp_id" SERIAL NOT NULL,
    "pvp_user_id" INTEGER NOT NULL,
    "pvp_name" VARCHAR(100) NOT NULL,
    "pvp_config" JSONB NOT NULL DEFAULT '{}',
    "pvp_is_last" BOOLEAN NOT NULL DEFAULT false,
    "pvp_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pvp_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pivot_view_presets_pkey" PRIMARY KEY ("pvp_id")
);

-- CreateIndex: unique per user+name
CREATE UNIQUE INDEX "pivot_view_presets_pvp_user_id_pvp_name_key"
    ON "pivot_view_presets"("pvp_user_id", "pvp_name");

-- CreateIndex: index on user_id for fast lookup
CREATE INDEX "pivot_view_presets_pvp_user_id_idx"
    ON "pivot_view_presets"("pvp_user_id");

-- AddForeignKey
ALTER TABLE "pivot_view_presets"
    ADD CONSTRAINT "pivot_view_presets_pvp_user_id_fkey"
    FOREIGN KEY ("pvp_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
