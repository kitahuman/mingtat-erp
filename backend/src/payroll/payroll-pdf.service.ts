import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { extname, join, normalize } from 'path';
import { PayrollService } from './payroll.service';
import { PdfUtilService } from '../common/pdf-util.service';

export interface PayrollPdfOptions {
  showGroupedSettlement?: boolean;
  showEmployeeSignature?: boolean;
  showCompanyStamp?: boolean;
}

@Injectable()
export class PayrollPdfService {
  constructor(
    private readonly payrollService: PayrollService,
    private readonly pdfUtil: PdfUtilService,
  ) {}

  async generatePayrollPdf(payrollId: number, options: PayrollPdfOptions = {}) {
    const { payroll, html } = await this.buildPayrollHtmlData(payrollId, options);

    const pdf = await this.pdfUtil.renderHtmlToPdf(html, {
      pdfOptions: {
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      },
    });
    return { pdf, payroll };
  }

  async generatePayrollHtml(payrollId: number, options: PayrollPdfOptions = {}) {
    const { html } = await this.buildPayrollHtmlData(payrollId, options);
    return html;
  }

  private async buildPayrollHtmlData(
    payrollId: number,
    options: PayrollPdfOptions = {},
  ) {
    const payroll: any = await this.payrollService.findOne(payrollId);
    const html = this.renderPayrollHtml(payroll, {
      showGroupedSettlement: options.showGroupedSettlement ?? false,
      showEmployeeSignature: options.showEmployeeSignature ?? false,
      showCompanyStamp: options.showCompanyStamp ?? true,
    });
    return { payroll, html };
  }

  private renderPayrollHtml(payroll: any, options: Required<PayrollPdfOptions>) {
    const emp = payroll.employee || {};
    const cp = payroll.company_profile || {};
    const company = payroll.company || emp.company || {};
    const items = (payroll.items || []).filter((item: any) => !item.payroll_item_excluded);
    const adjustments = payroll.adjustments || [];
    const payrollExpenses = payroll.payroll_expenses || [];
    const groupedSettlement = payroll.grouped_settlement || [];
    const pettyCashDeducted = this.toNumber(payroll.petty_cash_deducted);
    const reimbursementTotal = this.toNumber(payroll.reimbursement_total);
    const totalPayable = this.toNumber(payroll.net_amount) + reimbursementTotal - pettyCashDeducted;
    const grossAmount = this.toNumber(payroll.gross_amount);
    const deductionTotal = this.toNumber(payroll.deduction_total);
    const adjustmentTotal = this.toNumber(payroll.adjustment_total);
    const periodStartDate = this.formatFullDate(payroll.date_from);
    const periodEndDate = this.formatFullDate(payroll.date_to);
    const companyStampSrc = options.showCompanyStamp
      ? this.mediaDataUri(company.company_stamp_url || company.company_logo_url)
      : '';

    const salaryGroups = [
      { type: 'base_salary', title: '底薪項目' },
      { type: 'allowance', title: '津貼項目' },
      { type: 'ot', title: 'OT 項目' },
    ];
    const mpfItems = items.filter((item: any) => item.item_type === 'mpf_deduction');
    const hasAdjustments = adjustments.length > 0 || adjustmentTotal !== 0;
    const hasReimbursements = payrollExpenses.length > 0 || reimbursementTotal > 0;
    const hasPettyCash = pettyCashDeducted > 0;
    const mpfDeductionTotal = Math.abs(deductionTotal);
    const mpfLabel = `強積金（${this.getMpfPlanShortLabel(payroll.mpf_plan)}）(-)`;

    const itemRows: string[] = [];
    const pushSectionHeader = (title: string) => {
      itemRows.push(`<tr><td colspan="5" class="section-header">${this.escapeHtml(title)}</td></tr>`);
    };
    const pushSeparator = () => {
      itemRows.push('<tr><td colspan="5" class="separator"></td></tr>');
    };
    const pushSpacer = () => {
      itemRows.push('<tr><td colspan="5" class="spacer"></td></tr>');
    };
    const pushSubtotal = (label: string, amount: any, className = 'subtotal') => {
      itemRows.push(`<tr class="${className}"><td colspan="3" class="right bold">${this.escapeHtml(label)}</td><td class="money bold">${this.formatMoney(amount)}</td><td></td></tr>`);
    };
    const itemRow = (item: any, prefix = '') => {
      const amount = this.toNumber(item.amount);
      const isMpfPercent = item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry';
      const isMpfItem = item.item_type === 'mpf_deduction';
      return `<tr>
        <td>${this.escapeHtml(prefix)}${this.escapeHtml(item.item_name || '—')}</td>
        <td class="money">${isMpfPercent ? `${(this.toNumber(item.quantity) * 100).toFixed(0)}%` : this.formatMoney(item.unit_price)}</td>
        <td class="money">${isMpfPercent ? '—' : this.formatPlainNumber(item.quantity)}</td>
        <td class="money bold">${amount < 0 ? '-' : ''}${this.formatMoney(Math.abs(amount))}</td>
        <td>${isMpfItem ? '—' : this.escapeHtml(item.remarks || '—')}</td>
      </tr>`;
    };

    salaryGroups.forEach((group) => {
      const groupItems = items.filter((item: any) => item.item_type === group.type);
      if (groupItems.length === 0) return;
      pushSectionHeader(group.title);
      
      // Group items by name + unit_price
      const groupedByNameAndPrice = groupItems.reduce((acc: any[], item: any) => {
        const key = `${item.item_name}|${item.unit_price}`;
        const existing = acc.find((g: any) => g.groupKey === key);
        if (existing) {
          existing.items.push(item);
          existing.totalQuantity += this.toNumber(item.quantity);
          existing.totalAmount += this.toNumber(item.amount);
        } else {
          acc.push({
            groupKey: key,
            items: [item],
            totalQuantity: this.toNumber(item.quantity),
            totalAmount: this.toNumber(item.amount),
          });
        }
        return acc;
      }, []);
      
      groupedByNameAndPrice.forEach((groupedItem: any) => {
        const firstItem = groupedItem.items[0];
        const isMpfPercent = firstItem.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry';
        itemRows.push(`<tr>
          <td>${this.escapeHtml(firstItem.item_name || '—')}</td>
          <td class="money">${isMpfPercent ? `${(this.toNumber(firstItem.quantity) * 100).toFixed(0)}%` : this.formatMoney(firstItem.unit_price)}</td>
          <td class="money">${isMpfPercent ? '—' : this.formatPlainNumber(groupedItem.totalQuantity)}</td>
          <td class="money bold">${groupedItem.totalAmount < 0 ? '-' : ''}${this.formatMoney(Math.abs(groupedItem.totalAmount))}</td>
          <td>${this.escapeHtml(firstItem.remarks || '—')}</td>
        </tr>`);
      });
    });
    pushSeparator();
    pushSubtotal('應收總額', grossAmount, 'subtotal gross');

    if (hasAdjustments) {
      pushSpacer();
      pushSectionHeader('自定義津貼/扣款 (+)');
      adjustments.forEach((adj: any) => {
        const amount = this.toNumber(adj.amount);
        const dateLabel = this.formatAdjustmentDateForTable(adj.adjustment_date);
        itemRows.push(`<tr>
          <td>${this.escapeHtml(adj.item_name || '自定義津貼/扣款')}${dateLabel ? ` (${this.escapeHtml(dateLabel)})` : ''}</td>
          <td class="money">—</td>
          <td class="money">—</td>
          <td class="money bold">${amount < 0 ? '-' : '+'}${this.formatMoney(Math.abs(amount))}</td>
          <td>${this.escapeHtml(adj.remarks || '—')}</td>
        </tr>`);
      });
      if (adjustments.length === 0) pushSubtotal('自定義津貼/扣款合計', adjustmentTotal, 'subtotal adjustment');
    }

    pushSpacer();
    pushSectionHeader(mpfLabel);
    if (mpfItems.length > 0) {
      mpfItems.forEach((item: any) => itemRows.push(itemRow(item)));
    } else {
      itemRows.push(`<tr><td>${this.escapeHtml(mpfLabel)}</td><td class="money">—</td><td class="money">—</td><td class="money bold">-${this.formatMoney(mpfDeductionTotal)}</td><td>—</td></tr>`);
    }
    pushSeparator();
    pushSubtotal('淨薪金', payroll.net_amount, 'subtotal net');

    if (hasReimbursements) {
      pushSpacer();
      pushSectionHeader('員工報銷 (+)');
      payrollExpenses.forEach((record: any) => {
        const expense = record.expense || {};
        itemRows.push(`<tr>
          <td>${expense.date ? this.formatDate(expense.date) : '—'} - ${this.escapeHtml(this.getExpenseCategoryName(record))}</td>
          <td>${this.escapeHtml(expense.description || expense.item || '—')}</td>
          <td class="money">—</td>
          <td class="money bold">+${this.formatMoney(expense.total_amount)}</td>
          <td>報銷</td>
        </tr>`);
      });
      if (payrollExpenses.length === 0) pushSubtotal('員工報銷合計', reimbursementTotal, 'subtotal reimbursement');
    }

    if (hasPettyCash) {
      pushSpacer();
      pushSectionHeader('零用金抵扣 (-)');
      itemRows.push(`<tr><td>零用金抵扣</td><td class="money">—</td><td class="money">—</td><td class="money bold">-${this.formatMoney(pettyCashDeducted)}</td><td>抵扣員工報銷</td></tr>`);
    }

    pushSeparator();
    pushSubtotal('應付總額', totalPayable, 'subtotal payable');

    return `<!DOCTYPE html>
<html lang="zh-HK">
<head>
  <meta charset="utf-8" />
  <title>Payroll ${this.escapeHtml(payroll.id)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Arial, "Noto Sans CJK TC", "Microsoft JhengHei", sans-serif; font-size: 13px; line-height: 1.35; background: #fff; }
    .page { width: 100%; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #000; padding-bottom: 10px; }
    .header h1 { font-size: 24px; margin: 0 0 5px; font-weight: 700; }
    .header h2 { font-size: 14px; margin: 0 0 5px; font-weight: 700; letter-spacing: 1px; }
    .header p { font-size: 11px; margin: 0; font-weight: 700; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; }
    .info-table { margin: 15px 0; border: 2px solid #000; }
    .info-table td { padding: 6px 12px; border: 1px solid #000; font-size: 13px; }
    .label { width: 120px; text-align: right; white-space: nowrap; }
    .period { margin: 15px 0; font-size: 14px; }
    .period span { font-weight: 700; text-decoration: underline; }
    h2 { margin: 0 0 8px; font-size: 15px; }
    .print-table { margin: 15px 0; border: 2px solid #000; page-break-inside: auto; }
    th { padding: 6px 12px; border: 1px solid #000; border-bottom: 2px solid #000; text-align: left; font-size: 13px; background: #f3f4f6; }
    td { padding: 6px 12px; border: 1px solid #000; font-size: 13px; vertical-align: top; }
    tr { page-break-inside: avoid; }
    .right { text-align: right; }
    .money { text-align: right; font-family: "Courier New", monospace; white-space: nowrap; }
    .bold { font-weight: 700; }
    .section-header { background: #f3f4f6; font-weight: 700; }
    .separator { padding: 0; border-top: 2px solid #000; height: 0; }
    .spacer { height: 8px; border: 0; padding: 0; }
    .subtotal { background: #f8fafc; }
    .gross { background: #eef2ff; }
    .net { background: #eff6ff; }
    .payable, .adjustment { background: #f0fdf4; }
    .reimbursement { background: #eff6ff; }
    .signature-section { margin-top: 20px; display: flex; justify-content: space-between; gap: 36px; page-break-inside: avoid; }
    .signature-box { flex: 1; min-height: 100px; position: relative; }
    .signature-line { border-top: 1px solid #000; margin-top: 80px; padding-top: 8px; font-size: 13px; }
    .stamp { max-width: 130px; max-height: 90px; object-fit: contain; position: absolute; right: 30px; bottom: 30px; opacity: 0.95; }
    .muted { color: #6b7280; }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <h1>${this.escapeHtml(company.name || cp.chinese_name || '公司名稱')}</h1>
      <h2>${this.escapeHtml(company.name_en || cp.english_name || '')}</h2>
      <p>${this.escapeHtml(company.invoice_address || cp.office_address || '')}</p>
    </section>

    <table class="info-table">
      <tbody>
        <tr><td class="label">員工姓名(中)：</td><td>${this.escapeHtml(emp.name_zh || emp.name || payroll.employee_name || '-')}</td><td class="label">員工姓名(英)：</td><td>${this.escapeHtml(emp.name_en || emp.employee_name || '-')}</td></tr>
        <tr><td class="label">身份證號碼：</td><td>${this.escapeHtml(emp.id_number || '-')}</td><td class="label">受僱日期：</td><td>${this.escapeHtml(this.formatEmployeeJoinDate(emp.join_date) || '-')}</td></tr>
        <tr><td class="label">聯絡電話：</td><td>${this.escapeHtml(emp.phone || '-')}</td><td class="label">出糧戶口：</td><td>${this.escapeHtml(emp.bank_account || '-')}</td></tr>
        ${this.infoRow('地址：', emp.address)}
      </tbody>
    </table>

    <div class="period"><strong>本月工作日期：</strong> <span>${this.escapeHtml(periodStartDate)}-${this.escapeHtml(periodEndDate)}</span></div>

    ${options.showGroupedSettlement ? this.renderGroupedSettlement(groupedSettlement) : ''}

    <table class="print-table">
      <thead>
        <tr>
          <th style="width: 220px;">項目名稱</th>
          <th class="right">單價($)</th>
          <th class="right">天數/數量</th>
          <th class="right">金額($)</th>
          <th style="width: 160px;">備註</th>
        </tr>
      </thead>
      <tbody>${itemRows.join('')}</tbody>
    </table>

    <section class="signature-section">
      <div class="signature-box">
        ${options.showEmployeeSignature ? '<div class="signature-line">員工簽署 / 日期</div>' : ''}
      </div>
      <div class="signature-box">
        ${companyStampSrc ? `<img class="stamp" src="${companyStampSrc}" alt="Company Stamp" />` : ''}
        <div class="signature-line">公司授權簽署 / 公司印</div>
      </div>
    </section>
  </main>
</body>
</html>`;
  }

  private renderGroupedSettlement(groups: any[]) {
    if (!groups.length) return '';
    const rows = groups.map((group) => `<tr>
      <td>${this.escapeHtml(group.client_name || group.company_name || '-')}</td>
      <td>${this.escapeHtml(group.service_type || '-')}</td>
      <td>${this.escapeHtml(this.routeOf(group))}</td>
      <td class="money">${this.formatPlainNumber(this.groupBillingQuantity(group))} ${this.escapeHtml(this.groupBillingUnit(group))}</td>
      <td class="money">${this.formatMoney(group.matched_rate)}</td>
      <td class="money">${this.formatMoney(group.total_amount ?? group.amount)}</td>
    </tr>`).join('');

    return `<section>
      <h2>歸組結算</h2>
      <table class="print-table">
        <thead><tr><th>客戶</th><th>工種</th><th>路線</th><th class="right">計費數量</th><th class="right">單價</th><th class="right">金額</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }

  private infoRow(label: string, value: any) {
    return `<tr><td class="label">${this.escapeHtml(label)}</td><td>${this.escapeHtml(value || '-')}</td></tr>`;
  }

  private mediaDataUri(mediaUrl?: string | null) {
    if (!mediaUrl) return '';
    const relative = mediaUrl.replace(/^\/+uploads\//, '');
    const filePath = normalize(join(process.cwd(), 'uploads', relative));
    const uploadsRoot = normalize(join(process.cwd(), 'uploads'));
    if (!filePath.startsWith(uploadsRoot) || !existsSync(filePath)) return '';
    const ext = extname(filePath).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg';
    return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`;
  }

  private routeOf(row: any): string {
    return [row.start_location, row.end_location].filter(Boolean).join(' → ') || '-';
  }

  private groupBillingQuantity(group: any): number {
    if (group.billing_quantity !== null && group.billing_quantity !== undefined) {
      return this.toNumber(group.billing_quantity);
    }
    const type = group.billing_quantity_type || 'days';
    if (type === 'product_quantity') return this.toNumber(group.product_quantity);
    if (type === 'quantity') return this.toNumber(group.quantity);
    return this.toNumber(group.days || group.count || group.quantity);
  }

  private groupBillingUnit(group: any): string {
    const type = group.billing_quantity_type || 'days';
    if (type === 'product_quantity') return group.product_unit || group.matched_unit || '商品';
    if (type === 'quantity') return group.unit || group.matched_unit || '數量';
    return '天';
  }

  private getMpfPlanShortLabel(plan?: string | null): string {
    if (plan === 'industry') return '行業';
    if (plan === 'exempt_age65') return '過65歲, 不用供';
    if (plan === 'manulife') return '宏利';
    if (plan === 'aia') return 'AIA';
    return '一般';
  }

  private formatAdjustmentDateForTable(value?: string | null): string {
    if (!value) return '';
    const text = String(value).slice(0, 10);
    const parts = text.split('-');
    if (parts.length !== 3) return '';
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!Number.isFinite(month) || !Number.isFinite(day)) return '';
    return `${month}月${day}日`;
  }

  private getExpenseCategoryName(record: any): string {
    const category = record.expense?.category;
    if (!category) return '—';
    return category.parent?.name
      ? `${category.parent.name} / ${category.name || '—'}`
      : category.name || '—';
  }

  private formatEmployeeJoinDate(value?: string | Date | null): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  private formatFullDate(value?: string | Date | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  private formatDate(value?: string | Date | null): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  private formatMoney(value: any): string {
    return this.toNumber(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private formatPlainNumber(value: any): string {
    const n = this.toNumber(value);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  private toNumber(value: any): number {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private escapeHtml(value: any) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
