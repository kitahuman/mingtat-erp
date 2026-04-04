/**
 * PricingService — 共用計價匹配服務
 *
 * 集中管理所有價目表匹配邏輯，供 payroll.service.ts 和 work-logs.service.ts 調用。
 * 採用完全匹配策略，不再逐步放寬條件。
 * 所有文字欄位（合約、機種、噸數、服務類型、起點、終點）均來自同一套 field_options，
 * 因此文字比對可確保一致性。
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MatchResult {
  card: any | null;
  unmatchedReason: string;
}

export interface ResolvedRate {
  rate: number;
  unit: string;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 從已載入的 FleetRateCard 列表中嚴格匹配（記憶體內）。
   * 不再逐步放寬條件，找不到即回傳未匹配原因。
   * 合約用 client_contract_no 文字比對（來自 field_options，格式一致）。
   */
  matchFleetRateCardInMemory(
    clientCards: any[],
    companyId: number | null,
    clientContractNo: string | null,
    serviceType: string | null,
    dayNight: string | null,
    tonnage: string | null,
    machineType: string | null,
    origin: string | null,
    destination: string | null,
  ): MatchResult {
    // [DEBUG] 輸出工作記錄的匹配條件
    console.log(`[DEBUG matchFleetRateCardInMemory] 工作記錄條件: companyId=${companyId} clientContractNo=${JSON.stringify(clientContractNo)} serviceType=${JSON.stringify(serviceType)} day_night=${JSON.stringify(dayNight)} tonnage=${JSON.stringify(tonnage)} machineType=${JSON.stringify(machineType)} origin=${JSON.stringify(origin)} destination=${JSON.stringify(destination)}`);
    console.log(`[DEBUG matchFleetRateCardInMemory] clientCards 數量: ${clientCards.length}`);

    clientCards.forEach((rc, i) => {
      const failCompany = companyId && rc.company_id && rc.company_id !== companyId;
      const failContract = clientContractNo && rc.client_contract_no && rc.client_contract_no !== clientContractNo;
      const failService = serviceType && rc.service_type && rc.service_type !== serviceType;
      const failDayNight = dayNight && rc.day_night && rc.day_night !== dayNight;
      const failTonnage = tonnage && rc.tonnage && rc.tonnage !== tonnage;
      const failMachineType = machineType && rc.machine_type !== machineType;
      const failOrigin = origin && rc.origin && rc.origin !== origin;
      const failDest = destination && rc.destination && rc.destination !== destination;

      const pass = !failCompany && !failContract && !failService && !failDayNight && !failTonnage && !failMachineType && !failOrigin && !failDest;
      console.log(`[DEBUG matchFleetRateCardInMemory] card[${i}] id=${rc.id} company_id=${rc.company_id} client_contract_no=${JSON.stringify(rc.client_contract_no)} service_type=${JSON.stringify(rc.service_type)} day_night=${JSON.stringify(rc.day_night)} tonnage=${JSON.stringify(rc.tonnage)} machine_type=${JSON.stringify(rc.machine_type)} origin=${JSON.stringify(rc.origin)} destination=${JSON.stringify(rc.destination)} => 通過:${pass} (失敗原因: ${[failCompany && 'company', failContract && 'client_contract_no', failService && 'service_type', failDayNight && 'day_night', failTonnage && 'tonnage', failMachineType && 'machine_type', failOrigin && 'origin', failDest && 'destination'].filter(Boolean).join(',') || '無'})`);
    });

    const matched = clientCards.filter(rc => {
      if (companyId && rc.company_id && rc.company_id !== companyId) return false;
      if (clientContractNo && rc.client_contract_no && rc.client_contract_no !== clientContractNo) return false;
      if (serviceType && rc.service_type && rc.service_type !== serviceType) return false;
      if (dayNight && rc.day_night && rc.day_night !== dayNight) return false;
      if (tonnage && rc.tonnage && rc.tonnage !== tonnage) return false;
      if (machineType && rc.machine_type !== machineType) return false;
      if (origin && rc.origin && rc.origin !== origin) return false;
      if (destination && rc.destination && rc.destination !== destination) return false;
      return true;
    });

    if (matched.length > 0) {
      console.log(`[DEBUG matchFleetRateCardInMemory] 匹配成功: card.id=${matched[0].id}`);
      return { card: matched[0], unmatchedReason: '' };
    }

    const reason = this.buildUnmatchedReason('租賃價目', clientContractNo, dayNight, tonnage, machineType, origin, destination);
    console.log(`[DEBUG matchFleetRateCardInMemory] 匹配失敗: ${reason}`);
    return { card: null, unmatchedReason: reason };
  }

  /**
   * 從資料庫嚴格匹配 FleetRateCard（非記憶體）。
   * 不再逐步放寬條件，找不到即回傳未匹配原因。
   * 合約用 client_contract_no 文字比對（來自 field_options，格式一致）。
   */
  async matchFleetRateCardFromDb(
    clientId: number,
    companyId: number | null,
    clientContractNo: string | null,
    serviceType: string | null,
    dayNight: string | null,
    tonnage: string | null,
    machineType: string | null,
    origin: string | null,
    destination: string | null,
  ): Promise<MatchResult> {
    const where: any = { status: 'active', client_id: clientId };
    if (companyId) where.company_id = companyId;
    if (clientContractNo) where.client_contract_no = clientContractNo;
    if (serviceType) where.service_type = serviceType;
    if (dayNight) where.day_night = dayNight;
    if (tonnage) where.tonnage = tonnage;
    if (machineType) where.machine_type = machineType;
    if (origin) where.origin = origin;
    if (destination) where.destination = destination;

    const card = await this.prisma.fleetRateCard.findFirst({ where });
    if (card) return { card, unmatchedReason: '' };

    const reason = this.buildUnmatchedReason('租賃價目', clientContractNo, dayNight, tonnage, machineType, origin, destination);
    return { card: null, unmatchedReason: reason };
  }

  /**
   * 從資料庫嚴格匹配 RateCard（客戶價目表）。
   * 不再逐步放寬條件，找不到即回傳未匹配原因。
   */
  async matchRateCardFromDb(
    clientId: number,
    companyId: number | null,
    quotationId: number | null,
    serviceType: string | null,
    machineType: string | null,
    tonnage: string | null,
    origin: string | null,
    destination: string | null,
  ): Promise<MatchResult> {
    const where: any = { status: 'active', client_id: clientId };
    if (companyId) where.company_id = companyId;
    if (quotationId) where.source_quotation_id = quotationId;
    if (serviceType) where.service_type = serviceType;
    if (machineType) where.machine_type = machineType;
    if (tonnage) where.tonnage = tonnage;
    if (origin) where.origin = origin;
    if (destination) where.destination = destination;

    const card = await this.prisma.rateCard.findFirst({
      where,
      orderBy: { effective_date: 'desc' },
    });
    if (card) return { card, unmatchedReason: '' };

    const reason = this.buildUnmatchedReason('客戶價目', null, null, tonnage, machineType, origin, destination);
    return { card: null, unmatchedReason: reason };
  }

  /**
   * 根據日/夜/中直取對應費率。
   * 優先使用統一費率欄位（rate），回退到舊版 day_rate/night_rate。
   */
  resolveRate(card: any, dayNight: string | null): ResolvedRate {
    // 新版統一費率欄位
    const unifiedRate = Number(card.rate) || 0;
    if (unifiedRate > 0) {
      return { rate: unifiedRate, unit: card.unit || '' };
    }
    // 回退舊版分開欄位（向後兼容）
    if (dayNight === '夜') {
      return { rate: Number(card.night_rate) || 0, unit: card.night_unit || card.day_unit || card.unit || '' };
    }
    if (dayNight === '中直') {
      return { rate: Number(card.mid_shift_rate) || 0, unit: card.mid_shift_unit || card.day_unit || card.unit || '' };
    }
    return { rate: Number(card.day_rate) || 0, unit: card.day_unit || card.unit || '' };
  }

  /**
   * 計算單筆工作紀錄的費用明細。
   */
  calculateLineAmounts(
    card: any,
    dayNight: string | null,
    quantity: number,
    otQuantity: number,
    isMidShift: boolean,
  ): { baseAmount: number; otAmount: number; midShiftAmount: number; rate: number; unit: string; otRate: number; midShiftRate: number } {
    const resolved = this.resolveRate(card, dayNight);
    const rate = resolved.rate;
    const otRate = Number(card.ot_rate) || 0;
    const midShiftRate = Number(card.mid_shift_rate) || 0;
    return {
      rate,
      unit: resolved.unit,
      otRate,
      midShiftRate,
      baseAmount: rate * quantity,
      otAmount: otRate * otQuantity,
      midShiftAmount: isMidShift ? midShiftRate * 1 : 0,
    };
  }

  /**
   * 從已載入的 SubconRateCard 列表中嚴格匹配（記憶體內）。
   * 匹配邏輯與 FleetRateCard 一致，額外支援 plate_no 匹配。
   */
  matchSubconRateCardInMemory(
    subconCards: any[],
    companyId: number | null,
    clientContractNo: string | null,
    serviceType: string | null,
    dayNight: string | null,
    tonnage: string | null,
    machineType: string | null,
    origin: string | null,
    destination: string | null,
    plateNo: string | null = null,
  ): MatchResult {
    const matched = subconCards.filter(rc => {
      if (companyId && rc.company_id && rc.company_id !== companyId) return false;
      if (clientContractNo && rc.client_contract_no && rc.client_contract_no !== clientContractNo) return false;
      if (serviceType && rc.service_type && rc.service_type !== serviceType) return false;
      if (dayNight && rc.day_night && rc.day_night !== dayNight) return false;
      if (tonnage && rc.tonnage && rc.tonnage !== tonnage) return false;
      if (machineType && rc.machine_type && rc.machine_type !== machineType) return false;
      if (origin && rc.origin && rc.origin !== origin) return false;
      if (destination && rc.destination && rc.destination !== destination) return false;
      if (plateNo && rc.plate_no && rc.plate_no !== plateNo) return false;
      return true;
    });

    if (matched.length > 0) {
      return { card: matched[0], unmatchedReason: '' };
    }

    const reason = this.buildUnmatchedReason('供應商價目', clientContractNo, dayNight, tonnage, machineType, origin, destination);
    return { card: null, unmatchedReason: reason };
  }

  /**
   * 生成未匹配原因文字。
   */
  buildUnmatchedReason(
    tableLabel: string,
    clientContractNo: string | null,
    dayNight: string | null,
    tonnage: string | null,
    machineType: string | null,
    origin: string | null,
    destination: string | null,
  ): string {
    const conditions: string[] = [];
    if (clientContractNo) conditions.push(`合約 ${clientContractNo}`);
    if (dayNight) conditions.push(`${dayNight}間`);
    if (tonnage) conditions.push(tonnage);
    if (machineType) conditions.push(machineType);
    if (origin) conditions.push(`起點: ${origin}`);
    if (destination) conditions.push(`終點: ${destination}`);
    return `找不到符合條件的${tableLabel}：${conditions.join('、') || '無條件'}`;
  }
}
