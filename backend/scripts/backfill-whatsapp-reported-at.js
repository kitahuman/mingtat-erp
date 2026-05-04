#!/usr/bin/env node
/*
 * Backfill work_logs.wl_whatsapp_reported_at from legacy WhatsApp remarks.
 *
 * Safety rules:
 * - Dry-run by default; pass --apply to update records.
 * - Only updates rows where wl_whatsapp_reported_at IS NULL.
 * - Only updates rows whose remarks contain a supported WhatsApp reported time pattern.
 * - Parsed times are treated as Asia/Hong_Kong local time and stored as UTC DateTime.
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' node backend/scripts/backfill-whatsapp-reported-at.js
 *   DATABASE_URL='postgresql://...' node backend/scripts/backfill-whatsapp-reported-at.js --apply
 *
 * Or provide DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT.
 */

const { Client } = require('pg');

const apply = process.argv.includes('--apply');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

function createClient() {
  if (process.env.DATABASE_URL) {
    return new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }

  return new Client({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 5432),
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
}

function normalizeDigits(input) {
  const fullWidth = '０１２３４５６７８９';
  return String(input).replace(/[０-９]/g, (char) => String(fullWidth.indexOf(char)));
}

function toUtcFromHongKongLocal(year, month, day, hour, minute, second = 0) {
  const utcMs = Date.UTC(year, month - 1, day, hour - 8, minute, second, 0);
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) return null;
  return date;
}

function parseWhatsappReportedAt(remarks) {
  if (!remarks) return null;
  const text = normalizeDigits(remarks).replace(/[：]/g, ':');

  const patterns = [
    /日期時間\s*:\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?/i,
    /WhatsApp\s*打卡\D{0,20}(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?/i,
    /(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const [, y, mo, d, h, mi, s] = match;
    return toUtcFromHongKongLocal(Number(y), Number(mo), Number(d), Number(h), Number(mi), s ? Number(s) : 0);
  }

  return null;
}

async function main() {
  const client = createClient();
  await client.connect();

  try {
    const queryLimit = Number.isFinite(limit) && limit > 0 ? `LIMIT ${Math.floor(limit)}` : '';
    const result = await client.query(`
      SELECT id, remarks
      FROM work_logs
      WHERE wl_whatsapp_reported_at IS NULL
        AND remarks IS NOT NULL
        AND remarks ILIKE '%WhatsApp%'
      ORDER BY id ASC
      ${queryLimit}
    `);

    let matched = 0;
    let updated = 0;
    const unmatchedSamples = [];

    for (const row of result.rows) {
      const parsed = parseWhatsappReportedAt(row.remarks);
      if (!parsed) {
        if (unmatchedSamples.length < 10) {
          unmatchedSamples.push({ id: row.id, remarks: String(row.remarks).replace(/\s+/g, ' ').slice(0, 180) });
        }
        continue;
      }

      matched += 1;
      if (apply) {
        const update = await client.query(
          `UPDATE work_logs
           SET wl_whatsapp_reported_at = $1, updated_at = NOW()
           WHERE id = $2 AND wl_whatsapp_reported_at IS NULL`,
          [parsed, row.id],
        );
        updated += update.rowCount;
      }
    }

    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', scanned: result.rowCount, matched, updated, unmatched_samples: unmatchedSamples }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
