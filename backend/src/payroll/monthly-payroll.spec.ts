import { PayrollCalculationService } from './payroll-calculation.service';
import { buildMonthlyPayCalendar, monthlyDailyRate } from './monthly-payroll';

describe('monthly payroll calendar', () => {
  it('uses the same integer daily rate everywhere', () => {
    expect(monthlyDailyRate(30_000, '2026-09-01')).toBe(986);
  });

  it('does not pay Sundays or holidays when there is no qualifying attendance', () => {
    const calendar = buildMonthlyPayCalendar([], {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      joinDate: '2026-04-01',
      holidayDates: ['2026-09-26'],
    });
    expect(calendar.days.get('2026-09-20')?.sundayQuantity).toBe(0);
    expect(calendar.days.get('2026-09-26')?.holidayQuantity).toBe(0);
  });

  it('pays only a rest-day block bracketed by qualifying work days', () => {
    const calendar = buildMonthlyPayCalendar([
      { date: '2026-09-19', workQuantity: 1 },
      { date: '2026-09-21', workQuantity: 1 },
    ], {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      joinDate: '2026-04-01',
      holidayDates: [],
    });
    expect(calendar.days.get('2026-09-20')?.sundayQuantity).toBe(1);
    expect(calendar.days.get('2026-09-13')?.sundayQuantity).toBe(0);
  });

  it('keeps Sunday and statutory-holiday components separate and removable', () => {
    const date = '2026-09-26';
    const calendar = buildMonthlyPayCalendar([
      { date: '2026-09-25', workQuantity: 1 },
      { date: '2026-09-28', workQuantity: 1 },
    ], {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      joinDate: '2026-04-01',
      holidayDates: [date],
      excludedPayKeys: new Set([`monthly_statutory_holiday_${date}`]),
    });
    expect(calendar.days.get(date)?.holidayEligible).toBe(true);
    expect(calendar.days.get(date)?.holidayQuantity).toBe(0);
    expect(calendar.days.get('2026-09-27')?.sundayQuantity).toBe(1);
  });
});

describe('monthly payroll calculation regression', () => {
  const calculation = new PayrollCalculationService({} as any, {} as any);
  const employee = { join_date: new Date('2026-04-01'), mpf_plan: 'manulife' };
  const salary = { salary_type: 'monthly', base_salary: 30_000 };
  const holidays = [{ date: new Date('2026-09-26'), name: '中秋節翌日' }];

  it('returns zero for payroll #251 conditions without resurrecting any source work log', async () => {
    const result = await calculation.calculatePayroll(
      employee, salary, [], '2026-09-01', '2026-09-30', undefined, undefined,
      holidays,
    );
    expect(result.base_amount).toBe(0);
    expect(result.mpf_deduction).toBe(0);
    expect(result.mpf_employer).toBe(0);
    expect(result.net_amount).toBe(0);
    expect(result.items.map((item: any) => item.item_type)).toEqual(['mpf_deduction']);
  });

  it('uses the integer daily rate for a bracketed Sunday in both total and daily data', async () => {
    const logs = ['2026-09-19', '2026-09-21'].map((scheduled_date, id) => ({
      id: id + 1, scheduled_date, quantity: 1, line_amount: 0, ot_line_amount: 0,
      mid_shift_line_amount: 0, day_night: '日', service_type: '工程',
    }));
    const result = await calculation.calculatePayroll(
      employee, salary, logs, '2026-09-01', '2026-09-30', undefined, undefined, [],
    );
    const daily = calculation.buildDailyCalculation(logs, salary, [], {
      dateFrom: '2026-09-01', dateTo: '2026-09-30', employeeJoinDate: '2026-04-01',
    });
    expect(result.base_amount).toBe(986 * 3);
    expect(daily.find((day: any) => day.date === '2026-09-20')).toMatchObject({
      monthly_daily_rate: 986,
      monthly_sunday_quantity: 1,
      effective_income: 986,
      monthly_sunday_eligible: true,
    });
  });

  it('marks an excluded paid rest-day label as zero payable while preserving eligibility for restore', () => {
    const logs = ['2026-09-19', '2026-09-21'].map((scheduled_date, id) => ({
      id: id + 1, scheduled_date, quantity: 1, line_amount: 0, ot_line_amount: 0,
      mid_shift_line_amount: 0, day_night: '日', service_type: '工程',
    }));
    const daily = calculation.buildDailyCalculation(logs, salary, [{
      date: new Date('2026-09-20'),
      allowance_key: 'excluded_monthly_sunday_2026-09-20',
      allowance_name: '已移除的休息日計薪',
      amount: 0,
    }], {
      dateFrom: '2026-09-01', dateTo: '2026-09-30', employeeJoinDate: '2026-04-01',
    });
    expect(daily.find((day: any) => day.date === '2026-09-20')).toMatchObject({
      monthly_sunday_eligible: true,
      monthly_sunday_quantity: 0,
      effective_income: 0,
    });
  });

  it('allows positive manual daily quantities to qualify a bracketed rest day', () => {
    const manualDays = new Map([
      ['2026-09-19', { manual_day_quantity: 1, manual_day_shift_quantity: 1, manual_night_shift_quantity: 0, is_manual_day_quantity: true }],
      ['2026-09-21', { manual_day_quantity: 1, manual_day_shift_quantity: 1, manual_night_shift_quantity: 0, is_manual_day_quantity: true }],
    ]);
    const daily = calculation.buildDailyCalculation([], salary, [], {
      dateFrom: '2026-09-01', dateTo: '2026-09-30', employeeJoinDate: '2026-04-01',
      manualDayQuantityMap: manualDays,
    });
    expect(daily.find((day: any) => day.date === '2026-09-20')).toMatchObject({
      monthly_sunday_eligible: true,
      monthly_sunday_quantity: 1,
      effective_income: 986,
    });
  });

  it('keeps manual income payable but does not let it qualify a rest day', () => {
    const daily = calculation.buildDailyCalculation([], salary, [{
      date: new Date('2026-09-19'),
      allowance_key: 'base_top_up_override',
      allowance_name: '手動收入',
      amount: 1000,
    }], {
      dateFrom: '2026-09-01', dateTo: '2026-09-30', employeeJoinDate: '2026-04-01',
    });
    expect(daily.find((day: any) => day.date === '2026-09-19')?.effective_income).toBe(1000);
    expect(daily.find((day: any) => day.date === '2026-09-20')).toMatchObject({
      monthly_sunday_eligible: false,
      monthly_sunday_quantity: 0,
      effective_income: 0,
    });
  });
});
