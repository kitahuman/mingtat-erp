import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 記錄審計日誌
   */
  async log(data: {
    userId: number;
    action: 'create' | 'update' | 'delete';
    targetTable: string;
    targetId: number;
    changesBefore?: any;
    changesAfter?: any;
    remarks?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        audit_user_id: data.userId,
        audit_action: data.action,
        audit_target_table: data.targetTable,
        audit_target_id: data.targetId,
        audit_changes_before: data.changesBefore || null,
        audit_changes_after: data.changesAfter || null,
        audit_remarks: data.remarks || null,
        audit_ip_address: data.ipAddress || null,
        audit_user_agent: data.userAgent || null,
      },
    });
  }

  /**
   * 查詢審計日誌
   */
  async findAll(query: {
    page?: number;
    limit?: number;
    userId?: number;
    userName?: string;
    action?: string;
    targetTable?: string;
    targetId?: number;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.userId) {
      where.audit_user_id = Number(query.userId);
    }

    if (query.userName) {
      where.user = {
        OR: [
          { displayName: { contains: query.userName, mode: 'insensitive' } },
          { username: { contains: query.userName, mode: 'insensitive' } },
        ],
      };
    }

    if (query.action) {
      where.audit_action = query.action;
    }

    if (query.targetTable) {
      where.audit_target_table = query.targetTable;
    }

    if (query.targetId) {
      where.audit_target_id = Number(query.targetId);
    }

    if (query.dateFrom || query.dateTo) {
      where.audit_timestamp = {};
      if (query.dateFrom) {
        where.audit_timestamp.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const endDate = new Date(query.dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.audit_timestamp.lte = endDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: { audit_timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: data.map(log => ({
        id: log.id,
        user_id: log.audit_user_id,
        user_name: log.user.displayName || log.user.username,
        action: log.audit_action,
        target_table: log.audit_target_table,
        target_id: log.audit_target_id,
        changes_before: log.audit_changes_before,
        changes_after: log.audit_changes_after,
        remarks: log.audit_remarks,
        ip_address: log.audit_ip_address,
        timestamp: log.audit_timestamp,
        user_agent: log.audit_user_agent,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private buildDateRangeWhere(dateFrom?: string, dateTo?: string) {
    const where: any = {};
    if (dateFrom || dateTo) {
      where.audit_timestamp = {};
      if (dateFrom) {
        where.audit_timestamp.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.audit_timestamp.lte = endDate;
      }
    }
    return where;
  }

  private mergeDateRanges(...ranges: any[]) {
    const timestamps = ranges
      .map((range) => range?.audit_timestamp)
      .filter(Boolean);
    if (timestamps.length === 0) return {};

    const merged: any = {};
    for (const timestamp of timestamps) {
      if (timestamp.gte && (!merged.gte || timestamp.gte > merged.gte)) {
        merged.gte = timestamp.gte;
      }
      if (timestamp.lte && (!merged.lte || timestamp.lte < merged.lte)) {
        merged.lte = timestamp.lte;
      }
    }

    return { audit_timestamp: merged };
  }

  async getUserActivity(query: { dateFrom?: string; dateTo?: string }) {
    const dateRangeWhere = this.buildDateRangeWhere(query.dateFrom, query.dateTo);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diffToMonday = (day + 6) % 7;
    weekStart.setDate(weekStart.getDate() - diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const users = await this.prisma.user.findMany({
      select: { id: true, username: true, displayName: true },
      orderBy: [{ displayName: 'asc' }, { username: 'asc' }],
    });
    const userIds = users.map((user) => user.id);
    if (userIds.length === 0) return [];

    const lastActivityGroups = await this.prisma.auditLog.groupBy({
      by: ['audit_user_id'],
      where: { ...dateRangeWhere, audit_user_id: { in: userIds } },
      _max: { audit_timestamp: true },
    });

    const todayWhere = this.mergeDateRanges(
      dateRangeWhere,
      { audit_timestamp: { gte: todayStart, lte: todayEnd } },
    );
    const weekWhere = this.mergeDateRanges(
      dateRangeWhere,
      { audit_timestamp: { gte: weekStart } },
    );

    const todayGroups = await this.prisma.auditLog.groupBy({
      by: ['audit_user_id'],
      where: { ...todayWhere, audit_user_id: { in: userIds } },
      _count: { _all: true },
    });
    const weekGroups = await this.prisma.auditLog.groupBy({
      by: ['audit_user_id'],
      where: { ...weekWhere, audit_user_id: { in: userIds } },
      _count: { _all: true },
    });

    const lastActivityByUserId = new Map(
      lastActivityGroups.map((group) => [group.audit_user_id, group._max.audit_timestamp]),
    );
    const todayCountByUserId = new Map(
      todayGroups.map((group) => [group.audit_user_id, group._count._all]),
    );
    const weekCountByUserId = new Map(
      weekGroups.map((group) => [group.audit_user_id, group._count._all]),
    );

    return users.map((user) => ({
      user_id: user.id,
      user_name: user.displayName || user.username || `用戶 ${user.id}`,
      today_count: todayCountByUserId.get(user.id) || 0,
      week_count: weekCountByUserId.get(user.id) || 0,
      last_activity_at: lastActivityByUserId.get(user.id) || null,
    }));
  }

  /**
   * 獲取單筆審計日誌
   */
  async findOne(id: number) {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  /**
   * 獲取特定表和記錄 ID 的所有審計日誌
   */
  async findByTargetRecord(targetTable: string, targetId: number) {
    return this.prisma.auditLog.findMany({
      where: {
        audit_target_table: targetTable,
        audit_target_id: targetId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
      orderBy: { audit_timestamp: 'desc' },
    });
  }
}
