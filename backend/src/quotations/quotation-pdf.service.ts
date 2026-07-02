import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfUtilService } from '../common/pdf-util.service';
import { existsSync, readFileSync } from 'fs';
import { extname, join, normalize } from 'path';

export type QuotationPdfLanguage = 'zh' | 'en' | 'bilingual';

export interface QuotationPdfOptions {
  language?: QuotationPdfLanguage;
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
  overrideClientName?: string;
  fontSizes?: {
    title?: number;
    itemName?: number;
    itemDesc?: number;
    paymentTerms?: number;
  };
}

@Injectable()
export class QuotationPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfUtil: PdfUtilService,
  ) {}

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

    const pdf = await this.pdfUtil.renderHtmlToPdf(html, {
      pdfOptions: {
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      },
    });
    return { pdf, quotation };
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

    // Get system defaults for both font sizes and print settings
    const systemSettings = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            'quotation_pdf_title_font_size',
            'quotation_pdf_item_name_font_size',
            'quotation_pdf_item_desc_font_size',
            'quotation_pdf_payment_terms_font_size',
            'print_quotation_language',
            'print_quotation_show_client_address',
            'print_quotation_show_client_phone',
            'print_quotation_show_client_contact',
            'print_quotation_show_client_signature',
            'print_quotation_show_company_signature',
            'print_quotation_show_company_stamp',
          ],
        },
      },
    });
    const defaults = Object.fromEntries(systemSettings.map((s) => [s.key, s.value]));

    // Helper function to convert string boolean to actual boolean
    const toBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
      if (value === 'true') return true;
      if (value === 'false') return false;
      return defaultValue;
    };

    const language = this.normalizeLanguage(options.language || (defaults['print_quotation_language'] as any) || 'zh');
    const legacyShowSignature = options.showSignature ?? true;
    const showClientSignature = options.showClientSignature ?? toBoolean(defaults['print_quotation_show_client_signature'], legacyShowSignature);
    const showCompanySignature = options.showCompanySignature ?? toBoolean(defaults['print_quotation_show_company_signature'], legacyShowSignature);
    const showCompanyStamp = options.showCompanyStamp ?? toBoolean(defaults['print_quotation_show_company_stamp'], false);
    const showClientAddress = options.showClientAddress ?? toBoolean(defaults['print_quotation_show_client_address'], true);
    const showClientPhone = options.showClientPhone ?? toBoolean(defaults['print_quotation_show_client_phone'], true);
    const showClientContact = options.showClientContact ?? toBoolean(defaults['print_quotation_show_client_contact'], true);
    const showClientInfo = options.showClientInfo ?? true;

    // Merge font sizes: options > document override > system default
    const docFontSizes = (quotation.pdf_font_sizes as any) || {};
    const finalFontSizes = {
      title: Number(options.fontSizes?.title || docFontSizes.title || defaults['quotation_pdf_title_font_size'] || 25),
      itemName: Number(options.fontSizes?.itemName || docFontSizes.itemName || defaults['quotation_pdf_item_name_font_size'] || 13),
      itemDesc: Number(options.fontSizes?.itemDesc || docFontSizes.itemDesc || defaults['quotation_pdf_item_desc_font_size'] || 9),
      paymentTerms: Number(options.fontSizes?.paymentTerms || docFontSizes.paymentTerms || defaults['quotation_pdf_payment_terms_font_size'] || 11),
    };

    return {
      quotation,
      html: this.buildHtml(quotation as any, {
        language,
        showClientAddress,
        showClientPhone,
        showClientContact,
        showClientInfo,
        showSignature: showClientSignature || showCompanySignature,
        showClientSignature,
        showCompanySignature,
        showCompanyStamp,
        overridePaymentTerms: options.overridePaymentTerms ?? '',
        overrideClientAddress: options.overrideClientAddress ?? '',
        overrideClientContact: options.overrideClientContact ?? '',
        overrideClientPhone: options.overrideClientPhone ?? '',
        overrideClientName: options.overrideClientName ?? '',
        fontSizes: finalFontSizes,
      }),
    };
  }

  private buildHtml(quotation: any, options: Required<QuotationPdfOptions>) {
    const labels = this.labels(options.language);
    const company = quotation.company || {};
    const client = quotation.client || {};
    // PDF 顯示用客戶名稱：優先用 override（預覽即時輸入），其次資料庫 display_client_name，最後 fallback client.name
    const clientDisplayName =
      options.overrideClientName || quotation.display_client_name || client.name || '';
    const theme = this.sanitizeColor(company.invoice_color_theme || '#1a365d');
    const themeLightBg = this.hexToRgba(theme, 0.08);
    const themeLightBorder = this.hexToRgba(theme, 0.15);
    const logoDataUri = this.logoDataUri(company.company_logo_url);
    const stampDataUri = options.showCompanyStamp ? this.logoDataUri(company.company_stamp_url) : '';
    const quotationCompanyNameEn = this.invoiceCompanyNameEn(company);
    const quotationAddress = company.invoice_address || company.address || '';
    const quotationPhone = company.invoice_phone || company.phone || '';
    const quotationFax = company.invoice_fax || '';
    const displayClientAddress = options.overrideClientAddress || client.address || '';
    const displayClientContact = options.overrideClientContact || client.contact_person || '';
    const displayClientPhone = options.overrideClientPhone || client.phone || '';
    const companyMetaLines = [
      quotationAddress ? this.escapeHtml(quotationAddress) : '',
      [quotationPhone ? `Tel: ${this.escapeHtml(quotationPhone)}` : '', quotationFax ? `Fax: ${this.escapeHtml(quotationFax)}` : ''].filter(Boolean).join(' &nbsp; '),
    ].filter(Boolean).join('<br />');
    
    const paymentTerms = options.overridePaymentTerms !== undefined 
      ? options.overridePaymentTerms 
      : (quotation.payment_terms || '');

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
        <div class="section-label">${labels.to}</div>
        <div class="client-box">
          <div class="client-name">${this.escapeHtml(clientDisplayName)}</div>
          ${clientLines}
        </div>
      </div>`
      : '';

    const isRateOnlyItem = (item: any) => Boolean(item?.rate_only) || !item?.quantity || Number(item.quantity) === 0;
    const isRateOnlyTotal = (quotation.items || []).length > 0 && (quotation.items || []).every(isRateOnlyItem);

    const itemRows = (quotation.items || [])
      .map((item: any, idx: number) => {
        const name = item.item_name || '';
        const description = item.item_description || '';
        const rateOnly = isRateOnlyItem(item);
        return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td>
            <div class="item-title">${this.escapeHtml(name)}</div>
            ${description ? `<div class="sub-lines">${this.escapeMultiline(description)}</div>` : ''}
          </td>
          <td class="right">${rateOnly ? '—' : this.formatQuantity(item.quantity)}</td>
          <td class="center">${this.escapeHtml(item.unit || '')}</td>
          <td class="right">${this.formatMoney(item.unit_price, false)}</td>
          <td class="right">${rateOnly ? 'Rate Only' : this.formatMoney(item.amount, false)}</td>
        </tr>
      `;
      })
      .join('');

    const totalsRows = [
      this.totalRow(labels.total, isRateOnlyTotal ? 'Rate Only' : this.formatMoney(quotation.total_amount), true),
    ].join('');

    return `<!DOCTYPE html>
<html lang="${options.language === 'en' ? 'en' : 'zh-Hant'}">
<head>
  <meta charset="UTF-8" />
  <title>${this.escapeHtml(quotation.quotation_no || `quotation-${quotation.id}`)}_${this.escapeHtml(client.code || clientDisplayName || '')}_${this.escapeHtml(quotation.contract_name || quotation.project_name || '')}</title>
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
    .company-block, .brand-block, .client-section, .invoice-details, .terms-section, .signature-area { display: table-cell; vertical-align: top; }
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
    .details-table { width: 100%; border-collapse: collapse; font-size: 11px; }
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
    .items tbody td { padding: 6px 6px; border-bottom: none; vertical-align: top; color: #243b53; overflow-wrap: anywhere; }
    .items tbody tr:nth-child(even) td { background: ${themeLightBg}; }
    .items .center { text-align: center; }
    .items .right { text-align: right; white-space: nowrap; }
    .item-title { font-weight: 800; color: #1f2933; margin-bottom: 4px; overflow-wrap: anywhere; font-size: ${(options as any).fontSizes.itemName}px; }
    .sub-lines { color: #52606d; font-size: ${(options as any).fontSizes.itemDesc}px; line-height: 1.35; margin-top: 2px; overflow-wrap: anywhere; }
    .totals-row td { border-bottom: none !important; background: #ffffff !important; padding-top: 6px !important; padding-bottom: 6px !important; }
    .items tbody td.totals-label { text-align: right; font-weight: 800; color: #243b53; white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
    .items tbody td.totals-value { white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
    .grand-total td { background: ${themeLightBg} !important; border-top: 1.5px solid ${themeLightBg}; border-bottom: 1.5px solid ${themeLightBg} !important; font-size: 12px; font-weight: 900; color: ${theme}; }
    .after-table { margin-top: 9px; page-break-inside: avoid; display: flex; flex-direction: column; }
    .terms-section { width: 100%; }
    .terms-box { border: 1px solid ${themeLightBorder}; background: ${themeLightBg}; padding: 8px 10px; min-height: 52px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: ${(options as any).fontSizes.paymentTerms}px; }
    .footer-row { margin-top: 20px; page-break-inside: avoid; }
    .signature-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 24px; page-break-inside: avoid; border: none; }
    .signature-table td { width: 50%; vertical-align: bottom; border: none; padding: 0; }
    .signature-table td:first-child { padding-right: 18mm; }
    .signature-table td:last-child { padding-left: 18mm; }
    .signature-block { width: 100%; writing-mode: horizontal-tb; text-orientation: mixed; text-align: center; }
    .signature-stamp-space { height: 130px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; }
    .signature-stamp-space.empty { height: 130px; }
    .signature-line { border-top: 1.2px solid #243b53; width: 100%; height: 0; }
    .stamp-img { width: auto; max-width: 120px; max-height: 120px; object-fit: contain; display: block; }
    .signature-company-name { margin-top: 6px; text-align: center; font-size: 11px; font-weight: 800; color: #243b53; writing-mode: horizontal-tb; text-orientation: mixed; }
  </style>
</head>
<body>
  <div class="invoice-page">
    <div class="top-rule"></div>
    <div class="header">
      <div class="company-block">
        <div class="company-name-cn">${this.escapeHtml(company.name || '')}</div>
        ${quotationCompanyNameEn ? `<div class="company-name-en">${this.escapeHtml(quotationCompanyNameEn)}</div>` : ''}
        <div class="company-meta">${companyMetaLines}</div>
      </div>
      <div class="brand-block">
        ${logoDataUri ? `<img class="logo-img" src="${logoDataUri}" />` : `<div class="logo-placeholder"><span>${this.escapeHtml(quotationCompanyNameEn || company.name || 'COMPANY')}</span></div>`}
        <div class="invoice-title">${labels.quotationTitle}</div>
      </div>
    </div>
    <div class="subtle-line"></div>
    <div class="info-row">
      ${clientSectionHtml}
      <div class="invoice-details${options.showClientInfo ? '' : ' full'}">
        <div class="section-label">${labels.quotationDetails}</div>
        <div class="details-box">
          <table class="details-table">
            <tr><td>${labels.quotationNo}</td><td>${this.escapeHtml(quotation.quotation_no || '')}</td></tr>
            <tr><td>${labels.quotationDate}</td><td>${this.formatDate(quotation.quotation_date, options.language)}</td></tr>
            ${quotation.valid_until ? `<tr><td>${labels.validityPeriod}</td><td>${this.formatDate(quotation.valid_until, options.language)}</td></tr>` : ''}
          </table>
        </div>
      </div>
    </div>
    <div class="invoice-subject">${this.escapeHtml(quotation.project_name || labels.quotationTitle)}</div>
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

    <div class="after-table">
      <div class="terms-section">
        <div class="section-label">${labels.paymentTerms}</div>
        <div class="terms-box">${this.escapeMultiline(paymentTerms)}</div>
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
              <div class="signature-company-name">${this.escapeHtml(clientDisplayName)}</div>
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

  private labels(language: QuotationPdfLanguage) {
    const bilingual = {
      quotationTitle: 'QUOTATION 報價單',
      to: '致 To',
      quotationDetails: '報價單資料 Quotation Details',
      quotationNo: 'Quotation No.',
      quotationDate: 'Quotation Date',
      address: '地址 Address',
      phone: '電話 Phone',
      contact: '聯絡人 Contact',
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
        contact: 'Contact',
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
        contact: '聯絡人',
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
