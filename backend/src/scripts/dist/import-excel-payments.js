"use strict";
/**
 * import-excel-payments.ts
 *
 * Imports PaymentIn records from payment-excel-v2.xlsx
 * Sheets: DTC, DCL
 *
 * DTC columns:
 *   1: 公司, 2: Received Date, 3: Contract No, 4: Payment No,
 *   5: Amount, 6: Retention, 7: Payment Method, 8: CHQ,
 *   9: Settled Invoices (comma-separated), 10: Contra Charge,
 *   11: Remarks, 12: 實際進帳日期
 *
 * DCL columns:
 *   1: 公司, 2: PaymentDate, 3: Invoice#, 4: Name,
 *   5: 合約, 6: Payment Method, 7: ChequeNo/Ref No, 8: PaidAmt,
 *   9: Remark/PO/etc, 10: 實際進帳日期, 11: PO, 12: 欄1
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const ExcelJS = __importStar(require("exceljs"));
const path = __importStar(require("path"));
const prisma = new client_1.PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
// Payment method mapping from Excel values to Chinese system values
function mapPaymentMethod(excelValue, referenceNo) {
    if (excelValue) {
        const v = excelValue.toString().trim().toUpperCase();
        if (v === 'CHEQUE' || v === 'CHQ')
            return '支票';
        if (v === 'TRANSFER' || v === 'AUTOPAY' || v === 'AUTOPAY ')
            return '銀行轉帳';
        if (v === 'EPS')
            return 'EPS';
        if (v === 'FPS')
            return 'FPS 轉數快';
        if (v === 'CASH')
            return '現金';
        if (v === 'CREDIT')
            return '信用卡';
        if (v === 'ONLINE')
            return '網上銀行';
    }
    // Fallback: classify by reference_no
    return classifyByRef(referenceNo);
}
function classifyByRef(ref) {
    if (!ref || ref.toString().trim() === '')
        return '銀行轉帳';
    const r = ref.toString().trim();
    if (/^\d{6}$/.test(r))
        return '支票';
    if (/^[A-Za-z#]+\d+$/.test(r) || /^[A-Za-z]+[#]?\d+$/.test(r))
        return '支票';
    if (/^\d{7}$/.test(r))
        return '銀行轉帳';
    return '銀行轉帳';
}
function toDate(val) {
    if (!val)
        return null;
    if (val instanceof Date)
        return val;
    if (typeof val === 'number') {
        // Excel serial date (days since 1900-01-01)
        const d = new Date((val - 25569) * 86400 * 1000);
        return d;
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}
function toDecimal(val) {
    if (val === null || val === undefined || val === '')
        return null;
    const n = parseFloat(val.toString());
    return isNaN(n) ? null : n;
}
function toStr(val) {
    if (val === null || val === undefined)
        return null;
    const s = val.toString().trim();
    return s === '' ? null : s;
}
async function main() {
    var _a, _b, _c, _d, _e, _f;
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    const filePath = path.join(__dirname, 'data', 'payment-excel-v2.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const rows = [];
    // === Parse DTC sheet ===
    const dtcWs = wb.getWorksheet('DTC');
    dtcWs.eachRow((row, rowNum) => {
        if (rowNum === 1)
            return; // skip header
        const r = row.values; // 1-indexed
        const amount = toDecimal(r[5]);
        const date = toDate(r[2]);
        if (!amount || !date)
            return;
        const refRaw = toStr(r[8]);
        const pmRaw = toStr(r[7]);
        const settledRaw = toStr(r[9]);
        const invoiceNos = settledRaw
            ? settledRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
            : [];
        rows.push({
            sheet: 'DTC',
            rowNum,
            date,
            amount,
            paymentMethod: mapPaymentMethod(pmRaw, refRaw),
            referenceNo: refRaw,
            invoiceNos,
            retentionAmount: toDecimal(r[6]),
            contraChargeAmount: toDecimal(r[10]),
            remarks: toStr(r[11]),
        });
    });
    // === Parse DCL sheet ===
    const dclWs = wb.getWorksheet('DCL');
    dclWs.eachRow((row, rowNum) => {
        if (rowNum === 1)
            return;
        const r = row.values;
        const amount = toDecimal(r[8]);
        const date = toDate(r[2]);
        if (!amount || !date)
            return;
        const refRaw = toStr(r[7]);
        const pmRaw = toStr(r[6]);
        const invoiceNo = toStr(r[3]);
        const invoiceNos = invoiceNo ? [invoiceNo] : [];
        rows.push({
            sheet: 'DCL',
            rowNum,
            date,
            amount,
            paymentMethod: mapPaymentMethod(pmRaw, refRaw),
            referenceNo: refRaw,
            invoiceNos,
            retentionAmount: null,
            contraChargeAmount: null,
            remarks: toStr(r[9]),
        });
    });
    console.log(`Parsed ${rows.length} rows from Excel (DTC + DCL)`);
    // === Load all invoices referenced ===
    const allInvoiceNos = [...new Set(rows.flatMap(r => r.invoiceNos))];
    console.log(`Unique invoice nos referenced: ${allInvoiceNos.length}`);
    const invoices = await prisma.invoice.findMany({
        where: { invoice_no: { in: allInvoiceNos }, deleted_at: null },
        select: {
            id: true,
            invoice_no: true,
            company_id: true,
        },
    });
    const invoiceMap = new Map(invoices.map(inv => [inv.invoice_no, inv]));
    console.log(`Found ${invoices.length} matching invoices in DB`);
    // === Load bank accounts (one per company) ===
    const bankAccounts = await prisma.bankAccount.findMany({
        select: { id: true, company_id: true },
    });
    const bankAccountByCompany = new Map(bankAccounts.map(ba => [ba.company_id, ba.id]));
    // === De-duplicate check: load existing PaymentIn records ===
    // Key: invoice_no + amount + date (YYYY-MM-DD)
    const existingAllocations = await prisma.paymentInAllocation.findMany({
        include: { payment_in: { select: { id: true, amount: true, date: true } } },
    });
    const existingKeys = new Set();
    for (const alloc of existingAllocations) {
        const pi = alloc.payment_in;
        if (!pi)
            continue;
        const dateStr = pi.date ? new Date(pi.date).toISOString().split('T')[0] : '';
        const key = `${alloc.payment_in_allocation_invoice_id}|${pi.amount}|${dateStr}`;
        existingKeys.add(key);
    }
    let imported = 0;
    let skipped = 0;
    let noInvoice = 0;
    let noBank = 0;
    for (const row of rows) {
        // Find invoices
        const matchedInvoices = row.invoiceNos
            .map(no => invoiceMap.get(no))
            .filter((inv) => inv != null);
        // Determine company_id from first matched invoice
        let companyId = null;
        if (matchedInvoices.length > 0) {
            companyId = matchedInvoices[0].company_id;
        }
        // Find bank account
        const bankAccountId = companyId ? (_a = bankAccountByCompany.get(companyId)) !== null && _a !== void 0 ? _a : null : null;
        // De-duplicate check: if all invoices already have a payment with same amount+date, skip
        if (matchedInvoices.length > 0) {
            const dateStr = row.date ? new Date(row.date).toISOString().split('T')[0] : '';
            const alreadyExists = matchedInvoices.every(inv => {
                const key = `${inv.id}|${row.amount}|${dateStr}`;
                return existingKeys.has(key);
            });
            if (alreadyExists) {
                console.log(`  SKIP [${row.sheet} row ${row.rowNum}] duplicate: invoices=${row.invoiceNos.join(',')} amount=${row.amount} date=${dateStr}`);
                skipped++;
                continue;
            }
        }
        if (row.invoiceNos.length > 0 && matchedInvoices.length === 0) {
            console.log(`  SKIP [${row.sheet} row ${row.rowNum}] invoices not found: ${row.invoiceNos.join(',')}`);
            noInvoice++;
            continue;
        }
        if (!bankAccountId) {
            console.log(`  WARN [${row.sheet} row ${row.rowNum}] no bank account for company_id=${companyId}, importing without bank_account_id`);
            noBank++;
        }
        console.log(`  IMPORT [${row.sheet} row ${row.rowNum}] amount=${row.amount} date=${(_b = row.date) === null || _b === void 0 ? void 0 : _b.toISOString().split('T')[0]} method=${row.paymentMethod} invoices=${row.invoiceNos.join(',') || '(none)'}`);
        if (!DRY_RUN) {
            await prisma.paymentIn.create({
                data: {
                    date: row.date,
                    amount: row.amount,
                    source_type: 'invoice',
                    payment_method: row.paymentMethod,
                    reference_no: row.referenceNo,
                    remarks: row.remarks,
                    bank_account_id: bankAccountId !== null && bankAccountId !== void 0 ? bankAccountId : null,
                    allocations: matchedInvoices.length > 0 ? {
                        create: matchedInvoices.map(inv => ({
                            payment_in_allocation_invoice_id: inv.id,
                            payment_in_allocation_amount: row.amount / matchedInvoices.length,
                        })),
                    } : undefined,
                    deductions: {
                        create: [
                            ...(row.retentionAmount ? [{
                                    payment_in_deduction_type: 'retention',
                                    payment_in_deduction_amount: row.retentionAmount,
                                    payment_in_deduction_invoice_id: (_d = (_c = matchedInvoices[0]) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : null,
                                    payment_in_deduction_remarks: '',
                                }] : []),
                            ...(row.contraChargeAmount ? [{
                                    payment_in_deduction_type: 'contra_charge',
                                    payment_in_deduction_amount: row.contraChargeAmount,
                                    payment_in_deduction_invoice_id: (_f = (_e = matchedInvoices[0]) === null || _e === void 0 ? void 0 : _e.id) !== null && _f !== void 0 ? _f : null,
                                    payment_in_deduction_remarks: '',
                                }] : []),
                        ],
                    },
                },
            });
        }
        imported++;
    }
    console.log('\n=== Summary ===');
    console.log(`Total rows parsed:  ${rows.length}`);
    console.log(`Imported:           ${imported}`);
    console.log(`Skipped (dup):      ${skipped}`);
    console.log(`Skipped (no inv):   ${noInvoice}`);
    console.log(`No bank account:    ${noBank}`);
    if (DRY_RUN)
        console.log('\n[DRY RUN] No changes written.');
    else
        console.log('\n[DONE] Import complete.');
}
main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
