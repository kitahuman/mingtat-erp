import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WhatsappService } from './whatsapp.service';

// ══════════════════════════════════════════════════════════════
// WhatsApp Webhook Controller
// POST endpoints — 不需要 JWT，用 webhook secret 驗證
// GET endpoints — 需要 JWT 認證
// ══════════════════════════════════════════════════════════════

@Controller('verification')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // ── 驗證 webhook secret 的共用方法 ────────────────────────────
  private validateWebhookSecret(webhookSecret?: string) {
    const expectedSecret = process.env.WHATSAPP_WEBHOOK_SECRET || 'mingtat-wa-webhook-2026';
    if (webhookSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Bot 狀態管理端點（Heartbeat + QR Code）
  // ══════════════════════════════════════════════════════════════

  // ── Heartbeat 端點（不需要 JWT）───────────────────────────────
  @Post('whatsapp-heartbeat')
  @HttpCode(HttpStatus.OK)
  async handleHeartbeat(
    @Body() body: { status: 'connected' | 'disconnected'; uptime?: number; lastMessageAt?: string },
    @Headers('x-webhook-secret') webhookSecret?: string,
  ) {
    this.validateWebhookSecret(webhookSecret);
    return this.whatsappService.recordHeartbeat(body);
  }

  // ── QR Code 接收端點（不需要 JWT）─────────────────────────────
  @Post('whatsapp-qrcode')
  @HttpCode(HttpStatus.OK)
  async handleQrCode(
    @Body() body: { qrCode: string },
    @Headers('x-webhook-secret') webhookSecret?: string,
  ) {
    this.validateWebhookSecret(webhookSecret);
    if (!body.qrCode) {
      return { saved: false, reason: 'missing_qr_code' };
    }
    return this.whatsappService.saveQrCode(body.qrCode);
  }

  // ── Bot 狀態查詢端點（需要 JWT）───────────────────────────────
  @Get('whatsapp-bot-status')
  @UseGuards(AuthGuard('jwt'))
  async getBotStatus() {
    return this.whatsappService.getBotStatus();
  }

  // ── QR Code 查詢端點（需要 JWT）───────────────────────────────
  @Get('whatsapp-qrcode')
  @UseGuards(AuthGuard('jwt'))
  async getQrCode() {
    return this.whatsappService.getQrCode();
  }

  // ══════════════════════════════════════════════════════════════
  // Webhook 端點（不需要 JWT）
  // ══════════════════════════════════════════════════════════════

  @Post('whatsapp-webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: { chatId: string; sender: string; text: string; groupName?: string },
    @Headers('x-webhook-secret') webhookSecret?: string,
  ) {
    this.validateWebhookSecret(webhookSecret);

    if (!body.text || !body.sender) {
      return { processed: false, reason: 'missing_required_fields' };
    }

    return this.whatsappService.processWebhookMessage({
      chatId: body.chatId || '',
      sender: body.sender,
      text: body.text,
      groupName: body.groupName,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 每日 Order 總結端點（需要 JWT）
  // ══════════════════════════════════════════════════════════════

  @Get('whatsapp-daily-summaries')
  @UseGuards(AuthGuard('jwt'))
  async getDailySummaries(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.whatsappService.getDailySummaries({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      date_from: dateFrom,
      date_to: dateTo,
      search,
    });
  }

  @Get('whatsapp-daily-summary/:date')
  @UseGuards(AuthGuard('jwt'))
  async getDailySummary(@Param('date') date: string) {
    return this.whatsappService.getDailySummary(date);
  }

  // ══════════════════════════════════════════════════════════════
  // 向後兼容端點（需要 JWT）
  // ══════════════════════════════════════════════════════════════

  @Get('whatsapp-orders')
  @UseGuards(AuthGuard('jwt'))
  async getOrders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.whatsappService.getWhatsappOrders({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      date_from: dateFrom,
      date_to: dateTo,
      search,
    });
  }

  @Get('whatsapp-orders/:id')
  @UseGuards(AuthGuard('jwt'))
  async getOrderDetail(@Param('id') id: string) {
    return this.whatsappService.getWhatsappOrderDetail(+id);
  }

  @Get('whatsapp-messages')
  @UseGuards(AuthGuard('jwt'))
  async getMessages(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('classification') classification?: string,
  ) {
    return this.whatsappService.getWhatsappMessages({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      classification,
    });
  }

  @Get('whatsapp-clockin-feed')
  @UseGuards(AuthGuard('jwt'))
  async getClockinFeed(
    @Query('limit') limit?: string,
  ) {
    return this.whatsappService.getClockinFeed(limit ? +limit : 50);
  }

  // ══════════════════════════════════════════════════════════════
  // CRUD: 手動編輯 Order Items（需要 JWT）
  // ══════════════════════════════════════════════════════════════

  @Put('whatsapp-orders/:orderId/items/:itemId')
  @UseGuards(AuthGuard('jwt'))
  async updateOrderItem(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body() body: {
      order_type?: string;
      contract_no?: string;
      customer?: string;
      work_description?: string;
      location?: string;
      driver_nickname?: string;
      vehicle_no?: string;
      machine_code?: string;
      contact_person?: string;
      slip_write_as?: string;
      is_suspended?: boolean;
      remarks?: string;
    },
  ) {
    return this.whatsappService.updateOrderItem(+orderId, +itemId, body);
  }

  @Post('whatsapp-orders/:orderId/items')
  @UseGuards(AuthGuard('jwt'))
  async addOrderItem(
    @Param('orderId') orderId: string,
    @Body() body: {
      order_type?: string;
      contract_no?: string;
      customer?: string;
      work_description?: string;
      location?: string;
      driver_nickname?: string;
      vehicle_no?: string;
      machine_code?: string;
      contact_person?: string;
      slip_write_as?: string;
      is_suspended?: boolean;
      remarks?: string;
    },
  ) {
    return this.whatsappService.addOrderItem(+orderId, body);
  }

  @Delete('whatsapp-orders/:orderId/items/:itemId')
  @UseGuards(AuthGuard('jwt'))
  async deleteOrderItem(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.whatsappService.deleteOrderItem(+orderId, +itemId);
  }
}
