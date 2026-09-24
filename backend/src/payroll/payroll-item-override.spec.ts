import { BadRequestException } from '@nestjs/common';
import {
  applyOverridesToCalculatedResult,
  CalculatedPayrollResult,
  mergePayrollItemsWithOverrides,
  StoredPayrollItem,
  switchPayrollItemToManual,
  switchPayrollItemToSystem,
  updateManualPayrollItemValues,
} from './payroll-item-override';
import { PayrollService } from './payroll.service';

function monthlyCalc(): CalculatedPayrollResult {
  return {
    salary_type: 'monthly',
    base_rate: 30000,
    work_days: 22,
    work_nights: 0,
    base_amount: 30000,
    allowance_total: 0,
    ot_total: 0,
    commission_total: 0,
    mpf_deduction: 1500,
    mpf_plan: 'manulife',
    mpf_employer: 1500,
    mpf_relevant_income: 30000,
    gross_income: 30000,
    net_amount: 28500,
    items: [
      {
        item_type: 'base_salary',
        item_name: '基本薪金',
        unit_price: 30000,
        quantity: 1,
        amount: 30000,
        remarks: '月薪 $30000 × 12 / 365 = 日薪 $986',
        sort_order: 1,
      },
      {
        item_type: 'mpf_deduction',
        item_name: '強積金（Manulife）',
        unit_price: 30000,
        quantity: 0.05,
        amount: -1500,
        remarks: '月入 5%，上限 $1,500',
        sort_order: 2,
      },
    ],
  };
}

function dailyCalc(): CalculatedPayrollResult {
  return {
    salary_type: 'daily',
    base_rate: 800,
    work_days: 10,
    work_nights: 0,
    base_amount: 7000,
    allowance_total: 0,
    ot_total: 0,
    commission_total: 0,
    mpf_deduction: 500,
    mpf_plan: 'industry',
    mpf_employer: 500,
    mpf_relevant_income: 700,
    gross_income: 7000,
    net_amount: 6500,
    items: [
      {
        item_type: 'base_salary',
        item_name: '工作收入',
        unit_price: 0,
        quantity: 10,
        amount: 5000,
        remarks: '系統工作收入',
        sort_order: 1,
      },
      {
        item_type: 'base_salary',
        item_name: '底薪',
        unit_price: 800,
        quantity: 2.5,
        amount: 2000,
        remarks: '系統補底薪',
        sort_order: 2,
      },
      {
        item_type: 'mpf_deduction',
        item_name: '強積金（行業計劃）',
        unit_price: 50,
        quantity: 10,
        amount: -500,
        remarks: '按日薪級別計算，10天，日薪基數 $700',
        sort_order: 3,
      },
    ],
  };
}

function stored(
  itemName: string,
  extras: Partial<StoredPayrollItem> = {},
): StoredPayrollItem {
  return {
    item_type: 'base_salary',
    item_name: itemName,
    unit_price: 0,
    quantity: 1,
    amount: extras.amount ?? 0,
    remarks: extras.remarks ?? null,
    sort_order: extras.sort_order ?? 1,
    payroll_item_excluded: extras.payroll_item_excluded ?? false,
    payroll_item_is_manual_amount: extras.payroll_item_is_manual_amount ?? false,
    payroll_item_system_amount: extras.payroll_item_system_amount ?? null,
    payroll_item_system_quantity: extras.payroll_item_system_quantity ?? null,
    payroll_item_system_remarks: extras.payroll_item_system_remarks ?? null,
    payroll_item_manual_amount: extras.payroll_item_manual_amount ?? null,
    payroll_item_manual_remarks: extras.payroll_item_manual_remarks ?? null,
  };
}

describe('independent payroll item overlay', () => {
  it('covers monthly 基本薪金 without using the monthly formula', () => {
    const previous = [
      stored('基本薪金', {
        amount: 12345,
        remarks: '手動基本薪金',
        payroll_item_is_manual_amount: true,
        payroll_item_system_amount: 30000,
        payroll_item_system_quantity: 1,
        payroll_item_system_remarks: '月薪 $30000 × 12 / 365 = 日薪 $986',
        payroll_item_manual_amount: 12345,
        payroll_item_manual_remarks: '手動基本薪金',
      }),
    ];
    const merged = applyOverridesToCalculatedResult(monthlyCalc(), previous);
    const basic = merged.items.find((item) => item.item_name === '基本薪金');
    expect(basic).toMatchObject({
      amount: 12345,
      remarks: '手動基本薪金',
      payroll_item_is_manual_amount: true,
      payroll_item_system_amount: 30000,
      payroll_item_system_remarks: '月薪 $30000 × 12 / 365 = 日薪 $986',
    });
    expect(merged.base_amount).toBe(12345);
  });

  it('covers daily 工作收入 and 底薪 independently', () => {
    const previous = [
      stored('工作收入', {
        amount: 8888,
        remarks: '只改工作收入',
        payroll_item_is_manual_amount: true,
        payroll_item_system_amount: 5000,
        payroll_item_system_quantity: 10,
        payroll_item_system_remarks: '系統工作收入',
        payroll_item_manual_amount: 8888,
        payroll_item_manual_remarks: '只改工作收入',
        sort_order: 1,
      }),
      stored('底薪', {
        amount: 2000,
        remarks: '系統補底薪',
        payroll_item_is_manual_amount: false,
        payroll_item_system_amount: 2000,
        payroll_item_system_quantity: 2.5,
        payroll_item_system_remarks: '系統補底薪',
        sort_order: 2,
      }),
    ];
    const merged = applyOverridesToCalculatedResult(dailyCalc(), previous);
    const workIncome = merged.items.find((item) => item.item_name === '工作收入');
    const topUp = merged.items.find((item) => item.item_name === '底薪');
    expect(workIncome?.amount).toBe(8888);
    expect(topUp?.amount).toBe(2000);
    expect(topUp?.payroll_item_is_manual_amount).toBe(false);
    expect(merged.base_amount).toBe(10888);
  });

  it('does not apply day-count or top-up formulas to a manual 底薪 amount', () => {
    const previous = [
      stored('工作收入', {
        amount: 5000,
        payroll_item_is_manual_amount: false,
        payroll_item_system_amount: 5000,
        sort_order: 1,
      }),
      stored('底薪', {
        amount: 1,
        remarks: '直接填金額',
        payroll_item_is_manual_amount: true,
        payroll_item_system_amount: 2000,
        payroll_item_system_quantity: 2.5,
        payroll_item_system_remarks: '系統補底薪',
        payroll_item_manual_amount: 1,
        payroll_item_manual_remarks: '直接填金額',
        sort_order: 2,
      }),
    ];
    const merged = applyOverridesToCalculatedResult(dailyCalc(), previous);
    const topUp = merged.items.find((item) => item.item_name === '底薪');
    expect(topUp?.amount).toBe(1);
    expect(topUp?.quantity).toBe(2.5);
    expect(topUp?.remarks).toBe('直接填金額');
  });

  it('keeps system snapshots while a manual overlay is active', () => {
    const previous = [
      stored('工作收入', {
        amount: 1111,
        remarks: '手動',
        payroll_item_is_manual_amount: true,
        payroll_item_system_amount: 5000,
        payroll_item_system_quantity: 10,
        payroll_item_system_remarks: '系統工作收入',
        payroll_item_manual_amount: 1111,
        payroll_item_manual_remarks: '手動',
      }),
    ];
    const recalc = applyOverridesToCalculatedResult(
      {
        ...dailyCalc(),
        items: dailyCalc().items.map((item) =>
          item.item_name === '工作收入'
            ? { ...item, amount: 6200, remarks: '重計後系統工作收入' }
            : item,
        ),
      },
      previous,
    );
    const workIncome = recalc.items.find((item) => item.item_name === '工作收入');
    expect(workIncome?.amount).toBe(1111);
    expect(workIncome?.payroll_item_system_amount).toBe(6200);
    expect(workIncome?.payroll_item_system_remarks).toBe('重計後系統工作收入');
    expect(workIncome?.payroll_item_manual_amount).toBe(1111);
  });

  it('switches back to the saved system value without recalculating', () => {
    const current = stored('基本薪金', {
      amount: 18000,
      remarks: '人手備註',
      payroll_item_is_manual_amount: true,
      payroll_item_system_amount: 30000,
      payroll_item_system_quantity: 1,
      payroll_item_system_remarks: '原本系統備註',
      payroll_item_manual_amount: 18000,
      payroll_item_manual_remarks: '人手備註',
    });
    const switched = switchPayrollItemToSystem(current);
    expect(switched.amount).toBe(30000);
    expect(switched.remarks).toBe('原本系統備註');
    expect(switched.payroll_item_is_manual_amount).toBe(false);
    expect(switched.payroll_item_manual_amount).toBe(18000);
    expect(switched.payroll_item_manual_remarks).toBe('人手備註');
  });

  it('keeps the manual overlay after a later system recalc', () => {
    const previous = [
      stored('基本薪金', {
        amount: 18000,
        remarks: '人手備註',
        payroll_item_is_manual_amount: true,
        payroll_item_system_amount: 30000,
        payroll_item_system_quantity: 1,
        payroll_item_system_remarks: '原本系統備註',
        payroll_item_manual_amount: 18000,
        payroll_item_manual_remarks: '人手備註',
      }),
    ];
    const afterRecalc = applyOverridesToCalculatedResult(
      {
        ...monthlyCalc(),
        items: monthlyCalc().items.map((item) =>
          item.item_name === '基本薪金'
            ? { ...item, amount: 25000, remarks: '重計後系統備註' }
            : item,
        ),
      },
      previous,
    );
    const basic = afterRecalc.items.find((item) => item.item_name === '基本薪金');
    expect(basic?.amount).toBe(18000);
    expect(basic?.remarks).toBe('人手備註');
    expect(basic?.payroll_item_system_amount).toBe(25000);
    expect(basic?.payroll_item_system_remarks).toBe('重計後系統備註');
  });

  it('persists independent manual remarks', () => {
    const current = stored('底薪', {
      amount: 1500,
      remarks: '舊備註',
      payroll_item_is_manual_amount: true,
      payroll_item_system_amount: 2000,
      payroll_item_system_quantity: 2.5,
      payroll_item_system_remarks: '系統補底薪',
      payroll_item_manual_amount: 1500,
      payroll_item_manual_remarks: '舊備註',
    });
    const updated = updateManualPayrollItemValues(current, {
      remarks: '新人手備註',
    });
    expect(updated.amount).toBe(1500);
    expect(updated.remarks).toBe('新人手備註');
    expect(updated.payroll_item_manual_remarks).toBe('新人手備註');
    expect(updated.payroll_item_system_remarks).toBe('系統補底薪');
  });

  it('uses effective overlay amounts for MPF and totals', () => {
    const previous = [
      stored('工作收入', {
        amount: 9000,
        payroll_item_is_manual_amount: true,
        payroll_item_system_amount: 5000,
        payroll_item_system_quantity: 10,
        payroll_item_manual_amount: 9000,
        sort_order: 1,
      }),
      stored('底薪', {
        amount: 1000,
        payroll_item_is_manual_amount: true,
        payroll_item_system_amount: 2000,
        payroll_item_system_quantity: 2.5,
        payroll_item_manual_amount: 1000,
        sort_order: 2,
      }),
    ];
    const merged = applyOverridesToCalculatedResult(dailyCalc(), previous, {
      mpfRelevantIncome: undefined,
    });
    expect(merged.base_amount).toBe(10000);
    expect(merged.gross_income).toBe(10000);
    const mpf = merged.items.find((item) => item.item_type === 'mpf_deduction');
    expect(mpf?.amount).toBe(-500);
    expect(merged.net_amount).toBe(9500);
  });

  it('does not copy a 工作收入 overlay onto 底薪 or vice versa', () => {
    const previous = [
      stored('工作收入', {
        amount: 7777,
        payroll_item_is_manual_amount: true,
        payroll_item_system_amount: 5000,
        payroll_item_manual_amount: 7777,
        sort_order: 1,
      }),
    ];
    const items = mergePayrollItemsWithOverrides(dailyCalc().items, previous);
    expect(items.find((item) => item.item_name === '工作收入')?.amount).toBe(7777);
    expect(items.find((item) => item.item_name === '底薪')?.amount).toBe(2000);
  });

  it('keeps a dormant overlay when switching back to system mode', () => {
    const current = stored('工作收入', {
      amount: 3333,
      remarks: '人手',
      payroll_item_is_manual_amount: true,
      payroll_item_system_amount: 5000,
      payroll_item_system_quantity: 10,
      payroll_item_system_remarks: '系統工作收入',
      payroll_item_manual_amount: 3333,
      payroll_item_manual_remarks: '人手',
    });
    const systemMode = switchPayrollItemToSystem(current);
    const reactivated = switchPayrollItemToManual(
      { ...current, ...systemMode },
      {},
    );
    expect(reactivated.amount).toBe(3333);
    expect(reactivated.remarks).toBe('人手');
    expect(reactivated.payroll_item_is_manual_amount).toBe(true);
  });
});

describe('PayrollService.updatePayrollItem overlay lock', () => {
  it('rejects overlay updates on confirmed or paid payrolls', async () => {
    const prisma = {
      payroll: {
        findUnique: jest.fn().mockResolvedValue({ id: 9, status: 'confirmed' }),
      },
      payrollItem: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new PayrollService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updatePayrollItem(9, 1, { use_manual_amount: true, amount: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payrollItem.findFirst).not.toHaveBeenCalled();
  });
});
