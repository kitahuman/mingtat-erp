import { Injectable, NotFoundException } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { existsSync, readFileSync } from 'fs';
import { extname, normalize } from 'path';
import { PrismaService } from '../prisma/prisma.service';

interface BankInfo {
  bank_name?: string;
  account_name?: string;
  account_no?: string;
  show_bank?: boolean;
  show_account_name?: boolean;
  show_account_no?: boolean;
}

@Injectable()
export class InvoiceStatementPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateStatementHtml(statementId: number) {
    const { html } = await this.buildStatementHtmlData(statementId);
    return html;
  }

  async generateStatementPdf(statementId: number) {
    const { statement, html } = await this.buildStatementHtmlData(statementId);

    const browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');
      const pdf = await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      return { pdf: Buffer.from(pdf), statement };
    } finally {
      await browser.close();
    }
  }

  private async buildStatementHtmlData(statementId: number) {
    const statement = await this.prisma.invoiceStatement.findUnique({
      where: { id: statementId },
      include: {
        client: true,
        company: {
          include: {
            bank_accounts: {
              where: { is_active: true },
              orderBy: { id: 'asc' },
            },
          },
        },
        items: {
          orderBy: { sort_order: 'asc' },
          include: { invoice: true },
        },
      },
    });

    if (!statement || statement.deleted_at) {
      throw new NotFoundException('發票清單不存在');
    }

    return { statement, html: this.buildHtml(statement as any) };
  }

  private buildHtml(statement: any) {
    const company = statement.company || {};
    const client = statement.client || {};
    const theme = this.sanitizeColor(company.invoice_color_theme || '#1a365d');
    const themeLightBg = this.hexToRgba(theme, 0.08);
    const themeLightBorder = this.hexToRgba(theme, 0.15);
    const logoDataUri = this.logoDataUri(company.company_logo_url);
    const companyNameEn = company.invoice_company_name_en || company.name_en || '';
    const invoiceAddress = company.invoice_address || company.address || '';
    const invoicePhone = company.invoice_phone || company.phone || '';
    const invoiceFax = company.invoice_fax || '';
    const bankAccounts = company.bank_accounts || [];
    const bankInfo: BankInfo =
      bankAccounts.length > 0
        ? {
            bank_name: bankAccounts[0].bank_name,
            account_name: bankAccounts[0].account_name,
            account_no: bankAccounts[0].account_no,
            show_bank: true,
            show_account_name: true,
            show_account_no: true,
          }
        : this.parseBankInfo(company.invoice_bank_info);

    const otherCharges = Array.isArray(statement.statement_other_charges)
      ? statement.statement_other_charges
      : [];
    const surchargeTotal = otherCharges.reduce((sum: number, charge: any) => {
      const amount = Number(charge?.amount || 0);
      return amount > 0 ? sum + amount : sum;
    }, 0);
    const deductionTotal = otherCharges.reduce((sum: number, charge: any) => {
      const amount = Number(charge?.amount || 0);
      return amount < 0 ? sum + Math.abs(amount) : sum;
    }, 0);

    const companyMetaLines = [
      invoiceAddress ? this.escapeHtml(invoiceAddress) : '',
      [
        invoicePhone ? `Tel: ${this.escapeHtml(invoicePhone)}` : '',
        invoiceFax ? `Fax: ${this.escapeHtml(invoiceFax)}` : '',
      ]
        .filter(Boolean)
        .join(' &nbsp; '),
    ]
      .filter(Boolean)
      .join('<br />');

    // Display flags from statement
    const showPaidColumns = statement.statement_show_paid_columns === true;
    const showBankInfo = statement.statement_show_bank_info === true;
    const showSignature = statement.statement_show_signature === true;

    const invoiceRows = (statement.items || [])
      .map((item: any, index: number) => {
        // Use snapshot data instead of reading the live invoice; fall back to invoice if snapshot missing
        const invoice = item.invoice || {};
        const invoiceNo = item.item_invoice_no ?? invoice.invoice_no ?? '';
        const itemDate = item.item_date ?? invoice.date ?? null;
        const title = item.item_title ?? invoice.invoice_title ?? '';
        const amount = item.item_amount ?? invoice.total_amount ?? 0;
        const paid = item.item_paid_amount ?? invoice.paid_amount ?? 0;
        const outstanding = item.item_outstanding ?? invoice.outstanding ?? 0;
        // NOTE: status column is intentionally NOT rendered in the PDF
        return `
          <tr>
            <td class="center">${index + 1}</td>
            <td>${this.escapeHtml(invoiceNo)}</td>
            <td>${this.formatDate(itemDate)}</td>
            <td>${this.escapeHtml(title)}</td>
            <td class="right">${this.formatMoney(amount)}</td>
            ${
              showPaidColumns
                ? `<td class="right">${this.formatMoney(paid)}</td>
            <td class="right">${this.formatMoney(outstanding)}</td>`
                : ''
            }
          </tr>`;
      })
      .join('');

    const otherChargeRows = otherCharges
      .map((charge: any) =>
        this.totalRow(
          this.escapeHtml(charge?.name || '其他項目'),
          this.formatMoney(charge?.amount || 0),
        ),
      )
      .join('');

    const bankLines = [
      bankInfo.show_bank !== false && bankInfo.bank_name
        ? `<div><strong>Bank:</strong> ${this.escapeHtml(bankInfo.bank_name)}</div>`
        : '',
      bankInfo.show_account_name !== false && bankInfo.account_name
        ? `<div><strong>Account Name:</strong> ${this.escapeHtml(bankInfo.account_name)}</div>`
        : '',
      bankInfo.show_account_no !== false && bankInfo.account_no
        ? `<div><strong>Account No.:</strong> ${this.escapeHtml(bankInfo.account_no)}</div>`
        : '',
    ]
      .filter(Boolean)
      .join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${this.escapeHtml(statement.statement_no || 'Invoice Statement')}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #1f2937; font-family: Arial, 'Noto Sans HK', 'Microsoft JhengHei', sans-serif; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 15mm 14mm; position: relative; }
    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid ${theme}; padding-bottom: 18px; }
    .brand { display: flex; gap: 14px; align-items: flex-start; }
    .logo { width: 72px; height: 72px; object-fit: contain; }
    .company-name { font-size: 22px; font-weight: 800; color: ${theme}; letter-spacing: 0.03em; }
    .company-name-en { font-size: 13px; margin-top: 4px; color: #4b5563; }
    .company-meta { font-size: 10px; line-height: 1.6; margin-top: 8px; color: #4b5563; }
    .doc-title { text-align: right; }
    .doc-title h1 { margin: 0 0 10px; color: ${theme}; font-size: 28px; letter-spacing: 0.08em; }
    .doc-title .subtitle { color: #6b7280; font-size: 13px; letter-spacing: 0.12em; }
    .meta-table { margin-top: 10px; border-collapse: collapse; font-size: 11px; margin-left: auto; }
    .meta-table th { text-align: left; color: #6b7280; font-weight: 600; padding: 3px 8px; }
    .meta-table td { text-align: right; padding: 3px 0 3px 8px; font-weight: 700; }
    .section { margin-top: 18px; }
    .section-label { color: ${theme}; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; margin-bottom: 7px; text-transform: uppercase; }
    .client-box { border: 1px solid ${themeLightBorder}; background: ${themeLightBg}; border-radius: 8px; padding: 12px 14px; font-size: 12px; line-height: 1.6; }
    .client-name { font-size: 15px; font-weight: 800; color: #111827; margin-bottom: 4px; }
    table.statement-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
    .statement-table th { background: ${theme}; color: #fff; padding: 8px 6px; text-align: left; font-weight: 700; }
    .statement-table td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; vertical-align: top; }
    .statement-table tr:nth-child(even) td { background: #f9fafb; }
    .center { text-align: center; }
    .right { text-align: right; }
    .summary { margin-top: 18px; display: flex; justify-content: flex-end; }
    .summary table { min-width: 260px; border-collapse: collapse; font-size: 12px; }
    .summary td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; }
    .summary .label { color: #4b5563; }
    .summary .amount { text-align: right; font-weight: 700; }
    .summary .grand td { background: ${theme}; color: #fff; font-size: 14px; font-weight: 800; border-bottom: none; }
    .remarks, .bank { margin-top: 18px; font-size: 11px; line-height: 1.6; color: #374151; }
    .remarks-box, .bank-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; min-height: 42px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 34px; font-size: 11px; }
    .signature-line { height: 54px; border-bottom: 1px solid #9ca3af; margin-bottom: 6px; }
    .footer { position: absolute; left: 14mm; right: 14mm; bottom: 10mm; color: #9ca3af; font-size: 9px; text-align: center; }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="brand">
        ${logoDataUri ? `<img class="logo" src="${logoDataUri}" />` : ''}
        <div>
          <div class="company-name">${this.escapeHtml(company.name || '')}</div>
          ${companyNameEn ? `<div class="company-name-en">${this.escapeHtml(companyNameEn)}</div>` : ''}
          ${companyMetaLines ? `<div class="company-meta">${companyMetaLines}</div>` : ''}
        </div>
      </div>
      <div class="doc-title">
        <h1>客戶發票清單</h1>
        <div class="subtitle">INVOICE STATEMENT</div>
        <table class="meta-table">
          <tr><th>清單編號</th><td>${this.escapeHtml(statement.statement_no || '')}</td></tr>
          <tr><th>清單日期</th><td>${this.formatDate(statement.created_at)}</td></tr>
          <tr><th>期間</th><td>${this.formatDate(statement.statement_period_start)} - ${this.formatDate(statement.statement_period_end)}</td></tr>
        </table>
      </div>
    </header>

    <section class="section">
      <div class="section-label">Bill To / 客戶資料</div>
      <div class="client-box">
        <div class="client-name">${this.escapeHtml(client.name || '')}</div>
        ${client.address ? `<div><strong>地址：</strong>${this.escapeHtml(client.address)}</div>` : ''}
        ${client.contact_person ? `<div><strong>聯絡人：</strong>${this.escapeHtml(client.contact_person)}</div>` : ''}
        ${client.phone ? `<div><strong>電話：</strong>${this.escapeHtml(client.phone)}</div>` : ''}
      </div>
    </section>

    ${statement.statement_title ? `<section class="section"><div class="section-label">Title / 標題</div><div class="client-box">${this.escapeHtml(statement.statement_title)}</div></section>` : ''}

    <section class="section">
      <div class="section-label">Invoices / 發票明細</div>
      <table class="statement-table">
        <thead>
          <tr>
            <th class="center" style="width: 34px;">#</th>
            <th style="width: 95px;">發票編號</th>
            <th style="width: 74px;">日期</th>
            <th>標題</th>
            <th class="right" style="width: 82px;">金額</th>
            ${
              showPaidColumns
                ? `<th class="right" style="width: 82px;">已收</th>
            <th class="right" style="width: 82px;">未收</th>`
                : ''
            }
          </tr>
        </thead>
        <tbody>${invoiceRows}</tbody>
      </table>
    </section>

    <div class="summary">
      <table>
        ${this.totalRow('發票小計', this.formatMoney(statement.statement_subtotal))}
        ${surchargeTotal ? this.totalRow('其他增加項', this.formatMoney(surchargeTotal)) : ''}
        ${deductionTotal ? this.totalRow('其他扣減項', `-${this.formatMoney(deductionTotal)}`) : ''}
        ${otherChargeRows}
        <tr class="grand"><td>總金額</td><td class="amount">${this.formatMoney(statement.statement_total_amount)}</td></tr>
      </table>
    </div>

    ${statement.statement_remarks ? `<section class="remarks"><div class="section-label">Remarks / 備註</div><div class="remarks-box">${this.escapeMultiline(statement.statement_remarks)}</div></section>` : ''}
    ${showBankInfo && bankLines ? `<section class="bank"><div class="section-label">Payment / 付款資料</div><div class="bank-box">${bankLines}</div></section>` : ''}

    ${
      showSignature
        ? `<div class="signatures">
      <div><div class="signature-line"></div><div>客戶確認 Customer Signature</div></div>
      <div><div class="signature-line"></div><div>公司確認 Company Signature</div></div>
    </div>`
        : ''
    }
    <div class="footer">Generated by Mingtat ERP</div>
  </div>
</body>
</html>`;
  }

  private totalRow(label: string, amount: string) {
    return `<tr><td class="label">${label}</td><td class="amount">${amount}</td></tr>`;
  }

  private statusLabel(status: string | null | undefined) {
    const labels: Record<string, string> = {
      draft: '草稿',
      issued: '已開立',
      partially_paid: '部分收款',
      paid: '已收清',
      void: '已作廢',
    };
    return labels[String(status || '')] || this.escapeHtml(status || '');
  }

  private formatMoney(value: unknown) {
    return `$${Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private formatDate(value: unknown) {
    if (!value) return '';
    const date = new Date(value as any);
    if (Number.isNaN(date.getTime())) return '';
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  private escapeHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private escapeMultiline(value: unknown) {
    return this.escapeHtml(value).replace(/\n/g, '<br />');
  }

  private logoDataUri(pathOrUrl: string | null | undefined) {
    if (!pathOrUrl) return '';
    if (/^data:/i.test(pathOrUrl)) return pathOrUrl;
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

    const normalized = normalize(String(pathOrUrl));
    const candidates = [
      normalized,
      normalized.startsWith('/') ? normalized : `/${normalized}`,
      normalized.startsWith('/app/') ? normalized.replace(/^\/app/, '') : '',
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      const ext = extname(candidate).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.svg'
              ? 'image/svg+xml'
              : 'image/png';
      return `data:${mime};base64,${readFileSync(candidate).toString('base64')}`;
    }
    return '';
  }

  private parseBankInfo(value: unknown): BankInfo {
    if (!value) return {};
    if (typeof value === 'object') return value as BankInfo;
    try {
      return JSON.parse(String(value)) as BankInfo;
    } catch {
      return {};
    }
  }

  private sanitizeColor(value: string) {
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#1a365d';
  }

  private hexToRgba(hex: string, alpha: number) {
    const normalized = this.sanitizeColor(hex).replace('#', '');
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
