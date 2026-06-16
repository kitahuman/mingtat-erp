"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    // 1. Check DTCSC25127434 allocations
    console.log('=== 1. DTCSC25127434 allocations ===');
    const targetInvoice = await prisma.invoice.findFirst({
        where: { invoice_no: 'DTCSC25127434' },
        select: { id: true, invoice_no: true, paid_amount: true, outstanding: true, status: true, total_amount: true },
    });
    console.log('Invoice:', JSON.stringify(targetInvoice));
    if (targetInvoice) {
        const allocs = await prisma.paymentInAllocation.findMany({
            where: { payment_in_allocation_invoice_id: targetInvoice.id },
            include: {
                payment_in: {
                    select: { id: true, amount: true, payment_method: true, date: true, payment_in_status: true },
                },
            },
        });
        console.log(`Allocations count: ${allocs.length}`);
        for (const a of allocs) {
            console.log(`  alloc id=${a.id}, amount=${a.payment_in_allocation_amount}, payment_in: id=${a.payment_in.id}, amount=${a.payment_in.amount}, method=${a.payment_in.payment_method}, date=${a.payment_in.date}, status=${a.payment_in.payment_in_status}`);
        }
    }
    // 2. Count invoices with paid_amount > 0 but NO allocations at all
    console.log('\n=== 2. Invoices with paid_amount > 0 but NO allocations ===');
    const orphanedInvoices = await prisma.invoice.findMany({
        where: {
            paid_amount: { gt: 0 },
            payment_in_allocations: { none: {} },
        },
        select: {
            id: true,
            invoice_no: true,
            paid_amount: true,
            outstanding: true,
            total_amount: true,
            status: true,
        },
    });
    console.log(`Count: ${orphanedInvoices.length}`);
    const totalOrphanedPaid = orphanedInvoices.reduce((sum, inv) => sum + Number(inv.paid_amount), 0);
    console.log(`Total orphaned paid_amount: ${totalOrphanedPaid.toLocaleString()}`);
    // Show breakdown by status
    const byStatus = {};
    for (const inv of orphanedInvoices) {
        byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;
    }
    console.log('By status:', JSON.stringify(byStatus));
    // Show first 20 examples
    console.log('\nFirst 20 examples:');
    for (const inv of orphanedInvoices.slice(0, 20)) {
        console.log(`  ${inv.invoice_no}: paid=${inv.paid_amount}, total=${inv.total_amount}, status=${inv.status}`);
    }
    // 3. Also check invoices with paid_amount > 0 AND allocations but allocation amounts are all 0
    console.log('\n=== 3. Invoices with paid_amount > 0 but all allocations have amount=0 ===');
    const zeroAllocInvoices = await prisma.invoice.findMany({
        where: {
            paid_amount: { gt: 0 },
            payment_in_allocations: {
                some: {},
                none: { payment_in_allocation_amount: { gt: 0 } },
            },
        },
        select: {
            id: true,
            invoice_no: true,
            paid_amount: true,
            status: true,
        },
    });
    console.log(`Count: ${zeroAllocInvoices.length}`);
    for (const inv of zeroAllocInvoices.slice(0, 10)) {
        console.log(`  ${inv.invoice_no}: paid=${inv.paid_amount}, status=${inv.status}`);
    }
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
