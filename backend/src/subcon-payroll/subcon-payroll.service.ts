import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../common/pricing.service';

@Injectable()
export class SubconPayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
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
}
