import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyProfilesService } from '../company-profiles/company-profiles.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { WhatsappService } from '../verification/whatsapp.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private companyProfilesService: CompanyProfilesService,
    private customFieldsService: CustomFieldsService,
    private whatsappService: WhatsappService,
  ) {}

  private toNum(v: any): number {
    return Number(v) || 0;
  }

  private round2(n: number): number {
    return parseFloat(n.toFixed(2));
  }

  // ═══════════════════════════════════════════════════════════
  // Tab 1: 工作狀況
  // ═══════════════════════════════════════════════════════════

  async getWorkStatus() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // ── 每日 WhatsApp Order 摘要（今天）──────────────────────
    const todaySummary = await this.whatsappService.getDailySummary(todayStr);

    let machineryCount = 0;
    let manpowerCount = 0;
    let transportCount = 0;
    let totalOrderItems = 0;

    if (todaySummary) {
      const activeItems = todaySummary.items.filter(
        (item) => !item.is_suspended && item.mod_status !== 'cancelled',
      );
      totalOrderItems = activeItems.length;
      machineryCount = activeItems.filter((i) => i.order_type === 'machinery').length;
      manpowerCount = activeItems.filter((i) => i.order_type === 'manpower').length;
      transportCount = activeItems.filter((i) => i.order_type === 'transport').length;
    }

    // ── 每日車輛工作數（今天打卡記錄中的車輛）──────────────
    // 從 work_logs 統計今天有 scheduled_date 的車輛（去重 equipment_number）
    const todayWorkLogs = await this.prisma.workLog.findMany({
      where: {
        scheduled_date: { gte: todayStart, lte: todayEnd },
      },
      select: {
        equipment_number: true,
        machine_type: true,
      },
    });

    // 統計有車牌/機械編號的記錄（去重）
    const uniqueVehicles = new Set<string>();
    for (const log of todayWorkLogs) {
      if (log.equipment_number) {
        uniqueVehicles.add(log.equipment_number);
      }
    }
    const dailyVehicleCount = uniqueVehicles.size;

    // ── 進行中工程數量 ────────────────────────────────────────
    const activeProjectsCount = await this.prisma.project.count({
      where: { status: 'active' },
    });

    // ── 最近入職員工（最近 30 天）────────────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentEmployees = await this.prisma.employee.findMany({
      where: {
        status: 'active',
        join_date: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        name_zh: true,
        name_en: true,
        role: true,
        join_date: true,
        company: { select: { name: true } },
      },
      orderBy: { join_date: 'desc' },
      take: 10,
    });

    // ── WhatsApp Bot 狀態 ─────────────────────────────────────
    const botStatus = await this.whatsappService.getBotStatus();

    // ── 近 7 天每日車輛工作數趨勢 ────────────────────────────
    const dailyVehicleTrend: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const dEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const dStr = `${d.getMonth() + 1}/${d.getDate()}`;

      const logs = await this.prisma.workLog.findMany({
        where: { scheduled_date: { gte: dStart, lte: dEnd } },
        select: { equipment_number: true },
      });
      const uniq = new Set(logs.map((l) => l.equipment_number).filter(Boolean));
      dailyVehicleTrend.push({ date: dStr, count: uniq.size });
    }

    return {
      daily_vehicle_count: dailyVehicleCount,
      active_projects_count: activeProjectsCount,
      daily_order_summary: {
        date: todayStr,
        total: totalOrderItems,
        machinery: machineryCount,
        manpower: manpowerCount,
        transport: transportCount,
        order_status: todaySummary?.latest_status || null,
      },
      recent_employees: recentEmployees.map((e) => ({
        id: e.id,
        name_zh: e.name_zh,
        name_en: e.name_en,
        role: e.role,
        join_date: e.join_date,
        company_name: e.company?.name || '',
      })),
      bot_status: botStatus,
      daily_vehicle_trend: dailyVehicleTrend,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Tab 2: 警告及提醒（含 MPF 提醒）
  // ═══════════════════════════════════════════════════════════

  async getAlerts() {
    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60);
    const sixtyStr = sixtyDaysLater.toISOString().split('T')[0];

    // ── 員工證件到期提醒 ──────────────────────────────────────
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

    // ── 車輛到期提醒 ──────────────────────────────────────────
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

    // ── 機械到期提醒 ──────────────────────────────────────────
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

    // ── 公司資料到期提醒 ──────────────────────────────────────
    const companyProfileAlerts = await this.companyProfilesService.getExpiryAlerts();

    // ── 自定義欄位到期提醒 ────────────────────────────────────
    const customFieldAlerts = await this.customFieldsService.getExpiryAlerts();

    // ── MPF 提醒（入職超過 60 天但未申請 MPF）────────────────
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const mpfPendingEmployees = await this.prisma.employee.findMany({
      where: {
        status: 'active',
        employee_is_temporary: false,
        employee_mpf_applied: false,
        join_date: { lte: sixtyDaysAgo },
      },
      select: {
        id: true,
        name_zh: true,
        name_en: true,
        role: true,
        join_date: true,
        company: { select: { name: true } },
      },
      orderBy: { join_date: 'asc' },
    });

    const mpfAlerts = mpfPendingEmployees.map((e) => {
      const joinDate = e.join_date ? new Date(e.join_date) : null;
      const daysSinceJoin = joinDate
        ? Math.floor((new Date().getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return {
        id: e.id,
        name: e.name_zh,
        name_en: e.name_en,
        role: e.role,
        join_date: e.join_date,
        days_since_join: daysSinceJoin,
        company_name: e.company?.name || '',
      };
    });

    // ── 合併所有到期警告並按嚴重程度排序 ─────────────────────
    const now = new Date();
    const getDaysUntil = (dateVal: any): number => {
      if (!dateVal) return 9999;
      const d = new Date(dateVal);
      return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    };

    const allExpiryAlerts = [
      ...employeeAlerts,
      ...vehicleAlerts,
      ...machineryAlerts,
      ...companyProfileAlerts,
      ...customFieldAlerts,
    ].sort((a, b) => {
      const da = getDaysUntil(a.expiry_date || a.date);
      const db = getDaysUntil(b.expiry_date || b.date);
      return da - db;
    });

    const criticalCount = allExpiryAlerts.filter((a) => getDaysUntil(a.expiry_date || a.date) <= 7).length;
    const warningCount = allExpiryAlerts.filter((a) => {
      const d = getDaysUntil(a.expiry_date || a.date);
      return d > 7 && d <= 30;
    }).length;
    const cautionCount = allExpiryAlerts.filter((a) => {
      const d = getDaysUntil(a.expiry_date || a.date);
      return d > 30 && d <= 60;
    }).length;

    // 總未處理警告數（到期提醒 + MPF 提醒）
    const totalAlertCount = allExpiryAlerts.length + mpfAlerts.length;

    return {
      expiry_alerts: {
        employees: employeeAlerts,
        vehicles: vehicleAlerts,
        machinery: machineryAlerts,
        companyProfiles: companyProfileAlerts,
        customFields: customFieldAlerts,
      },
      mpf_alerts: mpfAlerts,
      summary: {
        critical: criticalCount,
        warning: warningCount,
        caution: cautionCount,
        mpf_pending: mpfAlerts.length,
        total: totalAlertCount,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Tab 3: 公司收支（原有 getStats 的財務部分）
  // ═══════════════════════════════════════════════════════════

  async getFinancial() {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthDateFilter = { gte: thisMonthStart, lte: thisMonthEnd };

    const monthRevenueAgg = await this.prisma.paymentIn.aggregate({
      where: { date: monthDateFilter },
      _sum: { amount: true },
    });
    const monthRevenue = this.toNum(monthRevenueAgg._sum.amount);

    const monthExpenseAgg = await this.prisma.expense.aggregate({
      where: { date: monthDateFilter },
      _sum: { total_amount: true },
    });
    const monthExpense = this.toNum(monthExpenseAgg._sum.total_amount);
    const monthProfit = monthRevenue - monthExpense;

    const invoiceArAgg = await this.prisma.invoice.aggregate({
      where: { status: { notIn: ['void', 'draft', 'paid'] } },
      _sum: { outstanding: true },
    });
    const invoiceAr = this.toNum(invoiceArAgg._sum.outstanding);

    const openIpas = await this.prisma.paymentApplication.findMany({
      where: { status: { notIn: ['void', 'draft'] } },
      select: { certified_amount: true, client_certified_amount: true, paid_amount: true },
    });
    let ipaAr = 0;
    for (const ipa of openIpas) {
      const certified = this.toNum(ipa.client_certified_amount) || this.toNum(ipa.certified_amount);
      const paid = this.toNum(ipa.paid_amount);
      if (certified > paid) ipaAr += certified - paid;
    }
    const accountsReceivable = this.round2(invoiceAr + ipaAr);

    const totalExpenseAgg = await this.prisma.expense.aggregate({
      where: { is_paid: false },
      _sum: { total_amount: true },
    });
    const accountsPayable = this.round2(this.toNum(totalExpenseAgg._sum.total_amount));

    const activeProjects = await this.prisma.project.count({ where: { status: 'active' } });

    // Monthly trend (last 12 months)
    const monthlyTrend: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const mFilter = { gte: mStart, lte: mEnd };
      const [revAgg, expAgg] = await Promise.all([
        this.prisma.paymentIn.aggregate({ where: { date: mFilter }, _sum: { amount: true } }),
        this.prisma.expense.aggregate({ where: { date: mFilter }, _sum: { total_amount: true } }),
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

    // Top projects
    const allProjects = await this.prisma.project.findMany({
      where: { status: { in: ['active', 'completed'] } },
      include: { contract: true, client: { select: { name: true } } },
    });
    const projectProfits: any[] = [];
    for (const project of allProjects) {
      let revenue = 0;
      if (project.contract_id) {
        const latestIpa = await this.prisma.paymentApplication.findFirst({
          where: { contract_id: project.contract_id, status: { notIn: ['void', 'draft'] } },
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
      projectProfits.push({
        id: project.id,
        project_no: project.project_no,
        project_name: project.project_name,
        client_name: project.client?.name || '-',
        revenue: this.round2(revenue),
        cost: this.round2(cost),
        profit: this.round2(revenue - cost),
      });
    }
    projectProfits.sort((a, b) => b.profit - a.profit);
    const topProjects = projectProfits.slice(0, 10);

    // Expense pie
    const expenseCategories = await this.prisma.expense.groupBy({
      by: ['category_id'],
      where: { date: monthDateFilter },
      _sum: { total_amount: true },
    });
    const categoryIds = expenseCategories.map((e) => e.category_id).filter(Boolean) as number[];
    const categories = categoryIds.length > 0
      ? await this.prisma.expenseCategory.findMany({ where: { id: { in: categoryIds } } })
      : [];
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const expensePie = expenseCategories
      .map((e) => ({
        category: categoryMap.get(e.category_id!) || '未分類',
        amount: this.round2(this.toNum(e._sum.total_amount)),
      }))
      .sort((a, b) => b.amount - a.amount);

    // Reminders
    const unmatchedBankTx = await this.prisma.bankTransaction.count({ where: { match_status: 'unmatched' } });
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const upcomingInvoices = await this.prisma.invoice.findMany({
      where: { status: { in: ['issued', 'partially_paid'] }, due_date: { lte: thirtyDaysLater } },
      include: { client: { select: { name: true } } },
      orderBy: { due_date: 'asc' },
      take: 10,
    });
    const unconfirmedIpas = await this.prisma.paymentApplication.count({ where: { status: 'draft' } });
    const pendingLeaves = await this.prisma.employeeLeave.count({ where: { status: 'pending' } });

    // Role breakdown
    const roleBreakdown = await this.prisma.$queryRaw`
      SELECT role, COUNT(*)::int as count
      FROM employees
      WHERE status = 'active'
      GROUP BY role
    `;
    const totalEmployees = await this.prisma.employee.count({ where: { status: 'active' } });

    return {
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
        employee_cert_expiring: 0, // computed from alerts tab
        pending_leaves: pendingLeaves,
      },
      role_breakdown: roleBreakdown,
      total_employees: totalEmployees,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 原有 getStats（保持向後相容）
  // ═══════════════════════════════════════════════════════════

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
          employeeAlerts.push({ id: e.id, name: e.name_zh, type: c.type, expiry_date: c.date, company_name: e.company?.name || '' });
        }
      }
    }
    employeeAlerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));

    const vehicleAlerts: any[] = [];
    const activeVehicles = await this.prisma.vehicle.findMany({ where: { status: 'active' }, include: { owner_company: true } });
    for (const v of activeVehicles) {
      const checks = [
        { type: '保險', date: v.insurance_expiry }, { type: '牌費', date: v.permit_fee_expiry },
        { type: '驗車', date: v.inspection_date }, { type: '行車證', date: v.license_expiry },
      ];
      for (const c of checks) {
        if (c.date && String(c.date) <= sixtyStr) {
          vehicleAlerts.push({ id: v.id, name: v.plate_number, type: c.type, expiry_date: c.date, company_name: v.owner_company?.name || '' });
        }
      }
    }
    vehicleAlerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));

    const machineryAlerts: any[] = [];
    const activeMachinery = await this.prisma.machinery.findMany({ where: { status: 'active' }, include: { owner_company: true } });
    for (const m of activeMachinery) {
      const checks = [{ type: '驗機紙', date: m.inspection_cert_expiry }, { type: '保險', date: m.insurance_expiry }];
      for (const c of checks) {
        if (c.date && String(c.date) <= sixtyStr) {
          machineryAlerts.push({ id: m.id, name: m.machine_code, type: c.type, expiry_date: c.date, company_name: m.owner_company?.name || '' });
        }
      }
    }
    machineryAlerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));

    const companyProfileAlerts = await this.companyProfilesService.getExpiryAlerts();
    const customFieldAlerts = await this.customFieldsService.getExpiryAlerts();

    const roleBreakdown = await this.prisma.$queryRaw`
      SELECT role, COUNT(*)::int as count FROM employees WHERE status = 'active' GROUP BY role
    `;

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthDateFilter = { gte: thisMonthStart, lte: thisMonthEnd };

    const monthRevenueAgg = await this.prisma.paymentIn.aggregate({ where: { date: monthDateFilter }, _sum: { amount: true } });
    const monthRevenue = this.toNum(monthRevenueAgg._sum.amount);
    const monthExpenseAgg = await this.prisma.expense.aggregate({ where: { date: monthDateFilter }, _sum: { total_amount: true } });
    const monthExpense = this.toNum(monthExpenseAgg._sum.total_amount);
    const monthProfit = monthRevenue - monthExpense;

    const invoiceArAgg = await this.prisma.invoice.aggregate({ where: { status: { notIn: ['void', 'draft', 'paid'] } }, _sum: { outstanding: true } });
    const invoiceAr = this.toNum(invoiceArAgg._sum.outstanding);
    const openIpas = await this.prisma.paymentApplication.findMany({ where: { status: { notIn: ['void', 'draft'] } }, select: { certified_amount: true, client_certified_amount: true, paid_amount: true } });
    let ipaAr = 0;
    for (const ipa of openIpas) {
      const certified = this.toNum(ipa.client_certified_amount) || this.toNum(ipa.certified_amount);
      const paid = this.toNum(ipa.paid_amount);
      if (certified > paid) ipaAr += certified - paid;
    }
    const accountsReceivable = this.round2(invoiceAr + ipaAr);
    const totalExpenseAgg = await this.prisma.expense.aggregate({ where: { is_paid: false }, _sum: { total_amount: true } });
    const accountsPayable = this.round2(this.toNum(totalExpenseAgg._sum.total_amount));
    const activeProjects = await this.prisma.project.count({ where: { status: 'active' } });

    const monthlyTrend: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const mFilter = { gte: mStart, lte: mEnd };
      const [revAgg, expAgg] = await Promise.all([
        this.prisma.paymentIn.aggregate({ where: { date: mFilter }, _sum: { amount: true } }),
        this.prisma.expense.aggregate({ where: { date: mFilter }, _sum: { total_amount: true } }),
      ]);
      const rev = this.toNum(revAgg._sum.amount);
      const exp = this.toNum(expAgg._sum.total_amount);
      monthlyTrend.push({ label: `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`, revenue: this.round2(rev), expense: this.round2(exp), profit: this.round2(rev - exp) });
    }

    const allProjects = await this.prisma.project.findMany({ where: { status: { in: ['active', 'completed'] } }, include: { contract: true, client: { select: { name: true } } } });
    const projectProfits: any[] = [];
    for (const project of allProjects) {
      let revenue = 0;
      if (project.contract_id) {
        const latestIpa = await this.prisma.paymentApplication.findFirst({ where: { contract_id: project.contract_id, status: { notIn: ['void', 'draft'] } }, orderBy: { pa_no: 'desc' } });
        if (latestIpa) revenue = this.toNum(latestIpa.client_certified_amount) || this.toNum(latestIpa.certified_amount);
      }
      const invoiceAgg = await this.prisma.invoice.aggregate({ where: { project_id: project.id, status: { notIn: ['void', 'draft'] } }, _sum: { total_amount: true } });
      revenue += this.toNum(invoiceAgg._sum.total_amount);
      const expenseAgg = await this.prisma.expense.aggregate({ where: { project_id: project.id }, _sum: { total_amount: true } });
      const cost = this.toNum(expenseAgg._sum.total_amount);
      projectProfits.push({ id: project.id, project_no: project.project_no, project_name: project.project_name, client_name: project.client?.name || '-', revenue: this.round2(revenue), cost: this.round2(cost), profit: this.round2(revenue - cost) });
    }
    projectProfits.sort((a, b) => b.profit - a.profit);
    const topProjects = projectProfits.slice(0, 10);

    const expenseCategories = await this.prisma.expense.groupBy({ by: ['category_id'], where: { date: monthDateFilter }, _sum: { total_amount: true } });
    const categoryIds = expenseCategories.map((e) => e.category_id).filter(Boolean) as number[];
    const cats = categoryIds.length > 0 ? await this.prisma.expenseCategory.findMany({ where: { id: { in: categoryIds } } }) : [];
    const categoryMap = new Map(cats.map((c) => [c.id, c.name]));
    const expensePie = expenseCategories.map((e) => ({ category: categoryMap.get(e.category_id!) || '未分類', amount: this.round2(this.toNum(e._sum.total_amount)) })).sort((a, b) => b.amount - a.amount);

    const unmatchedBankTx = await this.prisma.bankTransaction.count({ where: { match_status: 'unmatched' } });
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const upcomingInvoices = await this.prisma.invoice.findMany({ where: { status: { in: ['issued', 'partially_paid'] }, due_date: { lte: thirtyDaysLater } }, include: { client: { select: { name: true } } }, orderBy: { due_date: 'asc' }, take: 10 });
    const unconfirmedIpas = await this.prisma.paymentApplication.count({ where: { status: 'draft' } });
    const pendingLeaves = await this.prisma.employeeLeave.count({ where: { status: 'pending' } });

    return {
      companies, employees, vehicles, machinery, companyProfiles,
      expiryAlerts: { employees: employeeAlerts, vehicles: vehicleAlerts, machinery: machineryAlerts, companyProfiles: companyProfileAlerts, customFields: customFieldAlerts },
      roleBreakdown,
      financial: { month_revenue: this.round2(monthRevenue), month_expense: this.round2(monthExpense), month_profit: this.round2(monthProfit), accounts_receivable: accountsReceivable, accounts_payable: accountsPayable, active_projects: activeProjects },
      monthly_trend: monthlyTrend,
      top_projects: topProjects,
      expense_pie: expensePie,
      reminders: { unmatched_bank_tx: unmatchedBankTx, upcoming_invoices: upcomingInvoices, unconfirmed_ipas: unconfirmedIpas, employee_cert_expiring: employeeAlerts.length, pending_leaves: pendingLeaves },
    };
  }

  // ════════════════════════════════════════════════════════════
  // Tab 5: 打卡總覽
  // ════════════════════════════════════════════════════════════

  private getHKTDayRange(): { start: Date; end: Date } {
    const now = new Date();
    const hktOffset = 8 * 60;
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const hktMs = utcMs + hktOffset * 60000;
    const hktNow = new Date(hktMs);
    const hktDayStart = new Date(hktNow.getFullYear(), hktNow.getMonth(), hktNow.getDate());
    const start = new Date(hktDayStart.getTime() - hktOffset * 60000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  private toHKTDate(d: Date): Date {
    const hktOffset = 8 * 60;
    const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
    return new Date(utcMs + hktOffset * 60000);
  }

  async getAttendanceSummary() {
    const { start: todayStart, end: todayEnd } = this.getHKTDayRange();

    // ── 今天所有打卡記錄 ─────────────────────────────────────
    const todayRecords = await this.prisma.employeeAttendance.findMany({
      where: {
        timestamp: { gte: todayStart, lt: todayEnd },
      },
      include: {
        employee: {
          select: {
            id: true,
            name_zh: true,
            name_en: true,
            emp_code: true,
            role: true,
            role_title: true,
            employee_is_temporary: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    // ── 所有在職員工（非臨時工）─────────────────────────────
    const activeEmployees = await this.prisma.employee.findMany({
      where: {
        status: 'active',
        employee_is_temporary: false,
        deleted_at: null,
      },
      select: {
        id: true,
        name_zh: true,
        name_en: true,
        emp_code: true,
        role: true,
        role_title: true,
        company: { select: { id: true, name: true } },
      },
    });

    // ── 統計已打卡/未打卡 ────────────────────────────────────
    const clockedInEmployeeIds = new Set<number>();
    for (const rec of todayRecords) {
      clockedInEmployeeIds.add(rec.employee_id);
    }

    const totalActive = activeEmployees.length;
    const clockedInCount = activeEmployees.filter((e) => clockedInEmployeeIds.has(e.id)).length;
    const notClockedInCount = totalActive - clockedInCount;

    // 未打卡員工列表
    const notClockedIn = activeEmployees
      .filter((e) => !clockedInEmployeeIds.has(e.id))
      .map((e) => ({
        id: e.id,
        name_zh: e.name_zh,
        name_en: e.name_en,
        emp_code: e.emp_code,
        role: e.role,
        role_title: e.role_title,
        company_name: e.company?.name || '',
      }));

    // ── 遲到/早退統計 ────────────────────────────────────────
    // 規則：開工 clock_in 在 HKT 08:00 之後算遲到
    //       收工 clock_out 在 HKT 18:00 之前算早退
    const LATE_HOUR = 8;
    const LATE_MINUTE = 0;
    const EARLY_HOUR = 18;
    const EARLY_MINUTE = 0;

    const lateRecords: Array<{
      employee_id: number;
      name_zh: string;
      emp_code: string | null;
      role_title: string | null;
      company_name: string;
      clock_in_time: string;
      minutes_late: number;
    }> = [];

    const earlyLeaveRecords: Array<{
      employee_id: number;
      name_zh: string;
      emp_code: string | null;
      role_title: string | null;
      company_name: string;
      clock_out_time: string;
      minutes_early: number;
    }> = [];

    // 每位員工的第一筆 clock_in 和最後一筆 clock_out
    const firstClockIn = new Map<number, typeof todayRecords[0]>();
    const lastClockOut = new Map<number, typeof todayRecords[0]>();

    // todayRecords 已按 timestamp desc 排序
    for (const rec of todayRecords) {
      if (rec.type === 'clock_in') {
        // 取最早的 clock_in（因為 desc 排序，後面的更早）
        firstClockIn.set(rec.employee_id, rec);
      }
      if (rec.type === 'clock_out') {
        // 取最晚的 clock_out（因為 desc 排序，第一筆就是最晚的）
        if (!lastClockOut.has(rec.employee_id)) {
          lastClockOut.set(rec.employee_id, rec);
        }
      }
    }

    for (const [empId, rec] of firstClockIn) {
      const hktTime = this.toHKTDate(new Date(rec.timestamp));
      const lateThreshold = LATE_HOUR * 60 + LATE_MINUTE;
      const actualMinutes = hktTime.getHours() * 60 + hktTime.getMinutes();
      if (actualMinutes > lateThreshold) {
        lateRecords.push({
          employee_id: empId,
          name_zh: rec.employee?.name_zh || '',
          emp_code: rec.employee?.emp_code || null,
          role_title: rec.employee?.role_title || null,
          company_name: rec.employee?.company?.name || '',
          clock_in_time: rec.timestamp.toISOString(),
          minutes_late: actualMinutes - lateThreshold,
        });
      }
    }

    for (const [empId, rec] of lastClockOut) {
      // 只計算非中直的 clock_out
      if (rec.is_mid_shift) continue;
      const hktTime = this.toHKTDate(new Date(rec.timestamp));
      const earlyThreshold = EARLY_HOUR * 60 + EARLY_MINUTE;
      const actualMinutes = hktTime.getHours() * 60 + hktTime.getMinutes();
      if (actualMinutes < earlyThreshold) {
        earlyLeaveRecords.push({
          employee_id: empId,
          name_zh: rec.employee?.name_zh || '',
          emp_code: rec.employee?.emp_code || null,
          role_title: rec.employee?.role_title || null,
          company_name: rec.employee?.company?.name || '',
          clock_out_time: rec.timestamp.toISOString(),
          minutes_early: earlyThreshold - actualMinutes,
        });
      }
    }

    // 排序：遲到最多的排前面
    lateRecords.sort((a, b) => b.minutes_late - a.minutes_late);
    earlyLeaveRecords.sort((a, b) => b.minutes_early - a.minutes_early);

    // ── 打卡記錄列表（不含 photo base64 以減少傳輸量）────────
    const records = todayRecords.map((rec) => ({
      id: rec.id,
      employee_id: rec.employee_id,
      name_zh: rec.employee?.name_zh || '',
      name_en: rec.employee?.name_en || '',
      emp_code: rec.employee?.emp_code || '',
      role_title: rec.employee?.role_title || '',
      is_temporary: rec.employee?.employee_is_temporary || false,
      company_name: rec.employee?.company?.name || '',
      type: rec.type,
      timestamp: rec.timestamp,
      address: rec.address,
      latitude: rec.latitude,
      longitude: rec.longitude,
      is_mid_shift: rec.is_mid_shift,
      work_notes: rec.work_notes,
      verification_method: rec.attendance_verification_method,
    }));

    return {
      records,
      summary: {
        total_records: todayRecords.length,
        total_active_employees: totalActive,
        clocked_in_count: clockedInCount,
        not_clocked_in_count: notClockedInCount,
        late_count: lateRecords.length,
        early_leave_count: earlyLeaveRecords.length,
      },
      not_clocked_in: notClockedIn,
      late_records: lateRecords,
      early_leave_records: earlyLeaveRecords,
    };
  }

  // ════════════════════════════════════════════════════════════
  // WhatsApp 報工訊息即時 feed
  // ════════════════════════════════════════════════════════════════════
  async getWhatsappFeed() {
    const CLOCKIN_GROUPS = [
      '120363278016234111@g.us',
      '120363277125015302@g.us',
      '120363262093688968@g.us',
      '85262366968-1600675068@g.us',
    ];
    const GROUP_LABELS: Record<string, string> = {
      '120363278016234111@g.us': '工程部',
      '120363277125015302@g.us': '運輸部',
      '120363262093688968@g.us': '機械部',
      '85262366968-1600675068@g.us': '公司打卡',
    };
    // Use HKT (UTC+8) for today boundary
    const now = new Date();
    const hktOffset = 8 * 60;
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const hktMs = utcMs + hktOffset * 60000;
    const hktNow = new Date(hktMs);
    const hktDayStart = new Date(hktNow.getFullYear(), hktNow.getMonth(), hktNow.getDate());
    const todayStart = new Date(hktDayStart.getTime() - hktOffset * 60000);
    const messages = await this.prisma.verificationWaMessage.findMany({
      where: {
        wa_msg_group_id: { in: CLOCKIN_GROUPS },
        wa_msg_timestamp: { gte: todayStart },
        wa_msg_type: 'text',
      },
      orderBy: { wa_msg_timestamp: 'desc' },
      take: 100,
      select: {
        id: true,
        wa_msg_group_id: true,
        wa_msg_group_name: true,
        wa_msg_sender_name: true,
        wa_msg_timestamp: true,
        wa_msg_body: true,
      },
    });
    return messages.map((m) => ({
      id: m.id,
      group_id: m.wa_msg_group_id,
      group_label: GROUP_LABELS[m.wa_msg_group_id || ''] || m.wa_msg_group_name || '報工群組',
      sender: m.wa_msg_sender_name,
      text: m.wa_msg_body,
      received_at: m.wa_msg_timestamp,
    }));
  }
}
