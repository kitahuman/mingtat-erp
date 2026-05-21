-- CreateTable
CREATE TABLE "attachments" (
    "id" SERIAL NOT NULL,
    "attachment_entity_type" VARCHAR(50) NOT NULL,
    "attachment_entity_id" INTEGER NOT NULL,
    "attachment_filename" TEXT NOT NULL,
    "attachment_stored_filename" TEXT NOT NULL,
    "attachment_file_path" TEXT NOT NULL,
    "attachment_file_url" TEXT NOT NULL,
    "attachment_file_size" INTEGER,
    "attachment_mime_type" TEXT,
    "attachment_uploaded_by" INTEGER,
    "attachment_description" TEXT,
    "attachment_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachment_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_attachment_entity_type_attachment_entity_id_idx" ON "attachments"("attachment_entity_type", "attachment_entity_id");

-- CreateIndex
CREATE INDEX "attachments_attachment_uploaded_by_idx" ON "attachments"("attachment_uploaded_by");
