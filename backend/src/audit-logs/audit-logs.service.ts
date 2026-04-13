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
