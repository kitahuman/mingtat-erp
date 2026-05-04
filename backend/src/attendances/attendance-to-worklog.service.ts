import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, EmployeeAttendance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConvertToWorkLogDto, PendingConversionCountQueryDto } from './dto/convert-to-worklog.dto';

interface AttendanceGroup {
  employeeId: number;
  businessDate: string;
  records: EmployeeAttendance[];
  clockIn?: EmployeeAttendance;
  clockOut?: EmployeeAttendance;
}

export interface ConversionItemResult {
  employee_id: number;
  employee_name?: string;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  gps_location?: string | null;
  status: 'created' | 'skipped' | 'preview';
  reason?: string;
  work_log_id?: number;
}

export interface ConversionResult {
  dryRun: boolean;
  created: number;
  skipped: number;
  totalCandidates: number;
  results: ConversionItemResult[];
}

const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_CONVERSION_RANGE_DAYS = 366;

@Injectable()
export class AttendanceToWorkLogService {
  constructor(private readonly prisma: PrismaService) {}

  async getPendingConversionCount(query: PendingConversionCountQueryDto): Promise<{ pending: number }> {
    const normalized = this.normalizeOptionalDateRange(query);
    const groups = await this.getAttendanceGroups(normalized.dateFrom, normalized.dateTo, query.employee_id);
    const candidates = groups.filter((group) => group.clockIn);
    const existingKeys = await this.getExistingWorkLogKeys(candidates);
    const pending = candidates.filter((group) => !existingKeys.has(this.groupKey(group.employeeId, group.businessDate))).length;
    return { pending };
  }

  async convertToWorkLog(dto: ConvertToWorkLogDto): Promise<ConversionResult> {
    const { dateFrom, dateTo } = this.normalizeRequiredDateRange(dto.date_from, dto.date_to);
    const groups = await this.getAttendanceGroups(dateFrom, dateTo, dto.employee_id);
    const dryRun = dto.dryRun === true;
    const employeeNames = await this.getEmployeeNameMap(groups.map((group) => group.employeeId));

    let created = 0;
    let skipped = 0;
    const results: ConversionItemResult[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const group of groups) {
        if (!group.clockIn) {
          skipped += 1;
          results.push({
            ...this.buildConversionItemDetails(group, employeeNames),
            status: 'skipped',
            reason: '沒有上班打卡',
          });
          continue;
        }

        const existing = await tx.workLog.findFirst({
          where: {
            employee_id: group.employeeId,
            scheduled_date: this.businessDateToDbDate(group.businessDate),
            deleted_at: null,
          },
          select: { id: true, source: true },
        });

        if (existing) {
          skipped += 1;
          results.push({
            ...this.buildConversionItemDetails(group, employeeNames),
            status: 'skipped',
            reason: this.buildSkipReason(existing.source),
            work_log_id: existing.id,
          });
          continue;
        }

        if (dryRun) {
          created += 1;
          results.push({
            ...this.buildConversionItemDetails(group, employeeNames),
            status: 'preview',
          });
          continue;
        }

        const createdWorkLog = await tx.workLog.create({
          data: this.buildWorkLogCreateInput(group),
          select: { id: true },
        });
        created += 1;
        results.push({
          ...this.buildConversionItemDetails(group, employeeNames),
          status: 'created',
          work_log_id: createdWorkLog.id,
        });
      }
    });

    return {
      dryRun,
      created,
      skipped,
      totalCandidates: groups.length,
      results,
    };
  }

  private normalizeOptionalDateRange(query: PendingConversionCountQueryDto): { dateFrom?: string; dateTo?: string } {
    if (query.date_from || query.date_to) {
      return this.normalizeRequiredDateRange(
        query.date_from ?? query.date_to ?? '',
        query.date_to ?? query.date_from ?? '',
      );
    }

    return {};
  }

  private normalizeRequiredDateRange(dateFromInput: string, dateToInput: string): { dateFrom: string; dateTo: string } {
    const dateFrom = this.normalizeDateString(dateFromInput);
    const dateTo = this.normalizeDateString(dateToInput);
    if (!dateFrom || !dateTo) throw new BadRequestException('請提供有效日期範圍');
    if (dateFrom > dateTo) throw new BadRequestException('開始日期不可晚於結束日期');

    const days = Math.floor((this.businessDateToDbDate(dateTo).getTime() - this.businessDateToDbDate(dateFrom).getTime()) / 86_400_000) + 1;
    if (days > MAX_CONVERSION_RANGE_DAYS) {
      throw new BadRequestException(`日期範圍不可超過 ${MAX_CONVERSION_RANGE_DAYS} 天`);
    }

    return { dateFrom, dateTo };
  }

  private normalizeDateString(value: string): string | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const normalized = `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return normalized;
  }

  private async getEmployeeNameMap(employeeIds: number[]): Promise<Map<number, string>> {
    const uniqueEmployeeIds = Array.from(new Set(employeeIds));
    if (uniqueEmployeeIds.length === 0) return new Map<number, string>();

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: uniqueEmployeeIds } },
      select: { id: true, name_zh: true, name_en: true, emp_code: true },
    });

    return new Map(
      employees.map((employee) => [
        employee.id,
        employee.name_zh || employee.name_en || employee.emp_code || `員工 #${employee.id}`,
      ]),
    );
  }

  private async getAttendanceGroups(dateFrom?: string, dateTo?: string, employeeId?: number): Promise<AttendanceGroup[]> {
    const timestampFilter = dateFrom && dateTo
      ? {
          timestamp: {
            gte: this.hongKongDateStartToUtc(dateFrom),
            lt: this.hongKongDateAfterEndToUtc(dateTo),
          },
        }
      : {};
    const records = await this.prisma.employeeAttendance.findMany({
      where: {
        ...timestampFilter,
        ...(employeeId ? { employee_id: employeeId } : {}),
      },
      orderBy: [{ employee_id: 'asc' }, { timestamp: 'asc' }],
    });

    const groupMap = new Map<string, AttendanceGroup>();
    for (const record of records) {
      const businessDate = this.timestampToHongKongBusinessDate(record.timestamp);
      const key = this.groupKey(record.employee_id, businessDate);
      const group = groupMap.get(key) ?? { employeeId: record.employee_id, businessDate, records: [] };
      group.records.push(record);
      if (record.type === 'clock_in' && (!group.clockIn || record.timestamp < group.clockIn.timestamp)) {
        group.clockIn = record;
      }
      if (record.type === 'clock_out' && (!group.clockOut || record.timestamp > group.clockOut.timestamp)) {
        group.clockOut = record;
      }
      groupMap.set(key, group);
    }

    return Array.from(groupMap.values()).sort((a, b) =>
      a.businessDate.localeCompare(b.businessDate) || a.employeeId - b.employeeId,
    );
  }

  private async getExistingWorkLogKeys(groups: AttendanceGroup[]): Promise<Set<string>> {
    if (groups.length === 0) return new Set<string>();
    const orConditions = groups.map((group) => ({
      employee_id: group.employeeId,
      scheduled_date: this.businessDateToDbDate(group.businessDate),
    }));
    const workLogs = await this.prisma.workLog.findMany({
      where: {
        deleted_at: null,
        OR: orConditions,
      },
      select: { employee_id: true, scheduled_date: true },
    });

    return new Set(
      workLogs
        .filter((workLog) => workLog.employee_id !== null && workLog.scheduled_date !== null)
        .map((workLog) => this.groupKey(workLog.employee_id as number, this.dbDateToBusinessDate(workLog.scheduled_date as Date))),
    );
  }

  private buildSkipReason(source: string | null): string {
    switch (source) {
      case 'whatsapp_clockin':
      case 'whatsapp':
        return '已有 WhatsApp 報工';
      case 'manual':
        return '已有手動紀錄';
      case 'employee_portal':
        return '已有員工入口紀錄';
      case 'attendance':
        return '已有打卡轉入紀錄';
      case 'report':
        return '已有報工紀錄';
      default:
        return '已有工作日誌';
    }
  }

  private buildConversionItemDetails(group: AttendanceGroup, employeeNames: Map<number, string>): Omit<ConversionItemResult, 'status' | 'reason' | 'work_log_id'> {
    return {
      employee_id: group.employeeId,
      employee_name: employeeNames.get(group.employeeId) ?? `員工 #${group.employeeId}`,
      scheduled_date: group.businessDate,
      start_time: group.clockIn ? this.formatHongKongTime(group.clockIn.timestamp) : null,
      end_time: group.clockOut ? this.formatHongKongTime(group.clockOut.timestamp) : null,
      gps_location: group.clockIn?.address ?? null,
    };
  }

  private buildWorkLogCreateInput(group: AttendanceGroup): Prisma.WorkLogUncheckedCreateInput {
    const clockIn = group.clockIn;
    if (!clockIn) throw new BadRequestException('沒有上班打卡，不能建立工作日誌');

    return {
      employee_id: group.employeeId,
      scheduled_date: this.businessDateToDbDate(group.businessDate),
      start_time: this.formatHongKongTime(clockIn.timestamp),
      end_time: group.clockOut ? this.formatHongKongTime(group.clockOut.timestamp) : null,
      start_location: clockIn.address ?? null,
      remarks: this.buildRemarks(group),
      is_mid_shift: group.records.some((record) => record.is_mid_shift),
      source: 'attendance',
      status: 'editing',
      is_confirmed: false,
      is_paid: false,
    };
  }

  private buildRemarks(group: AttendanceGroup): string | null {
    const remarks = group.records
      .map((record) => record.remarks?.trim())
      .filter((value): value is string => Boolean(value));
    const uniqueRemarks = Array.from(new Set(remarks));
    return uniqueRemarks.length > 0 ? uniqueRemarks.join('\n') : null;
  }

  private groupKey(employeeId: number, businessDate: string): string {
    return `${employeeId}:${businessDate}`;
  }

  private timestampToHongKongBusinessDate(timestamp: Date): string {
    return this.formatUtcDateParts(new Date(timestamp.getTime() + HONG_KONG_OFFSET_MS));
  }

  private dbDateToBusinessDate(value: Date): string {
    return this.formatUtcDateParts(value);
  }

  private businessDateToDbDate(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private hongKongDateStartToUtc(date: string): Date {
    return new Date(this.businessDateToDbDate(date).getTime() - HONG_KONG_OFFSET_MS);
  }

  private hongKongDateAfterEndToUtc(date: string): Date {
    return new Date(this.businessDateToDbDate(date).getTime() + 86_400_000 - HONG_KONG_OFFSET_MS);
  }

  private formatHongKongTime(timestamp: Date): string {
    const hongKongDate = new Date(timestamp.getTime() + HONG_KONG_OFFSET_MS);
    const hours = String(hongKongDate.getUTCHours()).padStart(2, '0');
    const minutes = String(hongKongDate.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private formatUtcDateParts(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
