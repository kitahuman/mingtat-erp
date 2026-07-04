/**
 * Test harness for BqImportService.parseFile — runs the same extraction + LLM
 * parsing pipeline as the API endpoint, against sample files, without the DB.
 *
 * Usage: npx ts-node -T test-bq-import.ts <file1> [file2 ...]
 */
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';
import { BqImportService } from '../bq-items/bq-import.service';

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: npx ts-node -T test-bq-import.ts <file1> [file2 ...]');
    process.exit(1);
  }

  const service = new BqImportService(null as any);

  for (const filePath of files) {
    const name = basename(filePath);
    console.log(`\n════════ ${name} ════════`);
    const buffer = readFileSync(filePath);
    const fakeFile = {
      originalname: Buffer.from(name, 'utf8').toString('latin1'),
      mimetype: name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    } as Express.Multer.File;

    const started = Date.now();
    try {
      const result = await service.parseFile(fakeFile);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`✓ Parsed in ${elapsed}s — ${result.items.length} items, ${result.sections.length} sections, total ${result.total_amount}`);
      console.log('Sections:', result.sections.join(' / ') || '(none)');
      if (result.warnings.length) console.log('Warnings:', result.warnings.slice(0, 10));
      console.log('First 12 items:');
      for (const it of result.items.slice(0, 12)) {
        console.log(
          `  [${it.item_no}] qty=${it.quantity} ${it.unit} rate=${it.rate} amt=${it.amount} sec="${it.section.slice(0, 30)}" | ${it.description.slice(0, 50).replace(/\n/g, ' ')}`,
        );
      }
      const outPath = `/tmp/bq-parse-${name.replace(/[^\w.-]/g, '_')}.json`;
      writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(`Full result: ${outPath}`);
    } catch (err: any) {
      console.error(`✗ FAILED: ${err.message}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
