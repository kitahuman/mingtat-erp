import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfUtilService } from '../common/pdf-util.service';
import { existsSync, readFileSync } from 'fs';
import { extname, join, normalize } from 'path';

export type ReceiptPdfLanguage = 'zh' | 'en' | 'bilingual';

export interface ReceiptPdfOptions {
  language?: ReceiptPdfLanguage;
  showClientAddress?: boolean;
  showClientPhone?: boolean;
  showClientContact?: boolean;
  showClientSignature?: boolean;
  showCompanySignature?: boolean;
  showCompanyStamp?: boolean;
  overrideClientName?: string;
}

export interface ReceiptOptions extends ReceiptPdfOptions {
  // Stored in receipt_options JSON column
}

@Injectable()
export class ReceiptPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfUtil: PdfUtilService,
  ) {}

  // ── Generate or retrieve receipt_no ──────────────────────────
  async ensureReceiptNo(paymentInId: number): Promise<string> {
    const record = await this.prisma.paymentIn.findUnique({
      where: { id: paymentInId },
      select: { id: true, receipt_no: true, date: true },
    });
    if (!record) throw new NotFoundException('收款記錄不存在');
    if (record.receipt_no) return record.receipt_no;

    // Generate new receipt_no: RCP-YYYY-NNNN
    const year = new Date(record.date).getUTCFullYear();
    const prefix = `RCP-${year}-`;

    // Find max existing receipt_no for this year
    const existing = await this.prisma.paymentIn.findMany({
      where: {
        receipt_no: { startsWith: prefix },
      },
      select: { receipt_no: true },
      orderBy: { receipt_no: 'desc' },
      take: 1,
    });

    let nextSeq = 1;
    if (existing.length > 0 && existing[0].receipt_no) {
      const parts = existing[0].receipt_no.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    const receiptNo = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    await this.prisma.paymentIn.update({
      where: { id: paymentInId },
      data: { receipt_no: receiptNo },
    });

    return receiptNo;
  }

  // ── Save receipt options ──────────────────────────────────────
  async saveReceiptOptions(
    paymentInId: number,
    options: ReceiptOptions,
  ): Promise<void> {
    const record = await this.prisma.paymentIn.findUnique({
      where: { id: paymentInId },
      select: { id: true },
    });
    if (!record) throw new NotFoundException('收款記錄不存在');

    await this.prisma.paymentIn.update({
      where: { id: paymentInId },
      data: { receipt_options: options as any },
    });
  }

  // ── Generate HTML (for preview) ──────────────────────────────
  async generateReceiptHtml(
    paymentInId: number,
    options: ReceiptPdfOptions = {},
  ): Promise<string> {
    const { html } = await this.buildReceiptData(paymentInId, options);
    return html;
  }

  // ── Generate PDF ─────────────────────────────────────────────
  async generateReceiptPdf(
    paymentInId: number,
    options: ReceiptPdfOptions = {},
  ): Promise<{ pdf: Buffer; receiptNo: string }> {
    const { html, receiptNo } = await this.buildReceiptData(
      paymentInId,
      options,
    );

    const pdf = await this.pdfUtil.renderHtmlToPdf(html, {
      pdfOptions: {
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `
          <div style="width: 100%; font-size: 9px; color: #666; padding: 0 10mm; display: flex; justify-content: space-between; align-items: center;">
            <span>${receiptNo}</span>
            <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
          </div>
        `,
        margin: { top: '0', right: '0', bottom: '14mm', left: '0' },
      },
    });

    return { pdf, receiptNo };
  }

  // ── Core build logic ─────────────────────────────────────────
  private async buildReceiptData(
    paymentInId: number,
    options: ReceiptPdfOptions = {},
  ) {
    const record = await this.prisma.paymentIn.findUnique({
      where: { id: paymentInId },
      include: {
        payer_partner: {
          select: {
            id: true,
            name: true,
            name_en: true,
            code: true,
            address: true,
            phone: true,
            contact_person: true,
          },
        },
        project: {
          select: {
            id: true,
            project_no: true,
            project_name: true,
            client: {
              select: {
                id: true,
                name: true,
                name_en: true,
                code: true,
                address: true,
                phone: true,
                contact_person: true,
              },
            },
          },
        },
        bank_account: {
          select: {
            id: true,
            account_name: true,
            bank_name: true,
            account_no: true,
            company: {
              select: {
                id: true,
                name: true,
                name_en: true,
                invoice_company_name_en: true,
                invoice_color_theme: true,
                company_logo_url: true,
                company_stamp_url: true,
                invoice_address: true,
                address: true,
                invoice_phone: true,
                phone: true,
                invoice_fax: true,
              },
            },
          },
        },
        allocations: {
          include: {
            invoice: {
              select: {
                id: true,
                invoice_no: true,
                invoice_title: true,
                client: {
                  select: {
                    id: true,
                    name: true,
                    name_en: true,
                    code: true,
                    address: true,
                    phone: true,
                    contact_person: true,
                  },
                },
              },
            },
          },
          orderBy: { id: 'asc' as const },
        },
      },
    });

    if (!record) throw new NotFoundException('收款記錄不存在');

    // Ensure receipt_no is generated
    const receiptNo = await this.ensureReceiptNo(paymentInId);

    // Merge saved receipt_options with passed-in options (passed-in takes precedence)
    const savedOptions = (record.receipt_options as ReceiptOptions | null) ?? {};
    const mergedOptions: Required<ReceiptPdfOptions> = {
      language: options.language ?? savedOptions.language ?? 'zh',
      showClientAddress: options.showClientAddress ?? savedOptions.showClientAddress ?? true,
      showClientPhone: options.showClientPhone ?? savedOptions.showClientPhone ?? true,
      showClientContact: options.showClientContact ?? savedOptions.showClientContact ?? true,
      showClientSignature: options.showClientSignature ?? savedOptions.showClientSignature ?? false,
      showCompanySignature: options.showCompanySignature ?? savedOptions.showCompanySignature ?? true,
      showCompanyStamp: options.showCompanyStamp ?? savedOptions.showCompanyStamp ?? false,
      overrideClientName: options.overrideClientName ?? savedOptions.overrideClientName ?? '',
    };

    const language = this.normalizeLanguage(mergedOptions.language);

    // Resolve company (from bank_account.company)
    const company = record.bank_account?.company ?? null;

    // Resolve client display name
    const payerPartner = record.payer_partner;
    const projectClient = record.project?.client ?? null;
    const firstAllocClient =
      record.allocations.length > 0
        ? record.allocations[0].invoice?.client ?? null
        : null;
    const resolvedClient = payerPartner ?? projectClient ?? firstAllocClient;

    const clientDisplayName =
      mergedOptions.overrideClientName ||
      record.payer_name ||
      resolvedClient?.name ||
      '';

    const clientAddress = resolvedClient?.address ?? '';
    const clientPhone = resolvedClient?.phone ?? '';
    const clientContact = resolvedClient?.contact_person ?? '';

    // Invoice numbers from allocations
    const invoiceNos = record.allocations
      .map((a) => a.invoice?.invoice_no)
      .filter((n): n is string => !!n);

    const html = this.buildHtml(record as any, {
      receiptNo,
      company,
      clientDisplayName,
      clientAddress,
      clientPhone,
      clientContact,
      invoiceNos,
      language,
      showClientAddress: mergedOptions.showClientAddress,
      showClientPhone: mergedOptions.showClientPhone,
      showClientContact: mergedOptions.showClientContact,
      showClientSignature: mergedOptions.showClientSignature,
      showCompanySignature: mergedOptions.showCompanySignature,
      showCompanyStamp: mergedOptions.showCompanyStamp,
    });

    return { html, receiptNo };
  }

  // ── HTML builder ─────────────────────────────────────────────
  private buildHtml(
    record: any,
    ctx: {
      receiptNo: string;
      company: any;
      clientDisplayName: string;
      clientAddress: string;
      clientPhone: string;
      clientContact: string;
      invoiceNos: string[];
      language: ReceiptPdfLanguage;
      showClientAddress: boolean;
      showClientPhone: boolean;
      showClientContact: boolean;
      showClientSignature: boolean;
      showCompanySignature: boolean;
      showCompanyStamp: boolean;
    },
  ): string {
    const {
      receiptNo,
      company,
      clientDisplayName,
      clientAddress,
      clientPhone,
      clientContact,
      invoiceNos,
      language,
      showClientAddress,
      showClientPhone,
      showClientContact,
      showClientSignature,
      showCompanySignature,
      showCompanyStamp,
    } = ctx;

    const labels = this.labels(language);
    const theme = this.sanitizeColor(company?.invoice_color_theme || '#1a365d');
    const themeLightBg = this.hexToRgba(theme, 0.08);
    const themeLightBorder = this.hexToRgba(theme, 0.15);
    const logoDataUri = this.logoDataUri(company?.company_logo_url);
    const stampDataUri = showCompanyStamp
      ? this.logoDataUri(company?.company_stamp_url)
      : '';

    const companyName = company?.name || '';
    const companyNameEn = this.invoiceCompanyNameEn(company);
    const invoiceAddress = company?.invoice_address || company?.address || '';
    const invoicePhone = company?.invoice_phone || company?.phone || '';
    const invoiceFax = company?.invoice_fax || '';

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

    // Payment method & reference
    const paymentMethod = record.payment_method || '';
    const referenceNo = record.reference_no || '';
    const isCheque =
      paymentMethod.toLowerCase().includes('cheque') ||
      paymentMethod.toLowerCase().includes('支票');
    const referenceLabel = isCheque ? labels.chequeNo : labels.reference;

    // Client section
    const clientLines = [
      showClientAddress && clientAddress
        ? `<div><strong>${labels.address}：</strong><span class="muted">${this.escapeHtml(clientAddress)}</span></div>`
        : '',
      showClientContact && clientContact
        ? `<div><strong>${labels.contact}：</strong><span class="muted">${this.escapeHtml(clientContact)}</span></div>`
        : '',
      showClientPhone && clientPhone
        ? `<div><strong>${labels.phone}：</strong><span class="muted">${this.escapeHtml(clientPhone)}</span></div>`
        : '',
    ].join('');

    // Invoice list
    const invoiceListHtml =
      invoiceNos.length > 0
        ? invoiceNos
            .map(
              (no) =>
                `<span class="invoice-tag">${this.escapeHtml(no)}</span>`,
            )
            .join(' ')
        : `<span class="muted">—</span>`;

    // Signature section
    const signatureHtml =
      showClientSignature || showCompanySignature
        ? `
      <table class="signature-table">
        <tr>
          <td>
            ${showClientSignature ? `
            <div class="signature-block">
              <div class="signature-stamp-space empty"></div>
              <div class="signature-line"></div>
              <div class="signature-company-name">${this.escapeHtml(clientDisplayName)}</div>
            </div>` : ''}
          </td>
          <td>
            ${showCompanySignature ? `
            <div class="signature-block">
              <div class="signature-stamp-space${stampDataUri ? '' : ' empty'}">${stampDataUri ? `<img class="stamp-img" src="${stampDataUri}" />` : ''}</div>
              <div class="signature-line"></div>
              <div class="signature-company-name">${this.escapeHtml(companyName)}</div>
            </div>` : ''}
          </td>
        </tr>
      </table>`
        : '';

    return `<!DOCTYPE html>
<html lang="${language === 'en' ? 'en' : 'zh-Hant'}">
<head>
  <meta charset="UTF-8" />
  <title>${this.escapeHtml(receiptNo)}_${this.escapeHtml(clientDisplayName)}</title>
  <style>
    @page { size: A4 portrait; margin: 9mm 10mm 9mm 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #ffffff; color: #1f2933;
      font-family: "Noto Sans CJK TC", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang TC", "Heiti TC", Arial, sans-serif;
      font-size: 11.2px; line-height: 1.38;
    }
    .receipt-page { width: 100%; margin: 0; background: #ffffff; page-break-after: auto; }
    .top-rule { height: 4px; background: ${theme}; margin-bottom: 13px; border-radius: 2px; }
    .header { display: table; width: 100%; table-layout: fixed; }
    .company-block { display: table-cell; width: 64%; vertical-align: top; padding-right: 18px; }
    .brand-block { display: table-cell; width: 36%; vertical-align: top; text-align: right; }
    .company-name-cn { font-size: 24px; font-weight: 800; color: ${theme}; letter-spacing: 0.6px; margin: 0 0 2px 0; line-height: 1.15; }
    .company-name-en { font-size: 13px; font-weight: 700; color: #334e68; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .company-meta { color: #52606d; font-size: 10.6px; line-height: 1.5; }
    .logo-img { max-width: 175px; max-height: 58px; object-fit: contain; }
    .logo-placeholder { width: 175px; height: 48px; margin-left: auto; border: 1.4px solid ${theme}; color: ${theme}; font-size: 10px; font-weight: 800; letter-spacing: 0.8px; display: table; text-align: center; background: ${themeLightBg}; }
    .logo-placeholder span { display: table-cell; vertical-align: middle; padding: 7px; line-height: 1.25; }
    .receipt-title { margin-top: 10px; color: ${theme}; font-size: 22px; font-weight: 800; letter-spacing: 1.2px; text-align: right; }
    .subtle-line { border-top: 1px solid ${themeLightBorder}; margin: 8px 0 12px 0; }
    .info-row { display: table; width: 100%; table-layout: fixed; margin-bottom: 16px; }
    .client-section { display: table-cell; width: 55%; vertical-align: top; padding-right: 16px; }
    .receipt-details { display: table-cell; width: 45%; vertical-align: top; }
    .section-label { color: ${theme}; font-weight: 800; font-size: 12px; letter-spacing: 0.3px; margin-bottom: 6px; text-transform: uppercase; }
    .client-box, .details-box { border: 1px solid ${themeLightBorder}; border-left: 4px solid ${theme}; padding: 8px 10px; min-height: 72px; background: ${themeLightBg}; }
    .client-name { font-size: 13px; font-weight: 800; color: #243b53; margin-bottom: 5px; }
    .muted { color: #52606d; }
    .details-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .details-table td { padding: 3px 0; vertical-align: top; }
    .details-table td:first-child { color: #52606d; width: 45%; font-weight: 700; }
    .details-table td:last-child { color: #1f2933; font-weight: 700; text-align: right; }
    .amount-section { margin: 16px 0; }
    .amount-box { border: 2px solid ${theme}; border-radius: 4px; padding: 16px 20px; background: ${themeLightBg}; display: flex; justify-content: space-between; align-items: center; }
    .amount-label { font-size: 14px; font-weight: 800; color: ${theme}; }
    .amount-value { font-size: 28px; font-weight: 900; color: ${theme}; letter-spacing: 1px; }
    .payment-info-section { margin: 12px 0; }
    .payment-info-box { border: 1px solid ${themeLightBorder}; padding: 10px 12px; background: #ffffff; }
    .payment-info-title { color: ${theme}; font-weight: 800; font-size: 12px; margin-bottom: 8px; border-bottom: 1px solid ${themeLightBorder}; padding-bottom: 5px; }
    .payment-info-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .payment-info-table td { padding: 4px 0; vertical-align: top; border-bottom: none; }
    .payment-info-table td:first-child { color: #52606d; width: 38%; font-weight: 700; }
    .payment-info-table td:last-child { color: #1f2933; font-weight: 700; }
    .invoice-ref-section { margin: 12px 0; }
    .invoice-ref-label { color: ${theme}; font-weight: 800; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px; }
    .invoice-ref-box { border: 1px solid ${themeLightBorder}; padding: 8px 10px; background: ${themeLightBg}; min-height: 36px; }
    .invoice-tag { display: inline-block; background: ${theme}; color: #ffffff; border-radius: 3px; padding: 2px 7px; font-size: 10.5px; font-weight: 700; margin: 2px 3px 2px 0; }
    .footer-row { margin-top: 24px; }
    .signature-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 24px; border: none; }
    .signature-table td { width: 50%; vertical-align: bottom; border: none; padding: 0; }
    .signature-table td:first-child { padding-right: 18mm; }
    .signature-table td:last-child { padding-left: 18mm; }
    .signature-block { width: 100%; text-align: center; }
    .signature-stamp-space { height: 100px; margin-bottom: 0px; display: flex; align-items: flex-end; justify-content: center; }
    .signature-stamp-space.empty { height: 100px; }
    .signature-line { border-top: 1.2px solid #243b53; width: 100%; height: 0; }
    .stamp-img { width: auto; max-width: 120px; max-height: 100px; object-fit: contain; display: block; margin-bottom: 0; }
    .signature-company-name { margin-top: 6px; text-align: center; font-size: 11px; font-weight: 800; color: #243b53; }
    .avoid-break { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="receipt-page">
    <div class="top-rule"></div>
    <div class="header">
      <div class="company-block">
        <div class="company-name-cn">${this.escapeHtml(companyName)}</div>
        ${companyNameEn ? `<div class="company-name-en">${this.escapeHtml(companyNameEn)}</div>` : ''}
        <div class="company-meta">${companyMetaLines}</div>
      </div>
      <div class="brand-block">
        ${logoDataUri ? `<img class="logo-img" src="${logoDataUri}" />` : `<div class="logo-placeholder"><span>${this.escapeHtml(companyNameEn || companyName || 'COMPANY')}</span></div>`}
        <div class="receipt-title">${labels.receiptTitle}</div>
      </div>
    </div>
    <div class="subtle-line"></div>

    <div class="info-row">
      <div class="client-section">
        <div class="section-label">${labels.receivedFrom}</div>
        <div class="client-box">
          <div class="client-name">${this.escapeHtml(clientDisplayName)}</div>
          ${clientLines}
        </div>
      </div>
      <div class="receipt-details">
        <div class="section-label">${labels.receiptDetails}</div>
        <div class="details-box">
          <table class="details-table">
            <tr><td>${labels.receiptNo}</td><td>${this.escapeHtml(receiptNo)}</td></tr>
            <tr><td>${labels.receiptDate}</td><td>${this.formatDate(record.date, language)}</td></tr>
          </table>
        </div>
      </div>
    </div>

    <div class="amount-section avoid-break">
      <div class="amount-box">
        <div class="amount-label">${labels.amountReceived}</div>
        <div class="amount-value">HKD ${this.formatMoney(record.amount)}</div>
      </div>
    </div>

    <div class="payment-info-section avoid-break">
      <div class="payment-info-box">
        <div class="payment-info-title">${labels.paymentInfo}</div>
        <table class="payment-info-table">
          <tr>
            <td>${labels.paymentMethod}</td>
            <td>${this.escapeHtml(paymentMethod || '—')}</td>
          </tr>
          ${referenceNo ? `<tr><td>${referenceLabel}</td><td>${this.escapeHtml(referenceNo)}</td></tr>` : ''}
        </table>
      </div>
    </div>

    <div class="invoice-ref-section avoid-break">
      <div class="invoice-ref-label">${labels.relatedInvoices}</div>
      <div class="invoice-ref-box">${invoiceListHtml}</div>
    </div>

    <div class="footer-row avoid-break">
      ${signatureHtml}
    </div>
  </div>
</body>
</html>`;
  }

  // ── Labels ────────────────────────────────────────────────────
  private labels(language: ReceiptPdfLanguage) {
    const bilingual = {
      receiptTitle: '正式收據 / OFFICIAL RECEIPT',
      receivedFrom: '收款自 Received From',
      receiptDetails: '收據資料 Receipt Details',
      receiptNo: 'Receipt No.',
      receiptDate: 'Receipt Date',
      address: '地址 Address',
      contact: '聯絡人 Contact',
      phone: '電話 Phone',
      amountReceived: '收款金額 Amount Received',
      paymentInfo: '付款資料 Payment Information',
      paymentMethod: '付款方式 Payment Method',
      chequeNo: '支票號碼 Cheque No.',
      reference: '參考資料 Reference',
      relatedInvoices: '對應發票 Related Invoices',
    };
    if (language === 'en') {
      return {
        receiptTitle: 'OFFICIAL RECEIPT',
        receivedFrom: 'Received From',
        receiptDetails: 'Receipt Details',
        receiptNo: 'Receipt No.',
        receiptDate: 'Receipt Date',
        address: 'Address',
        contact: 'Contact',
        phone: 'Phone',
        amountReceived: 'Amount Received',
        paymentInfo: 'Payment Information',
        paymentMethod: 'Payment Method',
        chequeNo: 'Cheque No.',
        reference: 'Reference',
        relatedInvoices: 'Related Invoices',
      };
    }
    if (language === 'zh') {
      return {
        receiptTitle: '正式收據',
        receivedFrom: '收款自',
        receiptDetails: '收據資料',
        receiptNo: '收據編號',
        receiptDate: '收款日期',
        address: '地址',
        contact: '聯絡人',
        phone: '電話',
        amountReceived: '收款金額',
        paymentInfo: '付款資料',
        paymentMethod: '付款方式',
        chequeNo: '支票號碼',
        reference: '參考資料',
        relatedInvoices: '對應發票',
      };
    }
    return bilingual;
  }

  // ── Helpers ───────────────────────────────────────────────────
  private normalizeLanguage(language: string): ReceiptPdfLanguage {
    return language === 'en' || language === 'bilingual' ? language : 'zh';
  }

  private logoDataUri(logoUrl?: string | null): string {
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

  private invoiceCompanyNameEn(company?: {
    invoice_company_name_en?: string | null;
  }): string {
    return (company?.invoice_company_name_en || '').trim();
  }

  private sanitizeColor(color: string): string {
    return /^#[0-9a-fA-F]{6}$/.test(color) ||
      /^#[0-9a-fA-F]{3}$/.test(color)
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

  private formatDate(value: Date | string, language: ReceiptPdfLanguage): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    if (language === 'en') return date.toISOString().slice(0, 10);
    return `${date.getUTCFullYear()}年${String(date.getUTCMonth() + 1).padStart(2, '0')}月${String(date.getUTCDate()).padStart(2, '0')}日`;
  }

  private formatMoney(value: any): string {
    const amount = Number(value || 0);
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private escapeHtml(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
