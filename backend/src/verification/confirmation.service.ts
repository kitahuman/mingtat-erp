import { Injectable } from '@nestjs/common';
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
    return this.prisma.verificationConfirmation.upsert({
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
        return this.prisma.verificationWaOrderItem.findMany({
          where: {
            order: { wa_order_date: dateObj },
            OR: [
              { wa_item_vehicle_no: { contains: params.search, mode: 'insensitive' } },
              { wa_item_machine_code: { contains: params.search, mode: 'insensitive' } },
              { wa_item_driver_nickname: { contains: params.search, mode: 'insensitive' } },
              { wa_item_customer: { contains: params.search, mode: 'insensitive' } },
            ],
          },
          include: { order: { select: { id: true, wa_order_type: true, wa_order_status: true } } },
          take: 20,
        });
      }

      default:
        return [];
    }
  }
}
