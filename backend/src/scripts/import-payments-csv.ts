import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.env.DRY_RUN !== 'false';
  const csvPath = process.env.CSV_PATH || '/home/ubuntu/upload/交易記錄150.csv';

  console.log(`Starting payment import. Dry run: ${dryRun}`);
  console.log(`CSV Path: ${csvPath}`);

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at ${csvPath}`);
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

  let companyMap = new Map();
  if (process.env.DATABASE_URL) {
    // Cache companies
    const companies = await prisma.company.findMany({
      where: { deleted_at: null },
    });
    companies.forEach(c => {
      if (c.internal_prefix) {
        companyMap.set(c.internal_prefix, c.id);
      }
    });
  }

  let importedCount = 0;
  let skippedCount = 0;
  let invoiceNotFoundCount = 0;
  let negativeAmountCount = 0;

  for (const record of records) {
    const invoiceNo = record['發票']?.trim();
    const amountStr = record['總額']?.trim();
    const amount = parseFloat(amountStr);
    const paymentDateStr = record['付款日期']?.trim();
    const referenceNo = record['支票']?.trim();
    const companyPrefix = record['公司']?.trim();
    const description = record['描述']?.trim();

    // 1. Skip negative amounts
    if (isNaN(amount) || amount < 0) {
      negativeAmountCount++;
      continue;
    }

    // 2. Find Invoice
    if (!invoiceNo) {
      skippedCount++;
      continue;
    }

    let invoice: any = null;
    if (process.env.DATABASE_URL) {
      invoice = await prisma.invoice.findFirst({
        where: { 
          invoice_no: invoiceNo,
          deleted_at: null 
        },
      });

      if (!invoice) {
        invoiceNotFoundCount++;
        console.log(`[Warning] Invoice not found: ${invoiceNo}`);
        continue;
      }
    }

    // 3. Determine Payment Method
    let paymentMethod = 'bank_transfer';
    if (referenceNo) {
      if (/^\d{6}$/.test(referenceNo) || /^[A-Za-z]+\d{6}$/.test(referenceNo)) {
        paymentMethod = 'cheque';
      } else if (/^\d{7}$/.test(referenceNo)) {
        paymentMethod = 'bank_transfer';
      }
    }

    // 4. Get Company ID
    const companyId = companyMap.get(companyPrefix) || null;

    const paymentDate = new Date(paymentDateStr);
    if (isNaN(paymentDate.getTime())) {
      console.log(`[Warning] Invalid date for invoice ${invoiceNo}: ${paymentDateStr}`);
      skippedCount++;
      continue;
    }

    if (!dryRun) {
      try {
        await prisma.$transaction(async (tx) => {
          // Create PaymentIn
          const paymentIn = await tx.paymentIn.create({
            data: {
              date: paymentDate,
              amount: amount,
              source_type: 'invoice',
              reference_no: referenceNo || null,
              payment_method: paymentMethod,
              payment_in_status: 'paid',
              remarks: description || null,
              // Note: company_id is not directly on PaymentIn in this schema, 
              // it seems it's linked via Project or just not stored there.
              // But we can store it in remarks if needed, or if the schema had it.
              // Looking at schema, PaymentIn has project_id, contract_id, bank_account_id.
            },
          });

          // Create Allocation
          await tx.paymentInAllocation.create({
            data: {
              payment_in_allocation_payment_in_id: paymentIn.id,
              payment_in_allocation_invoice_id: invoice.id,
              payment_in_allocation_amount: amount,
              payment_in_allocation_remarks: `Imported from legacy CSV: ${invoiceNo}`,
            },
          });

          // Update Invoice paid_amount and outstanding
          const newPaidAmount = Number(invoice.paid_amount) + amount;
          const newOutstanding = Number(invoice.total_amount) - newPaidAmount - Number(invoice.retention_amount || 0);
          
          let newStatus = invoice.status;
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
        });
        importedCount++;
      } catch (err) {
        console.error(`[Error] Failed to import for invoice ${invoiceNo}:`, err);
        skippedCount++;
      }
    } else {
      importedCount++;
    }
  }

  console.log('\n--- Import Summary ---');
  console.log(`Total processed: ${records.length}`);
  console.log(`Successfully ${dryRun ? 'validated' : 'imported'}: ${importedCount}`);
  console.log(`Skipped (missing data/invalid date): ${skippedCount}`);
  console.log(`Invoice not found: ${invoiceNotFoundCount}`);
  console.log(`Negative amounts skipped: ${negativeAmountCount}`);
  console.log('----------------------\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
