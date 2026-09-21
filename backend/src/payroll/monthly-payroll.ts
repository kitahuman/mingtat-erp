export interface MonthlyAttendanceDay {
  date: string;
  workQuantity: number;
}

export function monthlyDailyRate(baseSalary: number, dateFrom: string): number {
  const year = Number(dateFrom.slice(0, 4));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return Math.floor(baseSalary * 12 / (leap ? 366 : 365));
}

/**
 * Creates the single monthly-pay calendar used by payroll totals and the daily
 * UI. An automatic rest/holiday block must be bracketed by qualifying ordinary
 * days. Only full-period attendance can qualify an unbracketed period edge;
 * work outside the payroll period is never inferred. Manual money is not an
 * attendance anchor.
 */
export function buildMonthlyPayCalendar(
  days: MonthlyAttendanceDay[],
  options: {
    dateFrom: string;
    dateTo: string;
    joinDate?: string | null;
    terminationDate?: string | null;
    holidayDates: string[];
    excludedPayKeys?: Set<string>;
  },
) {
  const start = [options.dateFrom, options.joinDate || options.dateFrom].sort().pop()!;
  const end = [options.dateTo, options.terminationDate || options.dateTo].sort()[0];
  const holidaySet = new Set(options.holidayDates);
  const excludedPayKeys = options.excludedPayKeys || new Set<string>();
  const eligibleFrom = options.joinDate ? new Date(`${options.joinDate}T00:00:00Z`) : null;
  if (eligibleFrom) eligibleFrom.setUTCMonth(eligibleFrom.getUTCMonth() + 3);
  const eligibleFromStr = eligibleFrom?.toISOString().slice(0, 10);
  const quantities = new Map(days.map((day) => [day.date, Math.max(0, day.workQuantity)]));
  const calendar: {
    date: string;
    workQuantity: number;
    isSunday: boolean;
    isEligibleHoliday: boolean;
    sundayEligible: boolean;
    holidayEligible: boolean;
    sundayQuantity: number;
    holidayQuantity: number;
  }[] = [];

  for (
    let date = new Date(`${start}T00:00:00Z`);
    date <= new Date(`${end}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const key = date.toISOString().slice(0, 10);
    calendar.push({
      date: key,
      workQuantity: quantities.get(key) || 0,
      isSunday: date.getUTCDay() === 0,
      isEligibleHoliday: holidaySet.has(key) && (!eligibleFromStr || key >= eligibleFromStr),
      sundayEligible: false,
      holidayEligible: false,
      sundayQuantity: 0,
      holidayQuantity: 0,
    });
  }

  const ordinary = calendar.filter((day) => !day.isSunday && !day.isEligibleHoliday);
  const fullAttendance =
    start === options.dateFrom &&
    end === options.dateTo &&
    ordinary.length > 0 &&
    ordinary.every((day) => day.workQuantity >= 1);

  for (let i = 0; i < calendar.length;) {
    if (!calendar[i].isSunday && !calendar[i].isEligibleHoliday) {
      i++;
      continue;
    }
    const first = i;
    while (i < calendar.length && (calendar[i].isSunday || calendar[i].isEligibleHoliday)) i++;
    const bracketed =
      first > 0 &&
      i < calendar.length &&
      calendar[first - 1].workQuantity > 0 &&
      calendar[i].workQuantity > 0;
    if (!bracketed && !fullAttendance) continue;

    for (let j = first; j < i; j++) {
      const day = calendar[j];
      day.sundayEligible = day.isSunday;
      day.holidayEligible = day.isEligibleHoliday;
      // Sunday and statutory-holiday amounts remain separate, including overlap.
      day.sundayQuantity = day.sundayEligible && !excludedPayKeys.has(`monthly_sunday_${day.date}`) ? 1 : 0;
      day.holidayQuantity =
        day.holidayEligible && !excludedPayKeys.has(`monthly_statutory_holiday_${day.date}`)
          ? 1
          : 0;
    }
  }

  return { days: new Map(calendar.map((day) => [day.date, day])), fullAttendance };
}
