-- CreateTable
CREATE TABLE "document_folders" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "parent_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_folders_parent_id_idx" ON "document_folders"("parent_id");

-- CreateIndex
CREATE INDEX "document_folders_created_by_idx" ON "document_folders"("created_by");

-- CreateIndex
CREATE INDEX "document_folders_deleted_at_idx" ON "document_folders"("deleted_at");

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
