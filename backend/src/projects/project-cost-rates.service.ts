import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectCostRateDto,
  UpdateProjectCostRateDto,
} from './dto/project-cost-rate.dto';

@Injectable()
export class ProjectCostRatesService {
  constructor(private prisma: PrismaService) {}

  private toNum(v: any): number {
    if (v === null || v === undefined) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private async ensureProject(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('工程項目不存在');
    return project;
  }

  // ═══════════════════════════════════════════════════════════
  // Cost rate CRUD
  // ═══════════════════════════════════════════════════════════

  async findAll(projectId: number) {
    await this.ensureProject(projectId);
    return this.prisma.projectCostRate.findMany({
      where: { project_cost_rate_project_id: projectId },
      orderBy: [
        { project_cost_rate_category: 'asc' },
        { project_cost_rate_type: 'asc' },
      ],
    });
  }

  /** 新增 / 批量 upsert（以 project + category + type 為唯一鍵） */
  async batchUpsert(projectId: number, rates: CreateProjectCostRateDto[]) {
    await this.ensureProject(projectId);
    if (!Array.isArray(rates) || rates.length === 0) {
      throw new BadRequestException('請提供至少一筆單價資料');
    }

    const results = await this.prisma.$transaction(
      rates.map((rate) =>
        this.prisma.projectCostRate.upsert({
          where: {
            project_cost_rate_project_id_project_cost_rate_category_project_cost_rate_type:
              {
                project_cost_rate_project_id: projectId,
                project_cost_rate_category: rate.category,
                project_cost_rate_type: rate.type,
              },
          },
          create: {
            project_cost_rate_project_id: projectId,
            project_cost_rate_category: rate.category,
            project_cost_rate_type: rate.type,
            project_cost_rate_tonnage:
              rate.tonnage === null || rate.tonnage === undefined
                ? null
                : rate.tonnage,
            project_cost_rate_day_rate: rate.day_rate ?? 0,
            project_cost_rate_ot_rate: rate.ot_rate ?? 0,
            project_cost_rate_remarks: rate.remarks ?? null,
          },
          update: {
            project_cost_rate_tonnage:
              rate.tonnage === null || rate.tonnage === undefined
                ? null
                : rate.tonnage,
            project_cost_rate_day_rate: rate.day_rate ?? 0,
            project_cost_rate_ot_rate: rate.ot_rate ?? 0,
            project_cost_rate_remarks: rate.remarks ?? null,
          },
        }),
      ),
    );
    return { data: results, count: results.length };
  }

  async updateOne(
    projectId: number,
    rateId: number,
    dto: UpdateProjectCostRateDto,
  ) {
    await this.ensureProject(projectId);
    const existing = await this.prisma.projectCostRate.findFirst({
      where: { id: rateId, project_cost_rate_project_id: projectId },
    });
    if (!existing) throw new NotFoundException('單價記錄不存在');

    const data: any = {};
    if (dto.category !== undefined) data.project_cost_rate_category = dto.category;
    if (dto.type !== undefined) data.project_cost_rate_type = dto.type;
    if (dto.tonnage !== undefined) data.project_cost_rate_tonnage = dto.tonnage;
    if (dto.day_rate !== undefined) data.project_cost_rate_day_rate = dto.day_rate;
    if (dto.ot_rate !== undefined) data.project_cost_rate_ot_rate = dto.ot_rate;
    if (dto.remarks !== undefined) data.project_cost_rate_remarks = dto.remarks;

    return this.prisma.projectCostRate.update({
      where: { id: rateId },
      data,
    });
  }

  async removeOne(projectId: number, rateId: number) {
    await this.ensureProject(projectId);
    const existing = await this.prisma.projectCostRate.findFirst({
      where: { id: rateId, project_cost_rate_project_id: projectId },
    });
    if (!existing) throw new NotFoundException('單價記錄不存在');
    await this.prisma.projectCostRate.delete({ where: { id: rateId } });
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════
  // Settlement summary (結算匯總) — all IPAs of the project's contract
  // ═══════════════════════════════════════════════════════════

  async getSettlementSummary(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        project_no: true,
        project_name: true,
        contract_id: true,
        contract: {
          select: {
            id: true,
            contract_no: true,
            contract_name: true,
            original_amount: true,
            retention_rate: true,
            advance_payment_rate: true,
            advance_payment_amount: true,
            advance_release_rate: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundException('工程項目不存在');
    if (!project.contract_id) {
      return { contract: null, ipas: [] };
    }

    const ipas = await this.prisma.paymentApplication.findMany({
      where: {
        contract_id: project.contract_id,
        status: { not: 'void' },
      },
      orderBy: { pa_no: 'asc' },
      select: {
        id: true,
        pa_no: true,
        reference: true,
        period_to: true,
        status: true,
        bq_work_done: true,
        vo_work_done: true,
        cumulative_work_done: true,
        materials_on_site: true,
        retention_amount: true,
        other_deductions: true,
        certified_amount: true,
        client_certified_amount: true,
        current_due: true,
        client_current_due: true,
        paid_amount: true,
      },
    });

    return {
      contract: project.contract,
      ipas,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Financial statement (財務報表)
  // ═══════════════════════════════════════════════════════════

  async getFinancialStatement(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, contract_id: true },
    });
    if (!project) throw new NotFoundException('工程項目不存在');

    // ── Income: latest certified IPA cumulative amount ──
    let ipaCertified = 0;
    let latestIpa: any = null;
    if (project.contract_id) {
      const certifiedIpas = await this.prisma.paymentApplication.findMany({
        where: {
          contract_id: project.contract_id,
          status: { in: ['certified', 'partially_paid', 'paid'] },
        },
        orderBy: { pa_no: 'desc' },
        take: 1,
        select: {
          id: true,
          pa_no: true,
          reference: true,
          certified_amount: true,
          client_certified_amount: true,
        },
      });
      if (certifiedIpas.length > 0) {
        latestIpa = certifiedIpas[0];
        ipaCertified =
          this.toNum(latestIpa.client_certified_amount) ||
          this.toNum(latestIpa.certified_amount);
      }
    }

    // ── Income: payment received ──
    const paymentInAgg = await this.prisma.paymentIn.aggregate({
      where: {
        project_id: projectId,
        payment_in_status: { not: 'cancelled' },
      },
      _sum: { amount: true },
    });
    const paymentReceived = this.toNum(paymentInAgg._sum.amount);

    // ── Expense: Expense records total ──
    const expenseAgg = await this.prisma.expense.aggregate({
      where: { project_id: projectId, deleted_at: null },
      _sum: { total_amount: true },
      _count: { id: true },
    });
    const expenseTotal = this.toNum(expenseAgg._sum.total_amount);
    const expenseCount = expenseAgg._count.id;

    // ── Expense: daily report resource cost via ProjectCostRate ──
    const [costRates, reports] = await Promise.all([
      this.prisma.projectCostRate.findMany({
        where: { project_cost_rate_project_id: projectId },
      }),
      this.prisma.dailyReport.findMany({
        where: {
          daily_report_project_id: projectId,
          daily_report_deleted_at: null,
          daily_report_status: 'submitted',
        },
        include: {
          items: true,
        },
      }),
    ]);

    // rate lookup: category||type → rate
    const rateMap = new Map<string, { day_rate: number; ot_rate: number; id: number }>();
    for (const r of costRates) {
      rateMap.set(
        `${r.project_cost_rate_category}||${r.project_cost_rate_type}`,
        {
          id: r.id,
          day_rate: this.toNum(r.project_cost_rate_day_rate),
          ot_rate: this.toNum(r.project_cost_rate_ot_rate),
        },
      );
    }

    type ResourceCost = {
      category: string;
      type: string;
      content: string;
      total_quantity: number;
      total_ot_hours: number;
      matched: boolean;
      day_rate: number;
      ot_rate: number;
      day_cost: number;
      ot_cost: number;
      total_cost: number;
    };
    const resourceMap = new Map<string, ResourceCost>();

    const resolveType = (item: any): string => {
      if (item.daily_report_item_category === 'worker') {
        return item.daily_report_item_worker_type || item.daily_report_item_content || '';
      }
      if (item.daily_report_item_category === 'machinery') {
        return item.daily_report_item_machine_type || item.daily_report_item_content || '';
      }
      // vehicle / tool — use machine_type first, then content
      return (
        item.daily_report_item_machine_type ||
        item.daily_report_item_worker_type ||
        item.daily_report_item_content ||
        ''
      );
    };

    for (const report of reports) {
      for (const item of report.items) {
        const category = item.daily_report_item_category;
        if (!['worker', 'machinery', 'vehicle', 'tool'].includes(category)) continue;
        const type = resolveType(item);
        const key = `${category}||${type}`;
        if (!resourceMap.has(key)) {
          const rate = rateMap.get(key);
          resourceMap.set(key, {
            category,
            type,
            content: item.daily_report_item_content || type,
            total_quantity: 0,
            total_ot_hours: 0,
            matched: !!rate,
            day_rate: rate?.day_rate || 0,
            ot_rate: rate?.ot_rate || 0,
            day_cost: 0,
            ot_cost: 0,
            total_cost: 0,
          });
        }
        const res = resourceMap.get(key)!;
        res.total_quantity += this.toNum(item.daily_report_item_quantity);
        res.total_ot_hours += this.toNum(item.daily_report_item_ot_hours);
      }
    }

    const resources = Array.from(resourceMap.values());
    const categoryCosts: Record<string, number> = {
      worker: 0,
      machinery: 0,
      vehicle: 0,
      tool: 0,
    };
    let dailyReportCost = 0;
    let unmatchedCount = 0;
    for (const res of resources) {
      res.day_cost = this.round2(res.total_quantity * res.day_rate);
      res.ot_cost = this.round2(res.total_ot_hours * res.ot_rate);
      res.total_cost = this.round2(res.day_cost + res.ot_cost);
      categoryCosts[res.category] =
        this.round2((categoryCosts[res.category] || 0) + res.total_cost);
      dailyReportCost += res.total_cost;
      if (!res.matched) unmatchedCount += 1;
    }
    dailyReportCost = this.round2(dailyReportCost);

    const totalIncome = this.round2(ipaCertified + paymentReceived);
    const totalExpense = this.round2(expenseTotal + dailyReportCost);
    const grossProfit = this.round2(totalIncome - totalExpense);

    return {
      income: {
        ipa_certified: this.round2(ipaCertified),
        latest_ipa: latestIpa
          ? { id: latestIpa.id, pa_no: latestIpa.pa_no, reference: latestIpa.reference }
          : null,
        payment_received: this.round2(paymentReceived),
        total: totalIncome,
      },
      expense: {
        expense_total: this.round2(expenseTotal),
        expense_count: expenseCount,
        daily_report_cost: dailyReportCost,
        category_costs: categoryCosts,
        resources: resources.sort((a, b) =>
          a.category === b.category
            ? b.total_cost - a.total_cost
            : a.category.localeCompare(b.category),
        ),
        unmatched_count: unmatchedCount,
        total: totalExpense,
      },
      gross_profit: grossProfit,
    };
  }
}
