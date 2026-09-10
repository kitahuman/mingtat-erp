jest.mock('./pdf-util.service', () => ({ PdfUtilService: class {} }));

import { InvoicePdfService } from '../invoices/invoice-pdf.service';
import { QuotationPdfService } from '../quotations/quotation-pdf.service';
import { DOCUMENT_TAIL_PAGINATION_CSS } from './document-pdf-layout';

const pdfOptions = {
  language: 'zh' as const,
  showBank: true,
  showClientAddress: true,
  showClientPhone: true,
  showClientContact: true,
  showClientInfo: true,
  showSignature: true,
  showClientSignature: true,
  showCompanySignature: true,
  showCompanyStamp: false,
  overridePaymentTerms: '',
  overrideClientAddress: '',
  overrideClientContact: '',
  overrideClientPhone: '',
  overrideClientName: '',
  fontSizes: { title: 25, itemName: 13, itemDesc: 9, paymentTerms: 11 },
};

const company = {
  name: '明達建築有限公司',
  profiles: [
    {
      chinese_name: '明達建築有限公司',
      english_name: 'Ming Tat Construction Limited',
    },
  ],
  bank_accounts: [
    { bank_name: 'Test Bank', account_name: 'Ming Tat', account_no: '123456' },
  ],
};

const client = { name: '測試客戶', code: 'TEST', address: 'Hong Kong' };

function extractItemRows(html: string) {
  return Array.from(
    html.matchAll(
      /<tr(?: class="([^"]*)")?>\s*<td class="center">(\d+)<\/td>/g,
    ),
  ).map((match) => ({ classes: match[1] || '', sequence: Number(match[2]) }));
}

describe('document PDF tail pagination', () => {
  it('defines a keep-with-next chain without scaling content', () => {
    expect(DOCUMENT_TAIL_PAGINATION_CSS).toContain('break-after: avoid-page');
    expect(DOCUMENT_TAIL_PAGINATION_CSS).toContain('break-before: avoid-page');
    expect(DOCUMENT_TAIL_PAGINATION_CSS).toContain('break-inside: avoid-page');
    expect(DOCUMENT_TAIL_PAGINATION_CSS).not.toContain('scale');
  });

  it('keeps the final invoice item, every total row, and the invoice tail together', () => {
    const service = new InvoicePdfService({} as never, {} as never);
    const html = (service as any).buildHtml(
      {
        invoice_no: 'INV-TEST',
        invoice_title: 'Invoice pagination test',
        date: '2026-09-10',
        due_date: '2026-10-10',
        subtotal: 300,
        total_amount: 290,
        retention_rate: 5,
        retention_amount: 15,
        other_charges: [{ amount: 10 }, { amount: -5 }],
        payment_terms: '30 days',
        company,
        client,
        items: [
          {
            item_name: 'FIRST_ITEM',
            quantity: 1,
            unit: 'job',
            unit_price: 100,
            amount: 100,
          },
          {
            item_name: 'MIDDLE_ITEM',
            quantity: 1,
            unit: 'job',
            unit_price: 100,
            amount: 100,
          },
          {
            item_name: 'LAST_ITEM',
            quantity: 1,
            unit: 'job',
            unit_price: 100,
            amount: 100,
          },
        ],
      },
      pdfOptions,
    );

    const itemRows = extractItemRows(html);
    expect(itemRows).toEqual([
      { classes: '', sequence: 1 },
      { classes: '', sequence: 2 },
      { classes: 'keep-with-tail', sequence: 3 },
    ]);
    expect(html.match(/class="totals-row keep-with-tail"/g)).toHaveLength(4);
    expect(html.match(/class="grand-total keep-with-tail"/g)).toHaveLength(1);
    expect(html).toContain('<div class="document-tail">');
    expect(html.indexOf('LAST_ITEM')).toBeLessThan(
      html.indexOf('class="document-tail"'),
    );
  });

  it('keeps the final quotation item, total, terms, and signatures together', () => {
    const service = new QuotationPdfService({} as never, {} as never);
    const html = (service as any).buildHtml(
      {
        id: 1,
        quotation_no: 'QUO-TEST',
        quotation_date: '2026-09-10',
        project_name: 'Quotation pagination test',
        total_amount: 300,
        payment_terms: '30 days',
        company,
        client,
        items: [
          {
            item_name: 'FIRST_ITEM',
            quantity: 1,
            unit: 'job',
            unit_price: 100,
            amount: 100,
          },
          {
            item_name: 'MIDDLE_ITEM',
            quantity: 1,
            unit: 'job',
            unit_price: 100,
            amount: 100,
          },
          {
            item_name: 'LAST_ITEM',
            quantity: 1,
            unit: 'job',
            unit_price: 100,
            amount: 100,
          },
        ],
      },
      pdfOptions,
    );

    const itemRows = extractItemRows(html);
    expect(itemRows).toEqual([
      { classes: '', sequence: 1 },
      { classes: '', sequence: 2 },
      { classes: 'keep-with-tail', sequence: 3 },
    ]);
    expect(html.match(/class="grand-total keep-with-tail"/g)).toHaveLength(1);
    expect(html).toContain('<div class="document-tail">');
    expect(html.indexOf('LAST_ITEM')).toBeLessThan(
      html.indexOf('class="document-tail"'),
    );
  });

  it('anchors an empty item table to its totals and document tail', () => {
    const service = new QuotationPdfService({} as never, {} as never);
    const html = (service as any).buildHtml(
      {
        id: 2,
        quotation_no: 'QUO-EMPTY',
        quotation_date: '2026-09-10',
        total_amount: 0,
        payment_terms: '',
        company,
        client,
        items: [],
      },
      pdfOptions,
    );

    expect(html).toMatch(
      /<tr class="keep-with-tail"><td colspan="6" class="center muted">沒有項目<\/td><\/tr>/,
    );
    expect(html).toContain('class="grand-total keep-with-tail"');
  });
});
