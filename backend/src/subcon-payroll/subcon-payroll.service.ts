import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../common/pricing.service';
import { ExpensesService } from '../expenses/expenses.service';
import { ConfirmSubconPayrollDto } from './dto/confirm-subcon-payroll.dto';
import { SubconPayrollQueryDto } from './dto/subcon-payroll-query.dto';

@Injectable()
export class SubconPayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly expensesService: ExpensesService,
  ) {}

  /**
   * 預覽供應商計糧：
   * 1. 找出該供應商旗下所有車牌
   * 2. 用車牌匹配工作記錄
   * 3. 用 subcon_rate_cards 匹配計算金額
   */
  async preview(dto: {
    subcon_id: number;
    date_from: string;
    date_to: string;
    company_id?: number;
  }) {
    const subcon = await this.prisma.partner.findUnique({
      where: { id: dto.subcon_id },
      select: { id: true, name: true, code: true },
    });
    if (!subcon) throw new NotFoundException('供應商不存在');

    // 1. 找出該供應商旗下所有車牌
    const drivers = await this.prisma.subcontractorFleetDriver.findMany({
      where: { subcontractor_id: dto.subcon_id, status: 'active' },
      select: { id: true, plate_no: true, name_zh: true, machine_type: true },
    });
    const plateNos = drivers.filter(d => d.plate_no).map(d => d.plate_no!);

    if (plateNos.length === 0) {
      return {
        subcon,
        date_from: dto.date_from,
        date_to: dto.date_to,
        drivers,
        work_logs: [],
        summary: { total: 0, matched: 0, unmatched: 0, total_amount: 0 },
        unmatched_summary: [],
      };
    }

    // 2. 用車牌匹配工作記錄
    const where: any = {
      equipment_number: { in: plateNos },
      scheduled_date: {
        gte: new Date(dto.date_from),
        lte: new Date(dto.date_to),
      },
    };
    if (dto.company_id) where.company_id = dto.company_id;

    const workLogs = await this.prisma.workLog.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, code: true } },
        company: { select: { id: true, name: true } },
        employee: { select: { id: true, name_zh: true } },
      },
      orderBy: { scheduled_date: 'asc' },
    });

    // 3. 載入該供應商的所有 subcon_rate_cards
    const subconRateCards = await this.prisma.subconRateCard.findMany({
      where: {
        subcon_id: dto.subcon_id,
        status: 'active',
      },
    });

    // 4. 逐筆匹配計算
    const enrichedLogs: any[] = [];
    const unmatchedReasons: Record<string, number> = {};

    for (const wl of workLogs) {
      const enriched: any = { ...wl };

      const { card, unmatchedReason } = this.pricingService.matchSubconRateCardInMemory(
        subconRateCards,
        wl.company_id,
        wl.client_contract_no || null,
        wl.service_type,
        wl.day_night,
        wl.tonnage,
        wl.machine_type,
        wl.start_location,
        wl.end_location,
        wl.equipment_number,
      );

      if (card) {
        const qty = Number(wl.quantity) || 1;
        const otQty = Number(wl.ot_quantity) || 0;
        const isMidShift = wl.is_mid_shift || false;
        const amounts = this.pricingService.calculateLineAmounts(card, wl.day_night, qty, otQty, isMidShift);

        enriched._matched_rate_card_id = card.id;
        enriched._matched_rate = amounts.rate;
        enriched._matched_unit = amounts.unit;
        enriched._matched_ot_rate = amounts.otRate;
        enriched._matched_mid_shift_rate = amounts.midShiftRate;
        enriched._price_match_status = 'matched';
        enriched._price_match_note = `匹配到：SubconRC#${card.id}`;
        enriched._line_amount = amounts.baseAmount;
        enriched._ot_line_amount = amounts.otAmount;
        enriched._mid_shift_line_amount = amounts.midShiftAmount;
        enriched._total_amount = amounts.baseAmount + amounts.otAmount + amounts.midShiftAmount;
      } else {
        enriched._matched_rate_card_id = null;
        enriched._matched_rate = null;
        enriched._matched_unit = null;
        enriched._matched_ot_rate = null;
        enriched._matched_mid_shift_rate = null;
        enriched._price_match_status = 'unmatched';
        enriched._price_match_note = unmatchedReason;
        enriched._line_amount = 0;
        enriched._ot_line_amount = 0;
        enriched._mid_shift_line_amount = 0;
        enriched._total_amount = 0;

        // 統計未匹配原因
        unmatchedReasons[unmatchedReason] = (unmatchedReasons[unmatchedReason] || 0) + 1;
      }

      enriched._driver = drivers.find(d => d.plate_no === wl.equipment_number) || null;

      enrichedLogs.push(enriched);
    }

    const matchedCount = enrichedLogs.filter(l => l._price_match_status === 'matched').length;
    const unmatchedCount = enrichedLogs.filter(l => l._price_match_status === 'unmatched').length;
    const totalAmount = enrichedLogs.reduce((sum, l) => sum + (l._total_amount || 0), 0);

    const unmatchedSummary = Object.entries(unmatchedReasons).map(([reason, count]) => ({
      reason,
      count,
    }));

    return {
      subcon,
      date_from: dto.date_from,
      date_to: dto.date_to,
      drivers,
      work_logs: enrichedLogs,
      summary: {
        total: enrichedLogs.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        total_amount: totalAmount,
      },
      unmatched_summary: unmatchedSummary,
    };
  }

  // ── 確認糧單 ─────────────────────────────────────────────────
  async confirm(dto: ConfirmSubconPayrollDto) {
    // 1. 用現有的 preview 計算邏輯取得結果
    const previewResult = await this.preview({
      subcon_id: dto.subcon_id,
      date_from: dto.date_from,
      date_to: dto.date_to,
      company_id: dto.company_id,
    });

    const workLogs = previewResult.work_logs || [];
    const matchedLogs = workLogs.filter((wl: any) => wl._price_match_status === 'matched');

    if (matchedLogs.length === 0 && (!dto.extra_items || dto.extra_items.length === 0)) {
      throw new BadRequestException('沒有已匹配的工作記錄或其他費用項目，無法確認糧單');
    }

    // Calculate totals
    const workTotal = workLogs.reduce((sum: number, wl: any) => sum + (wl._total_amount || 0), 0);
    const extraTotal = (dto.extra_items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const grandTotal = workTotal + extraTotal;

    // Determine month from date_from
    const monthDate = new Date(dto.date_from);
    const monthFirstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);

    // 2. 建立 SubconPayroll + SubconPayrollItem 記錄
    const subconPayroll = await this.prisma.$transaction(async (tx) => {
      // Create main record
      const payroll = await tx.subconPayroll.create({
        data: {
          subcon_payroll_subcontractor_id: dto.subcon_id,
          subcon_payroll_month: monthFirstDay,
          subcon_payroll_total_amount: grandTotal,
          subcon_payroll_status: 'confirmed',
          subcon_payroll_confirmed_at: new Date(),
        },
      });

      // Create line items from work logs (include all, even unmatched with 0 amount for reference)
      const items: any[] = [];
      for (const wl of workLogs) {
        items.push({
          subcon_payroll_item_payroll_id: payroll.id,
          subcon_payroll_item_driver_id: wl._driver?.id || null,
          subcon_payroll_item_driver_name: wl._driver?.name_zh || wl.employee?.name_zh || wl.equipment_number || '未知',
          subcon_payroll_item_work_date: new Date(wl.scheduled_date),
          subcon_payroll_item_work_content: [
            wl.service_type,
            wl.start_location,
            wl.end_location ? `→ ${wl.end_location}` : '',
          ].filter(Boolean).join(' ') || null,
          subcon_payroll_item_quantity: Number(wl.quantity) || 1,
          subcon_payroll_item_unit: wl._matched_unit || '車',
          subcon_payroll_item_unit_price: Number(wl._matched_rate) || 0,
          subcon_payroll_item_subtotal: Number(wl._total_amount) || 0,
          subcon_payroll_item_work_log_id: wl.id,
        });
      }

      // Create extra items (other costs) as line items without work_log_id
      for (const extra of (dto.extra_items || [])) {
        if (!extra.name && !extra.amount) continue;
        items.push({
          subcon_payroll_item_payroll_id: payroll.id,
          subcon_payroll_item_driver_id: null,
          subcon_payroll_item_driver_name: '其他費用',
          subcon_payroll_item_work_date: monthFirstDay,
          subcon_payroll_item_work_content: extra.name || '其他',
          subcon_payroll_item_quantity: 1,
          subcon_payroll_item_unit: '項',
          subcon_payroll_item_unit_price: Number(extra.amount) || 0,
          subcon_payroll_item_subtotal: Number(extra.amount) || 0,
          subcon_payroll_item_work_log_id: null,
        });
      }

      if (items.length > 0) {
        await tx.subconPayrollItem.createMany({ data: items });
      }

      return payroll;
    });

    // 3. 自動建立 Expense（source='SUBCON', source_ref_id=subcon_payroll_id）
    const subcon = previewResult.subcon;
    const periodLabel = `${monthFirstDay.getFullYear()}年${monthFirstDay.getMonth() + 1}月`;

    // Find subcon expense category
    const subconCategoryId = await this.findSubconCategoryId();

    await this.expensesService.bulkCreate([
      {
        date: monthFirstDay,
        supplier_partner_id: dto.subcon_id,
        supplier_name: subcon.name,
        category_id: subconCategoryId,
        item: `${periodLabel} 判頭糧單 - ${subcon.name}`,
        total_amount: grandTotal,
        source: 'SUBCON',
        source_ref_id: subconPayroll.id,
        remarks: `自動產生：判頭糧單 #${subconPayroll.id}，期間 ${dto.date_from} ~ ${dto.date_to}`,
      },
    ]);

    return {
      id: subconPayroll.id,
      confirmed: true,
      total_amount: grandTotal,
      items_count: (await this.prisma.subconPayrollItem.count({
        where: { subcon_payroll_item_payroll_id: subconPayroll.id },
      })),
    };
  }

  // ── 取得已確認的糧單詳情 ─────────────────────────────────────
  async findOne(id: number) {
    const payroll = await this.prisma.subconPayroll.findUnique({
      where: { id },
      include: {
        subcontractor: { select: { id: true, name: true, code: true } },
        payment_outs: {
          include: {
            bank_account: { select: { id: true, account_name: true, bank_name: true, account_no: true } },
          },
          orderBy: { date: 'desc' },
        },
        items: {
          include: {
            driver: { select: { id: true, name_zh: true, plate_no: true } },
            work_log: {
              select: {
                id: true,
                scheduled_date: true,
                equipment_number: true,
                service_type: true,
                start_location: true,
                end_location: true,
                day_night: true,
                tonnage: true,
                machine_type: true,
                quantity: true,
                ot_quantity: true,
                client: { select: { id: true, name: true } },
                company: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { subcon_payroll_item_work_date: 'asc' },
        },
      },
    });

    if (!payroll) throw new NotFoundException('糧單不存在');

    // Fetch related expense
    const expenses = await this.prisma.expense.findMany({
      where: {
        source: 'SUBCON',
        source_ref_id: id,
        deleted_at: null,
      },
      select: { id: true, total_amount: true, payment_status: true },
    });

    return { ...payroll, expenses };
  }

  // ── 列出所有已確認的糧單 ─────────────────────────────────────
  async findAll(query: SubconPayrollQueryDto) {
    const where: any = {};

    if (query.subcon_id) {
      where.subcon_payroll_subcontractor_id = query.subcon_id;
    }
    if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      where.subcon_payroll_month = {
        gte: monthStart,
        lte: monthEnd,
      };
    }
    if (query.status) {
      where.subcon_payroll_status = query.status;
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.subconPayroll.findMany({
        where,
        include: {
          subcontractor: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true } },
        },
        orderBy: { subcon_payroll_created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.subconPayroll.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ── 刪除糧單（同時刪除關聯的 Expense）──────────────────────
  async remove(id: number) {
    const payroll = await this.prisma.subconPayroll.findUnique({
      where: { id },
    });
    if (!payroll) throw new NotFoundException('糧單不存在');

    if (payroll.subcon_payroll_status === 'paid') {
      throw new BadRequestException('已付款的糧單不能刪除');
    }

    // Delete related expenses
    await this.expensesService.deleteBySourceRef('SUBCON', id);

    // Delete the payroll (cascade will delete items)
    await this.prisma.subconPayroll.delete({ where: { id } });

    return { success: true, message: '糧單已刪除' };
  }

  // ── 查找判頭支出類別 ─────────────────────────────────────────
  private async findSubconCategoryId(): Promise<number | null> {
    // Try to find the '員工薪酬' sub-category under '人事費用' first,
    // then fall back to other salary-related names for backward compatibility
    const names = ['員工薪酬', '人事費用', '判頭支出', '判頭費用', '供應商費用', '出糧支出', '薪資'];
    for (const name of names) {
      const cat = await this.prisma.expenseCategory.findFirst({
        where: { name: { contains: name }, is_active: true },
        orderBy: { parent_id: 'desc' }, // prefer child categories (sub-categories have higher parent_id)
      });
      if (cat) return cat.id;
    }
    return null;
  }
}
