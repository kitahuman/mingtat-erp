import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WhatsappConsoleService } from './whatsapp-console.service';
import { WebPushService } from './web-push.service';

/**
 * Webhook controller for receiving messages from the WhatsApp Bot.
 * This controller does NOT require JWT auth — it uses a shared webhook secret instead.
 * Kept separate from WhatsappConsoleController which requires admin JWT.
 */
@Controller('whatsapp-console')
@SkipThrottle()
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly service: WhatsappConsoleService,
    private readonly webPushService: WebPushService,
  ) {}

  // ── 接收 Bot 推送的新訊息（Bot → ERP → 廣播給 SSE 客戶端 + Web Push）
  // 這個端點不需要 JWT，用 webhook secret 驗證
  @Post('webhook/message')
  @HttpCode(HttpStatus.OK)
  async receiveWebhookMessage(
    @Headers('x-webhook-secret') secret: string,
    @Body() body: any,
  ) {
    const expectedSecret = process.env.WHATSAPP_BOT_API_SECRET || 'mingtat-bot-api-2026';
    if (secret !== expectedSecret) {
      this.logger.warn('Invalid webhook secret received');
      throw new UnauthorizedException('Invalid webhook secret');
    }

    // 廣播給 SSE 客戶端
    if (body.type === 'message' && body.message) {
      this.service.events$.next({ type: 'message', message: body.message });

      // 發送 Web Push 通知給所有訂閱用戶
      const msg = body.message;
      if (!msg.fromMe) {
        const senderName =
          msg.senderName ||
          msg.chatName ||
          msg.sender?.replace('@s.whatsapp.net', '') ||
          '未知';
        const preview = msg.text || (msg.hasMedia ? '[媒體訊息]' : '[訊息]');
        await this.webPushService.broadcast({
          title: `WhatsApp: ${senderName}`,
          body: preview.length > 100 ? preview.slice(0, 97) + '...' : preview,
          icon: '/whatsapp-console/icon-192.png',
          badge: '/whatsapp-console/badge-72.png',
          tag: `wa-msg-${msg.chatId}`,
          data: { chatId: msg.chatId, messageId: msg.id, url: '/whatsapp-console' },
        });
      }
    } else if (body.type === 'status') {
      this.service.events$.next({ type: 'status', status: body.status });
    }

    return { success: true };
  }
}
