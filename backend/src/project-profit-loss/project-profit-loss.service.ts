import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface OverviewRow {
  id: number;
  project_no: string;
  project_name: string;
  status: string;
  client_name: string;
  contract_amount: number;
  cumulative_certified: number;
  invoice_revenue: number;
  total_revenue: number;
  total_cost: number;
  direct_cost: number;
  gross_profit: number;
  gross_profit_rate: number;
  completion_percentage: number;
}

@Injectable()
export class ProjectProfitLossService {
  constructor(private prisma: PrismaService) {}

  private toNum(v: any): number {
    return Number(v) || 0;
  }

  // ═══════════════════════════════════════════════════════════
  // Get P&L report for a single project
  // ═══════════════════════════════════════════════════════════
  async getProjectProfitLoss(projectId: number, dateFrom?: string, dateTo?: string) {
    // 1. Fetch project with contract
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        contract: {
          include: {
            bq_items: { where: { status: 'active' } },
            variation_orders: { where: { status: 'approved' } },
          },
        },
        client: { select: { id: true, name: true, name_en: true } },
      },
    });
    if (!project) throw new NotFoundException('工程不存在');

    const contractId = project.contract_id;

    // ─── Revenue ────────────────────────────────────────────
    const revenue = await this.calcRevenue(project, contractId, dateFrom, dateTo);

    // ─── Costs ──────────────────────────────────────────────
    const costs = await this.calcCosts(projectId, dateFrom, dateTo);

    // ─── Retention ──────────────────────────────────────────
    const retention = contractId
      ? await this.calcRetention(contractId)
      : { cumulative_retained: 0, total_released: 0, unreleased_balance: 0 };

    // ─── Cash Flow ──────────────────────────────────────────
    const cashFlow = await this.calcCashFlow(projectId, contractId, dateFrom, dateTo);

    // ─── P&L Calculation ────────────────────────────────────
    const cumulativeCertified = revenue.cumulative_certified;
    const directCostTotal = costs.direct_cost_total;
    const indirectCostTotal = costs.indirect_cost_total;

    const grossProfit = cumulativeCertified - directCostTotal;
    const grossProfitRate = cumulativeCertified > 0
      ? (grossProfit / cumulativeCertified) * 100
      : 0;
    const netProfit = cumulativeCertified - directCostTotal - indirectCostTotal;
    const netProfitRate = cumulativeCertified > 0
      ? (netProfit / cumulativeCertified) * 100
      : 0;
    const completionPercentage = revenue.revised_contract_total > 0
      ? (cumulativeCertified / revenue.revised_contract_total) * 100
      : 0;

    return {
      project: {
        id: project.id,
        project_no: project.project_no,
        project_name: project.project_name,
        status: project.status,
        client: project.client,
        contract_id: contractId,
      },
      revenue,
      costs,
      profit_loss: {
        gross_profit: this.round2(grossProfit),
        gross_profit_rate: this.round2(grossProfitRate),
        net_profit: this.round2(netProfit),
        net_profit_rate: this.round2(netProfitRate),
        completion_percentage: this.round2(completionPercentage),
      },
      retention,
      cash_flow: cashFlow,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Revenue calculation
  // ═══════════════════════════════════════════════════════════
  private async calcRevenue(project: any, contractId: number | null, dateFrom?: string, dateTo?: string) {
    let originalAmount = 0;
    let approvedVoAmount = 0;
    let revisedContractTotal = 0;
    let cumulativeCertified = 0;

    if (contractId) {
      const contract = project.contract;
      originalAmount = this.toNum(contract?.original_amount);

      // Approved VO amount
      approvedVoAmount = (contract?.variation_orders || []).reduce(
        (sum: number, vo: any) => sum + this.toNum(vo.approved_amount),
        0,
      );

      revisedContractTotal = originalAmount + approvedVoAmount;

      // Cumulative certified from IPA
      const dateFilter: any = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);

      const paWhere: any = {
        contract_id: contractId,
        status: { notIn: ['void', 'draft'] },
      };
      if (dateFrom || dateTo) {
        paWhere.period_to = dateFilter;
      }

      const ipas = await this.prisma.paymentApplication.findMany({
        where: paWhere,
        orderBy: { pa_no: 'desc' },
        take: 1,
      });

      if (ipas.length > 0) {
        const latestIpa = ipas[0];
        cumulativeCertified = this.toNum(latestIpa.client_certified_amount)
          || this.toNum(latestIpa.certified_amount);
      }
    }

    // Cumulative payment received
    const paymentInWhere: any = { project_id: project.id };
    if (dateFrom || dateTo) {
      paymentInWhere.date = {};
      if (dateFrom) paymentInWhere.date.gte = new Date(dateFrom);
      if (dateTo) paymentInWhere.date.lte = new Date(dateTo);
    }
    const paymentIns = await this.prisma.paymentIn.aggregate({
      where: paymentInWhere,
      _sum: { amount: true },
    });
    const cumulativeReceived = this.toNum(paymentIns._sum.amount);

    // Invoice revenue
    const invoiceWhere: any = {
      project_id: project.id,
      status: { notIn: ['void', 'draft'] },
    };
    if (dateFrom || dateTo) {
      invoiceWhere.date = {};
      if (dateFrom) invoiceWhere.date.gte = new Date(dateFrom);
      if (dateTo) invoiceWhere.date.lte = new Date(dateTo);
    }
    const invoices = await this.prisma.invoice.aggregate({
      where: invoiceWhere,
      _sum: { total_amount: true },
    });
    const invoiceRevenue = this.toNum(invoices._sum.total_amount);

    // Accounts receivable = certified - received
    const accountsReceivable = cumulativeCertified + invoiceRevenue - cumulativeReceived;

    return {
      original_amount: this.round2(originalAmount),
      approved_vo_amount: this.round2(approvedVoAmount),
      revised_contract_total: this.round2(revisedContractTotal),
      cumulative_certified: this.round2(cumulativeCertified),
      cumulative_received: this.round2(cumulativeReceived),
      invoice_revenue: this.round2(invoiceRevenue),
      accounts_receivable: this.round2(accountsReceivable),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Cost calculation
  // ═══════════════════════════════════════════════════════════
  private async calcCosts(projectId: number, dateFrom?: string, dateTo?: string) {
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);

    const expenseWhere: any = { project_id: projectId };
    if (dateFrom || dateTo) {
      expenseWhere.date = dateFilter;
    }

    const expenses = await this.prisma.expense.findMany({
      where: expenseWhere,
      include: {
        category: {
          include: { parent: true },
        },
      },
    });

    const directCosts: Record<string, number> = {};
    let directCostTotal = 0;
    let indirectCostTotal = 0;
    const indirectCosts: Record<string, number> = {};

    for (const exp of expenses) {
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

    // Payment out (actual payments)
    const paymentOutWhere: any = { project_id: projectId };
    if (dateFrom || dateTo) {
      paymentOutWhere.date = {};
      if (dateFrom) paymentOutWhere.date.gte = new Date(dateFrom);
      if (dateTo) paymentOutWhere.date.lte = new Date(dateTo);
    }
    const paymentOuts = await this.prisma.paymentOut.aggregate({
      where: paymentOutWhere,
      _sum: { amount: true },
    });
    const totalPaid = this.toNum(paymentOuts._sum.amount);

    const totalExpense = directCostTotal + indirectCostTotal;
    const accountsPayable = totalExpense - totalPaid;

    const directBreakdown = Object.entries(directCosts)
      .map(([category, amount]) => ({ category, amount: this.round2(amount) }))
      .sort((a, b) => b.amount - a.amount);

    const indirectBreakdown = Object.entries(indirectCosts)
      .map(([category, amount]) => ({ category, amount: this.round2(amount) }))
      .sort((a, b) => b.amount - a.amount);

    return {
      direct_cost_total: this.round2(directCostTotal),
      direct_breakdown: directBreakdown,
      indirect_cost_total: this.round2(indirectCostTotal),
      indirect_breakdown: indirectBreakdown,
      total_expense: this.round2(totalExpense),
      total_paid: this.round2(totalPaid),
      accounts_payable: this.round2(accountsPayable),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Retention calculation
  // ═══════════════════════════════════════════════════════════
  private async calcRetention(contractId: number) {
    const latestTracking = await this.prisma.retentionTracking.findFirst({
      where: { contract_id: contractId },
      orderBy: { pa_no: 'desc' },
    });
    const cumulativeRetained = this.toNum(latestTracking?.cumulative_retention);

    const releases = await this.prisma.retentionRelease.findMany({
      where: { contract_id: contractId },
    });
    const totalReleased = releases
      .filter((r) => r.status === 'paid' || r.status === 'approved')
      .reduce((sum, r) => sum + this.toNum(r.amount), 0);

    const unreleasedBalance = cumulativeRetained - totalReleased;

    return {
      cumulative_retained: this.round2(cumulativeRetained),
      total_released: this.round2(totalReleased),
      unreleased_balance: this.round2(unreleasedBalance),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Cash flow calculation
  // ═══════════════════════════════════════════════════════════
  private async calcCashFlow(
    projectId: number,
    contractId: number | null,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);

    const paymentInWhere: any = { project_id: projectId };
    if (dateFrom || dateTo) paymentInWhere.date = dateFilter;

    const paymentIns = await this.prisma.paymentIn.aggregate({
      where: paymentInWhere,
      _sum: { amount: true },
    });
    const totalReceived = this.toNum(paymentIns._sum.amount);

    const paymentOutWhere: any = { project_id: projectId };
    if (dateFrom || dateTo) paymentOutWhere.date = dateFilter;

    const paymentOuts = await this.prisma.paymentOut.aggregate({
      where: paymentOutWhere,
      _sum: { amount: true },
    });
    const totalPaid = this.toNum(paymentOuts._sum.amount);

    const netCashFlow = totalReceived - totalPaid;

    return {
      total_received: this.round2(totalReceived),
      total_paid: this.round2(totalPaid),
      net_cash_flow: this.round2(netCashFlow),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Overview: All projects P&L summary
  // ═══════════════════════════════════════════════════════════
  async getOverview(params: {
    status?: string;
    sort_by?: string;
    sort_order?: string;
  }): Promise<{ data: OverviewRow[] }> {
    const { status, sort_by, sort_order } = params;

    const projectWhere: any = {};
    if (status) projectWhere.status = status;

    const projects = await this.prisma.project.findMany({
      where: projectWhere,
      include: {
        contract: {
          include: {
            bq_items: { where: { status: 'active' } },
            variation_orders: { where: { status: 'approved' } },
          },
        },
        client: { select: { id: true, name: true, name_en: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    const results: OverviewRow[] = [];

    for (const project of projects) {
      const contractId = project.contract_id;
      let originalAmount = 0;
      let approvedVoAmount = 0;
      let revisedContractTotal = 0;
      let cumulativeCertified = 0;

      if (contractId && project.contract) {
        originalAmount = this.toNum(project.contract.original_amount);
        approvedVoAmount = (project.contract.variation_orders || []).reduce(
          (sum: number, vo: any) => sum + this.toNum(vo.approved_amount),
          0,
        );
        revisedContractTotal = originalAmount + approvedVoAmount;

        const latestIpa = await this.prisma.paymentApplication.findFirst({
          where: {
            contract_id: contractId,
            status: { notIn: ['void', 'draft'] },
          },
          orderBy: { pa_no: 'desc' },
        });
        if (latestIpa) {
          cumulativeCertified = this.toNum(latestIpa.client_certified_amount)
            || this.toNum(latestIpa.certified_amount);
        }
      }

      const invoiceAgg = await this.prisma.invoice.aggregate({
        where: {
          project_id: project.id,
          status: { notIn: ['void', 'draft'] },
        },
        _sum: { total_amount: true },
      });
      const invoiceRevenue = this.toNum(invoiceAgg._sum.total_amount);

      const expenseAgg = await this.prisma.expense.aggregate({
        where: { project_id: project.id },
        _sum: { total_amount: true },
      });
      const totalCost = this.toNum(expenseAgg._sum.total_amount);

      const directExpenses = await this.prisma.expense.findMany({
        where: { project_id: project.id },
        include: { category: { include: { parent: true } } },
      });

      let directCost = 0;
      for (const exp of directExpenses) {
        const categoryType = exp.category?.type || exp.category?.parent?.type || null;
        if (categoryType !== 'OVERHEAD') {
          directCost += this.toNum(exp.total_amount);
        }
      }

      const totalRevenue = cumulativeCertified + invoiceRevenue;
      const grossProfit = totalRevenue - directCost;
      const grossProfitRate = totalRevenue > 0
        ? (grossProfit / totalRevenue) * 100
        : 0;
      const completionPercentage = revisedContractTotal > 0
        ? (cumulativeCertified / revisedContractTotal) * 100
        : 0;

      results.push({
        id: project.id,
        project_no: project.project_no,
        project_name: project.project_name,
        status: project.status,
        client_name: project.client?.name || project.client?.name_en || '-',
        contract_amount: this.round2(revisedContractTotal),
        cumulative_certified: this.round2(cumulativeCertified),
        invoice_revenue: this.round2(invoiceRevenue),
        total_revenue: this.round2(totalRevenue),
        total_cost: this.round2(totalCost),
        direct_cost: this.round2(directCost),
        gross_profit: this.round2(grossProfit),
        gross_profit_rate: this.round2(grossProfitRate),
        completion_percentage: this.round2(completionPercentage),
      });
    }

    // Sort
    if (sort_by) {
      const order = sort_order === 'asc' ? 1 : -1;
      results.sort((a: any, b: any) => {
        const va = a[sort_by] ?? 0;
        const vb = b[sort_by] ?? 0;
        if (typeof va === 'string') return va.localeCompare(vb) * order;
        return (va - vb) * order;
      });
    }

    return { data: results };
  }

  private round2(n: number): number {
    return parseFloat(n.toFixed(2));
  }
}
