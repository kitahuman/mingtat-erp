"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    // Get all invoices with their allocations
    const invoices = await prisma.invoice.findMany({
        select: {
            id: true,
            invoice_no: true,
            total_amount: true,
            paid_amount: true,
            outstanding: true,
            status: true,
        },
    });
    console.log(`Total invoices: ${invoices.length}`);
    // Get all payment allocations with amount > 0 from paid PaymentIn records
    const allocations = await prisma.paymentInAllocation.findMany({
        where: {
            payment_in_allocation_amount: { gt: 0 },
            payment_in: {
                payment_in_status: 'paid',
            },
        },
        select: {
            payment_in_allocation_invoice_id: true,
            payment_in_allocation_amount: true,
        },
    });
    // Build a map: invoice_id -> total paid amount
    const paidMap = new Map();
    for (const alloc of allocations) {
        if (alloc.payment_in_allocation_invoice_id == null)
            continue;
        const current = paidMap.get(alloc.payment_in_allocation_invoice_id) || 0;
        paidMap.set(alloc.payment_in_allocation_invoice_id, current + Number(alloc.payment_in_allocation_amount));
    }
    let fixedCount = 0;
    let unchangedCount = 0;
    let errorCount = 0;
    for (const invoice of invoices) {
        const correctPaid = paidMap.get(invoice.id) || 0;
        const currentPaid = Number(invoice.paid_amount);
        const totalAmount = Number(invoice.total_amount);
        if (Math.abs(correctPaid - currentPaid) < 0.01) {
            unchangedCount++;
            continue;
        }
        const newOutstanding = totalAmount - correctPaid;
        // Determine new status
        let newStatus;
        const currentStatus = invoice.status;
        if (correctPaid >= totalAmount && totalAmount > 0) {
            newStatus = 'paid';
        }
        else if (correctPaid > 0) {
            newStatus = 'partial';
        }
        else {
            // Reset to issued if it was partial/paid but now has 0 paid
            if (currentStatus === 'partial' || currentStatus === 'paid') {
                newStatus = 'issued';
            }
            else {
                newStatus = currentStatus; // keep draft/cancelled etc.
            }
        }
        console.log(`[${dryRun ? 'DRY' : 'FIX'}] ${invoice.invoice_no}: paid ${currentPaid} → ${correctPaid}, outstanding ${Number(invoice.outstanding)} → ${newOutstanding}, status ${currentStatus} → ${newStatus}`);
        if (!dryRun) {
            try {
                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: {
                        paid_amount: correctPaid,
                        outstanding: newOutstanding,
                        status: newStatus,
                    },
                });
                fixedCount++;
            }
            catch (err) {
                console.error(`  ERROR updating ${invoice.invoice_no}: ${err.message}`);
                errorCount++;
            }
        }
        else {
            fixedCount++;
        }
    }
    console.log('\n=== Summary ===');
    console.log(`Fixed: ${fixedCount}`);
    console.log(`Unchanged: ${unchangedCount}`);
    console.log(`Errors: ${errorCount}`);
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
