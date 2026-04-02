import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyProfilesService } from '../company-profiles/company-profiles.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private companyProfilesService: CompanyProfilesService,
    private customFieldsService: CustomFieldsService,
  ) {}

  private toNum(v: any): number {
    return Number(v) || 0;
  }

  private round2(n: number): number {
    return parseFloat(n.toFixed(2));
  }

  async getStats() {
    const [companies, employees, vehicles, machinery, companyProfiles] = await Promise.all([
      this.prisma.company.count({ where: { status: 'active' } }),
      this.prisma.employee.count({ where: { status: 'active' } }),
      this.prisma.vehicle.count({ where: { status: 'active' } }),
      this.prisma.machinery.count({ where: { status: 'active' } }),
      this.prisma.companyProfile.count({ where: { status: 'active' } }),
    ]);

    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60);
    const sixtyStr = sixtyDaysLater.toISOString().split('T')[0];

    // Employee expiry alerts
    const employeeAlerts: any[] = [];
    const activeEmployees = await this.prisma.employee.findMany({
      where: { status: 'active' },
      include: { company: true },
    });
    for (const e of activeEmployees) {
      const checks = [
        { type: '平安卡', date: e.green_card_expiry },
        { type: '建造業工人註冊證', date: e.construction_card_expiry },
        { type: '駕駛執照', date: e.driving_license_expiry },
      ];
      for (const c of checks) {
        if (c.date && String(c.date) <= sixtyStr) {
          employeeAlerts.push({
            id: e.id,
            name: e.name_zh,
            type: c.type,
            expiry_date: c.date,
            company_name: e.company?.name || '',
          });
        }
      }
    }
    employeeAlerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));

    // Vehicle expiry alerts
    const vehicleAlerts: any[] = [];
    const activeVehicles = await this.prisma.vehicle.findMany({
      where: { status: 'active' },
      include: { owner_company: true },
    });
    for (const v of activeVehicles) {
      const checks = [
        { type: '保險', date: v.insurance_expiry },
        { type: '牌費', date: v.permit_fee_expiry },
        { type: '驗車', date: v.inspection_date },
        { type: '行車證', date: v.license_expiry },
      ];
      for (const c of checks) {
        if (c.date && String(c.date) <= sixtyStr) {
          vehicleAlerts.push({
            id: v.id,
            name: v.plate_number,
            type: c.type,
            expiry_date: c.date,
            company_name: v.owner_company?.name || '',
          });
        }
      }
    }
    vehicleAlerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));

    // Machinery expiry alerts
    const machineryAlerts: any[] = [];
    const activeMachinery = await this.prisma.machinery.findMany({
      where: { status: 'active' },
      include: { owner_company: true },
    });
    for (const m of activeMachinery) {
      const checks = [
        { type: '驗機紙', date: m.inspection_cert_expiry },
        { type: '保險', date: m.insurance_expiry },
      ];
      for (const c of checks) {
        if (c.date && String(c.date) <= sixtyStr) {
          machineryAlerts.push({
            id: m.id,
            name: m.machine_code,
            type: c.type,
            expiry_date: c.date,
            company_name: m.owner_company?.name || '',
          });
        }
      }
    }
    machineryAlerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));

    // Company profile expiry alerts
    const companyProfileAlerts = await this.companyProfilesService.getExpiryAlerts();

    // Custom field expiry alerts
    const customFieldAlerts = await this.customFieldsService.getExpiryAlerts();

    // Employee role breakdown using raw query
    const roleBreakdown = await this.prisma.$queryRaw`
      SELECT role, COUNT(*)::int as count
      FROM employees
      WHERE status = 'active'
      GROUP BY role
    `;

    // ═══════════════════════════════════════════════════════════
    // Phase 11: Financial KPIs
    // ═══════════════════════════════════════════════════════════

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthDateFilter = { gte: thisMonthStart, lte: thisMonthEnd };

    // This month revenue (PaymentIn)
    const monthRevenueAgg = await this.prisma.paymentIn.aggregate({
      where: { date: monthDateFilter },
      _sum: { amount: true },
    });
    const monthRevenue = this.toNum(monthRevenueAgg._sum.amount);

    // This month expense
    const monthExpenseAgg = await this.prisma.expense.aggregate({
      where: { date: monthDateFilter },
      _sum: { total_amount: true },
    });
    const monthExpense = this.toNum(monthExpenseAgg._sum.total_amount);

    const monthProfit = monthRevenue - monthExpense;

    // Accounts receivable: all non-void/draft invoices outstanding + IPA certified but unpaid
    const invoiceArAgg = await this.prisma.invoice.aggregate({
      where: { status: { notIn: ['void', 'draft', 'paid'] } },
      _sum: { outstanding: true },
    });
    const invoiceAr = this.toNum(invoiceArAgg._sum.outstanding);

    // IPA accounts receivable: sum of (client_certified_amount or certified_amount) - paid_amount for non-void/draft
    const openIpas = await this.prisma.paymentApplication.findMany({
      where: { status: { notIn: ['void', 'draft'] } },
      select: { certified_amount: true, client_certified_amount: true, paid_amount: true },
    });
    let ipaAr = 0;
    for (const ipa of openIpas) {
      const certified = this.toNum(ipa.client_certified_amount) || this.toNum(ipa.certified_amount);
      const paid = this.toNum(ipa.paid_amount);
      if (certified > paid) {
        ipaAr += certified - paid;
      }
    }
    const accountsReceivable = this.round2(invoiceAr + ipaAr);

    // Accounts payable: total expenses - total payment out
    const totalExpenseAgg = await this.prisma.expense.aggregate({
      where: { is_paid: false },
      _sum: { total_amount: true },
    });
    const accountsPayable = this.round2(this.toNum(totalExpenseAgg._sum.total_amount));

    // Active projects count
    const activeProjects = await this.prisma.project.count({
      where: { status: 'active' },
    });

    // ─── Monthly Trend (last 12 months) ─────────────────────
    const monthlyTrend: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const mFilter = { gte: mStart, lte: mEnd };

      const [revAgg, expAgg] = await Promise.all([
        this.prisma.paymentIn.aggregate({
          where: { date: mFilter },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: { date: mFilter },
          _sum: { total_amount: true },
        }),
      ]);

      const rev = this.toNum(revAgg._sum.amount);
      const exp = this.toNum(expAgg._sum.total_amount);

      monthlyTrend.push({
        label: `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        revenue: this.round2(rev),
        expense: this.round2(exp),
        profit: this.round2(rev - exp),
      });
    }

    // ─── Project Profit Ranking (Top 10) ─────────────────────
    const allProjects = await this.prisma.project.findMany({
      where: { status: { in: ['active', 'completed'] } },
      include: {
        contract: true,
        client: { select: { name: true } },
      },
    });

    const projectProfits: any[] = [];
    for (const project of allProjects) {
      let revenue = 0;
      if (project.contract_id) {
        const latestIpa = await this.prisma.paymentApplication.findFirst({
          where: {
            contract_id: project.contract_id,
            status: { notIn: ['void', 'draft'] },
          },
          orderBy: { pa_no: 'desc' },
        });
        if (latestIpa) {
          revenue = this.toNum(latestIpa.client_certified_amount) || this.toNum(latestIpa.certified_amount);
        }
      }

      const invoiceAgg = await this.prisma.invoice.aggregate({
        where: { project_id: project.id, status: { notIn: ['void', 'draft'] } },
        _sum: { total_amount: true },
      });
      revenue += this.toNum(invoiceAgg._sum.total_amount);

      const expenseAgg = await this.prisma.expense.aggregate({
        where: { project_id: project.id },
        _sum: { total_amount: true },
      });
      const cost = this.toNum(expenseAgg._sum.total_amount);
      const profit = revenue - cost;

      projectProfits.push({
        id: project.id,
        project_no: project.project_no,
        project_name: project.project_name,
        client_name: project.client?.name || '-',
        revenue: this.round2(revenue),
        cost: this.round2(cost),
        profit: this.round2(profit),
      });
    }

    projectProfits.sort((a, b) => b.profit - a.profit);
    const topProjects = projectProfits.slice(0, 10);

    // ─── Expense Category Pie ────────────────────────────────
    const expenseCategories = await this.prisma.expense.groupBy({
      by: ['category_id'],
      where: { date: monthDateFilter },
      _sum: { total_amount: true },
    });

    const categoryIds = expenseCategories.map((e) => e.category_id).filter(Boolean) as number[];
    const categories = categoryIds.length > 0
      ? await this.prisma.expenseCategory.findMany({
          where: { id: { in: categoryIds } },
        })
      : [];
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    const expensePie = expenseCategories
      .map((e) => ({
        category: categoryMap.get(e.category_id!) || '未分類',
        amount: this.round2(this.toNum(e._sum.total_amount)),
      }))
      .sort((a, b) => b.amount - a.amount);

    // ─── Reminders / To-do ───────────────────────────────────

    // Unmatched bank transactions
    const unmatchedBankTx = await this.prisma.bankTransaction.count({
      where: { match_status: 'unmatched' },
    });

    // Upcoming due invoices (next 30 days)
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const upcomingInvoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: ['issued', 'partially_paid'] },
        due_date: { lte: thirtyDaysLater },
      },
      include: {
        client: { select: { name: true } },
      },
      orderBy: { due_date: 'asc' },
      take: 10,
    });

    // Unconfirmed IPAs
    const unconfirmedIpas = await this.prisma.paymentApplication.count({
      where: { status: 'draft' },
    });

    // Pending leave requests
    const pendingLeaves = await this.prisma.employeeLeave.count({
      where: { status: 'pending' },
    });

    return {
      companies,
      employees,
      vehicles,
      machinery,
      companyProfiles,
      expiryAlerts: {
        employees: employeeAlerts,
        vehicles: vehicleAlerts,
        machinery: machineryAlerts,
        companyProfiles: companyProfileAlerts,
        customFields: customFieldAlerts,
      },
      roleBreakdown,
      // Phase 11 additions
      financial: {
        month_revenue: this.round2(monthRevenue),
        month_expense: this.round2(monthExpense),
        month_profit: this.round2(monthProfit),
        accounts_receivable: accountsReceivable,
        accounts_payable: accountsPayable,
        active_projects: activeProjects,
      },
      monthly_trend: monthlyTrend,
      top_projects: topProjects,
      expense_pie: expensePie,
      reminders: {
        unmatched_bank_tx: unmatchedBankTx,
        upcoming_invoices: upcomingInvoices,
        unconfirmed_ipas: unconfirmedIpas,
        employee_cert_expiring: employeeAlerts.length,
        pending_leaves: pendingLeaves,
      },
    };
  }
}
