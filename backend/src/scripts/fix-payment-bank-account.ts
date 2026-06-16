import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.env.DRY_RUN !== 'false';
  console.log('=== Fix PaymentIn bank_account_id Script ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (writing to DB)'}`);
  console.log('');

  // Find all PaymentIn with NULL bank_account_id
  const payments = await (prisma as any).paymentIn.findMany({
    where: {
      bank_account_id: null,
    },
    include: {
      allocations: {
        include: {
          invoice: {
            select: { id: true, invoice_no: true, company_id: true },
          },
        },
        take: 1,
      },
    },
  });

  console.log(`PaymentIn records with NULL bank_account_id: ${payments.length}`);

  // Get all bank accounts (one per company)
  const bankAccounts = await (prisma as any).bankAccount.findMany({
    where: { is_active: true },
    select: { id: true, company_id: true, account_name: true },
  });

  const bankAccountByCompany = new Map<number, number>();
  for (const ba of bankAccounts) {
    if (ba.company_id != null) {
      bankAccountByCompany.set(ba.company_id, ba.id);
    }
  }

  console.log(`Bank accounts found: ${bankAccounts.length}`);
  bankAccounts.forEach((ba: any) => {
    console.log(`  company_id=${ba.company_id} -> bank_account_id=${ba.id} (${ba.account_name})`);
  });
  console.log('');

  let updated = 0;
  let noAllocation = 0;
  let noCompany = 0;
  let noBankAccount = 0;

  for (const payment of payments) {
    const allocation = payment.allocations[0];

    if (!allocation || !allocation.invoice) {
      noAllocation++;
      continue;
    }

    const companyId: number | null = allocation.invoice.company_id;
    if (companyId == null) {
      noCompany++;
      console.log(`  [SKIP] PaymentIn id=${payment.id} (invoice ${allocation.invoice.invoice_no}): invoice has no company_id`);
      continue;
    }

    const bankAccountId = bankAccountByCompany.get(companyId);
    if (!bankAccountId) {
      noBankAccount++;
      console.log(`  [SKIP] PaymentIn id=${payment.id} (invoice ${allocation.invoice.invoice_no}): no bank account for company_id=${companyId}`);
      continue;
    }

    if (!dryRun) {
      await (prisma as any).paymentIn.update({
        where: { id: payment.id },
        data: { bank_account_id: bankAccountId },
      });
    }

    updated++;
  }

  console.log('');
  console.log('================================================================================');
  console.log('SUMMARY');
  console.log('================================================================================');
  console.log(`Total NULL bank_account_id:  ${payments.length}`);
  console.log(`${dryRun ? 'Would update' : 'Updated'}:              ${updated}`);
  console.log(`No allocation/invoice:       ${noAllocation}`);
  console.log(`Invoice has no company_id:   ${noCompany}`);
  console.log(`No bank account for company: ${noBankAccount}`);
  if (dryRun) {
    console.log('');
    console.log('DRY RUN complete. Re-run with DRY_RUN=false to apply changes.');
  } else {
    console.log('');
    console.log('LIVE update complete.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
