import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  Sse,
  MessageEvent,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable, map } from 'rxjs';
import type { Response } from 'express';
import { WhatsappConsoleService } from './whatsapp-console.service';
import { WebPushService } from './web-push.service';

@Controller('whatsapp-console')
@UseGuards(AuthGuard('jwt'))
@SkipThrottle()
export class WhatsappConsoleController {
  private readonly logger = new Logger(WhatsappConsoleController.name);

  constructor(
    private readonly service: WhatsappConsoleService,
    private readonly webPushService: WebPushService,
  ) {}

  // ── SSE 即時訊息推送 ─────────────────────────────────────────
  @Sse('events')
  streamEvents(): Observable<MessageEvent> {
    return this.service.events$.pipe(
      map(event => ({ data: event }) as MessageEvent),
    );
  }

  // ── Bot 狀態 ─────────────────────────────────────────────────
  @Get('status')
  async getStatus() {
    try {
      return await this.service.getBotStatus();
    } catch (err: any) {
      return { status: 'disconnected', error: err.message };
    }
  }

  // ── 對話列表 ─────────────────────────────────────────────────
  @Get('chats')
  async getChats() {
    return this.service.getChats();
  }

  // ── 訊息記錄 ─────────────────────────────────────────────────
  @Get('messages/:chatId')
  async getMessages(
    @Param('chatId') chatId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getMessages(chatId, limit ? parseInt(limit) : 50);
  }

  // ── 下載媒體 ─────────────────────────────────────────────────
  @Get('media/:messageId')
  async downloadMedia(
    @Param('messageId') messageId: string,
    @Query('chatId') chatId: string,
    @Res() res: Response,
  ) {
    try {
      const { buffer, contentType } = await this.service.downloadMedia(messageId, chatId);
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'private, max-age=3600');
      res.send(buffer);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  }

  // ── 發送文字訊息 ─────────────────────────────────────────────
  @Post('send-message')
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() body: { chatId: string; text: string }) {
    return this.service.sendMessage(body.chatId, body.text);
  }

  // ── 發送圖片 ─────────────────────────────────────────────────
  @Post('send-image')
  @HttpCode(HttpStatus.OK)
  async sendImage(
    @Body() body: { chatId: string; imageBase64: string; caption?: string; mimeType?: string },
  ) {
    return this.service.sendImage(body.chatId, body.imageBase64, body.caption, body.mimeType);
  }

  // ── 發送語音 ─────────────────────────────────────────────────
  @Post('send-voice')
  @HttpCode(HttpStatus.OK)
  async sendVoice(
    @Body() body: { chatId: string; audioBase64: string; mimeType?: string },
  ) {
    return this.service.sendVoice(body.chatId, body.audioBase64, body.mimeType);
  }

  // ── Web Push：取得 VAPID 公鑰 ────────────────────────────────
  @Get('push/vapid-key')
  getVapidKey() {
    const key = this.webPushService.getVapidPublicKey();
    return { publicKey: key };
  }

  // ── Web Push：訂閱 ───────────────────────────────────────────
  @Post('push/subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribe(
    @Req() req: any,
    @Body() body: { subscription: { endpoint: string; keys: { p256dh: string; auth: string } } },
    @Headers('user-agent') userAgent?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    await this.webPushService.saveSubscription(userId, body.subscription, userAgent);
    return { success: true };
  }

  // ── Web Push：取消訂閱 ───────────────────────────────────────
  @Delete('push/subscribe')
  @HttpCode(HttpStatus.OK)
  async unsubscribe(
    @Req() req: any,
    @Body() body: { endpoint: string },
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    await this.webPushService.deleteSubscription(userId, body.endpoint);
    return { success: true };
  }

  // ── 接收 Bot 推送的新訊息（Bot → ERP → 廣播給 SSE 客戶端 + Web Push）
  // 這個端點不需要 JWT，用 webhook secret 驗證
  @Post('webhook/message')
  @HttpCode(HttpStatus.OK)
  @UseGuards() // 覆蓋 class-level guard，不需要 JWT
  async receiveWebhookMessage(
    @Headers('x-webhook-secret') secret: string,
    @Body() body: any,
  ) {
    const expectedSecret = process.env.WHATSAPP_BOT_API_SECRET || 'mingtat-bot-api-2026';
    if (secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    // 廣播給 SSE 客戶端
    if (body.type === 'message' && body.message) {
      this.service.events$.next({ type: 'message', message: body.message });
      // 發送 Web Push 通知給所有訂閱用戶
      const msg = body.message;
      if (!msg.fromMe) {
        const senderName = msg.senderName || msg.chatName || msg.sender?.replace('@s.whatsapp.net', '') || '未知';
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
