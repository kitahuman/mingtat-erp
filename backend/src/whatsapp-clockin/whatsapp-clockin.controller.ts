import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { WhatsappClockinService, ParsedClockIn } from './whatsapp-clockin.service';

interface ClockInResponse {
  success: boolean;
  workLogId?: number;
  parsed?: ParsedClockIn;
  error?: string;
}

interface HeartbeatPayload {
  status: 'connected' | 'disconnected';
  uptime: number;
  lastMessageAt: string | null;
}

interface HeartbeatStatus extends HeartbeatPayload {
  receivedAt: string;
  isStale: boolean;
}

// 記憶體快取：儲存最新的 heartbeat 狀態
let latestHeartbeat: HeartbeatStatus | null = null;

// 超過 90 秒沒有心跳就視為 stale（bot 可能已斷線）
const STALE_THRESHOLD_MS = 90 * 1000;

@Controller()
export class WhatsappClockinController {
  private readonly logger = new Logger(WhatsappClockinController.name);

  constructor(private readonly service: WhatsappClockinService) {}

  // ─── 打卡訊息處理 ───────────────────────────────────────────
  @Post('whatsapp-clockin')
  @HttpCode(HttpStatus.OK)
  async handleClockIn(
    @Headers('x-webhook-secret') webhookSecret: string,
    @Body() body: { chatId: string; sender: string; text: string; groupName?: string },
  ): Promise<ClockInResponse> {
    const expectedSecret = process.env.WHATSAPP_CLOCKIN_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      this.logger.warn('Invalid webhook secret received');
      throw new UnauthorizedException('Invalid webhook secret');
    }

    this.logger.log(
      `Received clock-in from group=${body.chatId}, sender=${body.sender}, text=${(body.text || '').substring(0, 50)}...`,
    );

    const result = await this.service.processClockIn(body);

    return {
      success: result.success,
      workLogId: result.workLogId,
      parsed: result.parsed,
      error: result.error,
    };
  }

  // ─── 心跳接收（Bot → ERP）───────────────────────────────────
  @Post('whatsapp-heartbeat')
  @HttpCode(HttpStatus.OK)
  receiveHeartbeat(
    @Headers('x-webhook-secret') webhookSecret: string,
    @Body() body: HeartbeatPayload,
  ): { ok: boolean } {
    const expectedSecret = process.env.WHATSAPP_CLOCKIN_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      this.logger.warn('Invalid webhook secret on heartbeat');
      throw new UnauthorizedException('Invalid webhook secret');
    }

    latestHeartbeat = {
      status: body.status,
      uptime: body.uptime ?? 0,
      lastMessageAt: body.lastMessageAt ?? null,
      receivedAt: new Date().toISOString(),
      isStale: false,
    };

    this.logger.debug(
      `Heartbeat received: status=${body.status}, uptime=${body.uptime}s`,
    );

    return { ok: true };
  }

  // ─── 心跳查詢（ERP 前端 → ERP 後端）────────────────────────
  @Get('whatsapp-heartbeat')
  getHeartbeat(): HeartbeatStatus | { status: 'unknown'; isStale: true; receivedAt: null } {
    if (!latestHeartbeat) {
      return { status: 'unknown', isStale: true, receivedAt: null };
    }

    const ageMs = Date.now() - new Date(latestHeartbeat.receivedAt).getTime();
    latestHeartbeat.isStale = ageMs > STALE_THRESHOLD_MS;

    return latestHeartbeat;
  }
}
