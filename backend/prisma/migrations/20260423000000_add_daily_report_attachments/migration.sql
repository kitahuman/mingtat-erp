-- CreateTable
CREATE TABLE "daily_report_attachments" (
    "id" SERIAL NOT NULL,
    "daily_report_attachment_report_id" INTEGER NOT NULL,
    "daily_report_attachment_file_name" VARCHAR(255) NOT NULL,
    "daily_report_attachment_file_url" TEXT NOT NULL,
    "daily_report_attachment_file_type" VARCHAR(100) NOT NULL,
    "daily_report_attachment_sort_order" INTEGER NOT NULL DEFAULT 0,
    "daily_report_attachment_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_report_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "daily_report_attachments" ADD CONSTRAINT "daily_report_attachments_daily_report_attachment_report_id_fkey" FOREIGN KEY ("daily_report_attachment_report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
