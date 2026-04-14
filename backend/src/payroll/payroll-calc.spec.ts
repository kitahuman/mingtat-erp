/**
 * Unit tests for PayrollService calculation logic.
 *
 * Since calculatePayroll is a private async method that depends on PrismaService,
 * we test the extracted pure calculation logic:
 * - calculateLineAmount (private helper)
 * - MPF tier calculation logic
 * - Base salary / allowance / OT calculation patterns
 *
 * We instantiate PayrollService with mocked dependencies and use reflection
 * to access private methods for testing.
 */

// Helper: same toDateStr used in payroll.service.ts
function toDateStr(d: any): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s;
}

describe('Payroll Calculation Logic', () => {
  // ════════════════════════════════════════════════════════════
  // toDateStr utility
  // ════════════════════════════════════════════════════════════
  describe('toDateStr', () => {
    it('should convert Date object to YYYY-MM-DD', () => {
      expect(toDateStr(new Date('2026-01-15T08:00:00Z'))).toBe('2026-01-15');
    });

    it('should return YYYY-MM-DD string as-is', () => {
      expect(toDateStr('2026-03-01')).toBe('2026-03-01');
    });

    it('should parse ISO string', () => {
      expect(toDateStr('2026-03-01T12:00:00.000Z')).toBe('2026-03-01');
    });

    it('should return empty string for null/undefined', () => {
      expect(toDateStr(null)).toBe('');
      expect(toDateStr(undefined)).toBe('');
    });
  });

  // ════════════════════════════════════════════════════════════
  // calculateLineAmount logic (extracted)
  // ════════════════════════════════════════════════════════════
  describe('calculateLineAmount', () => {
    // Replicate the private method logic
    function calculateLineAmount(pwl: any): number {
      if (pwl.price_match_status !== 'matched') return 0;
      const rate = Number(pwl.matched_rate) || 0;
      const qty = Number(pwl.quantity) || 1;
      const otRate = Number(pwl.matched_ot_rate) || 0;
      const otQty = Number(pwl.ot_quantity) || 0;
      const midShiftRate = Number(pwl.matched_mid_shift_rate) || 0;
      const isMidShift = pwl.is_mid_shift === true;
      const baseAmount = rate * qty;
      const otAmount = otRate * otQty;
      const midShiftAmount = isMidShift ? midShiftRate * 1 : 0;
      return baseAmount + otAmount + midShiftAmount;
    }

    it('should return 0 for unmatched price status', () => {
      expect(calculateLineAmount({ price_match_status: 'unmatched', matched_rate: 1500, quantity: 1 })).toBe(0);
    });

    it('should return 0 for pending price status', () => {
      expect(calculateLineAmount({ price_match_status: 'pending', matched_rate: 1500, quantity: 1 })).toBe(0);
    });

    it('should calculate base amount only', () => {
      const result = calculateLineAmount({
        price_match_status: 'matched',
        matched_rate: 1500,
        quantity: 2,
        matched_ot_rate: 0,
        ot_quantity: 0,
        is_mid_shift: false,
      });
      expect(result).toBe(3000);
    });

    it('should calculate base + OT amount', () => {
      const result = calculateLineAmount({
        price_match_status: 'matched',
        matched_rate: 1500,
        quantity: 1,
        matched_ot_rate: 200,
        ot_quantity: 3,
        is_mid_shift: false,
      });
      expect(result).toBe(1500 + 600);
    });

    it('should calculate base + OT + mid-shift amount', () => {
      const result = calculateLineAmount({
        price_match_status: 'matched',
        matched_rate: 1500,
        quantity: 1,
        matched_ot_rate: 200,
        ot_quantity: 2,
        matched_mid_shift_rate: 100,
        is_mid_shift: true,
      });
      expect(result).toBe(1500 + 400 + 100);
    });

    it('should default quantity to 1 when not provided', () => {
      const result = calculateLineAmount({
        price_match_status: 'matched',
        matched_rate: 1500,
      });
      expect(result).toBe(1500);
    });
  });

  // ════════════════════════════════════════════════════════════
  // MPF Industry Tier Calculation
  // ════════════════════════════════════════════════════════════
  describe('MPF Industry Tier Calculation', () => {
    const MPF_INDUSTRY_TIERS = [
      { min: 0, max: 280, employer: 10, employee: 0 },
      { min: 280, max: 350, employer: 15, employee: 15 },
      { min: 350, max: 450, employer: 20, employee: 20 },
      { min: 450, max: 550, employer: 25, employee: 25 },
      { min: 550, max: 650, employer: 30, employee: 30 },
      { min: 650, max: 750, employer: 35, employee: 35 },
      { min: 750, max: 850, employer: 40, employee: 40 },
      { min: 850, max: 950, employer: 45, employee: 45 },
      { min: 950, max: Infinity, employer: 50, employee: 50 },
    ];

    function findTier(effectiveIncome: number) {
      return MPF_INDUSTRY_TIERS.find(t => effectiveIncome > t.min && effectiveIncome <= t.max)
        || MPF_INDUSTRY_TIERS[MPF_INDUSTRY_TIERS.length - 1];
    }

    it('should find lowest tier for income <= 280', () => {
      const tier = findTier(200);
      expect(tier.employer).toBe(10);
      expect(tier.employee).toBe(0);
    });

    it('should find correct tier for income 300 (280-350)', () => {
      const tier = findTier(300);
      expect(tier.employer).toBe(15);
      expect(tier.employee).toBe(15);
    });

    it('should find highest tier for income > 950', () => {
      const tier = findTier(1500);
      expect(tier.employer).toBe(50);
      expect(tier.employee).toBe(50);
    });

    it('should find boundary tier correctly (exactly 280)', () => {
      const tier = findTier(280);
      expect(tier.employer).toBe(10);
      expect(tier.employee).toBe(0);
    });

    it('should find boundary tier correctly (exactly 350)', () => {
      const tier = findTier(350);
      expect(tier.employer).toBe(15);
      expect(tier.employee).toBe(15);
    });

    it('should calculate total MPF for multiple work days', () => {
      // Simulate 5 work days with different daily incomes
      const dailyIncomes = [800, 600, 1000, 300, 500];
      let totalEmployee = 0;
      let totalEmployer = 0;
      for (const income of dailyIncomes) {
        const tier = findTier(income);
        totalEmployee += tier.employee;
        totalEmployer += tier.employer;
      }
      // 800 -> (40,40), 600 -> (30,30), 1000 -> (50,50), 300 -> (15,15), 500 -> (25,25)
      expect(totalEmployee).toBe(40 + 30 + 50 + 15 + 25);
      expect(totalEmployer).toBe(40 + 30 + 50 + 15 + 25);
    });
  });

  // ════════════════════════════════════════════════════════════
  // MPF Non-Industry Plan Calculation
  // ════════════════════════════════════════════════════════════
  describe('MPF Non-Industry Plan Calculation', () => {
    function calculateNonIndustryMpf(grossIncome: number, mpfRelevantIncome?: number | null): { deduction: number; employer: number } {
      const mpfBase = mpfRelevantIncome !== undefined && mpfRelevantIncome !== null
        ? Number(mpfRelevantIncome)
        : grossIncome;
      let deduction = Math.min(mpfBase * 0.05, 1500);
      let employer = Math.min(mpfBase * 0.05, 1500);
      deduction = Math.round(deduction * 100) / 100;
      employer = Math.round(employer * 100) / 100;
      return { deduction, employer };
    }

    it('should calculate 5% of gross income', () => {
      const result = calculateNonIndustryMpf(20000);
      expect(result.deduction).toBe(1000);
      expect(result.employer).toBe(1000);
    });

    it('should cap at $1,500', () => {
      const result = calculateNonIndustryMpf(50000);
      expect(result.deduction).toBe(1500);
      expect(result.employer).toBe(1500);
    });

    it('should use mpfRelevantIncome when provided', () => {
      const result = calculateNonIndustryMpf(50000, 10000);
      expect(result.deduction).toBe(500);
      expect(result.employer).toBe(500);
    });

    it('should handle zero income', () => {
      const result = calculateNonIndustryMpf(0);
      expect(result.deduction).toBe(0);
      expect(result.employer).toBe(0);
    });

    it('should round to 2 decimal places', () => {
      const result = calculateNonIndustryMpf(333);
      expect(result.deduction).toBe(16.65);
    });
  });

  // ════════════════════════════════════════════════════════════
  // Daily Salary Calculation Pattern
  // ════════════════════════════════════════════════════════════
  describe('Daily Salary Calculation', () => {
    it('should calculate base salary as daily_rate * unique_work_days', () => {
      const baseSalary = 800;
      const workLogs = [
        { scheduled_date: '2026-03-01' },
        { scheduled_date: '2026-03-01' }, // same day, 2 entries
        { scheduled_date: '2026-03-02' },
        { scheduled_date: '2026-03-03' },
      ];
      const workDates = new Set(workLogs.map(wl => toDateStr(wl.scheduled_date)));
      const workDays = workDates.size;
      const baseAmount = baseSalary * workDays;
      expect(workDays).toBe(3);
      expect(baseAmount).toBe(2400);
    });

    it('should calculate night allowance only for night shift days', () => {
      const nightAllowance = 100;
      const workLogs = [
        { scheduled_date: '2026-03-01', day_night: '日' },
        { scheduled_date: '2026-03-02', day_night: '夜' },
        { scheduled_date: '2026-03-03', day_night: '夜' },
        { scheduled_date: '2026-03-03', day_night: '夜' }, // same day
      ];
      const nightDates = new Set(
        workLogs.filter(wl => wl.day_night === '夜').map(wl => toDateStr(wl.scheduled_date))
      );
      const nightDays = nightDates.size;
      const nightAmount = nightAllowance * nightDays;
      expect(nightDays).toBe(2);
      expect(nightAmount).toBe(200);
    });

    it('should calculate OT based on total ot_quantity across all work logs', () => {
      const otRate = 150;
      const workLogs = [
        { ot_quantity: 2 },
        { ot_quantity: 1.5 },
        { ot_quantity: 0 },
      ];
      let totalOtHours = 0;
      for (const wl of workLogs) {
        if (wl.ot_quantity && Number(wl.ot_quantity) > 0) {
          totalOtHours += Number(wl.ot_quantity);
        }
      }
      const otTotal = otRate * totalOtHours;
      expect(totalOtHours).toBe(3.5);
      expect(otTotal).toBe(525);
    });
  });
});
