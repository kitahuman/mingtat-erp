import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 打卡配對增強服務
 * - 增強版 matchSingle：提供逐項核對結果（O/X）
 * - GPS 位置自動配對
 * - 異常記錄掃描與管理
 */
@Injectable()
export class AttendanceMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取得工作紀錄的打卡配對詳情（增強版）
   * 包含逐項核對結果
   */
  async getMatchDetail(workLogId: number) {
    const wl = await this.prisma.workLog.findUnique({
      where: { id: workLogId },
      include: {
        employee: { select: { id: true, name_zh: true, name_en: true, nickname: true, emp_code: true } },
        client: { select: { id: true, name: true } },
        contract: { select: { id: true, contract_no: true } },
      },
    });
    if (!wl) throw new NotFoundException(`工作紀錄 ${workLogId} 不存在`);

    const date = this.formatDateInHongKong(wl.scheduled_date);
    if (!date) {
      return {
        work_log_id: workLogId,
        matched: false,
        message: '工作紀錄無約定日期',
        attendance_records: [],
        checks: [],
      };
    }

    const { start, end } = this.getHongKongDayBounds(date);
    const employeeId = wl.employee_id;

    if (!employeeId) {
      return {
        work_log_id: workLogId,
        matched: false,
        message: '工作紀錄無指定員工',
        attendance_records: [],
        checks: [],
      };
    }

    // 查找該員工當天的所有打卡記錄
    const attendances = await this.prisma.employeeAttendance.findMany({
      where: {
        employee_id: employeeId,
        timestamp: { gte: start, lt: end },
      },
      include: {
        employee: { select: { id: true, name_zh: true, nickname: true, emp_code: true } },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (attendances.length === 0) {
      return {
        work_log_id: workLogId,
        matched: false,
        message: '未找到打卡記錄',
        attendance_records: [],
        checks: [],
      };
    }

    // 找出上班和下班記錄
    const clockIn = attendances.find((a) => a.type === 'clock_in');
    const clockOut = attendances.find((a) => a.type === 'clock_out');
    const hasMidShift = attendances.some((a) => a.is_mid_shift);

    // GPS 位置配對
    const locationMatch = await this.checkLocationMatch(attendances, wl);

    // 逐項核對
    const checks = this.buildChecks(wl, attendances, clockIn, clockOut, hasMidShift, locationMatch);

    return {
      work_log_id: workLogId,
      matched: true,
      clock_in: clockIn
        ? {
            id: clockIn.id,
            time: clockIn.timestamp,
            address: clockIn.address,
            latitude: clockIn.latitude,
            longitude: clockIn.longitude,
          }
        : null,
      clock_out: clockOut
        ? {
            id: clockOut.id,
            time: clockOut.timestamp,
            address: clockOut.address,
            latitude: clockOut.latitude,
            longitude: clockOut.longitude,
          }
        : null,
      is_mid_shift: hasMidShift,
      attendance_records: attendances.map((a) => ({
        id: a.id,
        type: a.type,
        timestamp: a.timestamp,
        address: a.address,
        latitude: a.latitude,
        longitude: a.longitude,
        is_mid_shift: a.is_mid_shift,
        photo_url: a.photo_url,
      })),
      checks,
      location_match: locationMatch,
    };
  }

  /**
   * 搜尋員工當天所有打卡記錄（手動配對用）
   */
  async searchEmployeeAttendances(employeeId: number, date: string) {
    const { start, end } = this.getHongKongDayBounds(date);

    return this.prisma.employeeAttendance.findMany({
      where: {
        employee_id: employeeId,
        timestamp: { gte: start, lt: end },
      },
      include: {
        employee: { select: { id: true, name_zh: true, nickname: true, emp_code: true } },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * GPS 位置配對：比對打卡 GPS 與 field_options 中的地址座標
   */
  private async checkLocationMatch(
    attendances: any[],
    workLog: any,
  ): Promise<{
    matched_location: string | null;
    distance_meters: number | null;
    is_within_range: boolean;
  }> {
    // 取得打卡的 GPS 座標（優先使用上班打卡）
    const clockIn = attendances.find((a: any) => a.type === 'clock_in');
    const gpsRecord = clockIn || attendances[0];

    if (!gpsRecord?.latitude || !gpsRecord?.longitude) {
      return { matched_location: null, distance_meters: null, is_within_range: false };
    }

    // 從 field_options 中取得 location 類別的所有有座標的選項
    const locations = await this.prisma.fieldOption.findMany({
      where: {
        category: 'location',
        is_active: true,
        field_option_latitude: { not: null },
        field_option_longitude: { not: null },
      },
    });

    if (locations.length === 0) {
      return { matched_location: null, distance_meters: null, is_within_range: false };
    }

    // 計算距離，找最近的
    let minDistance = Infinity;
    let closestLocation: any = null;

    for (const loc of locations) {
      const dist = this.haversineDistance(
        gpsRecord.latitude,
        gpsRecord.longitude,
        loc.field_option_latitude!,
        loc.field_option_longitude!,
      );
      if (dist < minDistance) {
        minDistance = dist;
        closestLocation = loc;
      }
    }

    const MATCH_THRESHOLD_METERS = 500;

    return {
      matched_location: closestLocation?.label || null,
      distance_meters: Math.round(minDistance),
      is_within_range: minDistance <= MATCH_THRESHOLD_METERS,
    };
  }

  /**
   * Haversine 公式計算兩點間的距離（米）
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // 地球半徑（米）
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  /**
   * 將 Date 以 Asia/Hong_Kong 時區格式化為 YYYY-MM-DD，避免 toISOString() 使用 UTC 導致日期偏移。
   */
  private formatDateInHongKong(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});

    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  /**
   * 回傳香港本地日期的 UTC 查詢邊界：[當日 00:00 HKT, 次日 00:00 HKT)。
   */
  private getHongKongDayBounds(date: string): { start: Date; end: Date } {
    const [year, month, day] = date.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000);
    const end = new Date(Date.UTC(year, month - 1, day + 1) - 8 * 60 * 60 * 1000);
    return { start, end };
  }

  /**
   * 建立逐項核對結果
   */
  private buildChecks(
    workLog: any,
    attendances: any[],
    clockIn: any,
    clockOut: any,
    hasMidShift: boolean,
    locationMatch: { matched_location: string | null; distance_meters: number | null; is_within_range: boolean },
  ) {
    const checks: Array<{
      item: string;
      work_log_value: string;
      attendance_value: string;
      result: 'O' | 'X' | '-';
      note?: string;
    }> = [];

    // 1. 日期核對
    const wlDate = this.formatDateInHongKong(workLog.scheduled_date) || '—';
    const attDate = this.formatDateInHongKong(clockIn?.timestamp) || '—';
    checks.push({
      item: '日期',
      work_log_value: wlDate,
      attendance_value: attDate,
      result: wlDate === attDate ? 'O' : 'X',
    });

    // 2. 員工核對
    const wlEmpName = workLog.employee?.name_zh || '—';
    const attEmpName = clockIn?.employee?.name_zh || attendances[0]?.employee?.name_zh || '—';
    const wlEmpId = workLog.employee_id;
    const attEmpId = clockIn?.employee_id || attendances[0]?.employee_id;
    checks.push({
      item: '員工',
      work_log_value: wlEmpName,
      attendance_value: attEmpName,
      result: wlEmpId && attEmpId && wlEmpId === attEmpId ? 'O' : 'X',
    });

    // 3. 班次（日/夜）核對
    const wlDayNight = workLog.day_night || '—';
    let attShift = '—';
    if (clockIn?.timestamp) {
      const hour = new Date(clockIn.timestamp).getHours();
      // 6:00-14:00 → 日班, 14:00-22:00 → 中直, 22:00-6:00 → 夜班
      if (hour >= 6 && hour < 14) attShift = '日';
      else if (hour >= 14 && hour < 22) attShift = '中直';
      else attShift = '夜';
    }
    const shiftMatch =
      wlDayNight === '—' || attShift === '—'
        ? '-'
        : wlDayNight === attShift ||
            (wlDayNight === '中直' && hasMidShift)
          ? 'O'
          : 'X';
    checks.push({
      item: '班次（日/夜）',
      work_log_value: wlDayNight,
      attendance_value: attShift,
      result: shiftMatch as 'O' | 'X' | '-',
      note: hasMidShift ? '打卡標記為中直' : undefined,
    });

    // 4. 中直核對
    const wlMidShift = workLog.is_mid_shift ? '是' : '否';
    const attMidShift = hasMidShift ? '是' : '否';
    checks.push({
      item: '中直',
      work_log_value: wlMidShift,
      attendance_value: attMidShift,
      result: workLog.is_mid_shift === hasMidShift ? 'O' : 'X',
    });

    // 5. 地點核對
    const wlLocation = [workLog.start_location, workLog.end_location].filter(Boolean).join(' → ') || '—';
    const attAddress = clockIn?.address || attendances[0]?.address || '—';
    checks.push({
      item: '地點',
      work_log_value: wlLocation,
      attendance_value: locationMatch.matched_location
        ? `${locationMatch.matched_location}（距離 ${locationMatch.distance_meters}m）`
        : attAddress,
      result: locationMatch.is_within_range ? 'O' : locationMatch.distance_meters !== null ? 'X' : '-',
      note: locationMatch.distance_meters !== null
        ? `GPS 距離: ${locationMatch.distance_meters}m${locationMatch.is_within_range ? '（範圍內）' : '（超出 500m）'}`
        : '無 GPS 座標',
    });

    return checks;
  }

  // ══════════════════════════════════════════════════════════════
  // 異常記錄掃描
  // ══════════════════════════════════════════════════════════════

  /**
   * 掃描指定日期範圍的異常記錄
   */
  async scanAnomalies(dateFrom: string, dateTo: string) {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const nextDay = new Date(to.getTime() + 86400000);

    let created = 0;

    // 遍歷每一天
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().slice(0, 10);
      const dayStart = new Date(dayStr);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      // 取得當天所有打卡記錄
      const attendances = await this.prisma.employeeAttendance.findMany({
        where: { timestamp: { gte: dayStart, lt: dayEnd } },
        include: { employee: { select: { id: true, name_zh: true } } },
      });

      // 取得當天所有工作紀錄
      const workLogs = await this.prisma.workLog.findMany({
        where: { scheduled_date: dayStart, deleted_at: null },
        include: {
          employee: { select: { id: true, name_zh: true } },
        },
      });

      // 按員工分組打卡記錄
      const attByEmployee = new Map<number, any[]>();
      for (const att of attendances) {
        if (!att.employee_id) continue;
        if (!attByEmployee.has(att.employee_id)) attByEmployee.set(att.employee_id, []);
        attByEmployee.get(att.employee_id)!.push(att);
      }

      // 按員工分組工作紀錄
      const wlByEmployee = new Map<number, any[]>();
      for (const wl of workLogs) {
        if (!wl.employee_id) continue;
        if (!wlByEmployee.has(wl.employee_id)) wlByEmployee.set(wl.employee_id, []);
        wlByEmployee.get(wl.employee_id)!.push(wl);
      }

      // 所有涉及的員工 ID
      const allEmployeeIds = new Set([...attByEmployee.keys(), ...wlByEmployee.keys()]);

      for (const empId of allEmployeeIds) {
        const empAtts = attByEmployee.get(empId) || [];
        const empWls = wlByEmployee.get(empId) || [];
        const empName = empAtts[0]?.employee?.name_zh || empWls[0]?.employee?.name_zh || '未知';

        // 1. 有打卡但沒有工作紀錄
        if (empAtts.length > 0 && empWls.length === 0) {
          await this.upsertAnomaly({
            date: dayStart,
            type: 'no_work_log',
            employeeId: empId,
            attendanceId: empAtts[0].id,
            description: `${empName} 在 ${dayStr} 有打卡記錄但沒有對應的工作紀錄`,
          });
          created++;
        }

        // 2. 有工作紀錄但沒有打卡
        if (empWls.length > 0 && empAtts.length === 0) {
          for (const wl of empWls) {
            await this.upsertAnomaly({
              date: dayStart,
              type: 'no_attendance',
              employeeId: empId,
              workLogId: wl.id,
              description: `${empName} 在 ${dayStr} 有工作紀錄但沒有打卡記錄`,
            });
            created++;
          }
        }

        // 3. 班次不一致
        if (empAtts.length > 0 && empWls.length > 0) {
          const clockIn = empAtts.find((a: any) => a.type === 'clock_in');
          if (clockIn) {
            const hour = new Date(clockIn.timestamp).getHours();
            let attShift: string;
            if (hour >= 6 && hour < 14) attShift = '日';
            else if (hour >= 14 && hour < 22) attShift = '中直';
            else attShift = '夜';

            for (const wl of empWls) {
              if (wl.day_night && wl.day_night !== attShift) {
                // 中直特殊處理
                const hasMidShift = empAtts.some((a: any) => a.is_mid_shift);
                if (wl.day_night === '中直' && hasMidShift) continue;

                await this.upsertAnomaly({
                  date: dayStart,
                  type: 'shift_mismatch',
                  employeeId: empId,
                  attendanceId: clockIn.id,
                  workLogId: wl.id,
                  description: `${empName} 在 ${dayStr} 打卡班次（${attShift}）與工作紀錄班次（${wl.day_night}）不一致`,
                });
                created++;
              }
            }
          }

          // 4. 地點不匹配
          const gpsRecord = empAtts.find((a: any) => a.type === 'clock_in' && a.latitude && a.longitude) || empAtts.find((a: any) => a.latitude && a.longitude);
          if (gpsRecord) {
            const locations = await this.prisma.fieldOption.findMany({
              where: {
                category: 'location',
                is_active: true,
                field_option_latitude: { not: null },
                field_option_longitude: { not: null },
              },
            });

            for (const wl of empWls) {
              const wlLocations = [wl.start_location, wl.end_location].filter(Boolean);
              if (wlLocations.length === 0) continue;

              // 找到工作紀錄地點對應的 field_option
              const matchedFieldOptions = locations.filter((loc) =>
                wlLocations.some(
                  (wlLoc: string) =>
                    loc.label === wlLoc ||
                    (Array.isArray(loc.aliases) && (loc.aliases as string[]).includes(wlLoc)),
                ),
              );

              if (matchedFieldOptions.length === 0) continue; // 沒有座標資料，跳過

              // 檢查打卡位置是否在任一工作地點 500m 範圍內
              const isNearAny = matchedFieldOptions.some((fo) =>
                this.haversineDistance(
                  gpsRecord.latitude!,
                  gpsRecord.longitude!,
                  fo.field_option_latitude!,
                  fo.field_option_longitude!,
                ) <= 500,
              );

              if (!isNearAny) {
                const minDist = Math.round(
                  Math.min(
                    ...matchedFieldOptions.map((fo) =>
                      this.haversineDistance(
                        gpsRecord.latitude!,
                        gpsRecord.longitude!,
                        fo.field_option_latitude!,
                        fo.field_option_longitude!,
                      ),
                    ),
                  ),
                );
                await this.upsertAnomaly({
                  date: dayStart,
                  type: 'location_mismatch',
                  employeeId: empId,
                  attendanceId: gpsRecord.id,
                  workLogId: wl.id,
                  description: `${empName} 在 ${dayStr} 打卡地點與工作地點不匹配（最近距離 ${minDist}m）`,
                });
                created++;
              }
            }
          }
        }
      }
    }

    return { scanned: true, anomalies_created: created };
  }

  /**
   * Upsert 異常記錄（避免重複）
   */
  private async upsertAnomaly(params: {
    date: Date;
    type: string;
    employeeId?: number;
    attendanceId?: number;
    workLogId?: number;
    description: string;
  }) {
    // 檢查是否已存在相同的異常
    const existing = await this.prisma.attendanceAnomaly.findFirst({
      where: {
        anomaly_date: params.date,
        anomaly_type: params.type,
        anomaly_employee_id: params.employeeId || null,
        anomaly_attendance_id: params.attendanceId || null,
        anomaly_work_log_id: params.workLogId || null,
      },
    });

    if (existing) return existing;

    return this.prisma.attendanceAnomaly.create({
      data: {
        anomaly_date: params.date,
        anomaly_type: params.type,
        anomaly_employee_id: params.employeeId || null,
        anomaly_attendance_id: params.attendanceId || null,
        anomaly_work_log_id: params.workLogId || null,
        anomaly_description: params.description,
      },
    });
  }

  /**
   * 查詢異常記錄列表
   */
  async findAnomalies(query: {
    page?: number;
    limit?: number;
    date_from?: string;
    date_to?: string;
    anomaly_type?: string;
    employee_id?: number;
    status?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = {};

    if (query.date_from || query.date_to) {
      where.anomaly_date = {};
      if (query.date_from) where.anomaly_date.gte = new Date(query.date_from);
      if (query.date_to) where.anomaly_date.lte = new Date(query.date_to);
    }

    if (query.anomaly_type) {
      where.anomaly_type = query.anomaly_type;
    }

    if (query.employee_id) {
      where.anomaly_employee_id = Number(query.employee_id);
    }

    if (query.status === 'resolved') {
      where.anomaly_is_resolved = true;
    } else if (query.status === 'unresolved') {
      where.anomaly_is_resolved = false;
    }

    const [data, total] = await Promise.all([
      this.prisma.attendanceAnomaly.findMany({
        where,
        include: {
          employee: { select: { id: true, name_zh: true, name_en: true, emp_code: true } },
          attendance: {
            select: { id: true, type: true, timestamp: true, address: true, latitude: true, longitude: true },
          },
          work_log: {
            select: {
              id: true,
              scheduled_date: true,
              day_night: true,
              start_location: true,
              end_location: true,
              equipment_number: true,
            },
          },
          resolver: { select: { id: true, displayName: true, username: true } },
        },
        orderBy: [{ anomaly_date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.attendanceAnomaly.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * 標記異常為已處理
   */
  async resolveAnomaly(id: number, userId: number, notes?: string) {
    const existing = await this.prisma.attendanceAnomaly.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('異常記錄不存在');

    return this.prisma.attendanceAnomaly.update({
      where: { id },
      data: {
        anomaly_is_resolved: true,
        anomaly_resolved_by: userId,
        anomaly_resolved_at: new Date(),
        anomaly_resolved_notes: notes || null,
      },
    });
  }

  /**
   * 取消已處理標記
   */
  async unresolveAnomaly(id: number) {
    const existing = await this.prisma.attendanceAnomaly.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('異常記錄不存在');

    return this.prisma.attendanceAnomaly.update({
      where: { id },
      data: {
        anomaly_is_resolved: false,
        anomaly_resolved_by: null,
        anomaly_resolved_at: null,
        anomaly_resolved_notes: null,
      },
    });
  }
}
