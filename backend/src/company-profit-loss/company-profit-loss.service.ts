import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompanyProfitLossService {
  constructor(private prisma: PrismaService) {}

  private toNum(v: any): number {
    return Number(v) || 0;
  }

  private round2(n: number): number {
    return parseFloat(n.toFixed(2));
  }

  // ═══════════════════════════════════════════════════════════
  // Company P&L Report
  // ═══════════════════════════════════════════════════════════
  async getCompanyProfitLoss(params: {
    period?: string;       // month | quarter | year
    year?: number;
    month?: number;
    quarter?: number;
    company_id?: number;
  }) {
    const { period, year, month, quarter, company_id } = params;

    // Build date range
    const { dateFrom, dateTo } = this.buildDateRange(period, year, month, quarter);

    // ─── Revenue ────────────────────────────────────────────
    const revenue = await this.calcRevenue(dateFrom, dateTo, company_id);

    // ─── Costs ──────────────────────────────────────────────
    const costs = await this.calcCosts(dateFrom, dateTo, company_id);

    // ─── P&L Calculation ────────────────────────────────────
    const totalRevenue = revenue.total_revenue;
    const directCostTotal = costs.direct_cost_total;
    const indirectCostTotal = costs.indirect_cost_total;
    const operatingExpense = costs.operating_expense_total;

    const grossProfit = totalRevenue - directCostTotal;
    const grossProfitRate = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const operatingProfit = grossProfit - indirectCostTotal - operatingExpense;
    const operatingProfitRate = totalRevenue > 0 ? (operatingProfit / totalRevenue) * 100 : 0;

    return {
      period: { period, year, month, quarter, date_from: dateFrom, date_to: dateTo },
      revenue,
      costs,
      profit_loss: {
        gross_profit: this.round2(grossProfit),
        gross_profit_rate: this.round2(grossProfitRate),
        operating_profit: this.round2(operatingProfit),
        operating_profit_rate: this.round2(operatingProfitRate),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Monthly Trend (last 12 months)
  // ═══════════════════════════════════════════════════════════
  async getMonthlyTrend(params: { company_id?: number; months?: number }) {
    const monthCount = params.months || 12;
    const now = new Date();
    const trends: any[] = [];

    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const { dateFrom, dateTo } = this.buildDateRange('month', year, month);

      const revenue = await this.calcRevenue(dateFrom, dateTo, params.company_id);
      const costs = await this.calcCosts(dateFrom, dateTo, params.company_id);

      const totalRevenue = revenue.total_revenue;
      const totalCost = costs.total_cost;
      const profit = totalRevenue - totalCost;

      trends.push({
        year,
        month,
        label: `${year}/${String(month).padStart(2, '0')}`,
        revenue: this.round2(totalRevenue),
        cost: this.round2(totalCost),
        profit: this.round2(profit),
      });
    }

    return { data: trends };
  }

  // ═══════════════════════════════════════════════════════════
  // Build date range from period params
  // ═══════════════════════════════════════════════════════════
  private buildDateRange(
    period?: string,
    year?: number,
    month?: number,
    quarter?: number,
  ): { dateFrom: Date | null; dateTo: Date | null } {
    if (!period || !year) return { dateFrom: null, dateTo: null };

    if (period === 'month' && month) {
      const dateFrom = new Date(year, month - 1, 1);
      const dateTo = new Date(year, month, 0, 23, 59, 59, 999);
      return { dateFrom, dateTo };
    }

    if (period === 'quarter' && quarter) {
      const startMonth = (quarter - 1) * 3;
      const dateFrom = new Date(year, startMonth, 1);
      const dateTo = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
      return { dateFrom, dateTo };
    }

    if (period === 'year') {
      const dateFrom = new Date(year, 0, 1);
      const dateTo = new Date(year, 11, 31, 23, 59, 59, 999);
      return { dateFrom, dateTo };
    }

    return { dateFrom: null, dateTo: null };
  }

  // ═══════════════════════════════════════════════════════════
  // Revenue calculation (company-wide)
  // ═══════════════════════════════════════════════════════════
  private async calcRevenue(dateFrom: Date | null, dateTo: Date | null, companyId?: number) {
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;

    // 1. Project revenue (cumulative certified from IPA)
    // Get all projects for this company
    const projectWhere: any = {};
    if (companyId) projectWhere.company_id = companyId;

    const projects = await this.prisma.project.findMany({
      where: projectWhere,
      include: {
        contract: true,
      },
    });

    let projectRevenue = 0;
    for (const project of projects) {
      if (!project.contract_id) continue;

      const paWhere: any = {
        contract_id: project.contract_id,
        status: { notIn: ['void', 'draft'] },
      };
      if (dateFrom || dateTo) {
        paWhere.period_to = dateFilter;
      }

      // Get latest IPA for this contract within date range
      const latestIpa = await this.prisma.paymentApplication.findFirst({
        where: paWhere,
        orderBy: { pa_no: 'desc' },
      });

      if (latestIpa) {
        const certified = this.toNum(latestIpa.client_certified_amount)
          || this.toNum(latestIpa.certified_amount);
        projectRevenue += certified;
      }
    }

    // 2. Invoice revenue
    const invoiceWhere: any = {
      status: { notIn: ['void', 'draft'] },
    };
    if (companyId) invoiceWhere.company_id = companyId;
    if (dateFrom || dateTo) {
      invoiceWhere.date = dateFilter;
    }

    const invoiceAgg = await this.prisma.invoice.aggregate({
      where: invoiceWhere,
      _sum: { total_amount: true },
    });
    const invoiceRevenue = this.toNum(invoiceAgg._sum.total_amount);

    // 3. Other income (PaymentIn with source_type = 'other')
    const otherIncomeWhere: any = {
      source_type: 'other',
    };
    if (dateFrom || dateTo) {
      otherIncomeWhere.date = dateFilter;
    }
    // Filter by company through project
    if (companyId) {
      otherIncomeWhere.project = { company_id: companyId };
    }

    const otherIncomeAgg = await this.prisma.paymentIn.aggregate({
      where: otherIncomeWhere,
      _sum: { amount: true },
    });
    const otherIncome = this.toNum(otherIncomeAgg._sum.amount);

    const totalRevenue = projectRevenue + invoiceRevenue + otherIncome;

    // Accounts receivable
    // Total certified + invoiced - received
    const paymentInWhere: any = {};
    if (companyId) {
      paymentInWhere.project = { company_id: companyId };
    }
    if (dateFrom || dateTo) {
      paymentInWhere.date = dateFilter;
    }
    const paymentInAgg = await this.prisma.paymentIn.aggregate({
      where: paymentInWhere,
      _sum: { amount: true },
    });
    const totalReceived = this.toNum(paymentInAgg._sum.amount);
    const accountsReceivable = totalRevenue - totalReceived;

    return {
      project_revenue: this.round2(projectRevenue),
      invoice_revenue: this.round2(invoiceRevenue),
      other_income: this.round2(otherIncome),
      total_revenue: this.round2(totalRevenue),
      total_received: this.round2(totalReceived),
      accounts_receivable: this.round2(accountsReceivable),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Cost calculation (company-wide)
  // ═══════════════════════════════════════════════════════════
  private async calcCosts(dateFrom: Date | null, dateTo: Date | null, companyId?: number) {
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;

    // All expenses with project (project costs)
    const projectExpenseWhere: any = {
      project_id: { not: null },
    };
    if (companyId) projectExpenseWhere.company_id = companyId;
    if (dateFrom || dateTo) projectExpenseWhere.date = dateFilter;

    const projectExpenses = await this.prisma.expense.findMany({
      where: projectExpenseWhere,
      include: {
        category: { include: { parent: true } },
      },
    });

    let directCostTotal = 0;
    let indirectCostTotal = 0;
    const directCosts: Record<string, number> = {};
    const indirectCosts: Record<string, number> = {};

    for (const exp of projectExpenses) {
      const amount = this.toNum(exp.total_amount);
      const categoryType = exp.category?.type || exp.category?.parent?.type || null;
      const categoryName = exp.category?.name || '其他';

      if (categoryType === 'OVERHEAD') {
        indirectCostTotal += amount;
        indirectCosts[categoryName] = (indirectCosts[categoryName] || 0) + amount;
      } else {
        directCostTotal += amount;
        directCosts[categoryName] = (directCosts[categoryName] || 0) + amount;
      }
    }

    // Operating expenses (project_id is null = company overhead)
    const opExpenseWhere: any = {
      project_id: null,
    };
    if (companyId) opExpenseWhere.company_id = companyId;
    if (dateFrom || dateTo) opExpenseWhere.date = dateFilter;

    const opExpenses = await this.prisma.expense.findMany({
      where: opExpenseWhere,
      include: {
        category: { include: { parent: true } },
      },
    });

    let operatingExpenseTotal = 0;
    const operatingExpenses: Record<string, number> = {};

    for (const exp of opExpenses) {
      const amount = this.toNum(exp.total_amount);
      const categoryName = exp.category?.name || '其他';
      operatingExpenseTotal += amount;
      operatingExpenses[categoryName] = (operatingExpenses[categoryName] || 0) + amount;
    }

    const totalCost = directCostTotal + indirectCostTotal + operatingExpenseTotal;

    // Accounts payable
    const paymentOutWhere: any = {};
    if (companyId) {
      paymentOutWhere.project = { company_id: companyId };
    }
    if (dateFrom || dateTo) {
      paymentOutWhere.date = dateFilter;
    }
    const paymentOutAgg = await this.prisma.paymentOut.aggregate({
      where: paymentOutWhere,
      _sum: { amount: true },
    });
    const totalPaid = this.toNum(paymentOutAgg._sum.amount);
    const accountsPayable = totalCost - totalPaid;

    const directBreakdown = Object.entries(directCosts)
      .map(([category, amount]) => ({ category, amount: this.round2(amount) }))
      .sort((a, b) => b.amount - a.amount);

    const indirectBreakdown = Object.entries(indirectCosts)
      .map(([category, amount]) => ({ category, amount: this.round2(amount) }))
      .sort((a, b) => b.amount - a.amount);

    const operatingBreakdown = Object.entries(operatingExpenses)
      .map(([category, amount]) => ({ category, amount: this.round2(amount) }))
      .sort((a, b) => b.amount - a.amount);

    return {
      direct_cost_total: this.round2(directCostTotal),
      direct_breakdown: directBreakdown,
      indirect_cost_total: this.round2(indirectCostTotal),
      indirect_breakdown: indirectBreakdown,
      operating_expense_total: this.round2(operatingExpenseTotal),
      operating_breakdown: operatingBreakdown,
      total_cost: this.round2(totalCost),
      total_paid: this.round2(totalPaid),
      accounts_payable: this.round2(accountsPayable),
    };
  }
}
