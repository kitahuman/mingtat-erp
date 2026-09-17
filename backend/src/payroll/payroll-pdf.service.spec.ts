jest.mock('../common/pdf-util.service', () => ({ PdfUtilService: class {} }));

import { PayrollPdfService } from './payroll-pdf.service';

const payrollPdfOptions = {
  showGroupedSettlement: false,
  showEmployeeSignature: false,
  showCompanyStamp: false,
};

describe('PayrollPdfService', () => {
  it('uses the linked CompanyProfile English name for legacy payrolls', () => {
    const service = new PayrollPdfService({} as never, {} as never);
    const html = (service as any).renderPayrollHtml(
      {
        id: 251,
        employee: { name_zh: '測試員工', name_en: 'Test Employee' },
        company_profile: null,
        company: {
          name: '明達建築有限公司',
          name_en: 'DCL Construction Ltd.',
          profiles: [
            {
              chinese_name: '明達建築有限公司',
              english_name: 'DICKY CONSTRUCTION COMPANY LIMITED',
            },
          ],
        },
        items: [],
        adjustments: [],
        payroll_expenses: [],
        grouped_settlement: [],
        petty_cash_deducted: 0,
        reimbursement_total: 0,
        net_amount: 0,
        gross_amount: 0,
        deduction_total: 0,
        adjustment_total: 0,
      },
      payrollPdfOptions,
    );

    expect(html).toContain('DICKY CONSTRUCTION COMPANY LIMITED');
    expect(html).not.toContain('DCL Construction Ltd.');
  });

  it('uses the employee company Profile when a legacy payroll has no company', () => {
    const service = new PayrollPdfService({} as never, {} as never);
    const html = (service as any).renderPayrollHtml(
      {
        id: 253,
        employee: {
          name_zh: '測試員工',
          name_en: 'Test Employee',
          company: {
            name: '明達建築有限公司',
            name_en: 'DCL Construction Ltd.',
            profiles: [
              {
                chinese_name: '明達建築有限公司',
                english_name: 'DICKY CONSTRUCTION COMPANY LIMITED',
              },
            ],
          },
        },
        company_profile: null,
        company: null,
        items: [],
        adjustments: [],
        payroll_expenses: [],
        grouped_settlement: [],
        petty_cash_deducted: 0,
        reimbursement_total: 0,
        net_amount: 0,
        gross_amount: 0,
        deduction_total: 0,
        adjustment_total: 0,
      },
      payrollPdfOptions,
    );

    expect(html).toContain('DICKY CONSTRUCTION COMPANY LIMITED');
    expect(html).not.toContain('DCL Construction Ltd.');
  });

  it('keeps an explicitly selected CompanyProfile as the payroll authority', () => {
    const service = new PayrollPdfService({} as never, {} as never);
    const html = (service as any).renderPayrollHtml(
      {
        id: 252,
        employee: { name_zh: '測試員工', name_en: 'Test Employee' },
        company_profile: {
          chinese_name: '卓嵐發展有限公司',
          english_name: 'CHEUK NAM DEVELOPMENT LIMITED',
        },
        company: {
          name: '明達建築有限公司',
          name_en: 'DCL Construction Ltd.',
          profiles: [
            {
              chinese_name: '明達建築有限公司',
              english_name: 'DICKY CONSTRUCTION COMPANY LIMITED',
            },
          ],
        },
        items: [],
        adjustments: [],
        payroll_expenses: [],
        grouped_settlement: [],
        petty_cash_deducted: 0,
        reimbursement_total: 0,
        net_amount: 0,
        gross_amount: 0,
        deduction_total: 0,
        adjustment_total: 0,
      },
      payrollPdfOptions,
    );

    expect(html).toContain('CHEUK NAM DEVELOPMENT LIMITED');
    expect(html).not.toContain('DICKY CONSTRUCTION COMPANY LIMITED');
  });
});
