import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import puppeteer from 'puppeteer';
import { existsSync, readFileSync } from 'fs';
import { extname, join, normalize } from 'path';

export type QuotationPdfLanguage = 'zh' | 'en' | 'bilingual';

export interface QuotationPdfOptions {
  language?: QuotationPdfLanguage;
  showSignature?: boolean;
  overridePaymentTerms?: string;
}

@Injectable()
export class QuotationPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateQuotationHtml(
    quotationId: number,
    options: QuotationPdfOptions = {},
  ) {
    const { html } = await this.buildQuotationHtmlData(quotationId, options);
    return html;
  }

  async generateQuotationPdf(quotationId: number, options: QuotationPdfOptions = {}) {
    const { quotation, html } = await this.buildQuotationHtmlData(
      quotationId,
      options,
    );

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
      await page.setContent(html, { waitUntil: 'load' });
      const companyName = this.escapeHtml(
        quotation.company?.name_en || quotation.company?.name || 'Quotation',
      );
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width:100%; font-family:Arial, sans-serif; font-size:8px; color:#9aa5b1; padding:0 11mm; text-align:center;">
            ${companyName} · Quotation · Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `,
        margin: { top: '11mm', right: '11mm', bottom: '13mm', left: '11mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private async buildQuotationHtmlData(
    quotationId: number,
    options: QuotationPdfOptions = {},
  ) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        items: { orderBy: { sort_order: 'asc' } },
        client: true,
        company: true,
        project: true,
      },
    });

    if (!quotation || quotation.deleted_at)
      throw new NotFoundException('報價單不存在');

    const language = this.normalizeLanguage(options.language || 'zh');
    const showSignature = options.showSignature ?? true;

    return {
      quotation,
      html: this.buildHtml(quotation as any, {
        language,
        showSignature,
        overridePaymentTerms: options.overridePaymentTerms,
      }),
    };
  }

  private buildHtml(quotation: any, options: Required<QuotationPdfOptions>) {
    const labels = this.labels(options.language);
    const company = quotation.company || {};
    const client = quotation.client || {};
    const theme = this.sanitizeColor(company.invoice_color_theme || '#1a365d');
    const logoDataUri = this.logoDataUri(company.company_logo_url);
    
    const paymentTerms = options.overridePaymentTerms !== undefined 
      ? options.overridePaymentTerms 
      : (quotation.payment_terms || '');

    const itemRows = (quotation.items || [])
      .map((item: any, idx: number) => {
        const name = item.item_name || '';
        const description = item.item_description || '';
        return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td>
            <div class="item-title">${this.escapeHtml(name)}</div>
            ${description ? `<div class="sub-lines">${this.escapeMultiline(description)}</div>` : ''}
          </td>
          <td class="right">${this.formatQuantity(item.quantity)}</td>
          <td class="center">${this.escapeHtml(item.unit || '')}</td>
          <td class="right">${this.formatMoney(item.unit_price, false)}</td>
          <td class="right">${this.formatMoney(item.amount, false)}</td>
        </tr>
      `;
      })
      .join('');

    const totalsRows = [
      this.totalRow(labels.total, this.formatMoney(quotation.total_amount), true),
    ].join('');

    return `<!DOCTYPE html>
<html lang="${options.language === 'en' ? 'en' : 'zh-Hant'}">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4 portrait; margin: 11mm 11mm 13mm 11mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #ffffff; color: #1f2933;
      font-family: "Noto Sans CJK TC", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang TC", "Heiti TC", Arial, sans-serif;
      font-size: 11.5px; line-height: 1.45;
    }
    .invoice-page { width: 188mm; margin: 0 auto; background: #ffffff; }
    .top-rule { height: 5px; background: ${theme}; margin-bottom: 17px; border-radius: 2px; }
    .header, .info-row, .after-table, .footer-row { display: table; width: 100%; table-layout: fixed; }
    .company-block, .brand-block, .client-section, .invoice-details, .terms-section, .note-area, .signature-area { display: table-cell; vertical-align: top; }
    .company-block { width: 64%; padding-right: 18px; }
    .brand-block { width: 36%; text-align: right; }
    .company-name-cn { font-size: 25px; font-weight: 800; color: ${theme}; letter-spacing: 0.6px; margin: 0 0 2px 0; line-height: 1.15; }
    .company-name-en { font-size: 14px; font-weight: 700; color: #334e68; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .company-meta { color: #52606d; font-size: 10.6px; line-height: 1.5; }
    .logo-img { max-width: 175px; max-height: 64px; object-fit: contain; }
    .logo-placeholder { width: 175px; height: 54px; margin-left: auto; border: 1.4px solid ${theme}; color: ${theme}; font-size: 10px; font-weight: 800; letter-spacing: 0.8px; display: table; text-align: center; background: #f4f7fb; }
    .logo-placeholder span { display: table-cell; vertical-align: middle; padding: 7px; line-height: 1.25; }
    .invoice-title { margin-top: 13px; color: ${theme}; font-size: 25px; font-weight: 800; letter-spacing: 1.2px; text-align: right; }
    .subtle-line { border-top: 1px solid #d9e2ec; margin: 10px 0 15px 0; }
    .info-row { margin-bottom: 16px; }
    .client-section { width: 58%; padding-right: 16px; }
    .invoice-details { width: 42%; }
    .section-label { color: ${theme}; font-weight: 800; font-size: 12px; letter-spacing: 0.3px; margin-bottom: 6px; text-transform: uppercase; }
    .client-box, .details-box { border: 1px solid #d9e2ec; border-left: 4px solid ${theme}; padding: 10px 12px; min-height: 88px; background: #fbfdff; }
    .client-name { font-size: 13px; font-weight: 800; color: #243b53; margin-bottom: 5px; }
    .muted { color: #52606d; }
    .details-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .details-table td { padding: 3px 0; vertical-align: top; }
    .details-table td:first-child { color: #52606d; width: 42%; font-weight: 700; }
    .details-table td:last-child { color: #1f2933; font-weight: 700; text-align: right; }
    .invoice-subject { margin: 0 0 13px 0; padding: 9px 12px; border-left: 4px solid ${theme}; background: #f4f7fb; color: #243b53; font-size: 13px; font-weight: 800; overflow-wrap: anywhere; }
    table.items { width: 100%; border-collapse: collapse; margin-top: 7px; font-size: 10.6px; page-break-inside: auto; }
    .items thead { display: table-header-group; }
    .items tfoot { display: table-row-group; }
    .items tr { page-break-inside: avoid; page-break-after: auto; }
    .items thead th { background: ${theme}; color: #ffffff; padding: 8px 7px; font-weight: 800; text-align: left; border-right: 1px solid rgba(255,255,255,0.18); white-space: nowrap; }
    .items thead th:last-child { border-right: none; }
    .items tbody td { padding: 8px 7px; border-bottom: 1px solid #d9e2ec; vertical-align: top; color: #243b53; overflow-wrap: anywhere; }
    .items tbody tr:nth-child(even) td { background: #fbfdff; }
    .items .center { text-align: center; }
    .items .right { text-align: right; white-space: nowrap; }
    .item-title { font-weight: 800; color: #1f2933; margin-bottom: 4px; overflow-wrap: anywhere; }
    .sub-lines { color: #52606d; font-size: 9.6px; line-height: 1.45; margin-top: 2px; overflow-wrap: anywhere; }
    .totals-row td { border-bottom: none !important; background: #ffffff !important; padding-top: 6px !important; padding-bottom: 6px !important; }
    .totals-label { text-align: right; font-weight: 800; color: #243b53; }
    .grand-total td { background: #f4f7fb !important; border-top: 1.5px solid ${theme}; border-bottom: 1.5px solid ${theme} !important; font-size: 12px; font-weight: 900; color: ${theme}; }
    .after-table { margin-top: 15px; page-break-inside: avoid; }
    .terms-section { width: 100%; }
    .terms-box { border: 1px solid #d9e2ec; background: #fbfdff; padding: 10px 12px; min-height: 60px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .footer-row { margin-top: 24px; page-break-inside: avoid; }
    .note-area { width: 100%; color: #52606d; font-size: 10px; line-height: 1.45; margin-bottom: 20px; }
    .signature-container { display: table; width: 100%; table-layout: fixed; margin-top: 30px; }
    .signature-block { display: table-cell; vertical-align: bottom; width: 50%; }
    .signature-space { height: 60px; }
    .signature-line-box { border-top: 1.2px solid #243b53; width: 85%; padding-top: 7px; font-size: 10.5px; color: #52606d; text-align: center; }
    .signature-label { font-weight: 800; color: #243b53; margin-bottom: 5px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="invoice-page">
    <div class="top-rule"></div>
    <div class="header">
      <div class="company-block">
        <div class="company-name-cn">${this.escapeHtml(company.name || '')}</div>
        ${company.name_en ? `<div class="company-name-en">${this.escapeHtml(company.name_en)}</div>` : ''}
        <div class="company-meta">
          ${company.address ? `${this.escapeHtml(company.address)}<br />` : ''}
          ${company.phone ? `Tel: ${this.escapeHtml(company.phone)}` : ''}
        </div>
      </div>
      <div class="brand-block">
        ${logoDataUri ? `<img class="logo-img" src="${logoDataUri}" />` : `<div class="logo-placeholder"><span>${this.escapeHtml(company.name_en || company.name || 'COMPANY')}</span></div>`}
        <div class="invoice-title">${labels.quotationTitle}</div>
      </div>
    </div>
    <div class="subtle-line"></div>
    <div class="info-row">
      <div class="client-section">
        <div class="section-label">${labels.to}</div>
        <div class="client-box">
          <div class="client-name">${this.escapeHtml(client.name || '')}</div>
          ${client.address ? `<div><strong>${labels.address}：</strong><span class="muted">${this.escapeHtml(client.address)}</span></div>` : ''}
          ${client.phone ? `<div><strong>${labels.phone}：</strong><span class="muted">${this.escapeHtml(client.phone)}</span></div>` : ''}
        </div>
      </div>
      <div class="invoice-details">
        <div class="section-label">${labels.quotationDetails}</div>
        <div class="details-box">
          <table class="details-table">
            <tr><td>${labels.quotationNo}</td><td>${this.escapeHtml(quotation.quotation_no || '')}</td></tr>
            <tr><td>${labels.quotationDate}</td><td>${this.formatDate(quotation.quotation_date, options.language)}</td></tr>
          </table>
        </div>
      </div>
    </div>
    <div class="invoice-subject">${this.escapeHtml(quotation.project_name || labels.quotationTitle)}</div>
    <table class="items">
      <thead>
        <tr>
          <th style="width: 7%;">${labels.no}</th>
          <th style="width: 49%;">${labels.item}</th>
          <th style="width: 11%; text-align: right;">${labels.quantity}</th>
          <th style="width: 12%; text-align: center;">${labels.unit}</th>
          <th style="width: 10%; text-align: right;">${labels.unitPrice}</th>
          <th style="width: 11%; text-align: right;">${labels.amount}</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || `<tr><td colspan="6" class="center muted">${labels.noItems}</td></tr>`}
        ${totalsRows}
      </tbody>
    </table>

    <div class="after-table">
      <div class="terms-section">
        <div class="section-label">${labels.paymentTerms}</div>
        <div class="terms-box">${this.escapeMultiline(paymentTerms)}</div>
      </div>
    </div>

    <div class="footer-row">
      <div class="note-area">
        ${quotation.validity_period ? `<div><strong>${labels.validityPeriod}:</strong> ${this.escapeHtml(quotation.validity_period)}</div>` : ''}
        ${quotation.exclusions ? `<div><strong>${labels.exclusions}:</strong> ${this.escapeMultiline(quotation.exclusions)}</div>` : ''}
        ${quotation.external_remark ? `<div style="margin-top:5px;">${this.escapeMultiline(quotation.external_remark)}</div>` : ''}
      </div>

      ${options.showSignature ? `
      <div class="signature-container">
        <div class="signature-block">
          <div class="signature-label">${this.escapeHtml(company.name || '')}</div>
          <div class="signature-space"></div>
          <div class="signature-line-box">${labels.authorizedSignature}</div>
        </div>
        <div class="signature-block">
          <div class="signature-label">${labels.clientConfirmation}</div>
          <div class="signature-space"></div>
          <div class="signature-line-box">${labels.clientSignatureDate}</div>
        </div>
      </div>
      ` : ''}
    </div>
  </div>
</body>
</html>`;
  }

  private totalRow(label: string, value: string, grand: boolean) {
    return `
      <tr class="${grand ? 'grand-total' : 'totals-row'}">
        <td colspan="4"></td>
        <td class="totals-label">${this.escapeHtml(label)}</td>
        <td class="right"><strong>${this.escapeHtml(value)}</strong></td>
      </tr>
    `;
  }

  private labels(language: QuotationPdfLanguage) {
    const bilingual = {
      quotationTitle: 'QUOTATION 報價單',
      to: '致 To',
      quotationDetails: '報價單資料 Quotation Details',
      quotationNo: 'Quotation No.',
      quotationDate: 'Quotation Date',
      address: '地址 Address',
      phone: '電話 Phone',
      no: '編號',
      item: '項目',
      quantity: '數量',
      unit: '單位類型',
      unitPrice: '單價',
      amount: '金額',
      total: '總數 Total (HKD)',
      paymentTerms: '付款條款 Payment Terms',
      authorizedSignature: 'Authorized Signature / 公司簽署',
      clientConfirmation: 'Client Confirmation / 客戶確認',
      clientSignatureDate: 'Authorized Signature & Date / 簽署及日期',
      noItems: '沒有項目 No items',
      validityPeriod: '有效期 Validity Period',
      exclusions: '不包括 Exclusions',
    };
    if (language === 'en') {
      return {
        ...bilingual,
        quotationTitle: 'QUOTATION',
        to: 'To',
        quotationDetails: 'Quotation Details',
        address: 'Address',
        phone: 'Phone',
        no: 'No.',
        item: 'Item',
        quantity: 'Qty',
        unit: 'Unit',
        unitPrice: 'Unit Price',
        amount: 'Amount',
        total: 'Total (HKD)',
        paymentTerms: 'Payment Terms',
        authorizedSignature: 'Authorized Signature',
        clientConfirmation: 'Client Confirmation',
        clientSignatureDate: 'Authorized Signature & Date',
        noItems: 'No items',
        validityPeriod: 'Validity Period',
        exclusions: 'Exclusions',
      };
    }
    if (language === 'zh') {
      return {
        ...bilingual,
        quotationTitle: '報價單',
        to: '致',
        quotationDetails: '報價單資料',
        quotationDate: '報價單日期',
        address: '地址',
        phone: '電話',
        total: '總數 (HKD)',
        paymentTerms: '付款條款',
        authorizedSignature: '公司簽署',
        clientConfirmation: '客戶確認',
        clientSignatureDate: '簽署及日期',
        noItems: '沒有項目',
        validityPeriod: '有效期',
        exclusions: '不包括',
      };
    }
    return bilingual;
  }

  private normalizeLanguage(language: string): QuotationPdfLanguage {
    return language === 'en' || language === 'bilingual' ? language : 'zh';
  }

  private logoDataUri(logoUrl?: string | null) {
    if (!logoUrl) return '';
    const relative = logoUrl.replace(/^\/+uploads\//, '');
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

  private sanitizeColor(color: string) {
    return /^#[0-9a-fA-F]{6}$/.test(color) || /^#[0-9a-fA-F]{3}$/.test(color)
      ? color
      : '#1a365d';
  }

  private formatDate(value: Date | string, language: QuotationPdfLanguage) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    if (language === 'en') return date.toISOString().slice(0, 10);
    return `${date.getUTCFullYear()}年${String(date.getUTCMonth() + 1).padStart(2, '0')}月${String(date.getUTCDate()).padStart(2, '0')}日`;
  }

  private formatMoney(value: any, withCurrency = true) {
    const amount = Number(value || 0);
    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return withCurrency ? `$${formatted}` : formatted;
  }

  private formatQuantity(value: any) {
    const num = Number(value || 0);
    return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  private escapeHtml(value: any) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private escapeMultiline(value: any) {
    return this.escapeHtml(value).replace(/\n/g, '<br />');
  }
}
