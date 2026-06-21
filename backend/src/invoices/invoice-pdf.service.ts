import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import puppeteer from 'puppeteer';
import { existsSync, readFileSync } from 'fs';
import { extname, join, normalize } from 'path';

export type InvoicePdfLanguage = 'zh' | 'en' | 'bilingual';

export interface InvoicePdfOptions {
  language?: InvoicePdfLanguage;
  showBank?: boolean;
  showClientAddress?: boolean;
  showClientPhone?: boolean;
  showClientContact?: boolean;
  showClientInfo?: boolean;
  showSignature?: boolean;
  showClientSignature?: boolean;
  showCompanySignature?: boolean;
  showCompanyStamp?: boolean;
  overridePaymentTerms?: string;
  overrideClientAddress?: string;
  overrideClientContact?: string;
  overrideClientPhone?: string;
  fontSizes?: {
    title?: number;
    itemName?: number;
    itemDesc?: number;
    paymentTerms?: number;
  };
}

interface BankInfo {
  bank_name?: string;
  account_name?: string;
  account_no?: string;
  show_bank?: boolean;
  show_account_name?: boolean;
  show_account_no?: boolean;
}

@Injectable()
export class InvoicePdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateInvoiceHtml(
    invoiceId: number,
    options: InvoicePdfOptions = {},
  ) {
    const { html } = await this.buildInvoiceHtmlData(invoiceId, options);
    return html;
  }

  async generateInvoicePdf(invoiceId: number, options: InvoicePdfOptions = {}) {
    const { invoice, html } = await this.buildInvoiceHtmlData(
      invoiceId,
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
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');
      const companyName = this.escapeHtml(
        this.invoiceCompanyNameEn(invoice.company) || invoice.company?.name || 'Invoice',
      );
      const invoiceNo = invoice.invoice_no || '';
      const pdf = await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `
          <div style="width: 100%; font-size: 9px; color: #666; padding: 0 10mm; display: flex; justify-content: space-between; align-items: center;">
            <span>${invoiceNo}</span>
            <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
          </div>
        `,
        margin: { top: '0', right: '0', bottom: '14mm', left: '0' },
      });
      return { pdf: Buffer.from(pdf), invoice };
    } finally {
      await browser.close();
    }
  }

  private async buildInvoiceHtmlData(
    invoiceId: number,
    options: InvoicePdfOptions = {},
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: { orderBy: { sort_order: 'asc' } },
        client: true,
        company: {
          include: {
            bank_accounts: {
              where: { is_active: true },
              orderBy: { id: 'asc' },
            },
          },
        },
        project: true,
        quotation: true,
      },
    });

    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');

    const language = this.normalizeLanguage(
      options.language ||
        (invoice.invoice_language as InvoicePdfLanguage) ||
        'zh',
    );
    const showBank = options.showBank ?? invoice.invoice_show_bank;
    const showClientAddress =
      options.showClientAddress ?? invoice.invoice_show_client_address;
    const showClientPhone =
      options.showClientPhone ?? invoice.invoice_show_client_phone;
    const showClientContact = options.showClientContact ?? true;
    const showClientInfo = options.showClientInfo ?? true;
    const legacyShowSignature = options.showSignature ?? true;
    const showClientSignature = options.showClientSignature ?? legacyShowSignature;
    const showCompanySignature = options.showCompanySignature ?? legacyShowSignature;
    const showCompanyStamp = options.showCompanyStamp ?? false;

    const systemSettings = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            'invoice_pdf_title_font_size',
            'invoice_pdf_item_name_font_size',
            'invoice_pdf_item_desc_font_size',
            'invoice_pdf_payment_terms_font_size',
          ],
        },
      },
    });
    const defaults = Object.fromEntries(
      systemSettings.map((setting) => [setting.key, setting.value]),
    );
    const docFontSizes = (invoice.pdf_font_sizes as any) || {};
    const finalFontSizes = {
      title: this.resolveFontSize(
        options.fontSizes?.title,
        docFontSizes.title,
        defaults['invoice_pdf_title_font_size'],
        25,
      ),
      itemName: this.resolveFontSize(
        options.fontSizes?.itemName,
        docFontSizes.itemName,
        defaults['invoice_pdf_item_name_font_size'],
        13,
      ),
      itemDesc: this.resolveFontSize(
        options.fontSizes?.itemDesc,
        docFontSizes.itemDesc,
        defaults['invoice_pdf_item_desc_font_size'],
        9,
      ),
      paymentTerms: this.resolveFontSize(
        options.fontSizes?.paymentTerms,
        docFontSizes.paymentTerms,
        defaults['invoice_pdf_payment_terms_font_size'],
        11,
      ),
    };

    return {
      invoice,
      html: this.buildHtml(invoice as any, {
        language,
        showBank,
        showClientAddress,
        showClientPhone,
        showClientContact,
        showClientInfo,
        showSignature: showClientSignature || showCompanySignature,
        showClientSignature,
        showCompanySignature,
        showCompanyStamp,
        overridePaymentTerms: options.overridePaymentTerms || '',
        overrideClientAddress: options.overrideClientAddress || '',
        overrideClientContact: options.overrideClientContact || '',
        overrideClientPhone: options.overrideClientPhone || '',
        fontSizes: finalFontSizes,
      }),
    };
  }

  private resolveFontSize(
    optionValue: unknown,
    documentValue: unknown,
    systemDefaultValue: unknown,
    fallback: number,
  ): number {
    for (const value of [optionValue, documentValue, systemDefaultValue, fallback]) {
      if (value === undefined || value === null || value === '') continue;
      const numberValue = Number(value);
      if (Number.isFinite(numberValue) && numberValue > 0) return numberValue;
    }
    return fallback;
  }

  private buildHtml(invoice: any, options: Required<InvoicePdfOptions>) {
    const labels = this.labels(options.language);
    const company = invoice.company || {};
    const client = invoice.client || {};
    const theme = this.sanitizeColor(company.invoice_color_theme || '#1a365d');
    const themeLightBg = this.hexToRgba(theme, 0.08);
    const themeLightBorder = this.hexToRgba(theme, 0.15);
    const logoDataUri = this.logoDataUri(company.company_logo_url);
    const stampDataUri = options.showCompanyStamp ? this.logoDataUri(company.company_stamp_url) : '';
    const invoiceCompanyNameEn = this.invoiceCompanyNameEn(company);
    const invoiceAddress = company.invoice_address || company.address || '';
    const invoicePhone = company.invoice_phone || company.phone || '';
    const displayClientAddress = options.overrideClientAddress || client.address || '';
    const displayClientContact = options.overrideClientContact || client.contact_person || '';
    const displayClientPhone = options.overrideClientPhone || client.phone || '';
    const invoiceFax = company.invoice_fax || '';
    const companyMetaLines = [
      invoiceAddress ? this.escapeHtml(invoiceAddress) : '',
      [invoicePhone ? `Tel: ${this.escapeHtml(invoicePhone)}` : '', invoiceFax ? `Fax: ${this.escapeHtml(invoiceFax)}` : ''].filter(Boolean).join(' &nbsp; '),
    ].filter(Boolean).join('<br />');
    // Use existing BankAccount records linked to the company (from bank_accounts module)
    const bankAccounts = (company as any).bank_accounts || [];
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
    const paymentTerms = options.overridePaymentTerms 
      ? options.overridePaymentTerms
      : (invoice.invoice_custom_payment_terms ||
        invoice.payment_terms ||
        company.invoice_default_payment_terms ||
        '');

    const otherCharges = Array.isArray(invoice.other_charges)
      ? invoice.other_charges
      : [];
    const surchargeTotal = otherCharges.reduce((sum: number, charge: any) => {
      const amount = Number(charge?.amount || 0);
      return amount > 0 ? sum + amount : sum;
    }, 0);
    const deductionTotal = otherCharges.reduce((sum: number, charge: any) => {
      const amount = Number(charge?.amount || 0);
      return amount < 0 ? sum + Math.abs(amount) : sum;
    }, 0);
    const retentionRate = Number(invoice.retention_rate || 0);
    const retentionAmount = Number(invoice.retention_amount || 0);

    const clientLines = [
      options.showClientAddress && displayClientAddress
        ? `<div><strong>${labels.address}：</strong><span class="muted">${this.escapeHtml(displayClientAddress)}</span></div>`
        : '',
      options.showClientContact && displayClientContact
        ? `<div><strong>${labels.contact}：</strong><span class="muted">${this.escapeHtml(displayClientContact)}</span></div>`
        : '',
      options.showClientPhone && displayClientPhone
        ? `<div><strong>${labels.phone}：</strong><span class="muted">${this.escapeHtml(displayClientPhone)}</span></div>`
        : '',
    ].join('');
    const clientSectionHtml = options.showClientInfo
      ? `
      <div class="client-section">
        <div class="section-label">${labels.billTo}</div>
        <div class="client-box">
          <div class="client-name">${this.escapeHtml(client.name || '')}</div>
          ${clientLines}
        </div>
      </div>`
      : '';

    const bankRows = [
      options.showBank && bankInfo.show_bank !== false && bankInfo.bank_name
        ? `<tr><td>${labels.bank}</td><td>${this.escapeHtml(bankInfo.bank_name)}</td></tr>`
        : '',
      options.showBank &&
      bankInfo.show_account_name !== false &&
      bankInfo.account_name
        ? `<tr><td>${labels.accountName}</td><td>${this.escapeHtml(bankInfo.account_name)}</td></tr>`
        : '',
      options.showBank &&
      bankInfo.show_account_no !== false &&
      bankInfo.account_no
        ? `<tr><td>${labels.accountNo}</td><td>${this.escapeHtml(bankInfo.account_no)}</td></tr>`
        : '',
    ].join('');

    const itemRows = (invoice.items || [])
      .map((item: any, idx: number) => {
        const name = item.item_name || item.description || '';
        const description =
          item.item_name && item.description ? item.description : '';
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
      this.totalRow(labels.subtotal, this.formatMoney(invoice.subtotal), false),
      surchargeTotal > 0
        ? this.totalRow(
            labels.surcharge,
            `+${this.formatMoney(surchargeTotal)}`,
            false,
          )
        : '',
      deductionTotal > 0
        ? this.totalRow(
            labels.deduction,
            `-${this.formatMoney(deductionTotal)}`,
            false,
          )
        : '',
      retentionRate > 0 && retentionAmount > 0
        ? this.totalRow(
            `${labels.retention} ${this.formatPercent(retentionRate)}`,
            `-${this.formatMoney(retentionAmount)}`,
            false,
          )
        : '',
      this.totalRow(
        labels.netAmountDue,
        this.formatMoney(invoice.total_amount),
        true,
      ),
    ].join('');

    return `<!DOCTYPE html>
<html lang="${options.language === 'en' ? 'en' : 'zh-Hant'}">
<head>
  <meta charset="UTF-8" />
  <title>${this.escapeHtml(invoice.invoice_no || '')}_${this.escapeHtml(client.code || client.name || '')}_${this.escapeHtml(invoice.invoice_title || '')}</title>
  <style>
    @page { size: A4 portrait; margin: 9mm 10mm 9mm 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #ffffff; color: #1f2933;
      font-family: "Noto Sans CJK TC", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang TC", "Heiti TC", Arial, sans-serif;
      font-size: 11.2px; line-height: 1.38;
    }
    .invoice-page { width: 100%; margin: 0; background: #ffffff; page-break-after: auto; }
    .top-rule { height: 4px; background: ${theme}; margin-bottom: 13px; border-radius: 2px; }
    .header, .info-row, .after-table, .footer-row { display: table; width: 100%; table-layout: fixed; }
    .company-block, .brand-block, .client-section, .invoice-details, .terms-section, .payment-section, .signature-area { display: table-cell; vertical-align: top; }
    .company-block { width: 64%; padding-right: 18px; }
    .brand-block { width: 36%; text-align: right; }
    .company-name-cn { font-size: 24px; font-weight: 800; color: ${theme}; letter-spacing: 0.6px; margin: 0 0 2px 0; line-height: 1.15; }
    .company-name-en { font-size: 13px; font-weight: 700; color: #334e68; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .company-meta { color: #52606d; font-size: 10.6px; line-height: 1.5; }
    .logo-img { max-width: 175px; max-height: 58px; object-fit: contain; }
    .logo-placeholder { width: 175px; height: 48px; margin-left: auto; border: 1.4px solid ${theme}; color: ${theme}; font-size: 10px; font-weight: 800; letter-spacing: 0.8px; display: table; text-align: center; background: ${themeLightBg}; }
    .logo-placeholder span { display: table-cell; vertical-align: middle; padding: 7px; line-height: 1.25; }
    .invoice-title { margin-top: 10px; color: ${theme}; font-size: ${(options as any).fontSizes.title}px; font-weight: 800; letter-spacing: 1.2px; text-align: right; }
    .subtle-line { border-top: 1px solid ${themeLightBorder}; margin: 8px 0 12px 0; }
    .info-row { margin-bottom: 12px; }
    .client-section { width: 58%; padding-right: 16px; }
    .invoice-details { width: 42%; }
    .invoice-details.full { width: 100%; }
    .section-label { color: ${theme}; font-weight: 800; font-size: 12px; letter-spacing: 0.3px; margin-bottom: 6px; text-transform: uppercase; }
    .client-box, .details-box { border: 1px solid ${themeLightBorder}; border-left: 4px solid ${theme}; padding: 8px 10px; min-height: 72px; background: ${themeLightBg}; }
    .client-name { font-size: 13px; font-weight: 800; color: #243b53; margin-bottom: 5px; }
    .muted { color: #52606d; }
    .details-table, .payment-table { width: 100%; border-collapse: collapse; }
    .details-table { font-size: 11px; }
    .details-table td { padding: 3px 0; vertical-align: top; }
    .details-table td:first-child { color: #52606d; width: 42%; font-weight: 700; }
    .details-table td:last-child { color: #1f2933; font-weight: 700; text-align: right; }
    .invoice-subject { margin: 0 0 10px 0; padding: 8px 10px; border-left: 4px solid ${theme}; background: ${themeLightBg}; color: #243b53; font-size: 13px; font-weight: 800; overflow-wrap: anywhere; }
    table.items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 6px; font-size: 10.3px; page-break-inside: auto; }
    .items thead { display: table-header-group; }
    .items tfoot { display: table-row-group; }
    .items tr { page-break-inside: avoid; page-break-after: auto; }
    .items thead th { background: ${theme}; color: #ffffff; padding: 5px 6px 4px; font-weight: 800; text-align: left; border-right: 1px solid rgba(255,255,255,0.18); white-space: nowrap; line-height: 1.12; }
    .items thead th:last-child { border-right: none; }
    .items tbody td { padding: 6px 6px; border-bottom: 1px solid ${themeLightBorder}; vertical-align: top; color: #243b53; overflow-wrap: anywhere; }
    .items tbody tr:nth-child(even) td { background: ${themeLightBg}; }
    .items .center { text-align: center; }
    .items .right { text-align: right; }
    .item-title { font-weight: 800; color: #1f2933; margin-bottom: 4px; overflow-wrap: anywhere; font-size: ${(options as any).fontSizes.itemName}px; }
    .sub-lines { color: #52606d; font-size: ${(options as any).fontSizes.itemDesc}px; line-height: 1.35; margin-top: 2px; overflow-wrap: anywhere; }
    .totals-row td { border-bottom: none !important; background: #ffffff !important; padding-top: 6px !important; padding-bottom: 6px !important; }
    .items tbody td.totals-label { text-align: right; font-weight: 800; color: #243b53; white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
    .items tbody td.totals-value { white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
    .grand-total td { background: ${themeLightBg} !important; border-top: 1.5px solid ${theme}; border-bottom: 1.5px solid ${theme} !important; font-size: 12px; font-weight: 900; color: ${theme}; }
    .avoid-break { page-break-inside: avoid; }
    .after-table { margin-top: 9px; display: flex; flex-direction: column; }
    .terms-section { width: 100%; padding-right: 0; margin-bottom: 10px; }
    .payment-section { width: 100%; }
    .terms-box { border: 1px solid ${themeLightBorder}; background: ${themeLightBg}; padding: 8px 10px; min-height: 72px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: ${(options as any).fontSizes.paymentTerms}px; }
    .payment-box { border: 1.2px solid ${theme}; padding: 8px 10px; background: #ffffff; min-height: 88px; }
    .payment-title { color: ${theme}; font-weight: 900; font-size: 12px; margin-bottom: 7px; border-bottom: 1px solid ${themeLightBorder}; padding-bottom: 5px; }
    .payment-table { font-size: 10.8px; }
    .payment-table td { padding: 3px 0; vertical-align: top; }
    .payment-table td:first-child { width: 34%; color: #52606d; font-weight: 800; }
    .payment-table td:last-child { color: #1f2933; font-weight: 700; overflow-wrap: anywhere; }
    .footer-row { margin-top: 20px; }
    .signature-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 24px; border: none; }
    .signature-table td { width: 50%; vertical-align: bottom; border: none; padding: 0; }
    .signature-table td:first-child { padding-right: 18mm; }
    .signature-table td:last-child { padding-left: 18mm; }
    .signature-block { width: 100%; writing-mode: horizontal-tb; text-orientation: mixed; text-align: center; }
    .signature-stamp-space { height: 100px; margin-bottom: 0px; display: flex; align-items: flex-end; justify-content: center; }
    .signature-stamp-space.empty { height: 100px; }
    .signature-line { border-top: 1.2px solid #243b53; width: 100%; height: 0; }
    .stamp-img { width: auto; max-width: 120px; max-height: 100px; object-fit: contain; display: block; margin-bottom: 0; }
    .signature-company-name { margin-top: 6px; text-align: center; font-size: 11px; font-weight: 800; color: #243b53; writing-mode: horizontal-tb; text-orientation: mixed; }
  </style>
</head>
<body>
  <div class="invoice-page">
    <div class="top-rule"></div>
    <div class="header">
      <div class="company-block">
        <div class="company-name-cn">${this.escapeHtml(company.name || '')}</div>
        ${invoiceCompanyNameEn ? `<div class="company-name-en">${this.escapeHtml(invoiceCompanyNameEn)}</div>` : ''}
        <div class="company-meta">${companyMetaLines}</div>
      </div>
      <div class="brand-block">
        ${logoDataUri ? `<img class="logo-img" src="${logoDataUri}" />` : `<div class="logo-placeholder"><span>${this.escapeHtml(invoiceCompanyNameEn || company.name || 'COMPANY')}</span></div>`}
        <div class="invoice-title">${labels.invoiceTitle}</div>
      </div>
    </div>
    <div class="subtle-line"></div>
    <div class="info-row">
      ${clientSectionHtml}
      <div class="invoice-details${options.showClientInfo ? '' : ' full'}">
        <div class="section-label">${labels.invoiceDetails}</div>
        <div class="details-box">
          <table class="details-table">
            <tr><td>${labels.invoiceNo}</td><td>${this.escapeHtml(invoice.invoice_no || '')}</td></tr>
            <tr><td>${labels.invoiceDate}</td><td>${this.formatDate(invoice.date, options.language)}</td></tr>
            ${invoice.due_date ? `<tr><td>${labels.dueDate}</td><td>${this.formatDate(invoice.due_date, options.language)}</td></tr>` : ''}
          </table>
        </div>
      </div>
    </div>
    <div class="invoice-subject">${this.escapeHtml(invoice.invoice_title || invoice.project?.project_name || invoice.quotation?.project_name || labels.invoiceTitle)}</div>
    <table class="items">
      <thead>
        <tr>
          <th style="width: 8%;">${labels.no}</th>
          <th style="width: 44%;">${labels.item}</th>
          <th style="width: 10%; text-align: right;">${labels.quantity}</th>
          <th style="width: 11%; text-align: center;">${labels.unit}</th>
          <th style="width: 13.5%; text-align: right;">${labels.unitPrice}</th>
          <th style="width: 13.5%; text-align: right;">${labels.amount}</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || `<tr><td colspan="6" class="center muted">${labels.noItems}</td></tr>`}
        ${totalsRows}
      </tbody>
    </table>
    <div class="avoid-break">
      <div class="after-table">
        <div class="terms-section">
          <div class="section-label">${labels.paymentTerms}</div>
          <div class="terms-box">${this.escapeMultiline(paymentTerms)}</div>
        </div>
        <div class="payment-section">
          ${
            options.showBank && bankRows
              ? `
          <div class="payment-box">
            <div class="payment-title">${labels.paymentDetails}</div>
            <table class="payment-table">${bankRows}</table>
          </div>`
              : ''
          }
        </div>
      </div>
      <div class="footer-row">
        ${options.showClientSignature || options.showCompanySignature ? `
        <table class="signature-table">
          <tr>
            <td>
              ${options.showClientSignature ? `
              <div class="signature-block">
                <div class="signature-stamp-space empty"></div>
                <div class="signature-line"></div>
                <div class="signature-company-name">${this.escapeHtml(client.name || '')}</div>
              </div>` : ''}
            </td>
            <td>
              ${options.showCompanySignature ? `
              <div class="signature-block">
                <div class="signature-stamp-space${stampDataUri ? '' : ' empty'}">${stampDataUri ? `<img class="stamp-img" src="${stampDataUri}" />` : ''}</div>
                <div class="signature-line"></div>
                <div class="signature-company-name">${this.escapeHtml(company.name || '')}</div>
              </div>` : ''}
            </td>
          </tr>
        </table>
        ` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private totalRow(label: string, value: string, grand: boolean) {
    return `
      <tr class="${grand ? 'grand-total' : 'totals-row'}">
        <td colspan="3"></td>
        <td colspan="2" class="totals-label">${this.escapeHtml(label)}</td>
        <td class="right totals-value"><strong>${this.escapeHtml(value)}</strong></td>
      </tr>
    `;
  }

  private labels(language: InvoicePdfLanguage) {
    const bilingual = {
      invoiceTitle: 'INVOICE 發票',
      billTo: '致 Bill To',
      invoiceDetails: '發票資料 Invoice Details',
      invoiceNo: 'Invoice No.',
      invoiceDate: 'Invoice Date',
      dueDate: 'Due Date',
      address: '地址 Address',
      contact: '聯絡人 Contact',
      phone: '電話 Phone',
      no: '編號',
      item: '項目',
      quantity: '數量',
      unit: '單位類型',
      unitPrice: '單價',
      amount: '金額',
      subtotal: '小計 Subtotal (HKD)',
      surcharge: '附加費 Surcharge',
      deduction: '扣款 Deduction',
      retention: 'Less Retention',
      netAmountDue: '總數 Net Amount Due (HKD)',
      paymentTerms: '付款條款 Payment Terms',
      paymentDetails: '付款資料 Payment Details',
      bank: 'Bank',
      accountName: 'Account Name',
      accountNo: 'Account No.',
      noItems: '沒有項目 No items',
    };
    if (language === 'en') {
      return {
        ...bilingual,
        invoiceTitle: 'INVOICE',
        billTo: 'Bill To',
        invoiceDetails: 'Invoice Details',
        address: 'Address',
        contact: 'Contact',
        phone: 'Phone',
        no: 'No.',
        item: 'Item',
        quantity: 'Qty',
        unit: 'Unit',
        unitPrice: 'Unit Price',
        amount: 'Amount',
        subtotal: 'Subtotal (HKD)',
        surcharge: 'Surcharge',
        deduction: 'Deduction',
        netAmountDue: 'Net Amount Due (HKD)',
        paymentTerms: 'Payment Terms',
        paymentDetails: 'Payment Details',
        authorizedSignature: 'Authorized Signature',
        clientConfirmation: 'Client Confirmation',
        clientSignatureDate: 'Authorized Signature & Date',
        clientSignatureStamp: 'Client Signature/Stamp',
        clientSignatureLine: 'Client Signature/Stamp: ____________________',
        companyStamp: 'Company Stamp',
        noItems: 'No items',
      };
    }
    if (language === 'zh') {
      return {
        ...bilingual,
        invoiceTitle: '發票',
        billTo: '致',
        invoiceDetails: '發票資料',
        invoiceDate: '發票日期',
        dueDate: '到期日',
        address: '地址',
        contact: '聯絡人',
        phone: '電話',
        subtotal: '小計 (HKD)',
        surcharge: '附加費',
        deduction: '扣款',
        retention: '保留金',
        netAmountDue: '總數 (HKD)',
        paymentTerms: '付款條款',
        paymentDetails: '付款資料',
        bank: '銀行',
        accountName: '戶口名稱',
        accountNo: '戶口號碼',
        noItems: '沒有項目',
      };
    }
    return bilingual;
  }

  private normalizeLanguage(language: string): InvoicePdfLanguage {
    return language === 'en' || language === 'bilingual' ? language : 'zh';
  }

  private parseBankInfo(value: any): BankInfo {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
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

  private invoiceCompanyNameEn(company?: { invoice_company_name_en?: string | null }) {
    return (company?.invoice_company_name_en || '').trim();
  }

  private sanitizeColor(color: string) {
    return /^#[0-9a-fA-F]{6}$/.test(color) || /^#[0-9a-fA-F]{3}$/.test(color)
      ? color
      : '#1a365d';
  }

  private hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private formatDate(value: Date | string, language: InvoicePdfLanguage) {
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

  private formatPercent(value: number) {
    return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
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
