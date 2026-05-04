-- Add WhatsApp reported-at timestamp captured from the original WhatsApp message time.
ALTER TABLE "work_logs" ADD COLUMN "wl_whatsapp_reported_at" TIMESTAMP(3);

-- Support filtering and sorting work logs by WhatsApp reported time.
CREATE INDEX "work_logs_wl_whatsapp_reported_at_idx" ON "work_logs"("wl_whatsapp_reported_at");
