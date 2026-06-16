import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parse } = require('csv-parse/sync');

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.env.DRY_RUN !== 'false';
  const csvPath = process.env.CSV_PATH || path.join(__dirname, 'data', 'payment-in-import.csv');

  console.log(`=== Payment Import Script ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (writing to DB)'}`);
  console.log(`CSV Path: ${csvPath}`);
  console.log('');

  if (!fs.existsSync(csvPath)) {
    console.error(`ERROR: CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records: any[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  console.log(`Total records in CSV: ${records.length}`);

  // Cache all invoice_no from DB
  const allInvoices = await prisma.invoice.findMany({
    where: { deleted_at: null },
    select: { id: true, invoice_no: true, status: true, total_amount: true, paid_amount: true, outstanding: true },
  });
  const invoiceMap = new Map(allInvoices.map(inv => [inv.invoice_no, inv]));

  // Cache companies
  const companies = await prisma.company.findMany({
    where: { deleted_at: null },
    select: { id: true, internal_prefix: true },
  });
  const companyMap = new Map();
  companies.forEach(c => {
    if (c.internal_prefix) companyMap.set(c.internal_prefix, c.id);
  });

  // --- Collect analysis lists ---
  const missingInvoiceRows: any[] = [];
  const negativeAmountRows: any[] = [];
  const toImport: any[] = [];
  let missingDateCount = 0;

  for (const record of records) {
    const invoiceNo = record['發票']?.trim() || '';
    const amountStr = record['總額']?.trim() || '';
    const amount = parseFloat(amountStr);
    const paymentDateStr = record['付款日期']?.trim() || '';
    const referenceNo = record['支票']?.trim() || '';
    const companyPrefix = record['公司']?.trim() || '';
    const clientName = record['客戶']?.trim() || '';
    const description = record['描述']?.trim() || '';

    const rowSummary = {
      invoiceNo,
      company: companyPrefix,
      client: clientName,
      amount: amountStr,
      paymentDate: paymentDateStr,
      referenceNo,
      description,
    };

    // 1. Negative amounts
    if (!isNaN(amount) && amount < 0) {
      negativeAmountRows.push(rowSummary);
      continue;
    }

    // 2. Missing invoice no
    if (!invoiceNo) {
      missingInvoiceRows.push({ ...rowSummary, reason: 'Empty invoice no' });
      continue;
    }

    // 3. Missing payment date (skip silently as requested)
    if (!paymentDateStr) {
      missingDateCount++;
      continue;
    }

    // 4. Check invoice exists in DB
    const invoice = invoiceMap.get(invoiceNo);
    if (!invoice) {
      missingInvoiceRows.push({ ...rowSummary, reason: 'Not found in DB' });
      continue;
    }

    // 5. Invalid date (not empty but unparseable)
    const d = new Date(paymentDateStr);
    if (isNaN(d.getTime())) {
      missingDateCount++;
      continue;
    }

    toImport.push({ record, invoice });
  }

  // --- Output List: Missing Invoice ---
  console.log('');
  console.log('='.repeat(60));
  console.log(`LIST: Records with NO matching invoice in DB (${missingInvoiceRows.length} records)`);
  console.log('='.repeat(60));
  if (missingInvoiceRows.length === 0) {
    console.log('(none)');
  } else {
    console.log('InvoiceNo | Company | Client | Amount | Date | Reason');
    console.log('-'.repeat(80));
    for (const r of missingInvoiceRows) {
      console.log(`${r.invoiceNo} | ${r.company} | ${r.client} | ${r.amount} | ${r.paymentDate} | ${r.reason}`);
    }
  }

  // --- Summary ---
  console.log('');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total CSV records:          ${records.length}`);
  console.log(`Negative amounts (skipped): ${negativeAmountRows.length}`);
  console.log(`Invoice not found in DB:    ${missingInvoiceRows.length}`);
  console.log(`Missing/invalid date:       ${missingDateCount}`);
  console.log(`Ready to import:            ${toImport.length}`);
  console.log('');

  if (dryRun) {
    console.log('DRY RUN complete. No changes made.');
    console.log('Re-run with DRY_RUN=false to perform actual import.');
    return;
  }

  // --- LIVE IMPORT ---
  console.log('Starting live import...');
  let importedCount = 0;
  let errorCount = 0;

  for (const { record, invoice } of toImport) {
    const invoiceNo = record['發票']?.trim();
    const amount = parseFloat(record['總額']?.trim());
    const paymentDateStr = record['付款日期']?.trim();
    const referenceNo = record['支票']?.trim() || '';
    const companyPrefix = record['公司']?.trim() || '';
    const description = record['描述']?.trim() || '';

    // Determine Payment Method
    let paymentMethod = 'bank_transfer';
    if (referenceNo) {
      if (/^\d{6}$/.test(referenceNo) || /^[A-Za-z]+\d{6}$/.test(referenceNo)) {
        paymentMethod = 'cheque';
      }
    }

    const companyId = companyMap.get(companyPrefix) || null;
    const paymentDate = new Date(paymentDateStr);

    try {
        await prisma.$transaction(async (tx) => {
          // Create PaymentIn
          const paymentInData: any = {
            date: paymentDate,
            amount: amount,
            source_type: 'invoice',
            reference_no: referenceNo || null,
            payment_method: paymentMethod,
            payment_in_status: 'paid',
            remarks: description || null,
          };
          
          const paymentIn = await tx.paymentIn.create({
            data: paymentInData,
          });

          // Create Allocation
          const allocationData: any = {
            payment_in_allocation_payment_in_id: paymentIn.id,
            payment_in_allocation_invoice_id: invoice.id,
            payment_in_allocation_amount: amount,
            payment_in_allocation_remarks: `Imported from legacy CSV: ${invoiceNo}`,
          };
          
          await tx.paymentInAllocation.create({
            data: allocationData,
          });

        // Update Invoice paid_amount and outstanding
        // Fetch current invoice state within transaction to be safe
        const currentInvoice = await tx.invoice.findUnique({
          where: { id: invoice.id },
          select: { total_amount: true, paid_amount: true, retention_amount: true, status: true }
        });

        if (currentInvoice) {
          const newPaidAmount = Number(currentInvoice.paid_amount) + amount;
          const newOutstanding = Number(currentInvoice.total_amount) - newPaidAmount - Number(currentInvoice.retention_amount || 0);

          let newStatus = currentInvoice.status;
          if (newOutstanding <= 0) {
            newStatus = 'paid';
          } else if (newPaidAmount > 0) {
            newStatus = 'partially_paid';
          }

          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              paid_amount: newPaidAmount,
              outstanding: newOutstanding,
              status: newStatus,
            },
          });
        }
      });
      importedCount++;
    } catch (err) {
      console.error(`[Error] Failed to import for invoice ${invoiceNo}:`, err);
      errorCount++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`Successfully imported: ${importedCount}`);
  console.log(`Errors:                ${errorCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
