import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConfirmationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 確認或拒絕一筆配對
   */
  async upsertConfirmation(dto: {
    work_log_id: number;
    source_code: string;
    status: 'confirmed' | 'rejected' | 'manual_match';
    matched_record_id?: number;
    matched_record_type?: string;
    notes?: string;
    confirmed_by: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const confirmation = await tx.verificationConfirmation.upsert({
        where: {
          work_log_id_source_code: {
            work_log_id: dto.work_log_id,
            source_code: dto.source_code,
          },
        },
        create: {
          work_log_id: dto.work_log_id,
          source_code: dto.source_code,
          status: dto.status,
          matched_record_id: dto.matched_record_id ?? null,
          matched_record_type: dto.matched_record_type ?? null,
          notes: dto.notes ?? null,
          confirmed_by: dto.confirmed_by,
        },
        update: {
          status: dto.status,
          matched_record_id: dto.matched_record_id ?? null,
          matched_record_type: dto.matched_record_type ?? null,
          notes: dto.notes ?? null,
          confirmed_by: dto.confirmed_by,
          confirmed_at: new Date(),
        },
      });

      await this.syncManualMatchToVerificationMatches(tx, dto);

      return confirmation;
    });
  }

  /**
   * 手動配對保存後，同步更新 verification_matches，避免舊自動配對結果繼續被下游讀取。
   *
   * 注意：目前 schema 的 verification_matches.match_record_id 只外鍵到 verification_records。
   * 因此 chit / delivery_note 可寫入 match_record_id；gps / attendance / whatsapp_order
   * 會以 match_diff_fields 記錄手動目標，並建立 manual_match 狀態列作為覆蓋標記。
   */
  private async syncManualMatchToVerificationMatches(
    tx: Prisma.TransactionClient,
    dto: {
      work_log_id: number;
      source_code: string;
      status: 'confirmed' | 'rejected' | 'manual_match';
      matched_record_id?: number;
      matched_record_type?: string;
      notes?: string;
      confirmed_by: number;
    },
  ) {
    if (dto.status !== 'manual_match' || !dto.matched_record_id) return;

    const matchedRecordIds = this.getManualMatchedRecordIds(dto.matched_record_id, dto.notes);
    if (matchedRecordIds.length === 0) return;

    const sourceCodes = this.getVerificationSourceCodes(dto.source_code);
    const sources = sourceCodes.length > 0
      ? await tx.verificationSource.findMany({
          where: { source_code: { in: sourceCodes } },
          select: { id: true, source_code: true },
        })
      : [];

    const sourceIdsToReject = new Set<number>(sources.map((s) => s.id));
    let defaultManualMatchSourceId: number | null = sources[0]?.id ?? null;
    const manualRows: Array<{
      targetId: number;
      sourceId: number;
      verificationRecordId: number | null;
    }> = [];

    if (this.isVerificationRecordManualTarget(dto.source_code, dto.matched_record_type)) {
      const records = await tx.verificationRecord.findMany({
        where: { id: { in: matchedRecordIds } },
        select: { id: true, record_source_id: true },
      });
      const recordById = new Map(records.map((record) => [record.id, record]));

      for (const targetId of matchedRecordIds) {
        const record = recordById.get(targetId);
        if (!record) continue;
        defaultManualMatchSourceId = record.record_source_id;
        sourceIdsToReject.add(record.record_source_id);
        manualRows.push({
          targetId,
          sourceId: record.record_source_id,
          verificationRecordId: record.id,
        });
      }
    } else if (defaultManualMatchSourceId) {
      for (const targetId of matchedRecordIds) {
        manualRows.push({
          targetId,
          sourceId: defaultManualMatchSourceId,
          verificationRecordId: null,
        });
      }
    }

    if (sourceIdsToReject.size > 0) {
      await tx.verificationMatch.updateMany({
        where: {
          match_work_record_id: dto.work_log_id,
          match_source_id: { in: Array.from(sourceIdsToReject) },
          match_status: { not: 'rejected' },
        },
        data: {
          match_status: 'rejected',
          match_resolved_by: dto.confirmed_by ?? null,
          match_resolved_at: new Date(),
          match_resolved_action: 'manual_override',
          match_notes: dto.notes
            ? `由手動配對覆蓋：${dto.notes}`
            : '由手動配對覆蓋舊配對結果',
        },
      });
    }

    for (const row of manualRows) {
      await tx.verificationMatch.create({
        data: {
          match_work_record_id: dto.work_log_id,
          match_source_id: row.sourceId,
          match_record_id: row.verificationRecordId,
          match_status: 'manual_match',
          match_confidence: 100,
          match_method: 'manual',
          match_diff_fields: {
            manual_match: true,
            source_code: dto.source_code,
            matched_record_id: row.targetId,
            matched_record_type: dto.matched_record_type ?? null,
          },
          match_diff_count: 0,
          match_notes: dto.notes ?? '手動配對',
          match_resolved_by: dto.confirmed_by ?? null,
          match_resolved_at: new Date(),
          match_resolved_action: 'manual_correct',
        },
      });
    }
  }

  private getManualMatchedRecordIds(primaryId: number | undefined, notes: string | undefined): number[] {
    const ids = new Set<number>();
    if (primaryId) ids.add(primaryId);

    const idListMatch = notes?.match(/記錄ID\s*([0-9,，\s]+)/);
    if (idListMatch?.[1]) {
      const parsedIds = idListMatch[1]
        .split(/[，,\s]+/)
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
      parsedIds.forEach((id) => ids.add(id));
    }

    return Array.from(ids);
  }

  private getVerificationSourceCodes(sourceCode: string): string[] {
    const sourceMap: Record<string, string[]> = {
      chit: ['receipt'],
      delivery_note: ['slip_chit', 'slip_no_chit'],
      gps: ['gps'],
      attendance: ['clock'],
      clock: ['clock'],
      whatsapp_order: ['whatsapp_order'],
      receipt: ['receipt'],
      slip_chit: ['slip_chit'],
      slip_no_chit: ['slip_no_chit'],
    };

    return sourceMap[sourceCode] ?? [sourceCode];
  }

  private isVerificationRecordManualTarget(sourceCode: string, matchedRecordType?: string): boolean {
    return (
      matchedRecordType === 'verification_record' ||
      ['chit', 'delivery_note', 'receipt', 'slip_chit', 'slip_no_chit'].includes(sourceCode)
    );
  }

  /**
   * 刪除一筆確認（重置為未審核）
   */
  async deleteConfirmation(workLogId: number, sourceCode: string) {
    return this.prisma.verificationConfirmation.deleteMany({
      where: { work_log_id: workLogId, source_code: sourceCode },
    });
  }

  /**
   * 查詢單筆工作紀錄的所有確認狀態
   */
  async getConfirmations(workLogId: number) {
    return this.prisma.verificationConfirmation.findMany({
      where: { work_log_id: workLogId },
      include: { user: { select: { id: true, displayName: true, username: true } } },
    });
  }

  /**
   * 批量查詢多筆工作紀錄的確認狀態（用於交叉比對頁面）
   */
  async getConfirmationsByWorkLogIds(workLogIds: number[]) {
    if (workLogIds.length === 0) return [];
    return this.prisma.verificationConfirmation.findMany({
      where: { work_log_id: { in: workLogIds } },
      include: { user: { select: { id: true, displayName: true, username: true } } },
    });
  }

  /**
   * 搜尋可配對的記錄（手動配對用）
   */
  async searchRecords(params: {
    source_code: string;
    date: string;
    search: string;
  }) {
    const dateObj = new Date(params.date);
    const nextDay = new Date(dateObj.getTime() + 86400000);

    switch (params.source_code) {
      case 'chit':
      case 'delivery_note': {
        const sourceCodes = params.source_code === 'chit' ? ['receipt'] : ['slip_chit', 'slip_no_chit'];
        const sources = await this.prisma.verificationSource.findMany({
          where: { source_code: { in: sourceCodes } },
        });
        const sourceIds = sources.map((s) => s.id);
        return this.prisma.verificationRecord.findMany({
          where: {
            record_source_id: { in: sourceIds },
            record_work_date: dateObj,
            OR: [
              { record_vehicle_no: { contains: params.search, mode: 'insensitive' } },
              { record_customer: { contains: params.search, mode: 'insensitive' } },
              { record_driver_name: { contains: params.search, mode: 'insensitive' } },
              { record_slip_no: { contains: params.search, mode: 'insensitive' } },
            ],
          },
          include: { chits: true },
          take: 20,
        });
      }

      case 'gps': {
        return this.prisma.verificationGpsSummary.findMany({
          where: {
            gps_summary_date: dateObj,
            gps_summary_vehicle_no: { contains: params.search, mode: 'insensitive' },
          },
          take: 20,
        });
      }

      case 'attendance': {
        return this.prisma.employeeAttendance.findMany({
          where: {
            timestamp: { gte: dateObj, lt: nextDay },
            OR: [
              { employee: { name_zh: { contains: params.search, mode: 'insensitive' } } },
              { employee: { nickname: { contains: params.search, mode: 'insensitive' } } },
            ],
          },
          include: { employee: { select: { id: true, name_zh: true, nickname: true } } },
          take: 20,
        });
      }

      case 'whatsapp_order': {
        const waWhere: any = { order: { wa_order_date: dateObj } };
        if (params.search && params.search.trim()) {
          waWhere.OR = [
            { wa_item_vehicle_no: { contains: params.search, mode: 'insensitive' } },
            { wa_item_machine_code: { contains: params.search, mode: 'insensitive' } },
            { wa_item_driver_nickname: { contains: params.search, mode: 'insensitive' } },
            { wa_item_customer: { contains: params.search, mode: 'insensitive' } },
            { wa_item_contract_no: { contains: params.search, mode: 'insensitive' } },
            { wa_item_location: { contains: params.search, mode: 'insensitive' } },
            { wa_item_remarks: { contains: params.search, mode: 'insensitive' } },
          ];
        }
        return this.prisma.verificationWaOrderItem.findMany({
          where: waWhere,
          include: {
            order: {
              select: { id: true, wa_order_date: true, wa_order_shift: true, wa_order_status: true, wa_order_version: true },
            },
          },
          orderBy: [
            { order: { wa_order_version: 'desc' } },
            { wa_item_seq: 'asc' },
          ],
          take: 50,
        });
      }

      default:
        return [];
    }
  }
}
