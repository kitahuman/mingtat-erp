import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorLogQueryDto } from './error-logs.dto';
import { Prisma } from '@prisma/client';

/** 脫敏的欄位名稱（不區分大小寫） */
const SENSITIVE_FIELDS = new Set([
  'password',
  'token',
  'secret',
  'authorization',
  'credit_card',
  'creditcard',
  'cvv',
  'ssn',
]);

interface ErrorLogInput {
  method: string;
  path: string;
  statusCode: number;
  message: string;
  stack?: string;
  userId?: number;
  username?: string;
  requestBody?: Record<string, unknown>;
}

@Injectable()
export class ErrorLogsService {
  private readonly logger = new Logger(ErrorLogsService.name);

  /**
   * 防刷：記錄最近通知的 key → timestamp
   * key = `${method}:${path}:${messagePrefix}`
   */
  private readonly recentNotifications = new Map<string, number>();
  private readonly THROTTLE_MS = 5 * 60 * 1000; // 5 分鐘

  /** WhatsApp Bot 設定 */
  private get botApiUrl(): string {
    return process.env.WHATSAPP_BOT_API_URL || process.env.BOT_API_URL || 'http://147.182.233.182:3002';
  }
  private get botApiSecret(): string {
    return process.env.WHATSAPP_BOT_API_SECRET || process.env.BOT_API_SECRET || 'mingtat-bot-api-2026';
  }
  private get notifyPhone(): string {
    return process.env.ERROR_NOTIFY_PHONE || '85262366968';
  }

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 記錄錯誤到數據庫，並在需要時發送 WhatsApp 通知
   */
  async logError(input: ErrorLogInput): Promise<void> {
    try {
      const sanitizedBody = input.requestBody
        ? this.sanitizeBody(input.requestBody)
        : null;

      // 寫入數據庫
      const shouldNotify = input.statusCode >= 500;
      const notified = shouldNotify ? await this.shouldSendNotification(input) : false;

      await this.prisma.errorLog.create({
        data: {
          error_log_method: input.method,
          error_log_path: input.path,
          error_log_status_code: input.statusCode,
          error_log_message: input.message,
          error_log_stack: input.stack || null,
          error_log_user_id: input.userId || null,
          error_log_username: input.username || null,
          error_log_request_body: sanitizedBody as Prisma.InputJsonValue ?? Prisma.JsonNull,
          error_log_notified: notified,
        },
      });

      // 發送 WhatsApp 通知（異步，不阻塞回應）
      if (notified) {
        this.sendWhatsAppNotification(input).catch((err: Error) => {
          this.logger.error(`WhatsApp 通知發送失敗: ${err.message}`);
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`記錄錯誤日誌失敗: ${errorMessage}`);
    }
  }

  /**
   * 防刷機制：同一個錯誤（相同 API 路徑 + 相同錯誤訊息前 100 字元）5 分鐘內只通知一次
   */
  private async shouldSendNotification(input: ErrorLogInput): Promise<boolean> {
    const messagePrefix = input.message.substring(0, 100);
    const key = `${input.method}:${input.path}:${messagePrefix}`;
    const now = Date.now();
    const lastNotified = this.recentNotifications.get(key);

    if (lastNotified && now - lastNotified < this.THROTTLE_MS) {
      return false;
    }

    this.recentNotifications.set(key, now);

    // 清理過期的記錄，避免記憶體洩漏
    if (this.recentNotifications.size > 500) {
      for (const [k, v] of this.recentNotifications.entries()) {
        if (now - v > this.THROTTLE_MS) {
          this.recentNotifications.delete(k);
        }
      }
    }

    return true;
  }

  /**
   * 發送 WhatsApp 通知
   */
  private async sendWhatsAppNotification(input: ErrorLogInput): Promise<void> {
    const now = new Date();
    const timestamp = now.toLocaleString('zh-HK', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const text = [
      '⚠️ ERP 系統錯誤通知',
      `時間：${timestamp}`,
      `API：${input.method} ${input.path}`,
      `錯誤：${input.message.substring(0, 200)}`,
      `用戶：${input.username || '未登入'}`,
    ].join('\n');

    const chatId = `${this.notifyPhone}@s.whatsapp.net`;

    try {
      await axios.post(
        `${this.botApiUrl}/api/send-message`,
        { chatId, text },
        {
          headers: {
            'x-bot-secret': this.botApiSecret,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      this.logger.log(`WhatsApp 錯誤通知已發送到 ${this.notifyPhone}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`WhatsApp 通知發送失敗: ${errorMessage}`);
    }
  }

  /**
   * 脫敏請求 body — 隱藏敏感欄位
   */
  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
        sanitized[key] = '***REDACTED***';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeBody(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * 查詢錯誤日誌列表
   */
  async findAll(query: ErrorLogQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const where: Prisma.ErrorLogWhereInput = {};

    if (query.statusCode) {
      where.error_log_status_code = query.statusCode;
    }
    if (query.path) {
      where.error_log_path = { contains: query.path, mode: 'insensitive' };
    }
    if (query.dateFrom || query.dateTo) {
      where.error_log_timestamp = {};
      if (query.dateFrom) {
        where.error_log_timestamp.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const endDate = new Date(query.dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.error_log_timestamp.lte = endDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.errorLog.findMany({
        where,
        orderBy: { error_log_timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.errorLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 取得單筆錯誤日誌
   */
  async findOne(id: number) {
    return this.prisma.errorLog.findUnique({ where: { id } });
  }
}
