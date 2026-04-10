# Development Notes

## Key Findings

### Feature 1: Audit Log
- Need to add `audit_logs` table to Prisma schema
- Need backend module: controller, service, module
- Need frontend page at `/audit-logs`
- Add to page-permissions.ts and Sidebar.tsx

### Feature 2: Recycle Bin
- Need `deleted_at` field on key tables
- Need backend module for recycle bin
- Need frontend page at `/recycle-bin`
- Existing services do hard delete - need to change to soft delete
- All existing queries need `where: { deleted_at: null }` filter

### Feature 3: Expiry Reminders → 3 months
- dashboard.service.ts: `getAlerts()` uses 60 days (line 147-149)
- dashboard.service.ts: `getStats()` also uses 60 days (line 512-514)
- company-profiles.service.ts: `getExpiryAlerts()` uses 60 days (line 83-85)
- custom-fields.service.ts: `getExpiryAlerts()` uses 60 days (line 109-111)
- Summary buckets: critical <=7, warning 8-30, caution 31-60
- Need to change all to 90 days (3 months) and update buckets

### Feature 4: Employee Portal Work Report Attachments
- Work report photos: uploaded via `/employee-portal/upload-photo` to `uploads/employee-portal/`
- Photos stored as URLs in the filesystem
- BUT: `photo_urls` are NOT saved to the work_log record! The payload doesn't include them.
- The `signature_url` is embedded in remarks text, not a separate field
- WorkLog schema has NO photo_urls field
- Acceptance Report attachments: stored in `acceptance_report_attachments` table with file_url (base64 data URLs)
- Acceptance Report admin page does NOT display attachments currently
- Daily Report: has NO attachment support at all

### Tables to consider for soft delete (Recycle Bin)
- employees, vehicles, machinery, companies, projects, contracts, partners
- quotations, expenses, invoices, work_logs, rate_cards
- daily_reports, acceptance_reports
