/**
 * Backfill script: Create PaymentOut records for existing PayrollPayments
 * that don't have a linked payment_out record.
 *
 * Run inside the backend Docker container:
 *   docker exec mingtat-erp-backend node scripts/backfill-payroll-payment-out.js
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    // Find all payroll_payments without a linked payment_out
    const orphanedPayments = await prisma.payrollPayment.findMany({
      where: { payroll_payment_payment_out_id: null },
      include: {
        payroll: {
          include: {
            employee: { select: { name_zh: true, name_en: true } },
          },
        },
      },
    });

    console.log(`Found ${orphanedPayments.length} payroll_payments without PaymentOut records.`);

    if (orphanedPayments.length === 0) {
      console.log('Nothing to backfill. Exiting.');
      return;
    }

    // Format period "2026-04" -> "2026年4月"
    function formatPeriod(period) {
      if (!period) return '';
      const [y, m] = period.split('-');
      if (!y || !m) return period;
      return `${y}年${parseInt(m, 10)}月`;
    }

    for (const pp of orphanedPayments) {
      const payroll = pp.payroll;
      const employeeName = payroll?.employee?.name_zh || payroll?.employee?.name_en || '';
      const periodLabel = payroll ? formatPeriod(payroll.period) : '';
      const description = periodLabel && employeeName
        ? `${periodLabel} ${employeeName}的糧單`
        : `糧單付款 #${pp.id}`;

      console.log(`  Backfilling PayrollPayment #${pp.id}: ${description}`);

      await prisma.$transaction(async (tx) => {
        // Create the PaymentOut record
        const paymentOut = await tx.paymentOut.create({
          data: {
            date: pp.payroll_payment_date,
            amount: pp.payroll_payment_amount,
            bank_account: pp.payroll_payment_bank_account || null,
            reference_no: pp.payroll_payment_reference_no || null,
            payment_out_description: description,
            payment_out_status: 'paid',
            remarks: pp.payroll_payment_remarks || null,
            payroll_id: pp.payroll_payment_payroll_id,
            company_id: payroll?.company_id || null,
          },
        });

        // Link the PayrollPayment to the new PaymentOut
        await tx.payrollPayment.update({
          where: { id: pp.id },
          data: { payroll_payment_payment_out_id: paymentOut.id },
        });

        console.log(`    -> Created PaymentOut #${paymentOut.id}, linked to PayrollPayment #${pp.id}`);
      });
    }

    console.log(`\nBackfill complete. Processed ${orphanedPayments.length} records.`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
