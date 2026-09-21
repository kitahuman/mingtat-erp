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
 * UI. Statutory-holiday blocks must be bracketed by qualifying ordinary days.
 * A monthly Sunday qualifies when the employee worked earlier and resumes work
 * later in the same eligible payroll period. Only full-period attendance can
 * qualify a period edge; work outside the payroll period is never inferred.
 * Manual money is not an attendance anchor.
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

    // Statutory holidays retain the existing strict contiguous-block rule.
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
      if (day.isEligibleHoliday) {
        day.holidayEligible = true;
        day.holidayQuantity = !excludedPayKeys.has(`monthly_statutory_holiday_${day.date}`)
          ? 1
          : 0;
      }
    }
  }

  // A Sunday is payable when it sits within a continuing monthly employment
  // period: the employee worked before it and later resumed work. This lets a
  // weekday absence after Sunday remain a leave day without erasing that
  // Sunday. It deliberately applies only to Sunday/rest-day eligibility.
  for (let i = 0; i < calendar.length; i++) {
    const day = calendar[i];
    if (!day.isSunday) continue;
    const workedBefore = calendar.slice(0, i).some((candidate) => candidate.workQuantity > 0);
    const workedAfter = calendar.slice(i + 1).some((candidate) => candidate.workQuantity > 0);
    if (!fullAttendance && !(workedBefore && workedAfter)) continue;

    day.sundayEligible = true;
    day.sundayQuantity = !excludedPayKeys.has(`monthly_sunday_${day.date}`) ? 1 : 0;
  }

  return { days: new Map(calendar.map((day) => [day.date, day])), fullAttendance };
}
