"use strict";
/**
 * fix-payment-method.ts
 *
 * Corrects payment_method values for imported PaymentIn records.
 * Rules based on reference_no:
 *   - Pure 6-digit number (e.g. 100158)          → 支票
 *   - Letters/symbols + digits (e.g. BOC006770)  → 支票
 *   - 7-digit number (e.g. 8137814)              → 銀行轉帳
 *   - Anything else (including null/empty)        → 銀行轉帳
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
function classify(referenceNo) {
    if (!referenceNo || referenceNo.trim() === '')
        return '銀行轉帳';
    const ref = referenceNo.trim();
    // Pure 6-digit number → 支票
    if (/^\d{6}$/.test(ref))
        return '支票';
    // Letters/symbols + digits combination → 支票
    if (/^[A-Za-z#]+\d+$/.test(ref) || /^[A-Za-z]+[#]?\d+$/.test(ref))
        return '支票';
    // 7-digit number → 銀行轉帳
    if (/^\d{7}$/.test(ref))
        return '銀行轉帳';
    // Fallback
    return '銀行轉帳';
}
async function main() {
    var _a;
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    // Find all records with English payment_method values
    const records = await prisma.paymentIn.findMany({
        where: {
            payment_method: { in: ['bank_transfer', 'cheque'] },
        },
        select: { id: true, payment_method: true, reference_no: true },
    });
    console.log(`Found ${records.length} records with English payment_method to fix.`);
    let chequeCount = 0;
    let bankTransferCount = 0;
    let skipped = 0;
    for (const record of records) {
        const newMethod = classify(record.reference_no);
        const oldMethod = record.payment_method;
        if (newMethod === oldMethod) {
            // Already correct (shouldn't happen since we're mapping English → Chinese)
            skipped++;
            continue;
        }
        if (newMethod === '支票')
            chequeCount++;
        else
            bankTransferCount++;
        console.log(`  [${record.id}] ref="${(_a = record.reference_no) !== null && _a !== void 0 ? _a : ''}" ${oldMethod} → ${newMethod}`);
        if (!DRY_RUN) {
            await prisma.paymentIn.update({
                where: { id: record.id },
                data: { payment_method: newMethod },
            });
        }
    }
    console.log('\n=== Summary ===');
    console.log(`Total to fix: ${records.length}`);
    console.log(`  → 支票:    ${chequeCount}`);
    console.log(`  → 銀行轉帳: ${bankTransferCount}`);
    console.log(`  Skipped:   ${skipped}`);
    if (DRY_RUN)
        console.log('\n[DRY RUN] No changes written.');
    else
        console.log('\n[DONE] All records updated.');
}
main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
